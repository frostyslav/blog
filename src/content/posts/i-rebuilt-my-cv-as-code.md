---
author: Rostyslav Fridman
pubDatetime: 2026-08-29T09:00:00Z
title: I rebuilt my CV as code
featured: false
draft: false
tags:
  - side-projects
  - job-search
  - open-source
  - web
description: For years I kept my CV in a Word document. Then I went job hunting and discovered the landscape had completely changed. So I turned my CV into a data-driven static site.
---

For years, my CV lived in a Word document. The workflow was simple and, I thought, fine: open Word, make the changes, export to PDF, send it off. On the side I kept LinkedIn and Xing more or less current, and back when I was still in Ukraine, [Djinni](https://djinni.co/jobs/) too.

(An aside on Djinni, because it's genuinely a good idea: it's an anonymous, candidate-first job platform. Recruiters see your skills but not your identity. Only if _you_ decide you're interested in a role do you reveal your profile to that recruiter. It flips the usual power dynamic, and I wish more markets had something like it.)

## Table of contents

## The Word document treadmill

I tried to modernize a few times. Google Docs, LibreOffice, the usual suspects. The problem is that none of them round-trip cleanly to Word format. Open a `.docx` in Google Docs, edit it, export it back, and the formatting is subtly (or not so subtly) broken. So I kept crawling back to Word, because that's what the exported PDF needed to look right.

Eventually I put up a basic personal site. I hosted it on GitHub, which felt like progress, but it didn't actually solve anything. It was just _another_ place to keep my skills and updates in sync. The Word document still existed. The site was a parallel copy, maintained by hand.

This worked fine for a couple of years, mostly because I wasn't looking for work.

## Then I went job hunting

And the landscape had changed while I wasn't paying attention.

Getting to an actual human being is hard now. Your CV first has to survive a gauntlet: AI screeners, bots, and Applicant Tracking Systems (ATS) that parse your document and decide whether a person ever sees it. And the expectations for what's _in_ the CV have escalated too:

- Achievements with quantifiable data, not just responsibilities
- Non-conflicting job dates (a real headache if you've done contractor work with overlapping engagements)
- Links to portfolios, open-source projects, and blog posts (no comment on why you're reading this one)

Maintaining one Word file, one LinkedIn, one Xing, and one hand-rolled website, all by hand, all in different formats, went from mildly annoying to completely untenable. Every update meant editing the same information in four places and hoping I didn't miss one.

So I did the thing I always do when a manual process becomes painful: I turned it into a project.

## CV as code

The result is [personal-cv-static-site](https://github.com/frostyslav/personal-cv-static-site). The core idea: my CV content is **data**, not a document. It lives in YAML files. The presentation is separate, handled by templates. And everything gets generated from that single source of truth.

The content sits in plain YAML:

- `experience.yaml` for work history
- `skills.yaml` for skill categories
- `projects.yaml` for open-source work and speaking
- `education.yaml`, `certifications.yaml`, and so on

Any developer or devops person can maintain this in about two minutes. No fighting a word processor, no formatting drift. Change a line of YAML, commit, done.

The build pipeline is deliberately boring: a framework-free Node.js build compiles the YAML into HTML via Handlebars templates, bundles and minifies the CSS and JS, and fingerprints everything for caching. It's fast and there's nothing to rot.

## Built for the modern gauntlet

Since the whole point was surviving the ATS-and-bots gauntlet, the site is built to be readable by machines as well as humans:

- **ATS-friendly**: a single page with a correct heading hierarchy, so parsers extract the right structure
- **Accessible**: ARIA labels, proper color contrast, keyboard navigation
- **SEO-friendly**: `robots.txt`, `sitemap.xml`
- **LLM-agent-friendly**: an `llms.txt` file, so when an AI agent comes crawling (and increasingly they do), it finds a clean description of who I am
- **Dark and light modes**, and **multiple languages** (I ship English and German)

## The best part: automatic PDF generation

The site doesn't just render in a browser. The build also generates PDF versions of the CV automatically. Multiple versions, in fact: two per language, one with a phone number and one without.

The download link on the site points to the version _without_ the phone number, which is the safer default for something publicly downloadable. If a recruiter needs the number, that version exists too.

So the whole "maintain a Word doc for the PDF" problem simply evaporates. One repository, a handful of YAML files, and I get a live website, multiple localized PDFs, and machine-readable metadata, all from the same source. When something changes, I edit one YAML file and everything regenerates.

## Open source, with your data kept private

The project is [open source](https://github.com/frostyslav/personal-cv-static-site) and ships with sample data (a fictional Jane Doe) so it builds out of the box. You can clone it, run `npm run build`, and see a complete CV site immediately.

My own personal data lives in a separate private repository. The build reads content from an external directory via environment variables, so the public project has the machinery and the private repo has the actual information. Fork the public one, point it at your own private data, and you've got the same setup.

Deployment is the same stack I use for this blog: Cloudflare Pages via GitHub Actions, using Wrangler. Push to `main`, and the site rebuilds and redeploys itself.

## Credit where it's due

Turning a CV from a list of job responsibilities into something with quantifiable, punchy achievements is its own skill, and not one that comes naturally to most engineers (myself included). I got a lot of mileage out of Kevin Burns' [claude-skills](https://github.com/kevin-burns/claude-skills/) repository, specifically the [cv-and-human](https://github.com/kevin-burns/claude-skills/blob/main/cv-and-human) and [cv-evidence-base](https://github.com/kevin-burns/claude-skills/blob/main/cv-evidence-base) skills. They're worth a look if your CV reads like a job description and you want it to read like accomplishments instead.

## The pattern, again

If you've read my other posts, you'll recognize the shape: something I care about was trapped in a format that didn't serve me, spread across places I had to sync by hand. So I made it data, put it in version control, and let a build pipeline handle the rest.

You can find [personal-cv-static-site on GitHub](https://github.com/frostyslav/personal-cv-static-site), and the result of it running at [cv.rostyslav.eu](https://cv.rostyslav.eu).
