---
author: Rostyslav Fridman
pubDatetime: 2026-09-04T09:00:00Z
title: Finding ovn-kubernetes when it was seven days old
featured: false
draft: false
tags:
  - kubernetes
  - networking
  - ovn
  - open-source
  - golang
  - war-stories
description: The second post in the CertaScale series. Handed a failed project and a title, I inherited a broken Vagrant file that created a single bridge, panic-googled my way to a week-old repo, learned OVS internals the hard way, and rewrote our side from Python to Go when the team changed.
---

This is the second post in a series about [CertaScale](/posts/the-private-cloud-we-built-before-it-was-cool/), the private cloud I helped build between 2016 and 2019. The [first post](/posts/the-private-cloud-we-built-before-it-was-cool/) laid out the whole system. This one is about the decision everything else in the network layer hung from: what to build the networking on.

I bet it on a repo that was a week old, whose first commit added a `.gitignore`. I did it because the alternative I'd inherited was even less than that.

## Table of contents

## "You are now responsible for building a Software-Defined Network"

The customer came to us after another consultancy had already tried and failed to deliver. I won't name names. The point that matters is that the project arrived pre-broken, with a customer who had every reason to be skeptical that the next set of people would do any better.

One day my manager came to me and said, more or less: you are now responsible for building a Software-Defined Network.

Here's where my head was at that moment. I knew what each of those words meant _separately_. I knew what software was. I'd worked as a network engineer before this, so I knew networks, protocols, and VLANs thoroughly, the administration side especially. But "Software-Defined Network," as a thing I was now supposed to build from whatever the last team had left behind? I had no idea what I was supposed to do.

That's the real starting line for this series. Not a confident architect surveying his options, but one person who'd just been handed a failed project and a title, googling in mild panic.

## The week I spent on a broken Vagrant file

Before I could build anything, I had to understand what I'd inherited. What the previous consultancy left the customer with was, in its entirety, a single Vagrant file.

It didn't work.

I spent about a week trying to make it run as-is, assuming there was something real in there I was failing to start correctly. There wasn't. Eventually I gave up on running it and rewrote it from scratch, line by line, purely to see what it was supposed to _produce_. That's when I found it.

It installed Open vSwitch and created a bridge.

That was the deliverable. One command that brings up an OVS bridge. No addressing, no VLANs, no Kubernetes integration, no logical networking, none of the hard parts even gestured at. A bridge. I remember the feeling: a small cold moment of "oh, there is nothing here, the thing I'm supposed to extend does not exist."

So I did what you do. I panicked a little, and I started googling.

## What the job actually was

Once the panic settled into a to-do list, the shape of the real problem was clear enough. CertaScale needed workloads to sit on the customer's real network: static and DHCP addressing, VLANs, QoS, the works. Kubernetes in 2016 did not think that way. The networking model was "every pod gets an IP from a flat cluster range, and services abstract over that." Fine for a stateless web app. Useless if what you need is for a workload to land on VLAN 116 with a fixed address the customer's firewall already knows about.

So the job was really "give Kubernetes an enterprise network." And the first real decision inside that job was the one that scared me: what do we build on? Write our own SDN from scratch, or find something to stand on?

Writing your own software-defined network is a great way to spend three years and still not have VLANs working right. Given where I was starting from, one inherited bridge and a network engineer's instincts, doing it all myself wasn't a plan. It was a way to fail slower than the last team. I wanted a foundation that already understood logical switches, logical routers, and the messy realities of getting packets across real hardware, so my team could spend its time on the Kubernetes integration and the enterprise features instead of reimplementing L2 and L3 from first principles.

## Finding it

The foundation I found was OVN, Open Virtual Network. It's the piece of the Open vSwitch project that adds native virtual networking: you describe the network you want as logical switches and routers, and OVN figures out the flows that make it real on every host. [OVN had been announced on the OVS mailing list in January 2015](https://developers.redhat.com/blog/2019/08/30/the-clean-break-of-open-virtual-network-from-open-vswitch), so by 2016 it was young but real.

What was _not_ real yet was the Kubernetes part. There was a separate project, `ovn-kubernetes`, whose entire job was to wire OVN in as a Kubernetes network plugin: watch the Kubernetes API, and when pods come and go, translate that into OVN logical ports, switches, and routers. That project's [very first commit landed on August 11, 2016](https://github.com/ovn-kubernetes/ovn-kubernetes/commit/81bbb29). It was a one-liner: "Add a .gitignore file."

When I found the repo, it was about a week past that. There was almost nothing in it. A skeleton, some early Python, an idea. I looked at that and thought: this is exactly the layer I need, it just doesn't exist yet.

## Betting on a week-old repo

"I found the perfect foundation" is the version you tell in hindsight. In the moment it was closer to "I found a foundation that's one week old, written by people I don't know, that might be abandoned in a month, and I'm going to propose we build a commercial product's most important feature on top of it."

The reasoning that made it a yes:

- **The hard part was already solved by OVN.** The logical-network abstraction, the flow generation, the plumbing into OVS on each host, that's the genuinely difficult engineering, and it existed and worked. `ovn-kubernetes` was "only" the glue between Kubernetes and that machinery. Glue I could write.
- **Being early meant I could shape it.** A week-old project has no entrenched opinions. If I needed it to do something our way, I could contribute that upstream rather than fork and diverge.
- **The alternative was worse.** I'd already seen it: a Vagrant file that made a bridge. Every other real option was either a heavier SDN that didn't map cleanly onto how we wanted addressing to work, or building it all ourselves from that inherited bridge. Standing on OVN was less risk than either, even accounting for the youth of the integration.

So I started contributing.

## Learning OVS internals the hard way

For a while it was just me. The tax on being this early is that there's no documentation written for newcomers, because there are no newcomers yet. To be useful I had to understand how OVN works underneath, not just call it.

Here's how thin the documentation was: at one point the thing I contributed back was the architecture diagram for the project's own README. [That's PR #47, "Add overlay diagram to README.md,"](https://github.com/ovn-kubernetes/ovn-kubernetes/pull/47) merged in September 2017. For a while, the project's explanation of how it fit together, for the next person who showed up, was a picture I drew. That tells you how early this was.

![The overlay diagram I contributed to the ovn-kubernetes README. On the left, the Kubernetes pod-creation flow: Kube API to Kube Scheduler to Pod, with an OVN-K8S Watcher reading events from the API stream, generating a MAC address, creating a logical port on the OVN switch, and annotating pod metadata with MAC, IP, and gateway. Below, the OVN-K8S CNI driver assigns the address and wires the pod interface into Open vSwitch. On the right, the OVN logical topology: a K8S switch and router, a Join switch, and an External switch and router handling SNAT and DNAT out to the external network, all sitting on the openvswitch integration bridge. A legend distinguishes traffic flow, web API calls, routes, and host-visible versus virtual interfaces.](_certascale-assets/ovn-kubernetes-overlay-diagram.png)

If that diagram looks like it already contains most of this series, that's because it does. The logical switches and routers, the SNAT and DNAT, the address annotation flow, all the things the next few posts pull apart, are right there. I didn't understand all of it yet when I drew it. Drawing it was how I came to.

The mental model I eventually built, and still use:

- You write your intent into the **northbound database**: logical switches, logical routers, ports, the ACLs and NAT rules you want. This is the "desired state" of the network in tidy, conceptual terms.
- A daemon called **ovn-northd** watches the northbound database and compiles that intent down into **logical flows**, which it writes into the **southbound database**.
- On every host, **ovn-controller** reads the southbound database and translates those logical flows into actual OpenFlow rules on the local Open vSwitch bridge. That's the point where an abstract "logical switch port" becomes real packets moving on a real machine.

Once that clicked, a lot followed. Our integration's job was to sit at the top of that stack: watch Kubernetes, and keep the northbound database in sync with reality. Pod scheduled? Create a logical switch port for it. Pod deleted? Remove it. The whole OVN pipeline below would take it from there and make the packets flow.

Learning this by reading source and mailing-list threads, rather than a tidy guide, was slow. But it paid off later: when things broke in production, I could reason from the northbound intent all the way down to the OpenFlow rules on a specific bridge, because I'd had to learn every layer to get anything working in the first place.

## Then I got a team, and the language changed

Eventually the project earned budget, and I got to hire. The complication: the team I could hire knew Go. The early integration work was in Python.

This is one of those forks where the "correct" engineering answer and the "correct" team answer point in different directions, and you have to pick the team. A codebase is only as maintainable as the people maintaining it. I could keep our side in Python and have a team that was slower and less confident in every change, or move to Go and have a team that could own the thing.

We moved to Go.

In hindsight it looks visionary, because Go went on to win cloud infrastructure decisively. Kubernetes itself is Go; the client libraries you want for watching the API are Go; the ecosystem we were living in was becoming a Go ecosystem. But it wasn't a grand bet on the industry. It was a more boring and more useful kind of decision: **build it in the language your team is actually good at.** The industry trend just happened to agree with us later.

The rewrite wasn't glamorous. It was the usual reality of porting: re-deriving behavior that was implicit in the old code, finding the couple of places where something worked by accident, and coming out the other side with something the team understood top to bottom because they'd rebuilt it themselves. That last part turned out to be worth as much as the language switch.

## What this bought us

Standing on OVN, and contributing to the integration rather than reinventing it, is what let a small team punch above its weight. We didn't spend our years reimplementing logical switching. We spent them on the parts that were actually our product: the [GCP-style flat network](/posts/the-private-cloud-we-built-before-it-was-cool/), the enterprise addressing and VLANs and QoS, and eventually [an ORM over the OVSDB databases](/posts/the-private-cloud-we-built-before-it-was-cool/) so our Go code could treat all of this as objects instead of raw protocol calls.

All of that sat on the decision made in front of a week-old repo.

## The lesson, if there is one

Betting on something this early isn't reckless if you're honest about _which_ part is risky. The risk in `ovn-kubernetes` wasn't the hard networking, OVN had that. The risk was that a young glue project might stall, and that risk I could absorb, because I was willing to be one of the people writing the glue. "This doesn't exist yet" is a reason to walk away when you need it to already exist. It's a reason to lean in when you're prepared to help build it.

The [next post](/posts/giving-kubernetes-an-enterprise-network/) gets concrete about what the customer actually asked for, and what this foundation had to deliver first: an enterprise network. Static and DHCP addressing, VLANs, and QoS that behaved the way their existing network already did, on a version of Kubernetes that wanted nothing to do with any of it. The flat network came later, and for a different reason: not a customer request, but an architectural call to move VMs seamlessly between nodes. But that's the post after.
