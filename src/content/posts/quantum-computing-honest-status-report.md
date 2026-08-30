---
author: Rostyslav Fridman
pubDatetime: 2026-08-30T09:00:00Z
title: Quantum computing, from someone who has to stay skeptical
featured: false
draft: false
tags:
  - quantum-computing
  - cloud
  - aws
  - explainer
description: I worked on a quantum computing platform. Here's the honest version of what quantum can and can't do today, and what it costs to run a real circuit yourself.
---

I worked on a quantum computing project: [QCloud](https://www.rackspace.com/newsroom/rackspace-technology-munster-technological-university-aws-quantum-cloud-platform), Ireland's first quantum cloud platform, built with Munster Technological University on AWS. My corner of it was the cloud plumbing rather than the physics: giving researchers access to real quantum hardware through Amazon Braket, with the cost controls to keep a room full of experiments from quietly spending a fortune.

You don't do that for long without people asking the obvious questions. What is this actually? Should we care yet? This post is my honest answer, including the part most quantum content skips: today, for almost everyone, there is no business advantage. And the gap to there being one is larger than the headlines suggest. That's not a reason to ignore it. It's a reason to understand it without the hype.

I'm not a physicist, so this is the engineer's-eye view: enough of the concepts to reason about it, and the practical bits you can actually touch.

## Table of contents

## The one idea worth holding onto

You've heard that a qubit "can be 0 and 1 at the same time." That's the pop-science version, and it's misleading enough to be worth correcting.

A classical bit is 0 or 1. A qubit holds a _superposition_: a combination of both, described by two amplitudes. The important part isn't that it's "both at once," it's what happens when you have many qubits. With N qubits, the state is described by 2^N amplitudes evolving together. Thirty qubits is a billion amplitudes. Three hundred qubits is more amplitudes than there are atoms in the observable universe.

That sounds like free parallelism, and this is where the pop version lies to you. You cannot read all those amplitudes out. When you measure, the whole thing collapses to a single answer, with a probability set by the amplitudes. The entire craft of quantum algorithms is arranging the computation so that the answer you want has a high probability and the wrong answers cancel out through interference. That's hard, and it only works for a small set of problem shapes.

So a quantum computer is not a faster classical computer. It's a different machine that is dramatically better at a few specific things and no better (often worse) at everything else.

## The misconceptions worth killing

The fastest way to understand quantum computing is to clear out what it isn't. Every one of these is something I've heard stated as fact:

- **"It'll break encryption today."** No. The algorithm that threatens RSA (Shor's) needs a large, error-corrected machine that does not exist yet. The real-world concern is "harvest now, decrypt later," which is why post-quantum cryptography is being rolled out now, but nothing is breaking your TLS this year.
- **"It speeds up every problem."** No. For most workloads a quantum computer offers no advantage at all. The speedups are specific: factoring, some search and optimization, and simulating quantum systems.
- **"It'll replace classical computers."** No. It's an accelerator for particular problems, the way a GPU is. Your database will still run on classical hardware.
- **"It gives instant answers."** No. You run a circuit many times and build up a probability distribution. It's statistical, not instant.
- **"More qubits means better."** Only partly. A noisy 1,000-qubit machine can be less useful than a clean 100-qubit one. Qubit count is the number vendors advertise; error rate is the number that actually matters.

## The elephant in the room

Here's the part the vendor decks tiptoe around: **today there is no quantum advantage for business.** No company is running a quantum computer in production to solve a real problem faster or cheaper than classical hardware could. The demonstrations of "quantum supremacy" were carefully chosen problems with no practical use, designed to prove a point, not to do work.

That's the honest status in one sentence. But it sits next to a genuinely uncomfortable counter-argument, one that Marco Pistoia made repeatedly while leading applied research at JPMorgan Chase (and clearly meant, since in 2025 he left the bank to join a quantum hardware company outright): if you wait until quantum advantage is real to start paying attention, catching up may take longer than you have. Building the skills, the tooling, and the intuition is slow. The hardware, when it arrives, will arrive faster than an organization can learn to use it.

So both things hold. There's no advantage today, but that doesn't make it safe to ignore. Sitting in that gap, paying a little attention without betting the business, is the honest place to be.

## How far away is "practical"?

Concretely: a genuinely useful, general-purpose quantum computer needs to run circuits billions of gate operations deep and still produce a correct answer. For that to work, the effective error rate has to be around one in a trillion. A raw physical gate today sits at about one in a thousand.

That's roughly nine orders of magnitude of gap. Not nine percent. Nine orders of magnitude. You don't close it by building physical gates a trillion times better, because that's not realistic. You close it with error correction: bundling many noisy physical qubits into one reliable logical qubit that detects and fixes its own errors. That's where the effort goes now, and there's been real progress, faster than the skeptics expected. It's a years-out problem, not a next-quarter one.

## You can still run one this afternoon

None of that means you can't touch a real quantum computer today. You can, and it's cheap enough to do out of curiosity. Giving researchers exactly this kind of access, without a physics lab or a seven-figure machine, was the whole point of QCloud.

The access layer is [Amazon Braket](https://aws.amazon.com/braket/), which puts real quantum hardware from several vendors (IonQ, IQM, Rigetti, QuEra) behind a normal SDK. The pricing model is simple: a flat per-task fee (currently $0.30) plus a per-shot fee that varies by device. A _shot_ is one run of your circuit; a _task_ is a batch of shots. Because a circuit is probabilistic, you run it many times, say a few hundred to a few thousand shots, and read the distribution.

The per-shot fees are small, but they add up fast when a dozen researchers are all iterating, which is why the QCloud build included a custom Braket cost dashboard with automated budget alerts. If you're just experimenting solo, a small circuit lands in the low single-digit dollars. Check the [Braket pricing page](https://aws.amazon.com/braket/pricing/) for the current per-shot numbers before you run anything, since they shift as vendors update hardware.

Here's a Bell state, the "hello world" of quantum computing, two qubits entangled so they always come out matching:

```python
from braket.aws import AwsDevice
from braket.circuits import Circuit

# A Bell state: Hadamard puts qubit 0 into superposition,
# then CNOT entangles it with qubit 1.
bell = Circuit().h(0).cnot(0, 1)

# Run on a real QPU. Start with the free local simulator
# (LocalSimulator) while you're iterating to avoid paying per shot.
device = AwsDevice("arn:aws:braket:us-east-1::device/qpu/ionq/Aria-1")
result = device.run(bell, shots=1000).result()

print(result.measurement_counts)
# Roughly: {'00': ~500, '11': ~500}
# Almost no '01' or '10' — that's entanglement.
# On real hardware you'll see a few, and that's the noise.
```

On a perfect machine you'd get only `00` and `11`, split about 50/50. On a real QPU you also get a small scattering of `01` and `10`. Those wrong results are the noise, made visible in your own output. It's the reason researchers want real hardware and not just simulators: a clean simulation doesn't reproduce the noise, and for some work the noise is the thing you're studying.

A tip that saves money and frustration: develop against the free local simulator that ships with the SDK, and only send to real hardware once the circuit does what you expect. The simulator is also honest about scale. Simulating more than ~30 qubits classically gets expensive fast, which is the whole reason quantum hardware is interesting in the first place.

## Who's building it, and how

There isn't one kind of quantum computer. There are competing physical approaches, and it's genuinely unsettled which will win:

- **Superconducting** circuits chilled to near absolute zero. Fast gates, mature tooling. Used by IBM, Google, Rigetti, IQM.
- **Trapped ions**: individual charged atoms held in electromagnetic fields. Slower, but very clean and long-lived. Used by IonQ and Quantinuum.
- **Neutral atoms** (Rydberg): atoms arranged in optical tweezer arrays. Used by QuEra and Pasqal.
- **Photonics**: computing with light through optical elements. Used by PsiQuantum and Xanadu.

Each trades off differently across gate speed, error rate, connectivity, and how hard it is to scale. Nobody has to pick a winner yet, and betting on the wrong physics is a real risk for the companies involved.

The money says the field takes itself seriously. National programs have committed billions (China's is the largest publicly reported, with the US, Germany, the UK, and others in the billions each), and the best-funded private hardware companies have raised hundreds of millions apiece. That funding is a statement about the potential payoff, not evidence that the payoff has arrived.

## Where I've landed

If you're an engineer wondering whether to care: care a little, calmly.

Learn the mental model, the superposition-and-interference idea, well enough that the headlines stop fooling you. Run a circuit on Braket once so it stops being abstract. Then get back to your actual job, because for almost everyone that's the correct allocation of attention right now.

The honest summary is boring, which is why it's worth saying out loud: quantum computing is real, genuinely important for a narrow set of problems, delivers no business advantage today, and the practical version is still years away. It's a science project with a serious budget and a plausible future, not a product you're late to.
