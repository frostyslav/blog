---
author: Rostyslav Fridman
pubDatetime: 2026-09-02T09:00:00Z
title: I can run AI models on my gaming PC now
featured: false
draft: false
tags:
  - local-ai
  - ollama
  - self-hosting
  - hardware
  - privacy
description: I bought a powerful GPU for gaming a couple of years ago. It turns out a Radeon 7900 XTX is also a perfectly good reason to run language models locally.
---

I'm a gamer, which is the part of this story that makes the hardware easy to explain. A couple of years ago, when I built my current PC, I bought a good GPU: an AMD Radeon 7900 XTX with 24 GB of VRAM. The justification at the time was games. High frame rates, high settings, a machine that wouldn't feel obsolete six months later.

That's still what I use it for. But the same card now runs local language models, which is a lot of extra mileage from a component I bought to make explosions look better.

One thing up front: I still use hosted models every day. For the hardest problems and the frontier of what any model can do, a big cloud model is usually the right tool, and I reach for one without hesitation. This post isn't an argument that local replaces cloud. Local models earn a specific slot in the toolbox, the one where privacy, availability, or cost matters more than raw capability. The question was never which is better, but which one for this task, and running my own means I finally get to choose.

## Table of contents

## Ollama is the easy part

The tool that made this practical for me is [Ollama](https://ollama.com/). It packages the annoying parts of running an open model locally into something that feels like installing an app rather than standing up a research project. Install it, pull a model, and it exposes a local API that other software can talk to.

The basic workflow is short:

```bash
ollama pull qwen2.5-coder:14b
ollama run qwen2.5-coder:14b
```

The model downloads once. After that, inference happens on my machine. No API key, no per-token bill, and no text leaves the computer unless I deliberately send it somewhere. Ollama also gives applications a familiar HTTP interface, so tools that support local models can usually point at `localhost` and carry on.

That last part matters more than the command-line chat. A local model earns its keep when it becomes part of things I already do: explaining files, helping with code, searching personal notes, or taking a first pass over data I'd rather not upload to a cloud service. It doesn't need to be the smartest model in the world for that. It needs to be available, private, and good enough.

## The GPU was already paid for

The 7900 XTX has 24 GB of VRAM, which is generous for a consumer card. It's also an AMD card, so the software story has historically been rougher than it is with NVIDIA and CUDA. Ollama's support and the underlying runtimes have improved a lot, but the practical rule still holds: hardware support is part of the experiment. On AMD that means the ROCm stack has to actually recognize your card, and a model that fits in theory can still crawl if the runtime falls back to the CPU without telling you. It's worth confirming the GPU is doing the work:

```bash
ollama ps
```

The `PROCESSOR` column tells you whether a loaded model is running on GPU, CPU, or split across both. If it says CPU when you expected GPU, that's your answer for why it feels slow.

I run this on Windows, and the good news is that the setup is boring. Ollama ships as a native Windows application with AMD Radeon support built in, so there's no separate ROCm install or driver dance to do by hand. You install it, it runs in the background, and the `ollama` command shows up in PowerShell. The 7900 XTX is a supported card, so it gets picked up without any of the workarounds that owners of older or unofficial cards have to chase down.

One more thing if you want other machines on your network to reach it, as I do below: by default Ollama only listens on `localhost`. Set the `OLLAMA_HOST` environment variable to `0.0.0.0` so it binds on your LAN, and make sure the firewall lets the port through. Keep that inside your own network, not exposed to the internet.

When it does work, the experience is good. Responses are local, the first token arrives quickly enough for normal use, and I can leave a model running without watching a cloud bill tick upward. I don't need new hardware for every new model either. I already own the expensive part, which changes the economics.

## How fast is it, actually

"Fast enough" deserves a number. Ollama will hand you one if you run a model with `--verbose`:

```bash
ollama run qwen2.5-coder:14b --verbose "Write a haiku about garbage collection"
```

After the response, it prints timing stats. Here is what `qwen2.5-coder:14b` looked like on my 7900 XTX:

```text
total duration:       12.4396372s
load duration:        12.1634424s
prompt eval count:    36 token(s)
prompt eval duration: 86.79ms
prompt eval rate:     414.79 tokens/s
eval count:           13 token(s)
eval duration:        187.153ms
eval rate:            69.46 tokens/s
```

The line that matters is `eval rate`, the generation speed in tokens per second. Here it's **69.46 tok/s**, comfortably faster than I can read. `prompt eval rate` is how quickly it ingested my prompt, which matters more when you feed the model a large context; at 414 tok/s it chewed through the short prompt instantly. The `load duration` is the one-time cost of pulling the weights into VRAM, which is why the very first request after starting a model feels slow and every one after it doesn't.

The more interesting result was a larger model. `qwen3.6:35b-a3b` is a mixture-of-experts model: 35 billion parameters on paper, but only about 3 billion active per token. That is the trick that lets a "35B" model stay usable on consumer hardware.

```text
total duration:       1m9.9225693s
load duration:        44.8768664s
prompt eval rate:     37.11 tokens/s
eval count:           1556 token(s)
eval duration:        24.569784s
eval rate:            63.33 tokens/s
```

It still generated at **63.33 tok/s**, barely slower than the dense 14B model, because the active parameter count is what the GPU actually pushes through per token. The `total duration` of over a minute looks alarming until you read the breakdown: 45 seconds of that was the cold `load duration`, and the model also happened to emit 1,556 tokens of visible chain-of-thought before its three-line answer. The generation itself was fast.

These numbers matter most when a model spills out of VRAM. The same prompt that ran at reading speed on the GPU drops to a crawl once the CPU picks up part of the work. That's the transition worth avoiding.

## Three numbers decide whether a model runs well

The first thing people ask is which model to run. The answer is less exciting than the leaderboards suggest: run the largest model that fits comfortably and stays fast enough that you'll actually use it. Three numbers decide that, and the one on the model card is only the first.

**Parameter count** is a rough measure of capacity. A 7B model is generally more limited than a 14B one, and a 32B model has more room for reasoning and knowledge than either. But it isn't a quality score. Training data, architecture, and instruction tuning matter too, and a well-tuned 8B model can beat a mediocre 14B one on the work you actually care about. The parameters also have to live somewhere. VRAM is finite, and a model that doesn't fit on the GPU spills into system RAM, where the experience shifts from "local assistant" to "I asked a question and went to make tea." For my 24 GB card, 7B and 8B models feel instant, 14B is a good compromise when I want more capable answers, and anything larger has to earn the speed I give up.

**Quantization** is how a model that shouldn't fit does anyway. Weights are stored at a given numerical precision, and quantization uses fewer bits per weight to shrink the memory footprint. You'll see names like `Q4_K_M`, `Q5_K_M`, and `Q8_0`: lower-bit versions use less memory and run faster, higher-bit versions keep more precision, and aggressive quantization can cost quality on hard reasoning or precise language. The numbers make the case on their own. A 14B model at full 16-bit precision wants around 28 GB just for weights, which already overflows my card; the same model at `Q4_K_M` lands closer to 9 GB, leaving comfortable room for context. It's a sliding scale, not a choice between a perfect model and a broken one. A good 4-bit quant can be remarkably capable, while the 8-bit version may not be worth the extra memory.

**Context size** is how many tokens the model can consider at once: instructions, history, pasted text, retrieved documents, and the response as it's generated. More sounds better right up until the memory cost arrives, because the runtime needs a KV cache that grows with the context. A model that was fast at 8,192 tokens can crawl at 32,768 without changing at all. There's a quality trap too. A 128K window doesn't mean every task benefits from 128K of text; irrelevant context makes retrieval worse and burns memory for nothing. I'd rather retrieve the relevant part of a document than dump the whole thing in and hope the model finds the sentence I meant.

So "it's a 14B model" is incomplete information. I need to know how it's quantized, how much context it's configured for, and whether my machine can keep it where it belongs. The best model is the one that answers before I forget what I was trying to do.

## I hardcode the context size

Ollama lets you set runtime parameters per request, but I prefer to bake important settings into the model definition. That way I don't have to remember which context size a given model needs, and every application using that model gets the same baseline.

I use a `Modelfile` for this:

```text
FROM qwen2.5-coder:14b

PARAMETER num_ctx 8192
PARAMETER temperature 0.2

SYSTEM """
You are a concise, practical assistant. Prefer accurate answers over confident guesses.
"""
```

Then I create a named model from it:

```bash
ollama create coder-local -f Modelfile
ollama run coder-local
```

The important line is `PARAMETER num_ctx 8192`. Pinning the context size in the `Modelfile` rather than passing it per request keeps memory predictable, and 8K covers most of what I ask a local model to do. When a job needs more, I build a deliberate higher-context variant, `coder-local-32k` for the coding agent below, and take the hardware cost on purpose.

It's a small thing that removes a surprising amount of ambiguity. The model name tells me which weights I'm using; the `Modelfile` tells me how the model should behave. Configuration in version control, instead of settings I reconstruct from memory every time.

## What I actually plugged it into

The abstract case for local models is fine, but the reason I keep the setup around is that two things I already run are wired into it. Both handle the kind of data I've written about keeping on my own machines, [genetic data](/posts/making-sense-of-my-dna/) and [medical images](/posts/looking-inside-the-disc-your-radiologist-gives-you/). Sending that to a hosted chatbot can be reasonable, but it should be a deliberate choice. With a local model, the default flips: the data stays here.

The first is [OSGenome2](/posts/making-sense-of-my-dna/), the DNA viewer I've been adapting. It cross-references my raw genotypes against SNPedia, and the newer version can point a local model at a row and explain what it means in plain language. That only works as a privacy story if the model is local. Pasting my variants into a hosted chatbot would undo the entire point of keeping the genome on my own machine. Ollama keeps the explanation and the data on the same side of my firewall.

The second is [Paperless-ngx](/posts/my-22cm-cube-that-replaced-the-cloud/), which runs on my home server and holds every document I own. On its own it does OCR; with **paperless-ai** bolted on, it points a language model at each incoming scan to suggest tags, titles, and correspondents. Those documents are exactly the kind of thing I don't want to feed a cloud API: bank letters, contracts, medical paperwork. Here the model doesn't even live on the same box. Ollama runs on my gaming PC, and paperless-ai on the server points at it across my LAN. That's the nice part of Ollama exposing an HTTP API: the machine doing the sorting and the machine doing the inference can be different, as long as both are mine. The documents never leave the house.

Neither of these needs a frontier model. They need one that's reachable on the local network, private by default, and good enough at the narrow task. That's why the "small local services" idea stops being abstract once you have one or two of them running.

## Wiring it into VS Code

The one integration I most wanted was coding help inside the editor without shipping my code to a cloud API. This corner of the ecosystem moves fast, and I went through a few options before settling.

[Continue](https://www.continue.dev/) used to be the obvious choice, but the project went read-only after an acquisition, and there was even a reported case of it falling back to a cloud service despite being set to local, exactly the failure mode a privacy setup can't afford. The various Ollama VS Code plugins are mid-reshuffle too, with the community extension deprecated in favor of an official one. I didn't want to anchor to something frozen or in flux.

What I settled on is [Cline](https://cline.bot/). It's a provider-agnostic agent that reads files, proposes changes, and runs commands with my approval on each step, and it's open source and actively maintained. Pointing it at Ollama is a matter of choosing Ollama as the provider in its settings and giving it the local endpoint:

```text
API Provider:  Ollama
Base URL:      http://localhost:11434
Model:         coder-local-32k
```

Note the model: `coder-local-32k`, the higher-context variant from earlier. A coding agent stuffs open files, diffs, and repo context into every prompt, so the 8K default is nowhere near enough. It costs more memory, but here the context earns it.

The honest caveat is capability. A good local coding model lands somewhere around 70 to 85 percent of a frontier cloud model on everyday single-file work, and the gap widens on multi-file reasoning. For scaffolding, explaining unfamiliar code, and small edits it earns its place; for a gnarly cross-cutting change I still reach for a stronger model.

## What local models are good at

So what actually goes in that local slot? In practice it's the narrow, repeatable work: summarizing files, explaining code, rewriting text, extracting structured information, and answering questions about a carefully chosen local context. Local models also make a good fast first pass. Let the local one do the boring work, then bring in a stronger hosted model or a human when the stakes justify it. Cheap and private by default, powerful when the task earns it.

They're less good at pretending to be a drop-in replacement for the best cloud models. Smaller local models hallucinate. They miss details. They'll confidently produce code that looks plausible and fails on the first run. A local model has the same fundamental problem as a hosted one, except now it's sitting in my office consuming my electricity.

For anything medical, financial, legal, or otherwise consequential, I treat the output as assistance, not authority. Local means private. It doesn't mean correct.

## The tradeoff I actually like

There's a particular satisfaction in running a useful model on hardware I already owned. I'm not waiting on a provider, budgeting every experiment by the token, or uploading every private input to a service I don't control. I can try things freely, find the limits, and turn the useful experiments into small local services.

None of this replaced the cloud models I still open every day. It sits next to them. The frontier model gets the hard reasoning; the local one gets everything that's private, routine, or not worth a round trip to someone else's server. Having both means the choice is mine to make per task instead of by default, and that turned out to be the part I value most.

The 7900 XTX was a gaming purchase. It's still a gaming purchase. But now it's also a private, local inference machine, which makes the original decision look even better in hindsight. A good GPU is a good GPU. Sometimes it renders a game. Sometimes it reads a folder of notes. Either way, it's finally earning its electricity.
