---
author: Rostyslav Fridman
pubDatetime: 2026-10-12T09:00:00Z
title: NVIDIA is not a GPU company anymore
featured: false
draft: false
tags:
  - nvidia
  - cuda
  - ai-infrastructure
  - inference
  - gpu
  - kubernetes
description: "A GPU-sharing problem I never solved cleanly years ago stayed with me, so I spent a weekend back in the NVIDIA world to see what had changed. What I found is that NVIDIA is no longer a GPU vendor. It is a full stack, from CUDA and the warp scheduler at the bottom, through NCCL, NVLink, NVSwitch, and the Mellanox fabric, through Grace CPUs and DGX systems and DGX Cloud, through TensorRT, vLLM, Triton, and Dynamo, up to build.nvidia.com with NIMs, Nemotron, Blueprints, Skills, and NeMo Guardrails. These are my weekend findings, and they end where my old problem started: how you share a GPU."
---

Years ago I designed a GPU platform and left one thing unresolved: how do you let more than one workload share a single GPU without either wasting most of the card or letting one tenant wreck another? At the time I had no answer I was happy with, and the question stayed with me. It came back recently: a [government data-and-AI organization in the Gulf](/posts/the-private-cloud-with-no-requirements/) I worked with is standing up clusters of thousands of NVIDIA GPUs, where how many jobs you can safely pack onto each card is a budget line, not a curiosity.

So I went back to the NVIDIA world to see what had changed since I last looked hard at it. The sharing question has an answer now. But what I kept running into on the way is bigger than the question I came with.

NVIDIA is not a GPU company anymore. Over the last few years it turned into a full-stack AI platform, and the GPU is now the bottom layer of a much taller stack. It makes the chip, the libraries, the interconnect, the CPU, the data-center network, the finished systems, a cloud to rent them from, the inference engines and servers, its own models, and the agent and safety layers above all of it. This post walks that stack from the bottom up, and the sharing problem that sent me in is where it ends.

## Table of contents

## CUDA, the real moat

CUDA, not the silicon, is the moat. Competitors build fast chips. What they cannot easily build is the fifteen-plus years of libraries and tooling that sit on top of CUDA, the thing every framework compiles down to.

To see why that lock-in runs so deep, look at what CUDA actually sits on. A data-center GPU is not one processor. It is a few dozen to well over a hundred streaming multiprocessors (SMs), each an independent engine with its own registers and schedulers. Work reaches them through CUDA, NVIDIA's programming model.

The mechanics are worth a beat, because this is where the lock-in starts. You write a kernel and launch it as a grid of thread blocks. The hardware chops each block into warps of exactly 32 threads that run the same instruction in lockstep, and each SM has warp schedulers that swap between warps every cycle, hiding memory latency behind other ready work. Keeping the SMs busy is the whole job, and an idle SM is wasted silicon the design exists to prevent. Every framework a developer touches rides on this machinery without ever seeing it, which is the point.

Those libraries ship as a product line called CUDA-X: cuDNN for deep-learning primitives, cuBLAS for linear algebra, and NCCL, the collective-communications library that handles the all-reduce and all-gather operations distributed training lives on. Keep NCCL in mind, because it drives the fabric in the next section. When people say it is hard to leave NVIDIA, they rarely mean the transistors. They mean CUDA, CUDA-X, and what is stacked on top. The rest of this post is NVIDIA building on top of that moat, one layer at a time, so that leaving gets harder the higher you climb.

## NVLink and NVSwitch, where many GPUs become one

A single GPU is rarely the unit that matters. The unit that matters is 8 in a box or 72 in a rack behaving as one accelerator. The interconnect builds that behavior, and it is the part people most often skip.

PCIe is the generic bus everything shares, and it is too slow and too contended to let GPUs cooperate on one model. So NVIDIA built a dedicated GPU-to-GPU fabric, NVLink. On a Blackwell GPU, fifth-generation NVLink gives each GPU 18 links at 100GB/s, for 1.8TB/s to its peers. That is roughly fourteen times the bidirectional bandwidth of a PCIe Gen5 x16 slot. NVLink alone only reaches a handful of neighbors, so NVSwitch, a switch ASIC, creates an all-to-all fabric where any GPU reaches any other at full speed. NVIDIA shipped the first NVSwitch with the DGX-2 in 2018. Today a GB200 NVL72 puts 72 Blackwell GPUs in a single NVLink domain with around 130TB/s of aggregate GPU-to-GPU bandwidth, and the rack behaves like one large GPU: a model's layers spread across all 72 and cooperate as if they shared a die.

That behavior is not free, which is where NCCL comes back. The fabric is wires and switches. NCCL is the software that orchestrates the all-reduce across all 72 GPUs so a training step's gradients converge. The hardware moves the bytes and NCCL decides the choreography, and both are NVIDIA's: a hardware layer and the software layer that makes it usable, owned by the same company.

This is not a GPU feature. It is a networking product NVIDIA owns down to the switch silicon. A GPU vendor sells you chips. NVIDIA sells you the fabric that turns a rack of chips into a computer.

## Mellanox and the data-center fabric

NVLink and NVSwitch stay inside a node or a rack. The moment a training job spans more racks and reaches thousands of GPUs across a data center, the traffic rides a different fabric. That fabric is also NVIDIA's. In 2019 NVIDIA bought Mellanox, the InfiniBand and high-speed-Ethernet company, for about $6.9 billion, and the deal closed in 2020, just before the AI boom made interconnects a boardroom topic.

What came with Mellanox is now three NVIDIA product lines doing the inter-node work NVLink cannot:

- **Quantum InfiniBand**, the low-latency fabric that stitches GPU nodes into a supercomputer, the default for the largest training clusters.
- **Spectrum-X**, an Ethernet platform tuned specifically for AI traffic, for operators who want Ethernet rather than InfiniBand without giving up AI-cluster performance.
- **BlueField DPUs**, data-processing units that offload networking, storage, and security from the CPU onto the NIC, so the host cores do host work instead of moving packets.

The Mellanox deal set a pattern NVIDIA has followed since: when it wants a layer of the stack it does not yet own, it does not build it slowly, it buys the company that already did. The networking layer came this way, and so, it turns out, did the layer that finally answered my sharing problem.

## Grace, the CPU

With both fabrics owned, there is one piece of the node left: the processor. NVIDIA makes its own CPU now. Grace is an Arm-based server CPU with 144 Neoverse V2 cores in the Superchip configuration, and it exists for the link rather than the cores. NVLink-C2C ties a Grace CPU to a GPU coherently at 900GB/s, roughly seven times the bidirectional bandwidth of that same PCIe Gen5 x16 slot, so the CPU and GPU share memory instead of shuffling it across a slow bus. That is what the GB200 and GB300 "Grace Blackwell" superchips are: a Grace CPU joined to Blackwell GPUs over that coherent link. NVIDIA designs the CPU, the GPU, and the private interconnect between them.

## DGX, HGX, and renting it all back

NVIDIA does not stop at chips and fabric. It sells the finished machine too. HGX is a reference baseboard of eight GPUs wired with NVLink and NVSwitch that NVIDIA hands to server makers to build into their own systems. Almost every GPU node you rent from a cloud is an HGX board inside someone's chassis. DGX is NVIDIA's own sealed system built from that same baseboard, defined end to end and sold as an appliance, scaling up to the DGX SuperPOD reference architecture for whole clusters.

Then there is DGX Cloud. NVIDIA takes its own DGX supercomputers, puts its full software stack on them, and rents them to you as a subscription over the internet, competing with the same hyperscalers that are its biggest customers.

## The inference layer: engines, server, framework

Training a model gets the headlines, but inference is where most of the GPU hours and most of the cost go. NVIDIA's answer is TensorRT, specifically TensorRT-LLM: a compiler and runtime that takes a model and builds an optimized engine for a specific NVIDIA GPU, cutting latency and lifting throughput that a naive runtime leaves on the table. Everything turns on the word "specific." You compile an engine and it is tuned to that GPU architecture. Change the hardware or key parameters and you recompile. You trade flexibility for speed, and the speed only exists on NVIDIA silicon. TensorRT plays CUDA's game one level up: optimization only NVIDIA can offer.

NVIDIA also supports vLLM, which I did not expect. vLLM is the open-source serving engine out of Berkeley that popularized PagedAttention for managing the KV cache, and its appeal is the opposite of TensorRT-LLM: take a Hugging Face model straight to an OpenAI-compatible endpoint with no compilation step, and run it on more than just NVIDIA hardware. It is the default a lot of teams reach for, because time-to-production beats a throughput edge that is workload-specific anyway.

A pure GPU vendor would fight that. NVIDIA instead supports vLLM, documents it, and packages it. The reasoning is clear once you see the whole stack: whether you serve with the proprietary TensorRT path or the open, portable vLLM path, you are still running on NVIDIA GPUs through CUDA. NVIDIA does not need to win the serving-engine war. It already won the layer underneath both engines, and letting the open option thrive makes CUDA stickier.

TensorRT and vLLM are the engines. Above them sits the server, Triton Inference Server, NVIDIA's model-serving layer that can host TensorRT, vLLM, PyTorch, and ONNX backends behind one API, with batching, concurrency, and metrics handled for you. Triton turns an engine into a production service, and it is most of what a NIM is: a NIM is essentially Triton plus an optimized engine plus a model, packaged as one thing you deploy.

The serving story is still growing. Dynamo is NVIDIA's newer open-source framework for inference at data-center scale, built around disaggregated serving. It splits the prefill phase of an LLM request from the decode phase onto separate pools of GPUs, moves the KV cache between them, and scales each independently. The target is the GB200/GB300 NVL72 rack, that same "one giant GPU," used now as one large inference machine. NVIDIA is not only serving models. It is redesigning how serving works and open-sourcing the result.

## build.nvidia.com, where NVIDIA ships software

The top of the stack is [build.nvidia.com](https://build.nvidia.com), which reads less like a hardware vendor's site than a software catalog: models you can call in the browser, microservices you can pull, and reference applications you can deploy. The acronyms come fast, and each one is a layer of packaging over the one before it.

### NIM: the model as a container you can run anywhere

A NIM, NVIDIA Inference Microservice, is a model plus its optimized inference engine plus a standard API, prepackaged in a container ready to deploy on cloud, data center, or a workstation. It is the key abstraction of this layer. Instead of handing you a model file and wishing you luck wiring up the serving stack, NVIDIA hands you a container that exposes an industry-standard endpoint and already has the TensorRT-or-equivalent optimization baked in. The hard part of turning weights into a fast callable service is done for you. A NIM is inference as a microservice, and almost everything else on build.nvidia.com is either a NIM or something made of NIMs.

### Nemotron: NVIDIA's own models

Nemotron is NVIDIA's own family of open models, tuned for reasoning and agentic use, and shipped as NIMs. NVIDIA now owns the weights too, on top of the hardware they run on and the runtime that serves them. Owning a credible model family means it has something to put inside every NIM and reference workflow it ships.

A naming note, because it tripped me up: the NeMo _framework_ is the toolkit for building, training, and fine-tuning these models, the thing you reach for to customize a Nemotron on your own data. It is distinct from NeMo _Guardrails_, the safety layer further up the stack, which does a different job entirely. Same brand, different layers, worth keeping straight.

### Blueprints: reference workflows you deploy, not assemble

Blueprints are reference AI workflows for specific use cases such as a RAG pipeline, a drug-discovery screen, or an agentic assistant, packaged as sample applications built from NIMs and partner microservices, with reference code and a Helm chart for deployment. The Helm chart is the tell. It means this is meant to land on Kubernetes and run, not to be read as a tutorial. NVIDIA is shipping deployable architectures, the kind of thing a consultancy used to assemble by hand. The abstraction moved up a layer again, from "here are the parts" to "here is the working system, customize it."

### Skills and NeMo Guardrails: the agentic and safety layer

The newest additions say the most about where this is going. Skills are composable building blocks for agents, discrete capabilities you plug into an agentic application rather than wiring from scratch. NeMo Guardrails is a programmable safety layer that sits between your application and the LLM, intercepting prompts and responses to enforce content safety, topic control, and jailbreak detection, backed by small purpose-built models shipped as NemoGuard NIMs. Guardrails is the part that struck me most, because it is NVIDIA selling trust and safety as infrastructure. That is about as far from "GPU vendor" as a product can get while still being a reason to buy GPUs.

Stand back from build.nvidia.com and the pattern is clear. CUDA abstracts the silicon. NIMs abstract the serving stack. Blueprints abstract the application. Skills and Guardrails abstract the agent and its safety. Each layer hides the one below and makes the stack harder to leave. The GPU is at the bottom, doing the work, and NVIDIA has claimed every layer above it.

![The NVIDIA stack as a stacked diagram, read bottom to top. At the bottom, GPU silicon (streaming multiprocessors, warps of 32 threads, shared via time-slicing, MPS, and MIG, scheduled by the KAI scheduler from the Run:ai acquisition in 2024). Above it, CUDA and CUDA-X as the moat, including cuDNN, cuBLAS, and NCCL. Then the NVLink and NVSwitch GPU-to-GPU fabric, then the Mellanox data-center fabric (Quantum InfiniBand, Spectrum-X, BlueField, from the 2019 acquisition), then the Grace CPU, then systems and cloud (HGX, DGX, DGX Cloud). Above those, the inference engines TensorRT-LLM and vLLM, the Triton server and Dynamo framework, then NIM containers, then Nemotron models and the NeMo framework, then Blueprints, and at the top the agents and safety layer of Skills and NeMo Guardrails. A side rail notes that higher means harder to leave, lower means closer to the silicon.](_nvidia-assets/stack.svg)

## Back to the thing that sent me in: sharing a GPU

All these NIMs, Blueprints, and agents assume GPUs to run on, and in a real cluster those GPUs are shared. This is the question I came with, and the answer comes in two halves: what the hardware can do, and who decides how it gets used.

Start with the hardware, where there are three mechanisms. Time-slicing advertises one physical GPU as several and lets the GPU's context switcher rotate between pods. It is pure software with no special hardware, and no isolation: everyone shares the memory with no walls, and one job can starve or crash the others. MPS, Multi-Process Service, runs multiple processes' kernels concurrently through a shared context instead of taking turns, which gives better performance and a soft compute cap but still no hard memory or fault isolation. MIG, Multi-Instance GPU, reaches down into the silicon and physically partitions the card into as many as seven instances, each with dedicated SMs, dedicated memory, and real fault isolation. The trade is rigidity: fixed partition profiles instead of arbitrary sizes. The shared substrate that makes sharing cheap is the same thing that makes isolation hard, and no mechanism escapes that. That is the wall I kept hitting years ago, and it is still there. The difference is that MIG now exists to get over it when isolation is what you need.

The second half is what actually resolved it for me. The hardware decides what a GPU can be cut into. It does not decide who gets the pieces, in what order, with what quota, or what happens when a high-priority job arrives on a full cluster. Vanilla Kubernetes is no help, because its scheduler only counts whole GPUs as opaque integers. A company called Run:ai built the missing scheduler, a GPU-aware one that understands fractional GPUs, per-team quotas, priority, and gang scheduling. Then NVIDIA did what it did with Mellanox: rather than build the scheduler, it bought the company that already had. It acquired Run:ai in 2024, reportedly for around $700 million, and in April 2025 open-sourced the core as the KAI Scheduler under Apache 2.0.

The answer was not hardware at all. It was a Kubernetes scheduler NVIDIA acquired and gave away, so that the better way to share NVIDIA GPUs is free, and running it keeps you on NVIDIA GPUs.

## What it came down to

- **The GPU is the bottom layer, not the whole stack.** Silicon, interconnect, CPU, network, finished machines, a cloud, serving engines, models, agents, safety. NVIDIA builds every tier, and each one makes the tier below it harder to leave.
- **CUDA was always the moat, and NVIDIA keeps extending it upward.** Competitors can match the chip. Matching fifteen-plus years of software stacked on CUDA, now reaching from NCCL at the bottom up to agent safety, is a different problem.
- **It grows up the stack by acquisition.** Mellanox in 2019, Run:ai in 2024, bookending a GPU business that was never going to stay just a GPU business.
- **NVIDIA no longer needs to win every layer, only to own the one under all of them.** Supporting open vLLM alongside proprietary TensorRT costs nothing when both run on CUDA. The open option makes the bottom layer stickier.
- **My old sharing problem turned on software, not hardware.** MIG gets over the isolation wall when you need it. For quota-aware fractional sharing, the answer lives one layer up, in a scheduler.

And this is only one wing of the company. There is a parallel stack I have not touched: Omniverse for digital twins and simulation, Cosmos for the world models that train robots and self-driving cars, the whole physical-AI side, each about as large as the stack I just walked. The path in this post is a slice, not the whole thing.

The problem that stayed with me for years finally has an answer, and it turned out to be a Kubernetes scheduler the company I filed under "makes graphics cards" acquired and gave away.
