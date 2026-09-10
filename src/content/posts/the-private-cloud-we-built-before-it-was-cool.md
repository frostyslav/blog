---
author: Rostyslav Fridman
pubDatetime: 2026-09-03T09:00:00Z
title: The private cloud we built before it was cool
featured: false
draft: false
tags:
  - kubernetes
  - networking
  - ovn
  - sdn
  - dpdk
  - private-cloud
  - war-stories
description: From 2016 to 2019 I helped build a private cloud on top of very early Kubernetes, with a drag-and-drop canvas, VMs running inside pods before Kata existed, and an enterprise-grade network layer I led, from GCP-style flat overlays to a 12-to-60 Gbps DPDK data path. The company is gone. The story shouldn't be.
---

Between 2016 and 2019 I worked on a private cloud. Not a wrapper around someone else's cloud, an actual private cloud: bare metal servers, a Kubernetes control plane, and a product that let you drag workloads onto a canvas and watch them deploy. It was called CertaScale. The company doesn't exist anymore, so there's no product to sell you and no roadmap to defend. That's exactly why I want to write it down.

Some of what we did still isn't common in 2026, and we shipped it on a version of Kubernetes so early that half the primitives people take for granted today either didn't exist or didn't work. I led the team that built the network layer, the part I'm proudest of and the part I'm still a little salty about, for reasons I'll get to.

## Table of contents

## What CertaScale was

The pitch was simple enough to draw on a whiteboard. You had a web canvas. You dragged a workload onto it, wired it up, and it deployed. Under the hood it was Kubernetes, but the person using the canvas didn't need to know a single `kubectl` incantation. They dragged a box, picked what went in it, and the platform did the rest.

Two kinds of boxes mattered:

- **Plain Linux applications.** These started as pods. Ordinary containers, the thing Kubernetes was built for.
- **Virtual machines.** These also started as pods, except the pod ran KVM inside it, and a full VM booted inside that.

Here's the shape of the whole system, redrawn from memory. The boot chain hands off to a Kubernetes control plane, our own components sit alongside the upstream ones, the network layer programs the data plane on every node, and both kinds of workload land as pods.

![Simplified CertaScale architecture: a boot chain (bare metal, CoreOS, systemd, kubelet) feeding a Kubernetes control plane of static pods (kube-apiserver, scheduler, controller-manager, etcd) alongside CertaScale-built components (sdn-controller, openvswitch, onboarding and UI, addon-manager). A network layer built on OVN and ovn-kubernetes programs the data plane. A drag-and-drop web canvas deploys workloads, which run as either an app pod (an ordinary Linux container) or a VM pod (a pod running KVM with a guest VM booted inside).](_certascale-assets/architecture.svg)

Read that second point again, because the timeline is the interesting part. This was working in 2016, on [Kubernetes 1.2.0, which had just been released that March](https://kubernetes.io/blog/2016/03/kubernetes-1-2-even-more-performance-upgrades-plus-easier-application-deployment-and-management/). [Kata Containers didn't launch until December 2017](https://katacontainers.io/), when Intel Clear Containers and Hyper runV merged into it. We were running VMs-inside-pods on a Kubernetes that had only just learned to walk, well before the ecosystem had a name for the pattern, let alone a supported runtime.

I'll cover the VM-in-pod runtime in its own post. The short version: a pod is just a namespace boundary and a lifecycle Kubernetes knows how to manage. If you're willing to run KVM inside that boundary and bridge the guest's network out, you get a VM that schedules, migrates, and dies like a pod, years before anyone shipped a `RuntimeClass` to make it official.

## The part that actually mattered: the network

Anyone can deploy a container. The reason CertaScale was worth anything to an enterprise was the network layer, and that's the part I owned.

Enterprises don't want "a container gets some random cluster IP." They want the workload to sit on _their_ network, with the properties their network has always had:

- **Static IP assignment** for the workloads that need a fixed address forever.
- **DHCP assignment** for the ones that don't.
- **VLANs**, so a project's traffic lives where the enterprise's segmentation says it should.
- **QoS**, so voice traffic and bulk backups don't fight over the same pipe as equals.

None of that is how Kubernetes networking thinks. Kubernetes wants a flat pod network and a service abstraction on top. Enterprises want VLAN 116 to behave like VLAN 116. Bridging those two worldviews was the whole job, and it's a whole series' worth of engineering. Here I'll just walk the map. The stops, in the order I'll write them up.

### It started with a seven-day-old project

The foundation I built on was `ovn-kubernetes`, the project wiring OVN (Open Virtual Network) into Kubernetes as a network plugin. Its [very first commit landed on August 11, 2016](https://github.com/ovn-kubernetes/ovn-kubernetes/commit/81bbb29), a one-line "Add a .gitignore file." When I stumbled onto the repo it was about a week old, barely anything there, the early code in Python. I started contributing, first alone, then with a team I hired, and along the way the code we owned migrated from Python to Go. That whole arc is its own post.

### An enterprise network, on the enterprise's terms

This was the ask, the reason the customer wanted us at all: static IPs, DHCP, VLANs, and QoS that behaved the way their existing network already behaved. We didn't invent schemes, we implemented the standards enterprises already speak, down to differentiated-services traffic classes. Meeting an enterprise network where it lives, instead of asking it to adopt Kubernetes' worldview, is the post I most look forward to writing.

### A flat network, borrowed from GCP

The idea I'm proudest of, and this one was our own architectural decision rather than a customer request: I took the flat-network model Google Cloud uses, where there's no subnet-wide L2 and the fabric just routes to each address, and rebuilt an equivalent on top of OVN and Kubernetes. We wanted it for live migration. If a workload's address isn't pinned to an L2 segment on one server, a VM can move between nodes and keep its IP. So the overlay became a global resource, and workloads got their addresses in a way that let them migrate seamlessly. How the addressing and migration actually worked is a post of its own.

### When the company tried to become a 5G-edge box

Somewhere in the middle of all this, the owners tried to pivot. Private cloud was a hard sell; 5G edge was the hot thing, and the same software running on a small box at the edge of a carrier network suddenly looked like a product. The catch: edge means line-rate packet processing on commodity hardware, and our data path went through the kernel, which topped out around 12 Gbps on the 100 Gbps COTS servers we were testing.

So I took the network data path out of the kernel. Using DPDK with Open vSwitch, poll-mode drivers, hugepages, NICs bound straight to userspace, we pushed the same commodity hardware from about 12 Gbps to roughly 60 Gbps. A 5x jump with no new hardware, just a different way of moving packets. That work, and the pivot that motivated it, is a post on its own.

### The ORM I'm still salty about

Driving OVN means talking to its databases over the OVSDB protocol, across several of them, and doing that by hand everywhere is miserable. So I built an ORM: an object mapper over the OVS/OVN multi-database world, so our Go code worked with logical switches, routers, ports, and NAT rules as objects. It was some of the best work in the whole project. I wanted to open-source it, the company said no, and it died with the company. I still think about it. There's a full post, and a bit of a eulogy, coming.

## Why write this now

CertaScale doesn't exist. The code is gone or locked away. But the ideas were good, and several of them, VMs as first-class pod workloads, flat GCP-style overlays on Kubernetes, treating enterprise network semantics as a first-class concern instead of an afterthought, are still relevant. Writing them down is the closest thing to open-sourcing them I have left.

## Should this be a series? Yes.

I tried to fit the whole thing into one post and it doesn't work. There's too much, and each piece deserves room. So here's how I'm breaking it up. This post is the overview. The rest go deep:

1. **The private cloud we built before it was cool** (this one). What CertaScale was, why the network mattered, and how the pieces fit.
2. **Finding ovn-kubernetes when it was seven days old.** Contributing to a brand-new integration, learning OVS internals, and the Python-to-Go rewrite when the team changed.
3. **Giving Kubernetes an enterprise network.** VLANs, static and DHCP addressing, and RFC 4594 QoS via DSCP in OVN, meeting enterprise networks on their own terms.
4. **A flat network, GCP-style, on early Kubernetes.** The `/32`-plus-routes model, the address operator and CRD pool, live migration of addresses, and why the overlay was a global resource.
5. **Running VMs inside pods in 2016, before Kata existed.** The VM-in-pod runtime: KVM inside a pod, how it scheduled and migrated, and how we bridged the guest network out. Plus where secure runtimes like gVisor fit later.
6. **From 12 to 60 Gbps with DPDK, when we tried to become a 5G-edge box.** The pivot from private cloud to edge, and taking the data path out of the kernel: DPDK on OVS, hugepages, poll-mode drivers, and userspace-bound NICs.
7. **The OVSDB ORM I wasn't allowed to open-source.** What it did, why it mattered, and a bit of a eulogy.

The network is the through-line of the whole series, so that's where I'm headed first. If that reads like a lot, it's because it was a lot. It ran for years and it worked. The next post starts where the whole network layer started: a repo that was seven days old, and the decision to build a private cloud's networking on top of it.
