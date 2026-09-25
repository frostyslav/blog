---
author: Rostyslav Fridman
pubDatetime: 2026-09-25T09:00:00Z
title: The 502 nobody could find
featured: false
draft: false
tags:
  - aws
  - authorization
  - oidc
  - saml
  - debugging
  - war-stories
description: "A legacy app served through a chain of gateways was throwing intermittent 502s to hundreds of call-center agents. A CIO escalation had run for two months with nobody able to say which component was failing. I joined as the new architect, tried to trace it the way everyone else had, hit the same wall, and concluded the wall was the point: stop hunting the fault, start removing components until it has nowhere to hide. This is that story, the identity provider being misused as a gateway underneath it all, and the two-stage design that shipped."
---

I joined this project as an external consultant, brought in as the architect to replace the one rolling off. I arrived on-site at the start of a program increment, which meant my introduction to the system was also an introduction to its biggest open problem: a legacy application, reached through a chain of gateways, was returning intermittent 502s. Only a small percentage of requests, but the users were call-center agents, hundreds of them, and a small percentage across hundreds of people answering phones all day is a steady stream of failures. It had been escalated to the top and left open for roughly two months, and nobody could say which component was throwing the error.

So I did what a new architect does: I spent real time trying to understand it. I traced the request path, read the logs people pointed me at, and tried to build the mental model that would let me find the failing hop. I hit the same wall everyone else had hit, and hitting it myself is what changed my mind about the problem. The conclusion I came to wasn't a solution. It was a method: if the system can't be explained well enough to find the fault, stop searching for the fault, and start removing components until it has nowhere left to hide. This post is about how that played out, the design mistake sitting underneath the whole mess, and the two-stage authorization gateway that shipped to replace it.

## Table of contents

## A small percentage, a large problem

The failure was easy to underweight if you only looked at the rate. A few percent of requests returned a 502. On a dashboard that's a rounding error. In a call center it's an agent who clicks into a customer record, gets an error page, clicks again, and gets in on the second try. Multiply one retry across hundreds of agents and a full working day and you have a constant drip of "the system is broken," even though the application behind it was fine.

502 is a specific kind of unhelpful. It means a gateway or proxy got a bad response from something upstream of it. It doesn't tell you which hop failed, only that the hop reporting it was disappointed by the next one along. When your request path is a single proxy in front of an app, that's enough to go on. When your request path is a chain of proxies and gateways, each capable of emitting its own 502 for its own reasons, the status code tells you almost nothing.

That was the situation. The traffic crossed several gateways on its way to the legacy app, and for reasons nobody could reconstruct it had been arranged to fan out across a handful of them. Two months of investigation had produced logs, timeout tweaks, and theories, but not an answer to the one question that mattered: which component is returning the 502.

## Why nobody could find it

The investigation wasn't lazy. It was thorough in the way that doesn't work, and I say that as someone who joined it. People had checked logs at each hop, compared timeouts, traced individual requests, and proposed changes to keep-alive and idle-timeout settings. The trouble was structural. The architecture had enough components, enough network hops, and enough shared responsibility across teams that no single person held the whole picture, and the failing requests weren't consistent enough to pin to one box. Coming in fresh didn't help me see through it; it just meant I reached the same dead end faster, without the sunk cost that made everyone reluctant to call the approach itself into question.

One hop in particular couldn't even produce enough log detail to confirm or rule it out. That's the quiet killer in a long request chain: a component that fails without saying so clearly turns every investigation into guesswork about the components around it. You end up debugging the neighbors of the thing that's actually broken, because the broken thing won't tell you anything.

The instinct in that spot is to keep looking. Add logging, trace harder, correlate across hops. That instinct is what had eaten two months. Piling more observability onto a system this tangled just hands you more places to look. The problem was never a shortage of data. It was a surplus of components.

## Remove components until the fault has nowhere to hide

The reframe I pushed was simple and slightly uncomfortable: you are not going to find this by looking harder, because the thing that makes it hard to find is the number of moving parts. So reduce the parts.

This is the same instinct I keep coming back to in other systems, most recently a [Bedrock pipeline I shrank by deleting components one at a time](/posts/designing-agentic-ai-on-bedrock/) until there was nothing left to remove. A fault that can hide behind six components cannot hide behind two. Every hop you delete is a hop that can no longer be the culprit, and a hop whose logs you no longer have to interpret. Simplification is a debugging tool, not just a cleanliness preference. You simplify until the system is small enough that the fault has to reveal itself, because there's nowhere left for it to be.

Applied here, that meant a hard question about the request path: how many of these gateways actually need to exist for a user to reach the app securely. The honest answer was far fewer than were in the path. That turned a two-month debugging failure into an architecture problem, which was a much better problem to have, because architecture problems have solutions and "find the intermittent 502" did not.

## The mistake underneath: an identity provider used as a gateway

Once you looked at it as an architecture question, the root cause stopped hiding.

The corporate identity provider was doing two jobs. It was the identity provider, which is what it's for. It was also being used as a traffic gateway, proxying requests through to the on-prem application, which is not what it's for. An identity provider is built to answer one question well: who is this user. Turning it into a proxy in the data path means every request, not just every login, now depends on a component that was designed and scaled for authentication events, not for carrying application traffic. That's the component that couldn't log enough to defend itself, and it's a strong candidate for where the intermittent failures were born.

That single design choice, an identity provider pressed into service as a gateway, is what made the rest of the architecture the way it was: the extra hops, the fan-out, the shared and blurry responsibilities, the request path that no one could hold in their head. Fix that one misuse and most of the complexity has no reason to exist.

What I wanted was almost aggressively simple: put a load balancer in the cloud in front of the on-prem app, do the identity check with OIDC against the identity provider, and stop there. Let the identity provider be an identity provider. Delete the gateway role entirely.

![Before and after, at the pattern level. On the left, the tangled path: a user's request crosses an identity provider that is also acting as a gateway, then fans out across several proxies and gateways and network hops before reaching the legacy app, with a red 502 emitted somewhere in the middle that nobody can localize. On the right, the simplified path: a user reaches an external ALB that does an OIDC check against the identity provider (now used only as an identity provider, not in the data path), then an internal ALB that obtains a SAML assertion from the same identity provider and hands it to the unchanged legacy app, which trusts the assertion and authenticates nothing itself. Far fewer hops, and a clear owner for each.](_authz-gateway-assets/before-after.svg)

## The design that shipped

The clean version I sketched wasn't quite the version that shipped, for a simple reason: I didn't own all the pieces.

The identity provider component running in the cloud was operated by a third-party vendor as a managed service inside the company's environment. Changing how it behaved meant asking them, and waiting to hear whether they were willing. And the legacy application couldn't be modified at all. So the shipped design is the pragmatic form of the simple idea, arranged to work within those two constraints rather than pretending they weren't there.

It settled into two separate authorization stages, each handled by a load balancer, and crucially neither of them handled by the application.

- **Stage one** happens on the external (public) ALB. A user arrives, and if they don't already carry the edge's authorization cookie, the ALB starts an OIDC flow against the identity provider. This decides one thing: is this an authorized employee who may reach the internal path at all. The identity provider is doing its actual job here, answering "who is this," not proxying traffic.
- **Stage two** happens on the internal ALB, and this is the part I had to get right. The legacy application trusts exactly one thing: a valid SAML assertion. It checks no credentials and runs no login of its own; it accepts any request that carries a good assertion. So the internal ALB inspects every request for that assertion, and if it isn't there, it redirects the browser to the identity provider's SAML endpoint. The assertion comes back through the browser and is handed to the app, which is now satisfied.

The reason to keep the stages separate is that they answer different questions with different protocols against the same identity provider. Stage one, OIDC at the edge, is a coarse gate: are you an authorized employee at all. Stage two, SAML at the internal ALB, produces the specific artifact the app requires to trust you. The application does no authentication of its own in either stage; both are done in front of it, which is exactly why the overloaded identity-provider-as-gateway could be taken out of the data path without touching the app.

The layered defense falls out of this naturally. You cannot obtain a SAML assertion for stage two unless you have already cleared OIDC at stage one, because the internal ALB is only reachable through the external one. There is no path where a request reaches the app with a valid assertion but no prior edge authorization. The two stages aren't redundant, they're a sequence you can't start in the middle.

![The shipped two-stage flow. The identity provider sits across the top, used only for identity and never in the data path. Along the bottom, the request runs left to right: user, external ALB, internal ALB, legacy app. Stage one is a vertical exchange between the external ALB and the identity provider over OIDC: no edge cookie means start an OIDC flow, and once the user authenticates the request is allowed onto the internal path. Stage two is a vertical exchange between the internal ALB and the same identity provider over SAML: no assertion on the request means redirect the browser to the identity provider for one, and the assertion then travels with the request to the app. The legacy app is unchanged and passive; it trusts a valid SAML assertion and runs no login of its own. Because the user already cleared OIDC at stage one, the SAML step needs no second credential entry.](_authz-gateway-assets/two-stage-flow.svg)

The one place I chose to spend money was at stage one, and the reason is a subtle SSO detail worth spelling out. A plain ALB doing OIDC only knows about its own authorization cookie. If that cookie is missing, it starts an SP-initiated login, every time, no matter what. That sounds harmless until you notice how people actually used the system: many of them logged into the identity provider directly first, an IdP-initiated login at the portal, and only then clicked through to the application. A plain ALB doesn't know or care that the user already has a live IdP session. Its cookie isn't there, so it kicks off SP-initiated SSO anyway, and the user who just logged in gets marched through login a second time.

To an engineer that's a redirect. To a call-center agent it's the tool asking them to log in twice for no reason, which reads as exactly the kind of bug this whole project existed to kill. So at stage one I used Amazon Cognito instead of raw ALB OIDC, because it can check with the identity provider whether the user is already authorized and skip the redundant login when they are. Cognito is billed per monthly active user, and the edge saw north of 50,000 a month, so this was a real recurring cost I had to justify. I justified it as the price of not recreating the "this is broken" perception for the many users who happened to log in at the portal first.

## The 502, in hindsight

I won't claim a tidy "and the root cause was exactly this line" ending, because removing the components was the fix, not isolating the culprit. Once the identity provider was out of the data path and the request chain was short and clearly owned, the intermittent 502s stopped being a thing users hit. The failing hop was gone, or at least no longer carrying load it wasn't built for, and it no longer mattered which. The question that had consumed two months, "which component is throwing the 502," stopped needing an answer because those components no longer sat in the path.

That's the part I'd underline for anyone staring at a similar escalation. You are allowed to solve an intermittent-failure problem by making the failure impossible to reach rather than by identifying it. A simpler system isn't only nicer to operate. It's what lets you beat the bug at all.

## What it came down to

- **A small error rate across many users is a big problem, and a 502 in a long chain tells you almost nothing.** Judge failures by who hits them and how often, not by the percentage on a dashboard.
- **When a system is too tangled to debug, the tangle is the bug.** More logging and more tracing on an over-connected architecture buys you more places to look. Removing components buys you fewer.
- **The root cause was a role confusion.** An identity provider was being used as a traffic gateway. Giving it back its one real job removed most of the complexity that made the failure unfindable.
- **The shipped design respected the constraints instead of wishing them away.** A third party operated the identity component and the legacy app couldn't be touched, so the two-stage split was built to work within both.

I joined this project as its new architect, and the first thing I did was try to solve the escalation the way everyone else had, by understanding it. Failing at it the same way was the useful part. It's what let me argue that the fault wasn't hiding in a log we hadn't read yet, it was hiding behind components we didn't need. Sometimes the fastest way to find the thing breaking your system is to delete the places it could be hiding.
