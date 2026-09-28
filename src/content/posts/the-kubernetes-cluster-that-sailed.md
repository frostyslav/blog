---
author: Rostyslav Fridman
pubDatetime: 2026-09-28T09:00:00Z
title: The Kubernetes cluster that had to survive the open ocean
featured: false
draft: false
tags:
  - aws
  - kubernetes
  - eks-anywhere
  - edge
  - architecture
  - war-stories
description: "A pre-sale asked for Kubernetes in the server room of a cruise ship. The ship is a distraction. The real constraint is that the network becomes a scheduled resource, present in port and gone at sea, and that splits the system into a runtime that has to survive for days with no link home and a lifecycle of updates and image pulls that can only happen while the ship is connected. EKS Anywhere runs the whole cluster on the boat, which is why it fit and why keeping the control plane onshore would not have."
---

Everyone latched onto the same detail when I described this project: the Kubernetes cluster lived on a cruise ship. The setting is a trap. It points your attention at the hardware and the weather when the real difficulty is where the ship spends most of its time, out in the open ocean, where the internet is either gone or bad enough to count as gone.

The whole design falls out of one fact: on a ship, the network is not a utility you can assume. Being cut off is the normal operating state, not an outage to recover from, and any design that misses that has already misunderstood the job.

## Table of contents

## The network is a scheduled resource

When the ship is in port, it has connectivity. Not necessarily good connectivity, but a real link to shore, the kind you can plan a data transfer around. Out in the open ocean it has effectively none. Satellite links exist, but for the purposes of a platform design you assume they are too slow and unreliable to lean on, and you build nothing critical on top of them. You get the link on a timetable, tied to the ship's itinerary, instead of having it simply present the way a building on land does.

Once you accept that, the system splits into two halves along a line the ocean draws for you:

- **Runtime:** everything the ship actually runs and has to keep running at sea, with no link home for days at a time. The workloads and the cluster underneath them.
- **Lifecycle:** everything that only needs to happen while the ship is connected. Updating the cluster, pulling new container images, applying upgrades, anything that reaches out to the wider world to change what the ship is running.

The customer had already grasped this without putting it in those terms. The way they described it, updates would happen onshore, and everything offshore should just work. That sentence is the brief, and the design just has to honor it.

The word offshore stuck with me. In cloud work we throw offshore and onshore around as metaphors, offshore teams and onshore support, infrastructure moved somewhere cheaper or kept close to home. Here the metaphor collapsed back into the literal thing. Offshore meant off the shore, in the sea, on a moving vessel with no cable to land. Onshore meant on the shore, in port, where the cable exists. For once the industry's borrowed nautical vocabulary was describing an actual boat and the water it floats in.

Kubernetes leans on that same vocabulary harder than almost anything else in the space. The name is Greek for helmsman, the one steering the ship. The logo is a ship's wheel. The official illustrated guide sends Phippy the giraffe across the sea on a container vessel, with a Captain Kube at the helm and a whole cast riding the same shipping metaphor. All of it points at the sea, and none of it worries about being cut off from land, because on the CNCF's imaginary ocean the control plane is always a call away. Putting a real cluster on a real ship turns the cute part of the metaphor inside out. The helmsman still has to steer when there is no port in sight, and out there the cheerful imagery stops helping and the disconnection is all that is left.

![An illustration from the CNCF's Children's Illustrated Guide to Kubernetes: Phippy the yellow giraffe, holding a little paper parasol, floats on the open sea inside a wooden shipping crate while a friendly green whale surfaces beside her and spouts water. A small boat with a crate-shaped hull sails in the hazy distance. Everyone is out on the water, and there is no shore anywhere in the picture.](_cruise-ship-assets/kubernetes-illustrated-guide-illustration-5.jpg)

_Illustration from [The Children's Illustrated Guide to Kubernetes](https://www.cncf.io/phippy/the-childrens-illustrated-guide-to-kubernetes/), by the CNCF, licensed under CC BY 4.0._

## Runtime must survive; lifecycle can wait for port

This split inverts the usual instinct. In an ordinary cloud deployment the network stays on, so you never separate the thing running now from the thing that changes what runs. On the ship the two live on opposite sides of the connectivity line, and they have opposite requirements.

The runtime half is strict. While the ship is at sea, the cluster has to keep its control plane healthy, keep scheduling and rescheduling pods, keep the onboard services up, and recover from the failures that happen on any given day, all without reaching anything onshore. A node reboots, a pod crashes, a service needs restarting, and none of that can require a phone call home when there is no home to call. The cluster has to be complete in itself for the length of a voyage.

The lifecycle half can afford to be relaxed. Nobody upgrades Kubernetes in the middle of the Atlantic. Nobody needs the latest image the moment it ships. Those operations can queue up and wait for the ship to reach port, where a link exists to run them over. The catch is that the platform has to genuinely support deferring them rather than assuming they can run at any time, because "any time" includes three days at sea when they cannot run at all.

## Why EKS Anywhere, and why the obvious modern option was wrong

I was there as part of AWS Professional Services, so the answer was always going to be an AWS product. That is a constraint of the engagement rather than a technical verdict, and I will not dress it up as a bake-off I ran and won. Within the AWS on-premises options, though, the choice was far from arbitrary. The ship makes the differences between them unusually sharp.

AWS has more than one way to run Kubernetes on hardware you own, and they sit at different points on the connectivity spectrum:

- **EKS Anywhere** runs the entire cluster on your own hardware. Control plane, etcd, worker nodes, all of it local. It is designed to run disconnected from any AWS region, up to and including fully air-gapped environments. There is no runtime dependency on a link home.
- **EKS Hybrid Nodes**, the newer and more heavily marketed on-premises option, does the opposite. It keeps the Kubernetes control plane in the AWS region and attaches your on-premises machines to it as nodes. That requires ongoing private connectivity from your site back to AWS, over Direct Connect, a Site-to-Site VPN, or your own VPN.

For most on-premises stories, Hybrid Nodes is the appealing choice. You let AWS run the hard part, the control plane, and you manage only the nodes. But look at what it assumes: a durable private link between your site and the region, up all the time. When that link drops, the nodes are cut off from their own control plane, and the guidance for avoiding that is, reasonably, to build redundant connections so the link stays up.

A cruise ship cannot satisfy that assumption, and no amount of redundancy fixes it, because link reliability was never the issue. Hybrid Nodes treats disconnection as the failure case to engineer against; the ship treats it as the default. EKS Anywhere puts the control plane on the boat, so the cluster stays whole at sea. Hybrid Nodes leaves it onshore, so the cluster comes apart the moment the ship leaves port.

They are not a new option replacing an old one. They answer two different questions, and the ship asks the one only EKS Anywhere answers well: what runs when there is no link at all?

## The registry that sails with the ship

Container images are where the runtime-versus-lifecycle split shows up most sharply.

A cluster that pulls images from a registry on the internet is fine on land and useless at sea. The moment a node needs an image it has not cached, it reaches out, and if the ship is mid-ocean, that pull hangs and the workload never starts. So the images have to be aboard the ship, in a registry that sails with it. Everything the cluster might need has to be present locally before the ship leaves port, because port is the last chance to fetch anything.

This is the exact model EKS Anywhere is built around for disconnected use. Running it air-gapped means mirroring its dependencies into a local registry while you still have a connection, then creating and running clusters against that mirror with no further need to reach out. Upgrades work the same way: you connect long enough to update the tooling and pull the new dependencies into the local mirror, and only then apply the upgrade. That is "updates happen onshore" turned into a procedure. You use the connection in port to top up the local mirror, and the ship lives on that mirror while at sea.

The local registry, then, is the connectivity line made physical. It fills up in port and feeds the cluster at sea, and it only refreshes when the ship next touches land.

## How you test being at sea without going to sea

The proof of concept did not run on a ship. It ran at an onshore location, on ordinary hardware, and that is less of a weakness than it first appears. It may be the right way to prove a disconnection design.

The property you need to demonstrate is that the cluster keeps working when the link is gone, and you do not need a ship for that. You set up EKS Anywhere the disconnected way against a local registry mirror, cut it off from the wider network, and watch the control plane stay healthy while workloads keep running and recovering. The ocean adds vibration and salt air and a deck that rolls underfoot, and those matter for the hardware, but none of them threaten the Kubernetes design. The missing network does, and you can remove the network anywhere.

That is exactly what the proof of concept showed: an EKS Anywhere cluster, provisioned for disconnected operation, kept running on its own without a link home. Everything offshore should just work, and offshore, in a building on land with the cable pulled, it did.

## What we did not prove, and what I would want to stress-test next

The proof of concept validated the central promise and stopped well short of the edges. Several things that would bite a real ship went untested, and if this went past pre-sale, they are where the next round of effort belongs.

- **Time without the internet.** Machines that cannot reach a time source drift, and plenty of things that look unrelated quietly depend on clocks agreeing, from certificate validation to distributed consensus to the ordering of logs. A ship needs a time source that does not live onshore, and I would want to watch how the cluster behaves across days of no external sync rather than assume it holds.
- **Certificates and anything else with an expiry.** Kubernetes rotates certificates, and various components carry credentials or licenses with lifetimes. A lifetime that is comfortable on land, where renewal is a background non-event, turns into a hazard on a long voyage where renewal cannot reach out. Anything that expires needs a lifetime longer than the longest stretch at sea and a renewal path that runs in port. I did not map every expiring thing in the stack, and building that inventory is real work.
- **Telemetry that queues at sea and floods in port.** Whatever ships logs and metrics off the vessel has to tolerate days without being able to send, buffer sensibly without filling the disk, and then avoid overwhelming the link the instant the ship connects. Those failure modes, silent data loss at sea or a flood of uploads in port, are the kind that look fine in a short onshore test and misbehave on a real crossing.

None of these mean the approach is wrong. They are the places where "everything offshore just works" has to be earned in detail rather than asserted, and a pre-sale proof of concept is the right time to name them and the wrong time to claim they are solved.

## What it came down to

- **The hard part is the network, not the ship.** It becomes a scheduled resource, present in port and gone at sea.
- **That splits the system in two.** The runtime must survive alone for days; the lifecycle can wait for port. Never let a runtime need depend on a lifecycle connection.
- **The deployment model is a bet about where the network is not.** EKS Anywhere puts the whole cluster on the boat and runs disconnected by design. Hybrid Nodes keeps the control plane onshore and needs a durable link, which the ocean will not grant.
- **You can prove a disconnection design without going to sea.** Pull the network onshore and watch the cluster carry on. Clock drift, expiries, and telemetry backpressure over a full itinerary are the untested list for the next phase.

The ship is only the reason the network goes away. Design for a network that leaves on a schedule, and the cruise ship turns into the most vivid version of the question every edge deployment is quietly asking: what still works when the link is gone?
