---
author: Rostyslav Fridman
pubDatetime: 2026-09-11T09:00:00Z
title: From 12 to 60 Gbps with DPDK, when we tried to become a 5G-edge box
featured: false
draft: false
tags:
  - kubernetes
  - networking
  - ovs
  - dpdk
  - performance
  - war-stories
description: "The sixth post in the CertaScale series. When private cloud proved a hard sell, the owners pivoted to 5G edge, and edge means line-rate on commodity hardware. Our kernel data path topped out around 12 Gbps on 100 Gbps NICs. Taking it out of the kernel with DPDK, hugepages, poll-mode drivers, and userspace-bound NICs got the same servers to roughly 60 Gbps."
---

This is the sixth post in a series about [CertaScale](/posts/the-private-cloud-we-built-before-it-was-cool/), the private cloud I helped build between 2016 and 2019. The last four posts built up the network layer and [ran VMs as pods](/posts/running-vms-inside-pods-in-2016-before-kata-existed/) on top of it. This one is different in character. It's not about a feature we chose or a customer asked for. It's about a business pivot that landed a performance problem on my desk, and the several months I spent moving packets out of the kernel to solve it.

The number in the title is the whole story in miniature: same servers, same NICs, from about 12 Gbps to roughly 60 Gbps. No new hardware, just a fundamentally different way of moving packets.

## Table of contents

## The pivot that started it

Private cloud was a hard sell. It's a big, conservative purchase, and our customer, the small company whose product this was, was asking enterprises to run their workloads on its platform on their own metal. Somewhere in the middle of the project, the customer's owners looked at what was selling and decided to chase it: 5G edge. I wasn't sure the market was real, and it wasn't a direction I'd have picked, but the technical problem it handed me was a good one.

The logic wasn't crazy on paper. The same product that ran a private cloud on a rack could, in principle, run on a small box at the edge of a carrier's network, close to the radios and the users. Carriers were spending on 5G, "edge" was the word in every deck, and a compact appliance running virtualized network functions at the edge suddenly looked like a product people wanted to buy. So the same Kubernetes-plus-OVN-plus-VMs stack my team had built the networking for got repositioned as an edge platform.

There was one catch, and it was mine to deal with. Edge networking means line-rate packet processing on commodity hardware. A box sitting in a carrier's network is expected to move packets at the speed of its interfaces, not at the speed a general-purpose kernel happens to manage. Our data path went through the Linux kernel.

## Why the kernel path tops out

Our packets took the ordinary route a Linux host takes. A NIC receives a frame, raises an interrupt, the kernel's network stack processes it, the packet crosses the boundary from kernel space into user space where Open vSwitch and the rest of our data path live, gets switched, and crosses back to go out. For a private cloud that was fine. For line-rate on fast NICs it is not, and the reasons are structural, not a matter of tuning:

- **Interrupts.** At high packet rates the interrupt load alone becomes a problem. Every packet, or every small batch, is an interrupt, a context switch, and a trip through the scheduler. The CPU spends its time being interrupted instead of doing work.
- **Copies and context switches.** Moving a packet from kernel space to user space and back costs copies and mode switches. At a few packets that's nothing. At tens of millions of packets per second it's the entire budget.
- **Per-packet overhead dominates.** At 100 Gbps with small frames you have on the order of a few nanoseconds per packet. That's tens of CPU cycles. The kernel's general-purpose path, built to be correct and fair across every kind of traffic, can't do its bookkeeping that fast.

On the 100 Gbps COTS servers we were testing on, all of that added up to a ceiling of around 12 Gbps through the kernel. The NICs could do far more; the kernel path couldn't feed them. And you can't interrupt your way to line rate. Past a certain point you stop trying to make the layer faster and start asking whether you need it at all. We didn't. The fix was to delete the kernel from the data path, not tune it.

## The idea: get out of the kernel entirely

[DPDK](https://www.dpdk.org/), the Data Plane Development Kit, is the tool for doing exactly that. Take the NIC away from the kernel, hand it to a userspace process, and let that process talk to the hardware directly. Open vSwitch has a DPDK datapath (`netdev`) that does this, and switching to it is what took us from 12 to 60.

It rests on a handful of pieces that all have to be in place together. None of them is exotic on its own; the work was getting all of them cooperating on our stack.

### Poll-mode drivers instead of interrupts

The first and biggest change is to stop being interrupted. Instead of the NIC raising an interrupt when a packet arrives, a DPDK **poll-mode driver** sits in a tight loop and constantly asks the NIC "anything for me?" A CPU core is dedicated to that loop and does nothing else. It runs hot, 100% busy, forever, whether or not there's traffic.

That sounds wasteful, and in a general-purpose system it would be. On a packet-forwarding box it's exactly right. You trade a core (or several) that you were going to dedicate to networking anyway, and in return you lose interrupt overhead and the unpredictable latency that comes with it. The core is always ready for the next packet because it's already looking.

### NICs bound to userspace

For a userspace process to drive the NIC, the kernel has to let go of it. That's what binding the NIC to a userspace-friendly driver does. On our setup we bound the interfaces to `vfio-pci`, which safely hands a PCI device to a userspace process using the IOMMU to keep it contained. The prep looked like this: enable VT-d (Intel's IOMMU) in firmware and in the kernel, load the module, then rebind the cards away from their kernel driver.

```bash
# VT-d must be on in firmware and in the kernel command line
dmesg | grep -e DMAR -e IOMMU
cat /proc/cmdline | grep intel_iommu=on

# hand the NICs to userspace via vfio-pci
modprobe vfio-pci
/usr/share/dpdk/usertools/dpdk-devbind.py --bind=vfio-pci $if1 $if2
/usr/share/dpdk/usertools/dpdk-devbind.py --status
```

After this the kernel no longer sees those interfaces as network devices. `ip link` won't show them. They belong to the DPDK process now. It feels wrong the first time you do it: you deliberately make the operating system blind to your fastest NICs, because the operating system is the bottleneck.

### Hugepages

DPDK needs its packet buffers in memory that won't move and that the CPU can address with as few translation lookups as possible. Normal 4 KB pages mean the CPU's TLB (the cache of virtual-to-physical address translations) misses constantly when you're touching a huge pool of buffers at line rate, and each miss is a page-table walk. **Hugepages** (2 MB instead of 4 KB) mean one TLB entry covers 512 times as much memory, so the translations stay cached and the buffers stay put.

We allocated them up front:

```bash
echo 'vm.nr_hugepages=4096' > /etc/sysctl.d/hugepages.conf
```

VT-d on, NICs on `vfio-pci`, hugepages reserved. Those three are the foundation the fast path stands on.

## Making OVS use it, inside Kubernetes

The pieces above are standard DPDK. The part that was specific to us was that Open vSwitch didn't run on the host in the usual way. In CertaScale, [OVS ran as a pod](/posts/the-private-cloud-we-built-before-it-was-cool/), like nearly everything else. So enabling the DPDK datapath meant enabling it in a containerized `vswitchd` and giving that container access to host resources a container doesn't normally get.

Turning on the datapath in the OVS database:

```bash
ovs-vsctl --no-wait set Open_vSwitch . other_config:dpdk-init=true
ovs-vsctl --no-wait set Open_vSwitch . other_config:dpdk-socket-mem="1024,1024"
ovs-vsctl --no-wait set Open_vSwitch . other_config:dpdk-hugepage-dir="/dev/hugepages"
```

The `dpdk-socket-mem="1024,1024"` is a small NUMA detail that matters a lot at these speeds: it reserves memory on each of the two CPU sockets, so a poll-mode core always has buffers on its own socket and isn't reaching across the interconnect for every packet. On a multi-socket box, ignoring NUMA quietly throws away a big chunk of the gain.

Then the `vswitchd` pod had to be handed the VFIO device and the hugepages, which meant mounting them in and declaring hugepages as a resource:

```yaml
resources:
  limits:
    hugepages-2Mi: 4000Mi
    memory: 500Mi
volumeMounts:
  - name: vfio
    mountPath: /dev/vfio
  - name: hugepage
    mountPath: /dev/hugepages
volumes:
  - name: vfio
    hostPath:
      path: /dev/vfio
  - name: hugepage
    emptyDir:
      medium: HugePages
```

Kubernetes understands hugepages as a first-class resource, so once the node advertised them, the scheduler treated `hugepages-2Mi` like memory or CPU: the pod requested a slice and the scheduler placed it somewhere the slice existed. The `/dev/vfio` mount is what let the containerized OVS reach the NICs we'd bound to userspace. A data-plane switch running as a pod, driving the physical NICs directly, is a slightly surreal thing to describe, but it dropped cleanly into the same pod model as the rest of the system.

Finally, the physical interfaces went into an OVS bond as DPDK ports, with the bridges switched to the `netdev` (userspace) datapath:

```bash
ovs-vsctl set bridge br-int datapath_type=netdev
ovs-vsctl set bridge br-ext datapath_type=netdev

ovs-vsctl add-bond br-ext bond0 $if1 $if2 bond_mode=balance-tcp lacp=active \
  -- set interface $if1 type=dpdk options:dpdk-devargs=$if1_pci \
  -- set interface $if2 type=dpdk options:dpdk-devargs=$if2_pci
ovs-vsctl set port bond0 bond_fake_iface=true
```

The two NICs are addressed by their PCI IDs now, not kernel interface names, because the kernel no longer has names for them. They're bonded with LACP for aggregate throughput and redundancy, and `datapath_type=netdev` is the switch that says "run this bridge in userspace on DPDK" rather than through the kernel.

![Two side-by-side panels comparing the packet path. On the left, the kernel data path: a NIC delivers packets by interrupt into the kernel network stack, packets are copied across the boundary into userspace Open vSwitch and copied back, and the whole thing tops out around 12 Gbps because interrupts, copies, and context switches dominate at high packet rates. On the right, the DPDK data path: the NIC is bound to vfio-pci and owned by a userspace poll-mode driver inside the OVS pod, a dedicated CPU core polls the NIC in a busy loop with no interrupts, packets stay in hugepage buffers with no kernel crossing, and the same hardware reaches roughly 60 Gbps. A note marks that the kernel no longer sees the NIC as a network device.](_certascale-assets/dpdk-vs-kernel-path.svg)

## What broke, and the caveats that came with it

Bypassing the kernel is not free, and most of the cost is that everything the kernel used to do for you, you now have to do yourself or route around. Four things had to change before it was production-worthy:

- **The bond had to be an OVS bond.** You can't lean on the kernel's bonding driver when the kernel doesn't own the NICs. The link aggregation had to live in Open vSwitch itself so DPDK could drive it natively, which is why `bond0` is an OVS construct above rather than a kernel `bond0`.
- **Kubernetes Services had to move to OVN load balancing.** The usual Service implementation leans on `kube-proxy` programming the kernel (iptables or IPVS). With the data path out of the kernel, that machinery is bypassed, so Service load balancing had to be expressed as OVN load balancers instead.
- **Routing had to move to OVN routers.** Same reason. The host kernel's routing table isn't in the path anymore, so routing had to be done on OVN logical routers, which is where [the earlier network posts](/posts/giving-kubernetes-an-enterprise-network/) had already been putting it.
- **No traffic through the host, except health probes.** The general rule that fell out of all this: data-plane traffic must not touch the kernel path at all. The only thing still allowed through the host stack was Kubernetes' own liveness and readiness probes, which are low-rate control traffic, not data.

That last point matters more than it looks. Once you commit to a userspace data path, the kernel path stops being a fallback and becomes a leak. Anything that quietly slips back onto it is both slow and a correctness problem, because it's no longer going through the switch that has all your policy. The work was as much about closing those leaks as it was about opening the fast path.

## What it actually bought, and what it cost

The benefit was the 5x, and for an edge box that's the difference between a product and a demo. At 12 Gbps the appliance couldn't credibly sit in a carrier's path; a single busy interface would have swamped it, and the pitch collapses the moment a customer runs a real traffic test. At 60 it could carry the aggregated load of the virtualized network functions the box was meant to host and still have headroom, on hardware you could buy from any vendor. That's what made the pitch real: throughput that had previously implied expensive specialized gear, on commodity servers.

The honest accounting has a cost column too. You burn CPU cores on polling whether or not traffic is flowing, so an idle box runs hot. You give up the kernel's conveniences and have to re-implement bonding, load balancing, and routing in OVS and OVN. You take on hard operational requirements: IOMMU on, hugepages reserved, NICs bound at boot, NUMA respected. And you make the machine's fastest interfaces invisible to every ordinary Linux tool, which is its own kind of operational tax. None of that is a reason not to do it. It's the price of line rate, and for the edge box the customer was trying to become, it was worth paying.

## The part that lingers

I said this post was different in character. The network layer up to this point was work I'd argue was elegant: meeting enterprise networks on their terms, borrowing a routing model from the big clouds, making VMs migrate like pods. This was not elegant. It was a response to a business pivot I didn't pick, chasing a market that may or may not have been real, and the engineering was closer to demolition than design: rip the packets out of the kernel, then spend months fixing everything that assumed they'd stay there.

But it worked, completely, and getting that much more out of hardware you already own by refusing to accept the operating system's answer is a satisfying kind of win. It's also the most transferable lesson in the series. The instinct on a ceiling is to tune the layer you're stuck in; the move that actually paid off was deleting it. Sometimes the fast path is the one that goes around.

The [next post](/posts/the-ovsdb-orm-i-wasnt-allowed-to-open-source/) is the last technical one, and it's the piece of this whole project I'm still not over. Driving OVN means talking to its databases over OVSDB, several of them, by hand, everywhere. So I built an ORM over that multi-database world, so our Go code worked with logical switches, routers, ports, and NAT rules as objects instead of raw protocol calls. It was some of the best work in the project. I wanted to open-source it, the company said no, and it died with the company. That post is a walkthrough, and a bit of a eulogy.
