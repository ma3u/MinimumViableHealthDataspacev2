# ADR-059: The UI on Azure scales out on whole cores, on its own HTTP concurrency rule

**Status:** Proposed (2026-10-12, Matthias Buchhorn). Accepted when the `stress` run after `size-ui.sh` holds 200 users inside the SLOs with no failed request.
**Date:** 2026-10-12
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-056](ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md), [ADR-058](ADR-058-azure-triggers-the-off-hours-schedule.md)
**Tracks:** [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571), [#519](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/519)

## Context

With Neo4j at 2 vCPU and 4 GiB (ADR-056), the graph views capped (#580) and
the onboarding agent's retry loop fixed (#581), the two `stress` runs of
2026-10-06 reached 400 users without a failed request, and the ceiling moved
to the UI:

| at 400 users (`20261006-2140-stress-aca`) | measured                                  |
| ----------------------------------------- | ----------------------------------------- |
| `mvhd-ui`, 3 replicas of 0.5 vCPU         | **99 % CPU from the 200-user stage on**   |
| `mvhd-neo4j`, 2 vCPU                      | 0.82 cores, 2.66 GB of 4 GiB              |
| `mvhd-neo4j-proxy`                        | 0.06 cores                                |
| throughput                                | 63.6 req/s over the run; 66 at best       |
| p95, API / pages / NLQ                    | 3.5 s / 3.2 s / 4.9 s (SLO 1 s, 2 s, 3 s) |

The UI is one Node process per replica. Node runs one event loop, so a replica
never uses more than one core, and at 0.5 vCPU the scheduler gives that loop
half a core: every request the replica serves is slower than the same request
on a laptop, before any load. ACA's default HTTP rule adds a replica at 10
concurrent requests, but the morning start (`offhours.sh`) caps the UI at 3
replicas, so from 200 users on there was nothing left to add.

## Decision

`mvhd-ui` gets a whole core per replica and more replicas, added on a rule the
repository owns:

| setting            | before                    | now                        |
| ------------------ | ------------------------- | -------------------------- |
| vCPU per replica   | 0.5                       | **1**                      |
| memory per replica | 1 GiB                     | **2 GiB**                  |
| replicas           | 1 to 3                    | **1 to 6**                 |
| scale rule         | ACA default, 10 in flight | **`http-concurrency`, 15** |

The values live once, in `scripts/azure/env.sh` (`UI_CPU`, `UI_MEMORY`,
`UI_MIN_REPLICAS`, `UI_MAX_REPLICAS`, `UI_SCALE_CONCURRENCY`). `05-cfm-ui.sh`
creates a fresh app with them, `size-ui.sh` applies them to the live app (a
rolling revision, no outage), and `offhours.sh` restores the replica range on
the morning start, which until now put the cap of 3 back every day.

Why 15 requests in flight: by Little's law a replica's in-flight count is its
throughput times its latency. One Node process on a whole core carried 50 to
60 req/s locally; at the 1 s API SLO that is 50 to 60 in flight, and the rule
has to fire well before that. At 15 a replica is added when its latency reaches
about 300 ms at full throughput, a third of the SLO, while a warm hub at 50
users (p95 150 ms, 21 req/s in all) stays on one or two replicas.

## Consequences

- **Cost.** Consumption-plan list prices, West Europe, active usage: about
  $0.0864 per vCPU-hour and $0.0108 per GiB-hour, so a replica-hour goes from
  $0.054 to $0.108. The idle hub, one replica through the office hours
  (ADR-053, about 280 hours a month), goes from about $15 to about $30 a month.
  A `stress` run at six replicas for 20 minutes adds about $0.22. The real
  numbers come from Cost Management over a run's window; the bill is in euro
  and carries the free grant, so these are the order, not the invoice.
- **Cost per 1,000 requests**, an estimate from `20261006-2115-load-aca`
  (19,509 requests in 15 minutes): the apps that did the work, UI at two
  replicas, proxy, Neo4j (ADR-056) and Keycloak, bill about $0.60 an hour at
  list price, so a quarter of an hour is $0.15, or **about $0.01 per 1,000
  requests** at 50 users. Per concurrent user and hour that is about $0.012.
  Everything else in the hub bills whether a request arrives or not.
- The in-memory rate limiter of the UI counts per replica (hypothesis 3 in the
  runbook): a user's budget is now up to six times the number, as it was three
  times. Left as is; the proxy's per-user limit (#536) is the one that holds.
- The next ceiling is measured, not guessed: `stress` again after `size-ui.sh`,
  same shape, its own testid. If the UI still saturates at six replicas the
  answer is more replicas; if Neo4j does, ADR-056 is superseded.

## Scalability per component

What each part of the hub can do under load, from the runs of #519 and the
code, for the runs still to come:

| component                                       | scales                                                             | today                      | what more would take                                              |
| ----------------------------------------------- | ------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------- |
| `mvhd-ui`                                       | out; stateless, the graph cache (#576) is per replica              | 1 to 6 × 1 vCPU (this ADR) | more replicas                                                     |
| `mvhd-neo4j-proxy`                              | out; stateless, rate limits and the audit batch writer per replica | 1 to 2 × 0.25 vCPU         | a higher maximum, and the limits divided by the replica count     |
| `mvhd-neo4j`                                    | up only; Community has no cluster and holds a store lock           | 2 vCPU, 4 GiB (ADR-056)    | 4 vCPU, 8 GiB; a cluster means Enterprise or Aura, out of scope   |
| `mvhd-keycloak`                                 | out with an Infinispan cluster                                     | 1 × 1 vCPU                 | cache stack and discovery; `signin` measures whether it is needed |
| control plane, data planes, IdentityHub, issuer | out; state machines lease their work in Postgres                   | 1 each                     | more replicas on the same database                                |
| CFM agents, `cfm-cp-shim`                       | singletons by design (one consumer per NATS subject)               | 1 each                     | nothing; they carry onboarding, not request load                  |
| Flexible Server B1ms                            | up (SKU); burstable, on credits                                    | B1ms                       | General Purpose if `soak` drains the credits (hypothesis 4)       |
| `mvhd-vault`, `mvhd-observability`              | singletons (one unsealer; one writer on the share, #573)           | 1 each                     | nothing; not on the request path                                  |

## Alternatives considered

- **Six replicas of 0.5 vCPU:** the same cores for the same money, but every
  request keeps its half-core latency; the whole core lifts the floor as well
  as the ceiling.
- **The default rule and a higher maximum only:** works, but leaves the number
  that decides when a replica is added outside the repository.
- **A CPU rule:** ACA's CPU scaling is on the replica's share of its limit,
  which a single-threaded process pins before its queue grows; requests in
  flight is what the user feels.
- **Cluster mode, Node's `cluster` module, in one replica:** more cores in one
  container, the same effect with fewer replicas, but ACA bills vCPU the same
  either way and replicas also give availability during a deploy.
