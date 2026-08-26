---
author: Rostyslav Fridman
pubDatetime: 2026-08-25T09:00:00Z
title: Making sense of my own DNA with OSGenome
featured: true
draft: false
tags:
  - genomics
  - python
  - open-source
  - side-projects
description: How an underwhelming Ancestry test sent me down a rabbit hole of raw DNA files, SNPedia, and an open-source project I ended up rebuilding to work with my own data.
---

It started, as a lot of my side projects do, with a small disappointment.

## Table of contents

## The test that left me wanting more

I took an Ancestry DNA test expecting to learn something about myself. What I got back was a tidy pie chart of regions and a list of relatives I'd never met. It's a nice product, genuinely. But after ten minutes of clicking around, I'd seen everything there was to see. The report is polished, curated, and closed. There was no "why," no way to dig into the actual data, and no room to ask my own questions.

The thing is, that test wasn't just a pie chart. Under the hood, Ancestry had genotyped **over 700,000 SNPs** from my sample. A SNP (single-nucleotide polymorphism, pronounced "snip") is a single spot in your genome where one base is swapped for another, and it's the most common form of genetic variation we have. These are the little switches that research has tried to associate with everything from how you metabolize caffeine to whether cilantro tastes like soap to you. I had 700,000 of them sitting behind a pie chart, and I couldn't touch any of them.

That bugged me more than it should have.

## Getting my hands on the raw data

Here's the part a lot of people don't realize: most of these testing services let you **download your raw DNA data**. It's usually buried a few menus deep, but it's there. A little searching and I had my own file, a plain text export with hundreds of thousands of rows, each one an SNP id, a chromosome position, and my specific genotype.

So now I had the raw material. What I needed was a way to give it meaning without handing it off to yet another service with a privacy policy I'd have to squint at. Because let's be honest about what this data is: it's not a password you can rotate. It's *you*. I really didn't want to upload it somewhere and hope for the best.

## Finding a project that already got it right

Before writing anything myself, I went looking, and I found an open-source project built around exactly this idea. It cross-referenced raw genetic data against [SNPedia](https://www.snpedia.com/), a community-maintained wiki of what individual SNPs are associated with, and presented the results in a filterable grid you could explore at your own pace. Everything ran locally. Your DNA never left your machine. It was the right philosophy.

There was just one problem: it didn't work with my data.

The project was built for a different provider's export format. And formats, it turns out, are where genomics gets fiddly. Different services use different delimiters (Ancestry uses tabs, others use commas), different column layouts, and, more subtly, different genome *builds* and orientations. That last one is the sneaky part. SNPedia reports SNPs against the build it was originally created from, while modern testing vendors use a newer reference. When the orientations don't line up, you can end up reading a genotype backwards without realizing it.

## Making it work with Ancestry data

So I rolled up my sleeves and adapted it. That's how I ended up with **[OSGenome](https://github.com/frostyslav/OSGenome)**.

The goal was simple to state and annoying to get right: take an Ancestry raw DNA export, cross-reference it against SNPedia, and show me what my genotypes actually mean, all locally. Along the way that meant handling Ancestry's tab-separated format, dealing with the orientation and build mismatches so the genotypes line up correctly, and being a respectful citizen of SNPedia's servers by rate-limiting the crawler instead of hammering their API.

The result is a small Flask web app. You point the crawler at your raw data file:

```bash
python3 SNPedia/data_crawler.py -f /path/to/your/ancestry_raw_data.txt
```

It fetches SNP information from SNPedia a few hundred at a time (so you get something to look at quickly rather than waiting for the whole encyclopedia), then serves up a responsive grid where you can filter, sort, highlight your specific genotype, export to Excel, and jump straight to any SNP's SNPedia page to read the research yourself.

A few things I care about that made it into the project:

- **Your data stays yours.** Everything is processed and stored locally. The only outbound requests are to SNPedia's public API to look up what SNPs mean, never your genotypes.
- **It's incremental.** Ancestry has ~700k SNPs; SNPedia meaningfully covers around 20,000 of them. The crawler chips away at that set and keeps track of progress, so you can run it whenever and pick up where you left off.
- **It's honest about uncertainty.** The orientation handling is deliberately conservative, and the project points you at the underlying research rather than pretending to hand you conclusions.

## A word of caution (that I mean sincerely)

It would be easy to read a grid like this and start drawing dramatic conclusions about yourself. Please don't. Direct-to-consumer genetic tests have been found to carry a [false-positive rate around 40%](https://www.nature.com/articles/gim201838) for clinically significant variants. This is a tool for curiosity and learning, not diagnosis. Anything that looks health-relevant belongs in a conversation with a doctor and a proper clinical lab, not a hobby project on your laptop.

There's also a real temptation, and the SNPedia folks are refreshingly upfront about this, to see meaning in noise. A lot of SNP associations are weak, contested, or drawn from small studies. OSGenome is at its best when you treat it as a starting point for reading, not an oracle.

## An update: OSGenome2 and local AI

Since I started down this path, the original maintainer has released a new version in a separate repo, [OSGenome2](https://github.com/mentatpsi/OSGenome2). The headline feature is a genuinely exciting one: you can point **local Ollama AI models** at your data to read and explain it in plain language. That fits the whole ethos perfectly, an LLM interpreting your genome without a single byte leaving your machine.

The catch, familiar by now, is that it's built for 23andMe data rather than Ancestry. So I've started adapting it the same way I did the first time. My hope is that the PRs get accepted upstream so everyone benefits. If they don't, I'll carry on the work in my own fork. Either way, the adaptation continues.

## Why I keep coming back to projects like this

I spend my working life on cloud architecture and platforms at scale, so there's something grounding about a project this personal. It's my own genome, my own laptop, my own questions. No enterprise, no SLA, just curiosity and a text file with 700,000 rows in it.

If you've taken one of these tests and felt that same little pang of "is that it?", go download your raw data and poke at it. The code is open source and runs entirely on your machine. You can find [OSGenome on GitHub](https://github.com/frostyslav/OSGenome), and I'd genuinely love to hear what you find, or what format you want it to support next.
