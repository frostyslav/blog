---
author: Rostyslav Fridman
pubDatetime: 2026-09-12T09:00:00Z
title: The OVSDB ORM I wasn't allowed to open-source
featured: false
draft: false
tags:
  - kubernetes
  - networking
  - ovn
  - ovsdb
  - golang
  - war-stories
description: "The seventh and last post in the CertaScale series, and the one I'm still not over. Driving OVN means talking to several databases over the OVSDB wire protocol by hand. So I built a full ORM in Go: every table as a typed object, references as pointers, and an ACL match compiler built on Reverse Polish Notation. I wanted to open-source it. The company said no, and it died with the company."
---

This is the seventh and final post in a series about [CertaScale](/posts/the-private-cloud-we-built-before-it-was-cool/), the private cloud I helped build between 2016 and 2019. The last six posts were about things that shipped and, mostly, things I'm proud of. This one is about a thing that shipped, that I'm proud of, and that no longer exists anywhere I can point you to. It's the piece of the whole project I'm still not over, and the right note to end on: the clearest example of what it means to build good work inside a company that then takes it to the grave.

## Table of contents

## The problem: OVN speaks a database, not an API

By this point in the series, the shape of the network layer is familiar. Everything we did to Kubernetes' networking, [VLANs and enterprise addressing](/posts/giving-kubernetes-an-enterprise-network/), [the flat overlay](/posts/a-flat-network-gcp-style-on-early-kubernetes/), [VM networking](/posts/running-vms-inside-pods-in-2016-before-kata-existed/), came down to writing intent into OVN: create this logical switch, attach that port, add this router, write this NAT rule, install this ACL.

The catch is how you actually talk to OVN. There's no tidy REST API. OVN's configuration lives in databases, and you talk to them over the **OVSDB protocol**, defined in [RFC 7047](https://tools.ietf.org/html/rfc7047). It's a JSON-RPC protocol, not SQL: you send operations like `insert`, `update`, `mutate`, `delete`, and `wait`, wrapped in a `transact` call, and you receive rows back as JSON. And it isn't one database. OVN keeps a northbound database (your intent) and a southbound database (the compiled result), and Open vSwitch itself has its own database on every host. Driving the system means talking to several of these.

Working with that directly is exactly as pleasant as it sounds. A few of the sharp edges:

- **Everything is a row keyed by UUID.** To attach a port to a switch you don't say "add this port to that switch." You insert a row into `Logical_Switch_Port`, get back a UUID, and then `mutate` the `ports` column of the `Logical_Switch` row to include that UUID. References are hand-managed.
- **Named UUIDs for things that don't exist yet.** Within a single transaction you often create a row and reference it in the same breath, which OVSDB handles with `named-uuid` placeholders you have to assemble and track yourself.
- **No types.** A column is a string, an integer, a set, a map, or a reference, and it's on you to remember that a VLAN tag is an integer 0–4095, that a given column is a set rather than a scalar, or that this field is a reference to a row in another table.
- **Transactions are yours to build.** Any non-trivial change is several operations that must succeed or fail together, and you're assembling that JSON by hand.

You can do all of this by shelling out to `ovn-nbctl`, the command-line tool. Many projects did, and some still do. But shelling out to a CLI from inside a long-running Go controller is its own kind of misery: formatting command strings, parsing text output, forking a process per operation, losing every type guarantee the moment you cross into a string. For the volume of network changes CertaScale made as pods and VMs came and went, that wasn't going to hold.

## What I built instead: a real ORM, in code

So I built an ORM over the OVS/OVN database world. Not a wrapper around the CLI, an actual object mapper: every table became a typed Go object, every relationship became a typed reference, and every operation the CLI could do was reproduced in code as a real OVSDB transaction. We never shelled out. Our Go code created a `LogicalSwitch`, gave it a `LogicalSwitchPort`, wired it to a `LogicalRouter`, and added a NAT rule, all as method calls on objects, and the library turned that into the right sequence of `insert` and `mutate` operations on the northbound database.

I call it an ORM knowing the word doesn't fit perfectly. There were no queries to speak of, no migrations, no lazy loading, none of the relational-database machinery the term usually drags along. What it did share with an ORM is the part that matters: it mapped rows to typed objects and foreign keys to real references, so you worked with a graph of Go objects instead of raw protocol. That's the sense I mean it in.

The word gets used loosely, and it's worth placing what we had against the alternatives. There is a well-known open-source binding, [eBay's go-ovn](https://github.com/eBay/go-ovn), that people sometimes call an ORM. It's useful, but fairly barebones, and in practice close to a wrapper over the command-line operations. There's also the community [libovsdb](https://github.com/ovn-org/libovsdb), which over time grew into a proper model-based client where you describe your tables as Go structs and it maps rows onto them. That's much closer to what we had, and it's telling that the ecosystem eventually converged on the same idea, but the mature version of it landed years after we were already running ours in production. What we had, internally, around 2017, was the full thing: all operations as code, everything typed, no CLI anywhere in the path.

The mental model it gave us was the one the whole series has been leaning on. The earlier posts described OVN topology, [logical switches and routers, `localnet` ports, SNAT and DNAT](/posts/giving-kubernetes-an-enterprise-network/), as if those were objects. In our code they _were_ objects, because this library made them so. When I wrote those posts saying "we created a logical switch with a `localnet` port," this ORM is what that sentence compiled down to.

## Generating the objects from the schema

This part I can actually show you. After the company folded I started, in my own time, to rebuild the idea from scratch as an open-source project: [gopenvswitch-db](https://github.com/frostyslav/gopenvswitch-db). It's unfinished. But it captures the technique the production version used, so it's the honest artifact to point at.

You should not hand-write those Go structs. OVSDB databases are self-describing: the schema is published as a JSON document listing every table, every column, and every column's type and constraints. So the objects should be _generated_ from the schema, which means they're always correct and they track OVN as it changes versions.

The generator reads the schema and emits one Go struct per table, one field per column. That much is obvious. The interesting decisions are in how it maps OVSDB's type system onto Go's, where an ORM stops being a dumb row-mapper and starts encoding the database's own rules into the type system:

- **A reference becomes a typed pointer.** When a column's type is a UUID that points at another table (OVSDB spells this out with a `refTable`), the generator doesn't emit a bare string. It emits a pointer to that table's struct. A column referencing the router table becomes a `*LogicalRouter`. Foreign keys become real object references, which is the entire point of an ORM.

```go
// in parseKeyValueCompound: a UUID column that names a refTable
case uuidType:
    refTable := sanitize.Name(data[refTableKey].(string))
    return "*" + refTable
```

- **An enum becomes a named type with constants.** Columns whose values are constrained to a fixed set (the classic example being an ACL's `action`: `allow`, `drop`, `reject`, `allow-related`) become their own string type with a generated constant for each acceptable value, so a typo is a compile error instead of a runtime surprise.

- **A bounded integer becomes a right-sized type.** OVSDB columns carry min/max constraints. A VLAN tag is 0–4095; a priority has its own range. The generator turns those bounds into custom integer types sized to fit, rather than letting everything be a wide, unchecked `int`.

- **Sets and maps become Go slices and maps.** An OVSDB column that can hold multiple values becomes a `[]T`; a key-value column becomes a `map[K]V`. The "is this a scalar or a set" question you'd otherwise have to remember is answered by the type.

One more mapping did as much for daily use as any of the type decisions. OVN ships human-readable documentation for every table and column as XML man-page source. The generator pulls that text in and emits it as Go doc comments on the generated structs and fields, then runs the whole thing through `go/format`. The result is generated code that reads like it was written and documented by hand, with the OVN manual sitting right there in your editor's tooltips. It's also the clearest expression of the whole idea: the objects and their documentation both come from the same source of truth, so they can't drift from it. You were never reading a stale hand-written comment about what a column meant. You were reading OVN's own words, regenerated every time the schema changed.

None of this is exotic today; code generation from schemas is a well-trodden path. It was less obvious in 2016, and doing it against a live network control plane, so the objects your controllers manipulated were provably faithful to the database they wrote to, is what made the rest of the network layer feel like ordinary Go instead of a JSON-RPC assembly line.

![The ORM pipeline, left to right. Our Go code works with objects and references (a LogicalSwitch with ports and ACLs, no raw JSON and no CLI). Those method calls go into the ORM, which holds a typed struct per table, references as pointers, enums and sized integers, and an ACL match compiler that turns infix boolean expressions with and, or, and parentheses into a string via Reverse Polish Notation, then assembles the transaction. The ORM emits OVSDB protocol operations (insert, mutate, transact) over JSON-RPC to the OVN northbound and southbound databases and the Open vSwitch database. Above the ORM, the OVSDB JSON schema plus the XML man-page docs generate the typed structs, so the objects stay faithful to the database as OVN changes. Everything the CLI could do was reproduced in code; we never shelled out to ovn-nbctl.](_certascale-assets/ovsdb-orm.svg)

## The part I'm proudest of: compiling ACL expressions with RPN

The trick I still smile about is how we handled ACL match expressions.

OVN's ACLs match traffic using a small [expression language](https://github.com/dspinhirne/ovn-tutorial/blob/main/20161003-OVN-and-ACLs.md). A match is a string like `inport == "vm1" && ip && tcp.dst == 22`, and the grammar supports the things you'd expect from a real boolean language: `&&` (and), `||` (or), `!` (not), comparisons, references to named address sets with `$`, and, crucially, **parentheses** for grouping. You can write `(ip4.src == $web || ip4.src == $db) && tcp.dst == 443` and it means what it looks like.

Generating those strings by hand, from the outside, is where things get dangerous. The moment your callers build conditions dynamically, combining a few "and" clauses here, an "or" group there, wrapping some of it in parentheses, you're doing string concatenation with precedence and grouping rules. Get a paren wrong and you've either got a syntax error or, worse, an ACL that silently matches the wrong traffic.

Consider the rule "allow the web and database tiers to reach port 443." Written correctly it's `(ip4.src == $web || ip4.src == $db) && tcp.dst == 443`. Drop the outer parentheses during string assembly and you get `ip4.src == $web || ip4.src == $db && tcp.dst == 443`. Because `&&` binds tighter than `||`, that parses as `ip4.src == $web || (ip4.src == $db && tcp.dst == 443)`: the `$web` tier is now allowed to reach _every_ port, not just 443. No syntax error, no crash, no log line. Just a firewall rule that's quietly wider than the one you meant to write. On a security primitive, that's the nightmare.

I'd seen this exact shape of problem before, in school, in the most classic place it shows up: writing a calculator. Turning `3 + 4 * (2 - 1)` into a correct result is the textbook motivation for **Reverse Polish Notation** and the shunting-yard algorithm. You parse the infix expression, operators and parentheses and all, into a postfix form where precedence and grouping are unambiguous and no parentheses are needed, and from there evaluating, or in our case re-emitting, is mechanical and correct.

So that's what the ORM did for ACL matches. Callers built up an expression as a structure, operands joined by `and`/`or`, groups nested as needed, and the library ran it through an RPN-based compiler that produced a correctly-parenthesized, correctly-precedenced OVN match string every time. The boolean logic was validated and assembled by an algorithm designed for exactly this, instead of by hopeful string-joining.

The API was a small set of combinators, `And`, `Or`, `Eq`, that built the expression as a tree. Reconstructed from memory (the original is gone, which is the whole point of this post), a caller wrote the same rule from above like this:

```go
// (ip4.src == $web || ip4.src == $db) && tcp.dst == 443
match := And(
    Or(
        Eq("ip4.src", "$web"),
        Eq("ip4.src", "$db"),
    ),
    Eq("tcp.dst", "443"),
)

acl := LogicalSwitch("ls1").
    AddACL(FromLport, 1000, match, ActionAllowRelated)
```

and the library turned that tree into the flat OVN match string, parentheses and precedence handled by the shunting-yard pass, then into the OVSDB transaction that inserted the ACL row and linked it to the switch. The person writing a firewall rule thought in terms of boolean logic. They never touched a parenthesis or a raw match string, and they couldn't accidentally ship a malformed one. A first-year calculator exercise, turned into the thing that kept our firewall rules honest.

## Why it's gone

I thought this library was good enough, and general enough, to live outside CertaScale. It wasn't private-cloud-specific or customer-specific; it was a clean, typed, generated Go interface to OVN's databases, exactly the thing a lot of people wiring OVN into their own systems would have wanted, and exactly the thing the ecosystem went on to build more than once. I wanted to open-source it.

The answer was no. Not for a technical reason, and not one I got to argue with much: it was the customer's software, the customer owned it, and open-sourcing a piece of it wasn't a call I could make. So it stayed inside. And when the company went away, it went away too, locked in a repository I have no access to, on infrastructure that no longer exists. No fork, no gist, no export. Just gone.

That's why [gopenvswitch-db](https://github.com/frostyslav/gopenvswitch-db) exists as a stub. It's me trying, on my own time and from memory, to rebuild the idea I wasn't allowed to release, so at least the technique isn't entirely lost. And it's why it's unfinished: rebuilding a couple of years of production work in evenings, from memory, while the rest of life keeps happening, is a very different proposition from having the original. The idea survives. The thing does not.

## The eulogy, and the end of the series

I opened the [first post](/posts/the-private-cloud-we-built-before-it-was-cool/) by saying CertaScale doesn't exist anymore, so there's no product to sell and no roadmap to defend, and that this was exactly why I wanted to write it down. This library is the sharpest version of that feeling: some of the best engineering in the whole project, and the piece with the least left to show for it. A handful of blog paragraphs and an unfinished repo, against a couple of years of production code I can't reach.

But that's the whole series, really, not just this last piece. [VMs as first-class pod workloads](/posts/running-vms-inside-pods-in-2016-before-kata-existed/), [GCP-style flat overlays on Kubernetes](/posts/a-flat-network-gcp-style-on-early-kubernetes/), [enterprise network semantics as a first-class concern](/posts/giving-kubernetes-an-enterprise-network/), [the data path pushed out of the kernel](/posts/from-12-to-60-gbps-with-dpdk-when-we-tried-to-become-a-5g-edge-box/), and this ORM, were good ideas, some of them more relevant now than they were then, and all of them locked inside a company that no longer exists.

Which is why these posts turned into what they are. I couldn't open-source the code, so I open-sourced the thinking. Seven posts, one private cloud, built years before the ecosystem grew names for half of what we did. The company is gone; the ideas don't have to be. That's the closest thing to a release I have left, and it's the one I got to make.
