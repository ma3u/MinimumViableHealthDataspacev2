# ADR-089: The Java EDC apps shrink to what they use; they are not rewritten in Rust

**Status:** Proposed
**Date:** 2026-11-11
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-056](ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md), [ADR-061](ADR-061-the-ui-scales-out-on-whole-cores.md), [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md)

## Context

The question was how much compute the hub would save if the EDC components
were written in Rust instead of Java. After the EDC 0.18 data planes left
(#927), three EDC apps run on a JVM: the control plane, the IdentityHub and
the IssuerService. The data plane is Rust already (siglet, #574, ADR-078).

Container Apps bills what an app is given, not what it uses, and the smallest
size it sells is 0.25 vCPU and 0.5 GiB. Azure Monitor, seven days to
2026-11-11, 70 running hours (the stack stops off hours, ADR-053), hourly
averages:

| app                         | given         | memory, median / max | CPU, p95 / max hour |
| --------------------------- | ------------- | -------------------- | ------------------- |
| `mvhd-controlplane` (Java)  | 1 vCPU, 2 GiB | 305 / 379 MiB        | 0.015 / 0.50 vCPU   |
| `mvhd-identityhub` (Java)   | 0.5, 1 GiB    | 168 / 196 MiB        | 0.005 / 0.12 vCPU   |
| `mvhd-issuerservice` (Java) | 0.5, 1 GiB    | 159 / 178 MiB        | 0.005 / 0.09 vCPU   |
| `mvhd-siglet` (Rust)        | 0.25, 0.5 GiB | 81 / 115 MiB         | 0.001 / 0.016 vCPU  |
| `mvhd-keycloak` (Java)      | 1 vCPU, 2 GiB | 668 / 738 MiB        | 0.033 / 1.04 vCPU   |

The Rust app does hold about half the memory of the smaller Java apps. All of
them sit far below the smallest size on sale, so the language does not reach
the bill; the allocation does.

| option                         | EDC allocation     | saved per month, office hours / always on |
| ------------------------------ | ------------------ | ----------------------------------------- |
| today                          | 2 vCPU, 4 GiB      | none                                      |
| the Java apps at what they use | 1 vCPU, 2 GiB      | about $30 / $79                           |
| all three rewritten in Rust    | 0.75 vCPU, 1.5 GiB | about $38 / $99                           |

At list price ($0.0864 per vCPU hour, $0.0108 per GiB hour, about 280 hours a
month); the bill is in euro and carries the free grant, so these are the
order, not the invoice. A rewrite adds $8 to $20 a month over right-sizing.

Upstream has no Rust control plane, IdentityHub or IssuerService:
`eclipse-edc` holds no Rust repository, and Rust lives only in
[eclipse-dataplane-core](https://github.com/eclipse-dataplane-core) (the data
plane SDK, `dsdk-facet-rs`, siglet). A rewrite would be ours alone: DSP, DCP,
the policy engine and the credential flows, kept conformant by us.

## Decision

1. **No rewrite.** The control plane, the IdentityHub and the IssuerService
   stay the upstream Java releases. Where upstream ships a Rust component we
   take it, as with siglet.
2. **The three apps get what they use:** the control plane 0.5 vCPU and 1 GiB,
   the IdentityHub and the IssuerService 0.25 vCPU and 0.5 GiB each. The sizes
   live in `scripts/azure/env.sh` (`EDC_CP_*`, `EDC_ID_*`);
   `04-edc-services.sh` creates the apps with them and
   `scripts/azure/size-edc.sh` applies them to the live apps.
3. **The heap ceiling stays.** A JVM takes a quarter of the container's memory
   as its heap, so half the container would be half the heap.
   `-XX:MaxRAMPercentage=50` (`EDC_JVM_HEAP_OPTS`) goes into
   `JAVA_TOOL_OPTIONS`: 512 MiB for the control plane and 256 MiB for the
   other two, as today.
4. **A start that fails undoes itself.** `size-edc.sh` sizes one app at a
   time, the IssuerService first, and gives an app its old size back when the
   new revision is not healthy in ten minutes.

## Consequences

- The EDC allocation halves, about $30 a month on the office-hours schedule.
- A JVM starts slower on less CPU. The control plane's 0.5 vCPU peak hour is
  most likely its start; the morning start after the off-hours stop is the
  thing to watch for the first days, and the startup probes may need longer.
- The memory headroom is smaller: the control plane's 379 MiB peak sits in
  1 GiB, the IdentityHub's 196 MiB in 0.5 GiB. A `contracts` load run after
  the change shows whether negotiation under load fits; if not, the sizes in
  `env.sh` go back up and this ADR is amended.
- Keycloak (1 vCPU, 2 GiB, 738 MiB peak) is Java but not EDC and is not
  touched here; its CPU peak is a full core.

## Alternatives considered

- **Rewrite in Rust:** $8 to $20 a month more than right-sizing, for three
  services with no upstream to follow.
- **GraalVM native images of the EDC runtimes:** EDC loads its extensions by
  reflection and service loaders; upstream ships no native image and we would
  own the build.
- **Leave it:** half the EDC allocation is paid for and never used.
