# ADR-056: Neo4j on Azure grows to 2 vCPU and 4 GiB, with its memory bounded

**Status:** Accepted (2026-10-06, Matthias Buchhorn)
**Date:** 2026-10-06
**Relates to:** [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md), [ADR-053](ADR-053-everything-stops-off-hours.md)
**Tracks:** [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571), [#540](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/540), [#519](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/519)

## Context

`mvhd-neo4j` is the platform's ceiling. Neo4j Community has no cluster mode,
so it is one replica, and the load and stress tests of 2026-10-05 and
2026-10-06 (#519) found it there:

- At 1 vCPU and 2 GiB, with a 1 GiB heap and a 384 MiB page cache, it ran at
  **2.0 to 2.09 GB of its 2 GiB even when idle**. The image starts the JVM with
  `-XX:+AlwaysPreTouch`, so the whole heap is committed at once. The page
  cache, the GDS and APOC plugins, thread stacks and Bolt's direct buffers
  share the rest, and the JVM leaves direct memory unbounded (it defaults to
  the heap size).
- Under stress the container was **killed for memory (exit 137) on both days**,
  at about 300 users. The kill is the container's limit, not the Java heap: a
  cap on transaction memory (`db.memory.transaction.total.max`, the cheap idea
  in #571) bounds heap use and would not have prevented it.
- The graph cache (#576) and the cap on the access log in the graph views
  (#580) took most of the query load off Neo4j: 0.18 cores at 50 users,
  against 0.85 before. They do not change its memory, which sat at the limit
  in every run.

## Decision

On Azure, `mvhd-neo4j` runs with **2 vCPU and 4 GiB**, and its memory is
planned to fit with room to spare:

| Part                  | Setting                                               | Size                         |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| Heap (initial = max)  | `server.memory.heap.*_size`                           | 1.5 GiB                      |
| Page cache            | `server.memory.pagecache.size`                        | 1 GiB (the store is smaller) |
| Direct memory         | `-XX:MaxDirectMemorySize` via `server.jvm.additional` | at most 512 MiB              |
| JVM, plugins, threads |                                                       | about 0.3 GiB                |
| **Planned**           |                                                       | **about 3.3 GiB of 4**       |

The values live once, in `scripts/azure/env.sh` (`NEO4J_CPU`, `NEO4J_MEMORY`,
`NEO4J_HEAP`, `NEO4J_PAGECACHE`, `NEO4J_DIRECT_MEMORY`). They are read by
`02-data-layer.sh`, which creates the app, by the GraphRAG workflow, which used
to reset the heap to 1G, and by `size-neo4j.sh`, which applies them to the live
app. Checked locally with the same image: `NEO4J_server_jvm_additional` adds to
the image's JVM defaults (G1GC, AlwaysPreTouch, the Netty flags) rather than
replacing them, and Neo4j idles at 1.8 GiB with these settings.

Applying it costs a minute or two of graph outage, as every Neo4j revision
change does: the new revision cannot start while the old one holds the store
lock on the `neo4j-data` share (docs/gotchas.md, 2026-10-04).

## Consequences

- Neo4j's compute cost doubles for the hours it runs; it stops off hours with
  everything else (ADR-053). That is its vCPU-seconds and GiB-seconds on the
  Consumption plan, not the whole hub's bill.
- Bounding direct memory turns a burst that would have exceeded the container
  into an allocation failure inside Neo4j, which it reports, instead of a
  silent kill of the whole database.
- The ceiling moves but does not go away. The next limit is Neo4j's CPU or the
  UI (three replicas of 0.5 vCPU). The `stress` run after this change measures
  where it now is (#571).
- Compose is unchanged: there Neo4j has the laptop's memory.

## Alternatives considered

- **Stay at 2 GiB and bound everything inside it:** no extra cost, but with
  heap and page cache fixed at 1.38 GiB the bounds leave too little for the
  plugins and Bolt, so stress would turn into refused queries instead of a kill.
- **A transaction memory cap only:** bounds the heap, which was not what ran out.
- **Neo4j Enterprise or Aura for a cluster:** licence or a managed service,
  against the demonstrator's open-source and cost premise; out of scope.
- **Measure first, change later:** the idle working set already left no
  headroom, so a stress run would only have repeated the kill.
