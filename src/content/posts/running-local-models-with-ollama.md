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

I'm a gamer, which is the part of this story that makes the hardware easy to explain. A couple of years ago, when I built my current PC, I bought a good GPU: an AMD Radeon 7900 XTX with 24 GB of VRAM. The justification at the time was games. High frame rates, high settings, a machine that wouldn't feel obsolete six months later.

That's still what I use it for. But the same card now runs local language models, which is a lot of extra mileage from a component I bought to make explosions look better.

## Table of contents

## Ollama is the easy part

The tool that made this practical for me is [Ollama](https://ollama.com/). It packages the annoying parts of running an open model locally into something that feels like installing an app rather than standing up a research project. Install it, pull a model, and it exposes a local API that other software can talk to.

The basic workflow is short:

```bash
ollama pull qwen3:14b
ollama run qwen3:14b
```

The model downloads once. After that, inference happens on my machine. No API key, no per-token bill, and no text leaves the computer unless I deliberately send it somewhere. Ollama also gives applications a familiar HTTP interface, so tools that support local models can usually point at `localhost` and carry on.

That last part matters more than the command-line chat. A local model earns its keep when it becomes part of things I already do: explaining files, helping with code, searching personal notes, or taking a first pass over data I'd rather not upload to a cloud service. It doesn't need to be the smartest model in the world for that. It needs to be available, private, and good enough for the task.

## The GPU was already paid for

The 7900 XTX has 24 GB of VRAM, which is generous for a consumer card. It's also an AMD card, so the software story has historically been rougher than it is with NVIDIA and CUDA. Ollama's support and the underlying runtimes have improved a lot, but the practical rule still holds: hardware support is part of the experiment. On AMD that means the ROCm stack has to actually recognize your card, and a model that fits in theory can still crawl if the runtime falls back to the CPU without telling you. It's worth confirming the GPU is doing the work:

```bash
ollama ps
```

The `PROCESSOR` column tells you whether a loaded model is running on GPU, CPU, or split across both. If it says CPU when you expected GPU, that's your answer for why it feels slow.

On the 7900 XTX specifically, the good news is that the card reports as `gfx1100`, which is on ROCm's officially supported list. That means it works without the `HSA_OVERRIDE_GFX_VERSION` trick that owners of unsupported cards have to reach for. What you do still need is a recent ROCm install, your user in the `render` and `video` groups so the process can reach `/dev/kfd` and `/dev/dri`, and the ROCm build of Ollama. The official install script bundles the right one. If you run Ollama in a container, you pass those device files through to it. Once that's in place, `ollama ps` shows GPU and everything just works.

When it does work, the experience is genuinely good. Responses are local, the first token arrives quickly enough for normal use, and I can leave a model running without watching a cloud bill tick upward. I don't need new hardware for every new model either. I already own the expensive part, which changes the economics completely.

## How fast is it, actually

"Fast enough" deserves a number. Ollama will hand you one if you run a model with `--verbose`:

```bash
ollama run qwen3:14b --verbose "Write a haiku about garbage collection."
```

After the response, it prints timing stats. The line that matters is `eval rate`, your generation speed in tokens per second. `prompt eval rate` is how quickly it ingested your prompt, which matters more when you feed it large context.

<!-- TODO: replace with your own measured numbers from `ollama run ... --verbose` -->
On my 7900 XTX I see roughly TODO tok/s on an 8B model at Q4 and around TODO tok/s at 14B, both comfortably faster than I can read. For reference, a 7900 XTX running Llama 3.1 8B lands in the ballpark of 90+ tok/s, roughly three-quarters of an RTX 4090 at a fraction of the price. The moment those numbers matter most is when a model spills out of VRAM: the same prompt that ran at reading speed on the GPU drops to a crawl once the CPU is doing part of the work, which is exactly the "went to make tea" transition worth avoiding.

It also changes how I think about privacy. I've written before about keeping [genetic data](/posts/making-sense-of-my-dna/) and [medical images](/posts/looking-inside-the-disc-your-radiologist-gives-you/) on my own machines. Sending a private document to a hosted chatbot can be perfectly reasonable in some situations, but it should be a choice. With a local model, the default is simpler: the document stays here.

## Bigger doesn't automatically mean better

The first thing people ask is which model to run. The answer is less exciting than the leaderboards suggest: run the largest model that fits comfortably and stays fast enough that you'll actually use it.

A model's parameter count is a rough measure of its capacity. A 7-billion-parameter model is generally more limited than a 14-billion one, and a 32-billion model generally has more room for reasoning and knowledge than either. But parameter count isn't a quality score. Training data, architecture, instruction tuning, and the task itself matter too. A well-tuned 8B model can beat a mediocre 14B one on the work you actually care about.

There's a hard limit hiding behind every impressive model announcement. The parameters have to live somewhere, and VRAM is finite. If a model doesn't fit on the GPU, some or all of it spills into system RAM. That can still work, but the experience shifts from "local assistant" to "I asked a question and went to make tea." Running a model isn't the same as running it pleasantly.

For my hardware, the small and middle ranges are the useful ones. A 7B or 8B model is light enough to feel instant. Around 14B is a good compromise when I want more capable answers without turning every prompt into an event. Larger models can be interesting, but the number on the model card isn't a reason on its own to accept poor speed or constant memory pressure.

The best model is the one that answers before I forget what I was trying to do.

## Quantization is how the model fits

The next piece of vocabulary is **quantization**. Model weights are stored and computed in numerical formats of varying precision. Quantization uses fewer bits per weight, shrinking the memory footprint and often making local inference possible on consumer hardware at all.

You'll see names like `Q4_K_M`, `Q5_K_M`, and `Q8_0`. The exact details depend on the model family and runtime, but the tradeoff is straightforward:

- Lower-bit quantization uses less memory and is usually faster.
- Higher-bit quantization keeps more precision and needs more memory.
- More aggressive quantization can reduce quality, especially on hard reasoning or precise language tasks.

A rough sense of the scale helps here. A 14B model at full 16-bit precision wants around 28 GB just for weights, which already overflows my 24 GB card. The same model at `Q4_K_M` lands closer to 9 GB, leaving comfortable room for context. That gap is the whole reason quantization matters on consumer hardware.

It isn't a binary choice between a perfect model and a broken one. It's a sliding scale. A good 4-bit quantization can be remarkably capable, while the 8-bit version may not be worth the extra memory for the work I'm doing. The right choice depends on the model, the task, and how much speed I'll trade for a little more fidelity.

This is why "it's a 14B model" is incomplete information. I also need to know how it's quantized, how much context it's configured for, and whether my machine can keep it where it belongs. Model size is only the first number in the conversation.

## Context is memory, and memory isn't free

The third constraint is context size: how many tokens the model can consider in one request. The context holds the instructions, conversation history, pasted text, retrieved documents, and the response being generated. More context sounds unambiguously better right up until the memory cost arrives.

A large context window consumes more memory, and the cost isn't limited to the model weights. The runtime also needs a KV cache to track the conversation as it grows. Increase the context size and you increase that cache. On a card with finite VRAM, a model that was fast at 8,192 tokens can slow to a crawl at 32,768, even though the model itself hasn't changed.

There's a quality trap here too. A 128K context window doesn't mean every task benefits from 128K of text. Irrelevant context can make retrieval worse, add latency, and burn memory for no useful result. I'd rather retrieve the relevant part of a document than dump the whole thing into a huge context and hope the model finds the sentence I meant.

## I hardcode the context size

Ollama lets you set runtime parameters per request, but I prefer to bake important settings into the model definition. That way I don't have to remember which context size a given model needs, and every application using that model gets the same baseline.

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

The important line for this post is `PARAMETER num_ctx 8192`. I pin the context size in the `Modelfile` rather than passing it per request. Eight thousand tokens covers most of what I ask a local model to do while keeping memory use predictable. When a job genuinely needs more, I create a deliberate variant and take the hardware cost on purpose.

It's a small thing that removes a surprising amount of ambiguity. A model name tells me which weights I'm using; the `Modelfile` tells me how I expect that model to behave. It's configuration in version control instead of settings I have to reconstruct from memory every time.

## What I actually plugged it into

The abstract case for local models is fine, but the reason I keep the setup around is that two things I already run are wired into it.

The first is [OSGenome2](/posts/making-sense-of-my-dna/), the DNA viewer I've been adapting. It cross-references my raw genotypes against SNPedia, and the newer version can point a local model at a row and explain what it means in plain language. That only works as a privacy story if the model is local. Pasting my variants into a hosted chatbot would undo the entire point of keeping the genome on my own machine. Ollama keeps the explanation and the data on the same side of my firewall.

The second is [Paperless-ngx](/posts/my-22cm-cube-that-replaced-the-cloud/), which runs on my home server and holds every document I own. On its own it does OCR; with **paperless-ai** bolted on, it points a language model at each incoming scan to suggest tags, titles, and correspondents. Those documents are exactly the kind of thing I don't want to feed a cloud API: bank letters, contracts, medical paperwork. Pointing paperless-ai at my local Ollama endpoint instead of a hosted provider means the sorting happens without a single page leaving the house.

Neither of these needs a frontier model. They need a model that's available on `localhost`, private by default, and good enough at the narrow task. That's the whole pitch, and it's why the "small local services" idea stops being abstract once you have one or two of them running.

## What local models are good at

I reach for local models where privacy, availability, or cost matters more than raw capability. They're good at summarizing files, explaining code, rewriting text, extracting structured information, and answering questions about a carefully chosen local context. They also work well as a fast first pass: let the local model do the boring work, then bring in a stronger hosted model or a human when the stakes justify it.

They're less good at pretending to be a drop-in replacement for the best cloud models. Smaller local models hallucinate. They miss details. They'll confidently produce code that looks plausible and fails on the first run. A local model has the same fundamental problem as a hosted one, except now it's sitting in my office consuming my electricity.

For anything medical, financial, legal, or otherwise consequential, I treat the output as assistance, not authority. Local means private. It doesn't mean correct.

## The tradeoff I actually like

There's a particular satisfaction in running a useful model on hardware I already owned. I'm not waiting on a provider, budgeting every experiment by the token, or uploading every private input to a service I don't control. I can try things freely, find the limits, and turn the useful experiments into small local services.

The limits are real. Parameter count sets how much capability can fit. Quantization sets how much memory and precision I trade. Context size sets how much the model can hold at once and how much memory the runtime needs. Ignore any one of the three and the model card writes checks my GPU can't cash.

The 7900 XTX was a gaming purchase. It's still a gaming purchase. But now it's also a private, local inference machine, which makes the original decision look even better in hindsight. A good GPU is a good GPU. Sometimes it renders a game. Sometimes it reads a folder of notes. Either way, it's finally earning its electricity.


=====DATA=====
 ollama run qwen3.6:35b-a3b --verbose "Write a haiku about garbage collection"
Thinking...
Thinking Process:

1.  **Deconstruct the request:**
    *   Topic: Garbage collection.
    *   Format: Haiku (5-7-5 syllables).

2.  **Brainstorming ideas/imagery related to garbage collection:**
    *   Trash bins, curbs, trucks, bags, recycling, cleaning up, waste, memory (if programming context? The prompt
doesn't specify, but usually "garbage collection" in AI prompts can be ambiguous. However, without a specific
"coding" tag, I should assume the physical act unless context suggests otherwise. But often users ask about GC in
CS. Let's look at the ambiguity. If I write about code, it might miss the user's intent. If I write about trash,
it's safer for general audiences. However, "garbage collection" is a very common CS term. A haiku about code is
usually more appreciated by devs. But a haiku about trash is universal. I'll aim for a double entendre or a clear
physical one? Usually, when people ask for a haiku on a specific term without context, they might be looking for
the creative interpretation of the concept. I'll write a haiku that works well for physical garbage but could
slightly nod to clearing away waste (which applies to code too). Or better, just do a solid physical one. It's
less risky. Let's check syllable counts for drafts.

    *   *Draft 1:*
        Blue bins by the curb (5)
        Trucks come early in the morning (7)
        Waste is taken away (7? No, "Waste is tak-en a-way" is 6. "Trash goes to the dump" is 5.)
        Result:
        Blue bins by the curb (5)
        Trucks come early in the morning (7)
        Trash gone from the street (5)
        *Critique:* A bit boring, but accurate.

    *   *Draft 2 (Poetic imagery):*
        Bags await the truck (5)
        Rattling sound fills the air now (7)
        World cleans itself up (5)
        *Critique:* "World cleans itself up" is 5? "World cleans it-self up" = 5. Good. "Rattling sound fills the
air now" = Rat-tling sound fills the air now = 7. Good. "Bags await the truck" = Bags a-wait the truck = 5. Good.
        *Result:*
        Bags await the truck
        Rattling sound fills the air now
        World cleans itself up
        *Critique:* "World cleans itself up" is a bit abstract.

    *   *Draft 3 (Focus on routine/cycle):*
        Curbside waiting bins (5)
        Heavy trucks roll down the lane (7)
        Renewal begins (5)
        *Critique:*
        Curb-side wait-ing bins = 5.
        Heav-y trucks roll down the lane = 7.
        Re-new-al be-gins = 5? Re-new-al is 3 syllables? "Re-nu-al"? No, usually "Ren-u-val" is 3. Or "Ren-val"?
Dictionary says re-nyoo-ul. So "Re-nu-al" might be 3. Let's check "Renewal". Re-new-al. Yes, 3 syllables. So
"Re-new-al be-gins" is 5.
        *Result:* Good haiku. "Renewal begins" implies the cycle of collection leads to a fresh start. This is a
nice touch.

    *   *Draft 4 (Considering Code GC):*
        If the user meant code:
        Memory clears out (5)
        Unused objects fade away (7)
        Space freed for new data (7? No, space freed for new da-ta = 6.)
        Space freed for new things (5).
        *Result:*
        Memory clears out
        Unused objects fade away
        Space freed for new things
        *Critique:* This is also good. But I'll provide the physical one as default unless asked. The prompt is
"Write a haiku about garbage collection". Usually, if it's code, they say "GC" or mention memory/programming. I'll
stick to the physical interpretation.

    *   *Refining Draft 3:*
        Curbside waiting bins (5)
        Heavy trucks roll down the lane (7)
        Renewal begins (5)
        *Syllable check:*
        Curb-side wait-ing bins: 5.
        Heav-y trucks roll down the lane: 7.
        Re-new-al be-gins: 5.
        *Content:* "Renewal begins" is a bit of a stretch for garbage, though metaphorically true. Maybe "Clean
slate arrives"? No. "Fresh start for the street"? Fresh-start-for-the-street = 6. "Streets wake up clean" = 5.
        *Alternative ending:*
        Curbside waiting bins
        Heavy trucks roll down the lane
        Streets wake up clean (5)
        *Critique:* "Streets wake up clean" is strong imagery. It personifies the street and shows the result.

    *   *Final Polish:*
        Bins line the curb (5)
        Rumble of the heavy truck (7)
        Streets are swept clean (5)
        *Check:*
        Bins line the curb: 5.
        Rum-ble of the hea-vy truck: 7? Rum-bly is 2. Rum-ble of the heav-y truck = 7. Yes.
        Streets are swept clean: 5.
        *Result:* Simple, effective.

    *   *Another option with more flavor:*
        Bags wait for the haul (5)
        Trucks gather up what we discard (7)
        Fresh day starts anew (5)
        *Check:*
        Bags wait for the haul: 5.
        Trucks gath-er up what we dis-card: 7.
        Fresh day starts a-new: 5? A-new is often 2 syllables, sometimes elided to 1 in poetry? "New" can be 1 or
2. Safer to avoid. "Fresh day begins" = 4. "A fresh start arrives" = 6. "World feels light again" = 6.
        *Stick with "Streets wake up clean".*

    *   *Final output structure:*
        Bins line the curb,
        Rumble of the heavy truck,
        Streets wake up clean.

        Wait, "Bins line the curb," has a comma. That doesn't change syllables.
        Bins line the curb: 5.
        Rum-ble of the hea-vy truck: 7.
        Streets wake up clean: 5.
        Perfect.

3.  **Output generation:**
    Bins line the curb,
    Rumble of the heavy truck,
    Streets wake up clean.
...done thinking.

Bins line the curb,
Rumble of the heavy truck,
Streets wake up clean.

total duration:       1m9.9225693s
load duration:        44.8768664s
prompt eval count:    17 token(s)
prompt eval duration: 458.07ms
prompt eval rate:     37.11 tokens/s
eval count:           1556 token(s)
eval duration:        24.569784s
eval rate:            63.33 tokens/s

 ollama run qwen2.5-coder:14b --verbose "Write a haiku about garbage collection"
Heap overflows,
Garbage collector sweeps,
Memory reclaimed.

total duration:       12.4396372s
load duration:        12.1634424s
prompt eval count:    36 token(s)
prompt eval duration: 86.79ms
prompt eval rate:     414.79 tokens/s
eval count:           13 token(s)
eval duration:        187.153ms
eval rate:            69.46 tokens/s