---
author: Rostyslav Fridman
pubDatetime: 2026-10-02T09:00:00Z
title: The four weeks I spent not doing my job
featured: false
draft: false
tags:
  - management
  - leadership
  - war-stories
  - consulting
  - aws
description: "Another semi-management story. On an AWS ProServe engagement, a big four partner had already owned the project for six months, and they wanted us nowhere near the real work. My first instinct was to push for a seat at the decision-making table, and that instinct was the problem. Here is what four weeks of deliberately not doing my job cost, the technical debt I watched pile up, and why the trust-building turned out to be the work itself."
---

Most of what I write here is about systems. This one is about four weeks I spent not doing the job I was brought in to do, on purpose, while the problems I'd eventually have to fix piled up in front of me. I didn't plan it that way. I had to be wrong first.

## Table of contents

## What ProServe actually is

I was on an AWS Professional Services team, and ProServe does not run a customer's production. That belonged to the partner and the customer. We showed up to enable: best practices, prescriptive guidance, the architecture decisions that are hard to walk back, and the right tooling for the problem. "Right" was doing real work in that sentence. On this engagement the right tool was Terraform and Terragrunt rather than CDK or CloudFormation, and we said so, even though one of those is the AWS-branded answer. We weren't there to sell the branded answer. We were there to leave the team better than we found it, and then leave.

Here's the part that matters for this story: a ProServe consultant cost the customer two to three times the hourly rate of a partner consultant. We were expensive by design and temporary by design. Hold on to both of those, because they are exactly what the people already on the project were holding on to.

## Joining a project someone already owned

A big four consultancy had been on this project for about six months before we arrived. They'd built a real relationship with the customer and done solid preliminary work. By any reasonable measure it was their project, and they ran it like it was.

Then we showed up.

The partner did not like us, and I want to be precise about why. From where they sat, a group of outside consultants billing two to three times their rate had just been inserted into a project they'd owned for half a year. People who talked like they knew better and cost like it too. Their mistrust wasn't paranoia; it was a correct reading of the incentives. In their chair, I'd have guarded the architecture decisions and kept the newcomers out of the loop too.

So they did. No meaningful work shared, no visibility into the decisions being made, polite distance on everything that counted.

## My first instinct, which was wrong

My instinct was to push in. We were there to help with the exact decisions they were walling us off from, so the obvious move was to make the case for a seat at that table. Argue the value. Point at the architecture choices we could improve. Get into the room where the decisions happened, because that's where the job was.

It took me longer than I'd like to admit to see the flaw in that.

Pushing for influence before you've earned trust doesn't read as helpful. It reads as confirmation. Every argument I made for why we belonged in the decisions was, from their side of the table, more evidence that we'd come to take them over. I'd have been spending their only scarce resource, their patience, to prove the thing they were already afraid of. You cannot earn trust by demanding the thing trust is supposed to unlock.

## Hitting the brakes

So I told my team to stop. Not slow down. Stop pushing to get into the decision-making at all.

Instead we were going to make one thing unmistakable at every turn: we were there to help them, and then we were there to leave. Not to take over. Not to stay. Not to walk off with their project or their relationship with the customer.

In practice that was smaller and more disciplined than it sounds:

- We brought suggestions to the partner directly and privately, never to the customer over their heads.
- We let them present. The findings, the recommendations, the improvements. Their names on it, their meeting, their credit.
- We framed everything as "here's what we've noticed, but it's your call." Then we meant the second half. When they made a different call, we let it stand.

None of that is complicated. All of it was uncomfortable, because every instinct I have as an engineer pulled the other way.

## What it cost

This was not free. Deferring meant watching decisions get made that I'd have made differently, and progress ran slower than it needed to. Technical debt crept in, the ordinary kind that accumulates when the people with the loudest "here's a better way" are deliberately keeping quiet. We knew we'd clean it up later. We did.

I signed up for that cost on purpose, and that was the hard part. I wasn't tolerating the debt because I couldn't see it. I was tolerating it because being right loudly and early would have cost more than the debt did.

And it cost me something harder to put on a ledger. I came to do the work, not play politics. I had opinions about the architecture that were correct and useful, and I sat on them, week after week, to manage a group of people's feelings about my presence. I spent almost a month proving I wasn't there to steal anyone's work, before anyone would let me do any. Described in advance, that sounds absurd. It wasn't. It was the job. I just hadn't understood that yet.

## There was no turning point

There's no scene here. No moment where the partner lead looked at me across a table and decided I was alright. Trust doesn't arrive as an event; it accumulates.

What happened was duller. After enough weeks of deferring, letting them lead, handing them the credit, and meaning it when we said "your call," they relaxed. No announcement, no handshake moment. Almost four weeks in, we were collaborating the way the engagement was always meant to work, and I couldn't point to the day it started. Trust gets built slowly and quietly, and anyone selling you an epiphany is selling you fiction.

## What it came down to

- **The trust-building was the job, not a tax I paid before it.** The architecture guidance I was so eager to deliver was worthless until someone was willing to receive it. Making someone willing was the actual deliverable those four weeks.
- **When your presence is a credible threat, de-threatening yourself comes first.** Their mistrust was rational, and you don't argue someone out of a rational fear. You behave your way out of it, consistently, for longer than feels necessary.
- **Credit is a tool, not a reward.** Letting the partner present our findings under their name wasn't generosity. It was the mechanism that made the next finding welcome. If you need the credit, you're there for yourself, not to enable anyone.

So here's where it leaves me. I spent almost a month doing the opposite of what I'm good at, to earn the right to be good at it, for people who started out wishing I'd go away. And it worked. Those weeks weren't a failure of the engagement. They were the engagement.

If I land in the same spot again, I think I'll recognize it faster now, even though the instinct to just fix the thing will still be pulling the other way. It's strongest at exactly the moment it's most wrong.
