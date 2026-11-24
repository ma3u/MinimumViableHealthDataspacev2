# ADR-099: The proxy runs one replica while SPE inboxes are held in memory

Date: 2026-11-24

**Status:** Accepted (2026-11-24)
**Supersedes in part:** [ADR-061](ADR-061-the-ui-scales-out-on-whole-cores.md), its row for `mvhd-neo4j-proxy` (1 to 2 replicas); the rest of ADR-061 stands
**Relates to:** [ADR-095](ADR-095-a-push-data-plane-on-the-dataplane-sdk-beside-siglet.md), [ADR-096](ADR-096-the-kafka-broker-on-azure-is-event-hubs.md)
**Tracks:** [#888](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/888)

## Context

ADR-061 lets `mvhd-neo4j-proxy` run one or two replicas, because the proxy
was stateless: its rate limits and its audit batch writer are per replica, and
nothing else was held between requests.

ADR-095 gave the proxy state. An SPE inbox (the token, the flow, the stream's
running hash and sequence) lives in the memory of the replica that opened it
(`services/neo4j-proxy/src/spe-inbox.ts`). A push makes several calls: open,
started, ready, then a bundle, a file or a stream of chunks, then complete.
Container Apps spreads them over the replicas, so with two replicas a call can
reach the one that never saw the inbox. It answers 401, and the transfer ends
`TERMINATED`. `scripts/azure/23-dataplane.sh --check` found the proxy at two
replicas on 2026-11-24, before the data plane was deployed.

Three ways out were weighed: one replica; session affinity on the proxy's
ingress, which does not help because the data plane's HTTP client keeps no
cookies; or the inbox state in a shared store, which is the real fix and a
change to the proxy.

## Decision

The proxy runs at most one replica on Azure while SPE inboxes are held in
memory. `23-dataplane.sh wire` (target `proxy`) sets `maxReplicas` to 1 before
it gives the proxy the data plane's settings, and `--check` reports any other
value as a fault.

When the inbox state moves to a shared store, a new ADR lifts this, and the
proxy may scale out again as ADR-061 decided.

Decided by Matthias on 2026-11-24.

## Consequences

- A push on Azure reaches the replica that holds its inbox, every time.
- Under load the proxy has half the capacity ADR-061 planned. The k6 load
  tests that drove the second replica (ADR-061) now meet one; their thresholds
  for the proxy's routes may need to be read with that in mind.
- A restart of the one replica in the middle of a transfer still ends that
  transfer, as on compose.

## Alternatives considered

- **Session affinity.** The data plane's Java HTTP client sends no cookie, so
  affinity by cookie routes nothing; it would need a change in the data plane
  and still breaks on a replica restart.
- **The inbox state in Postgres or Neo4j now.** The right end state, and more
  work than the first Azure run needs. It stays open in #888.
