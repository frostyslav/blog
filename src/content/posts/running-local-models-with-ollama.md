---
author: Rostyslav Fridman
pubDatetime: 2026-09-02T09:00:00Z
title: I can run AI models on my gaming PC now
featured: false
draft: true
tags:
  - local-ai
  - ollama
  - self-hosting
  - hardware
  - privacy
description: I bought a powerful GPU for gaming a couple of years ago. It turns out a Radeon 7900 XTX is also a perfectly good reason to run language models locally.
---

I am a gamer, which is the part of this story that makes the hardware decision easy to explain. A couple of years ago, when I built my current PC, I bought a good GPU: an AMD Radeon 7900 XTX with 24 GB of VRAM. At the time the justification was games. High frame rates, high settings, a machine that would not feel obsolete six months after I built it.

That is still what I use it for. But the same card can now run local language models, which is a slightly ridiculous amount of utility to get from a component I originally bought to make explosions look better.

## Table of contents

## Ollama is the easy part

The tool that made this practical for me is [Ollama](https://ollama.com/). It packages the irritating parts of running an open model locally into something that feels more like installing an application than operating a research project. Install it, pull a model, and it exposes a local API that other software can talk to.

The basic workflow is almost comically small:

```bash
ollama pull qwen3:14b
ollama run qwen3:14b
```

The model downloads once. After that, the inference happens on my machine. There is no API key, no per-token bill, and no text leaving the computer unless I deliberately send it somewhere. Ollama also gives applications a familiar HTTP interface, so tools that support local models can usually point at `localhost` and carry on.

That last part matters more than the command-line chat. A local model is useful when it becomes part of the things I already do: explaining files, helping with code, searching personal notes, or giving a first pass over data that I would rather not upload to a cloud service. The model does not need to be the smartest model in the world for that. It needs to be available, private, and good enough for the task.

## The GPU was already paid for

A 7900 XTX has 24 GB of VRAM, which is a generous amount for a consumer card. It is also an AMD card, so the software story has historically been less straightforward than it is with NVIDIA and CUDA. Ollama's support and the underlying runtimes have improved, but the practical rule remains: hardware support is part of the experiment. A model that fits in theory can still be awkward if the runtime does not use the GPU properly.

When it does work, the experience is surprisingly good. The response is local, the first token arrives quickly enough for normal use, and I can leave the model running without watching a cloud bill accumulate. I do not need to buy new hardware for every new model either. I already own the expensive part. That changes the economics completely.

It also changes the way I think about privacy. I have written before about keeping genetic data and medical images on my own machines. Sending a private document to a hosted chatbot can be perfectly reasonable in some situations, but it should be a choice. With a local model, the default is much simpler: the document stays here.

## Bigger does not automatically mean better

The first thing people usually ask is which model to run. The answer is less exciting than the model leaderboard suggests: run the largest model that fits comfortably and is fast enough that you will actually use it.

A model's parameter count is a rough indication of how much capacity it has. A 7-billion-parameter model is generally more limited than a 14-billion-parameter model, and a 32-billion-parameter model generally has more room for reasoning and knowledge than either. But parameter count is not a complete quality score. Training data, architecture, instruction tuning, and the task itself matter too.

There is a practical limit hiding behind every impressive model announcement. The parameters have to live somewhere, and VRAM is finite. If the model does not fit in the GPU, some or all of it may spill into system RAM. That can still work, but the experience often changes from "local assistant" to "I asked a question and went to make tea." Running a model is not the same as running it pleasantly.

For my hardware, models in the smaller and middle ranges are the useful ones. A 7B or 8B model is light enough to be responsive. Around 14B is a good compromise when I want more capable answers without turning every prompt into an event. Larger models can be interesting, but the number on the model card is not a reason by itself to accept poor speed or constant memory pressure.

The best model is the one that gives a good answer before I forget what I was trying to do.

## Quantization is how the model fits

The next piece of vocabulary is **quantization**. Models are commonly stored and calculated using numerical formats with different precision. Quantization uses fewer bits to represent the model's weights, reducing its memory footprint and often making local inference possible on consumer hardware.

You will see names such as `Q4_K_M`, `Q5_K_M`, and `Q8_0`. The exact details depend on the model family and runtime, but the broad tradeoff is straightforward:

- Lower-bit quantization uses less memory and is usually faster.
- Higher-bit quantization keeps more precision and usually needs more memory.
- More aggressive quantization can reduce quality, especially on difficult reasoning or precise language tasks.

Quantization is not a binary choice between a perfect model and a broken one. It is a sliding scale. A good 4-bit quantization can be remarkably capable, while an 8-bit version may not be worth the extra memory for the work I am doing. The right choice depends on the model, the task, and how much speed I am willing to trade for a little more fidelity.

This is why "it is a 14B model" is incomplete information. I also need to know how it is quantized, how much context it is configured to accept, and whether my machine can keep it where it belongs. Model size is only the first number in the conversation.

## Context is memory, and memory is not free

The third constraint is context size: how many tokens the model can consider in one request. The context contains the instructions, conversation history, pasted text, retrieved documents, and the response being generated. More context sounds unambiguously better until the memory cost arrives.

A large context window consumes more memory, and the cost is not limited to the model weights. The runtime also needs a KV cache to keep track of the conversation as it grows. Increase the context size and you increase that cache. On a card with finite VRAM, a model that was fast at 8,192 tokens can become much slower at 32,768, even though the model itself has not changed.

There is also a quality trap here. A model advertising a context window of 128K does not mean every task benefits from feeding it 128K of text. More irrelevant context can make retrieval worse, increase latency, and consume memory for no useful result. I would rather retrieve the relevant part of a document than dump the entire document into a huge context and hope the model finds the sentence I meant.

## I hardcode the context size

Ollama lets you set runtime parameters per request, but I prefer to make important settings part of the model definition. That way I do not have to remember which context size a particular model needs, and applications using that model get the same baseline configuration.

I use a `Modelfile` for this:

```text
FROM qwen3:14b

PARAMETER num_ctx 8192
PARAMETER temperature 0.2

SYSTEM """
You are a concise, practical assistant. Prefer accurate answers over confident guesses.
"""
```

Then I create a named model from it:

```bash
ollama create qwen3-local -f Modelfile
ollama run qwen3-local
```

The important line for this post is `PARAMETER num_ctx 8192`. I hardcode the context size inside my models through the `Modelfile` instructions. Eight thousand tokens is enough for many of the things I ask a local model to do, while keeping memory use predictable. If I need a larger context for a particular job, I create a deliberate variant and accept the hardware cost consciously.

This is a small thing, but it removes a surprising amount of ambiguity. A model name tells me what weights I am using; the `Modelfile` tells me how I expect that model to behave. It is configuration in version control rather than a collection of settings I have to reconstruct from memory.

## What local models are good at

I use local models where privacy, availability, or cost matters more than absolute capability. They are good at summarizing files, explaining code, rewriting text, extracting structured information, and answering questions about a carefully selected local context. They are also useful as a fast first pass: let the local model do the boring work, then involve a stronger hosted model or a human when the stakes justify it.

They are less good at pretending to be a universal replacement for the best cloud models. Smaller local models hallucinate. They miss details. They can confidently produce code that looks plausible and fails immediately. A local model has the same fundamental problem as a hosted one, only now it is sitting in your office and consuming your electricity.

For anything medical, financial, legal, or otherwise consequential, I treat the output as assistance, not authority. Local means private. It does not mean correct.

## The tradeoff I actually like

There is a particular satisfaction in running a useful model on hardware I already owned. I am not waiting for permission from a provider, budgeting every experiment by token, or uploading every private input to a service I do not control. I can try things freely, see where the limits are, and turn the useful experiments into small local services.

The limits are real. The parameter count determines how much capability can fit. Quantization determines how much memory and precision I trade. Context size determines how much information the model can hold at once and how much memory the runtime needs. Ignore any one of those and the model card will make promises my GPU cannot keep.

The 7900 XTX was a gaming purchase. It is still a gaming purchase. But now it is also a private, local inference machine, and that makes the original decision look even better in retrospect. A good GPU is a good GPU. Sometimes it renders a game. Sometimes it reads a folder of notes. Either way, it is finally earning its electricity.
