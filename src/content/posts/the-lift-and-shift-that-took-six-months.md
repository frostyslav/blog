---
author: Rostyslav Fridman
pubDatetime: 2026-09-26T09:00:00Z
title: The lift-and-shift that took six months
featured: false
draft: false
tags:
  - aws
  - migration
  - observability
  - ssm
  - vector
  - war-stories
description: "On paper it was the simplest kind of cloud migration: move one third-party server to a VM in AWS, same software, newer version. It took six months. The move was never the problem. The software assumed an environment that has mostly disappeared, the vendor who alone was allowed to install it couldn't operate the OS it ran on, and everything an operable system needs (readable logs, a health signal, automatic recovery) had to be built from the outside, around a box we weren't allowed to open."
---

The line that set the tone for the whole project showed up in a log file. The application refused to start on the new server and offered nothing but `unknown host`. This was supposed to be the easy part: move one third-party server to a virtual machine in AWS, same software, one version newer. A lift-and-shift, the kind of task you scope in days.

It took six months, and none of that time went into the move. Most of it went into being the one person who understood the machine, for software that was never built to run on one like it. What follows is how a task scoped in days unfolded into that.

## Table of contents

## `unknown host`

Here's the incident that rhymes with the entire project, reconstructed from a support thread that ran most of a day.

The application's main service wouldn't start on the new cloud VM. Its log said the host was unknown, then it shut itself down. The vendor's consultant, the only person permitted to install and start the software, opened a ticket with the vendor's own support. What followed was hours of increasingly archaeological debugging, none of it anywhere near the actual cause.

Support suggested running `ifconfig` to get the IP address. The consultant reported back that `ifconfig` wasn't available on the system. He asked the sysadmin to install `net-tools`, was told it was already installed, and asked why `ifconfig` still didn't work. The sysadmin explained, correctly, that `ifconfig` has been deprecated for years in favour of `ip`, and pasted the output of `ip -o a` showing the box had exactly one address. The consultant admitted he had no idea what to do with that output, and that he didn't want to ask us to install "old stuff" only to find it wasn't the cause anyway.

Meanwhile support kept comparing against one of their own reference machines, which happened to have a fully-qualified static hostname baked in. That was the clue, though nobody chasing `ifconfig` noticed it. The application resolves its own hostname at startup. On the new VM, the default hostname didn't resolve to anything, because in the cloud a machine's name and its address aren't wired together the way they were on the hand-built server this software grew up on. The lookup failed, and the service aborted with `unknown host`.

The fix was one line. I added the host's own name and address to `/etc/hosts`:

```text
# make the box's own hostname resolve
10.0.20.35   ip-10-0-20-35
```

The service started immediately. A day of support tickets, a bind-address red herring, and a tour through deprecated networking tools, all closed out by a mapping the software should never have needed and that any cloud VM lacks by default.

I'm not writing this to dunk on the consultant. He was doing his job with the knowledge he had. The problem was structural, and it's the same one that shaped everything after: we were accountable for a system that only the vendor could install, and the vendor could not operate the operating system it ran on. That gap, between who owns the outcome and who can actually touch the machine, is where the six months went.

## What "lift-and-shift" assumed, and what was actually true

A lift-and-shift is only as simple as the software you're lifting, and this software was written for a world that has quietly moved on.

Its own installation guide gives it away. The supported Linux list is old-guard enterprise: Red Hat, CentOS, Oracle Linux. The prerequisites read like a machine someone built by hand a decade ago. Install `net-tools` for `netstat`. Make sure `xinetd` or `inetd` is installed and running. Add `bc`, `libuuid`, and a threading library, all via `yum`. It expects `curl` to be present. It wants a fully-qualified hostname that resolves. On the pet server it was designed for, none of that is unreasonable. On a minimal, modern cloud image, all of it is friction, because `inetd` is a museum piece there and the default tools are the `ip` suite rather than `net-tools`.

We ran it on SUSE. That wasn't a preference so much as the only supported distribution that fit. At migration time the vendor supported SUSE, while Ubuntu, Debian, and Amazon Linux weren't supported then and still aren't. The choice of OS was made for us by a compatibility matrix, not by what would have been easiest to operate in AWS.

On top of that, only the vendor was allowed to install the software. Our job was to prepare the box, wire up the network, and hand it over. So we owned everything about how the system behaved in production while watching its installation from the sidelines, run by someone whose comfort zone stopped at the application and never reached the host.

Put those three facts together and the shape of the project is already set. The software assumes an environment that no longer exists, it has to be installed by someone who can't adapt it to the environment that does exist, and we're on the hook for making the result reliable. Everything that came after was a discovery of one more thing the software assumed and never said out loud, and us building the fix from the outside.

## Logs that resist being read

The first thing that broke after the hostname was visibility. The first thing you want from a system you're responsible for is to see what it's doing, and this software actively fought that.

Its logs were scattered across multiple directories, one per internal service. None of them carried a timestamp you could rely on. They were truncated and rewritten on every restart, so the moment you restarted the service to recover from a problem, the evidence of that problem vanished with it. The only live health signal was an endpoint you could `curl`, which returned a large XML document describing the state of every internal connection. Readable if you squinted hard enough, and useful to no machine.

So we built the observability the application refused to provide. Using the cloud's own agent-management, and without modifying the application, we:

- Installed a log-shipping agent that tails every one of those scattered log files into centralised log groups, with real retention measured in weeks and months instead of "until the next restart." Timestamps and multi-line handling were applied on the way in, so a stack trace stays one event instead of shattering into fifty.
- Added a second agent that periodically scrapes the `curl`-able XML health endpoint, parses it, and turns it into actual metrics: per-connection pool size, available connections, and failed connections, all published as time series you can alarm on. The XML blob that used to be the only way to monitor the thing became structured data.

We delivered both through the cloud's remote-configuration mechanism rather than baking them into the machine image. That was deliberate, because these are long-lived pets, not cattle you replace. The config re-applies itself idempotently to the running instance instead of forcing a rebuild, which matters for a box that a third party installs by hand and that you can't casually reprovision.

## Ports nobody could name, and a direction nobody knew

The next surprises came out of the networking, and both trace back to the same root: assumptions baked into the software that nobody on the vendor side could articulate.

First, the ports. Instead of a small, well-known set, the application listens on a sprawl of arbitrary high ports, a different one per internal service and per environment, hardcoded into its configuration. Every one had to be discovered, written into firewall requests, and matched exactly on both the cloud security groups and the on-prem firewall. There's no documented "here are the three ports you need." There's a spreadsheet you assemble by reading config files.

Second, and more expensively, the direction of traffic. The initial understanding from the vendor side was that the server only needed to be *reached* by the on-prem systems, inbound only, and the whole network design was drawn on that basis. Partway through, it turned out the application also needs to *initiate* connections back to on-prem. That single correction rippled through everything: new firewall rules in the other direction, NAT arrangements, security-group changes, and a rethink of the network path, all of it landing well after the point where it should have been settled. The change wasn't hard technically. It was expensive because it arrived late and invalidated decisions we'd already made.

## Silent death

The worst assumption showed up last, and it's the one that would have hurt most in production.

When the on-prem system the application depends on restarted, the application's own connection died. It didn't recover, didn't retry, and logged nothing useful about any of it. The process sat there, up but dead as a service, telling no one. Silent failure is the most dangerous kind, because your dashboards stay green and your users end up being the monitoring system.

Since we couldn't make the application heal itself, we wrapped it in a loop that does the healing for it:

- A health check runs on an interval, polling the application's endpoints and publishing a simple up/down metric.
- An alarm watches that metric. When the service goes down, the alarm fires.
- The alarm triggers an automation document that restarts the application's services in the right order and as the right service user, and a notification goes out so a human knows it happened.

Watching it run turned up two refinements. One of the application's own internal components leaks memory over time, so alongside the full-stack restart there's a lighter, targeted action that restarts just that leaking component of the vendor's software instead of bouncing everything, plus a scheduled maintenance restart to stay ahead of the leak. The result detects its own silent death and recovers without a human, which is the baseline the software should have offered on its own.

## The upgrade that can't happen in place

Backup was the one part of this that behaved like ordinary infrastructure. The application keeps its state on disk across the OS volume and several large data volumes, so we put the whole instance under the cloud's managed backup service: an encrypted vault, a daily plan with a fixed retention window, automatic snapshots by matching on the instance's tags. It's ours, it sits underneath the application, and there was nothing to fight. That makes it the exception here, which is why it gets one paragraph.

Upgrades are where it gets strange, and where the pet-versus-cattle distinction breaks in an interesting way. Operationally this box is a pet through and through: a third party installs the software by hand, you can't casually reprovision it, and its state lives on disk. But the OS underneath can't be upgraded like a pet. The SUSE image comes from an internal AMI pipeline rather than the distribution's own update channels, so there's no in-place OS upgrade path and no running the usual `zypper`-style dist-upgrade on the live box. Every OS upgrade means a fresh instance built from a newer image.

That forces an awkward hybrid. The layer you'd normally treat as a replaceable, cattle-style artifact, the OS image, is the one thing you *must* replace wholesale to move forward. The layer you'd love to make disposable, the hand-installed application on top, is the pet you can't easily rebuild. If a forced OS swap meant redoing the whole install by hand every time, upgrades would be a multi-day ordeal on every bump.

So we designed the box specifically so that a fresh instance is cheap and the vendor's work survives it. Three deliberate choices carry most of the weight:

- **OS-level prerequisites go in user-data.** Every package and system tweak the software expects (the `net-tools`, `bc`, `libuuid`, the hostname mapping, and the rest of the old-world checklist) gets installed by the instance's boot script, so a newly provisioned image configures itself with no manual steps.
- **The vendor's install and data live on separate EBS volumes.** The application and its state sit on data volumes rather than the root volume. On upgrade, those volumes detach from the old instance and reattach to the new one, so the vendor's hand-installation comes across intact and nobody has to reinstall anything.
- **The observability and self-healing scaffolding is delivered as re-appliable configuration.** The agents, health checks, alarms, and restart automation are pushed to the instance idempotently rather than hand-configured, so they re-apply themselves to the new box.

With that split, an OS upgrade becomes routine: provision a new instance from the newer image, let user-data lay down the prerequisites, move the data volumes over, and let the configuration re-apply. The one thing we can't fully automate, the vendor's own installer, is also the one thing we arranged never to have to run again, because it lives on a volume that outlives the instance. Here the automation isn't a nicety. It's what turns a mandatory-reprovision upgrade from a repeat of the original six months into a routine swap.

## Expectation versus reality

Here's the whole project in one picture: what was scoped, next to what was actually required to make it real.

![Two panels contrasting the planned work with the delivered work. On the left, "The ticket": a single box labelled third-party server, one arrow, a cloud labelled AWS VM. Simple. On the right, "What shipping it actually needed": the same VM in the cloud, connected up to a log-shipping agent (tailing scattered, untimestamped logs into central log groups) and a metrics agent (scraping the curl/XML health endpoint into real metrics), across to an on-prem ERP with a bidirectional link (hardcoded high ports), and down to a row of three operability pieces we had to build: a self-healing loop (poll endpoints, publish an up/down metric, alarm on down, auto-restart services, notify a human), managed backup (daily snapshots of every volume to an encrypted vault, tag-based selection), and a reprovision-based upgrade path (no in-place OS upgrade, so prerequisites live in user-data, data on detachable volumes, and the config re-applies to a fresh instance).](_lift-and-shift-assets/expectation-vs-reality.svg)

The left side is what everyone agreed to. The right side is what it took, and nearly all of it is scaffolding we built around software we couldn't change, to give it the operability it never had.

## What it came down to

- **A lift-and-shift is only as simple as the software you're lifting.** Moving the VM was days of work. Making the thing on it operable in a modern environment took six months, because the software assumed an environment that has largely disappeared.
- **When ownership and access are split, the gap becomes the project.** We owned whether the system worked in production, only the vendor could install it, and the vendor couldn't operate the host. Everything hard lived in that gap.
- **Operability you don't get from the vendor, you build from the outside.** Logs by tailing scattered files, metrics by scraping a `curl` endpoint, recovery by wrapping the process in a health-check-and-restart loop. You can't fix a black box, but you can surround it with one that behaves.
- **A black box's assumptions become your architecture.** Its hardcoded ports turn into your firewall rules. Its undocumented need to dial outbound turns into your late redesign. You inherit every decision the vendor never bothered to write down.
- **The pet-versus-cattle line can fall in the wrong place.** The application is a pet you can't rebuild, and the OS image is cattle you're forced to replace just to upgrade at all. When your only upgrade path is reprovisioning, deciding what lives on the disposable instance and what outlives it is the whole game.

The one-line `/etc/hosts` fix is the whole story in miniature. A trivial, well-understood problem, invisible to the people who owned the software and obvious to anyone who actually understood the machine. That's what the six months bought: a system that anyone can rebuild, wrapped around a box only the vendor could install and only we could keep alive.
