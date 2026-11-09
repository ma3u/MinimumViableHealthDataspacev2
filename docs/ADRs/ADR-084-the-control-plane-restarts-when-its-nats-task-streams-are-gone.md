# ADR-084: The control plane's liveness covers its NATS task streams, and Container Apps restarts it when they are gone

**Status:** Proposed
**Date:** 2026-11-09
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-058](ADR-058-azure-triggers-the-off-hours-schedule.md), [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md)
**Tracks:** [PR #1013](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/1013), [PR #1018](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/1018), [`docs/gotchas.md`](../gotchas.md) (2026-11-09)

## Context

### The failure

EDC 1.0.0-RC5's control plane runs negotiations and transfers as tasks on
JetStream. It creates `cn-stream` (`negotiations.>`) and `tp-stream`
(`transfers.>`) at startup only, and always in memory (`StorageType.Memory` in
`NatsSubscriber.prepare`, no setting). A NATS restart under a running control
plane deletes both. From then on every negotiation start answers 500, the
control plane logs `503 No Responders Available For Request` from
`NatsTaskPublisher.created`, and this lasts until the control plane restarts.
Locally, PR #1018 creates both as file streams on the `nats_data` volume before
the control plane starts, so they survive a NATS restart.

### Azure is exposed the same way (read on 2026-11-09)

- The 1.0 launcher carries the NATS task feature
  ([`runtimes/edc/controlplane/build.gradle.kts:7`](../../runtimes/edc/controlplane/build.gradle.kts),
  `:11`), and `mvhd-controlplane` has run it since 2026-11-06 (revisions 191
  to 196; its log shows `NatsTransferProcessTaskSubscriber`). The comment at
  [`scripts/azure/migrate-edc-to-v1.sh:30`](../../scripts/azure/migrate-edc-to-v1.sh),
  that the launchers carry no NATS extension, is wrong.
- JetStream on `mvhd-nats` (its `/jsz`, read through `az containerapp exec`):
  `cn-stream` and `tp-stream` are memory streams, created at 05:29:05 UTC by
  the control plane of the morning start, with their durable consumers
  `cn-subscriber` and `tp-subscriber`. Limits retention, no byte or age limit.
- `mvhd-nats` has no volume and no probes: 0.25 vCPU, 0.5 GiB, `-js -m 8222`
  ([`scripts/azure/04-edc-services.sh:36`](../../scripts/azure/04-edc-services.sh)
  to `:48` and `:120` to `:133`). Its store directory, `/tmp/nats/jetstream`,
  is container storage, so even the CFM file streams go with the replica.
- `mvhd-controlplane` has no probes either. Its `/api/check/liveness` answers
  four components, all healthy: Vault, the Observability API and the two NATS
  task subscribers. The subscribers' check (`NatsSubscriber.isHealthy`) asks
  only whether the subscriber loop runs and the connection is not `CLOSED`.
  The NATS client reconnects after a restart, so the check stays green with
  both streams gone. `/api/check/health`, which the compose healthcheck calls
  ([`docker-compose.jad.yml:426`](../../docker-compose.jad.yml)), returns the
  startup status, not liveness.

### How often mvhd-nats restarts

The environment's Log Analytics workspace keeps 30 days of system logs, here
2026-10-10 to 2026-11-09. Azure Monitor gave the restart and memory figures.

| What                                                 | Count    | Detail                                                                                                               |
| ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| NATS container starts                                | 22       | 19 morning starts (05:24 to 05:40 UTC), 3 manual stack starts (2026-10-15 20:26, 2026-10-28 20:40, 2026-11-01 14:47) |
| of those, followed by a control plane start          | 22 of 22 | 3 to 4 minutes later each time                                                                                       |
| NATS starts under a running control plane            | 0        |                                                                                                                      |
| Container restarts inside a replica (`RestartCount`) | 0        |                                                                                                                      |
| Replica moves by the platform                        | 0        | every `AssigningReplica` event belongs to a stack start                                                              |
| Peak memory (`MemoryPercentage`)                     | 5 %      | of 0.5 GiB                                                                                                           |

Before 2026-10-03 every stop and start made a new NATS revision
(`mvhd-nats--0000140` to `--0000178` in the last 40), and revisions 145, 151,
163, 169, 170 and 175 to 179 came off the schedule. Their logs are gone, so
what made them is not known. Since 2026-10-03 the stack runs
`mvhd-nats--0000179`, and a stop and start replaces its replica.

### The start order already protects the scheduled path

`offhours.sh start` starts NATS with the core apps
([`scripts/azure/offhours.sh:77`](../../scripts/azure/offhours.sh), `:311`),
waits 75 s and for Keycloak (`:324`), and only then starts the EDC apps
(`:337`). `offhours.sh stop` stops `mvhd-controlplane` before `mvhd-nats`
(`BACKEND_APPS`, `:68` to `:75`). The table shows it working on every start.

### What the order does not cover

1. **A change to `mvhd-nats` alone while the stack runs.** Azure runs NATS
   2.14.3 ([`scripts/azure/env.sh:120`](../../scripts/azure/env.sh)), compose
   2.15.1 ([`docker-compose.jad.yml:218`](../../docker-compose.jad.yml)), and
   Dependabot's [PR #989](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/989)
   moves compose to 2.15.2. The next alignment makes a new NATS revision under
   a running control plane. So does a rerun of `04-edc-services.sh`, or the
   min-replica fix in `05-cfm-configure.sh:65` to `:70` and
   `05-cfm-agents.sh:73` to `:78`.
2. **The platform moving or restarting the replica while the stack runs.** Not
   seen in 30 days.
3. **NATS killed for memory.** JetStream sizes its memory store from the node
   (it reports a `max_memory` of 1.9 GB) while the container has 0.5 GiB, and
   both task streams keep every message. At a 5 % peak this is far off, but
   nothing caps it.

Each would be silent: every negotiation answers 500, every health check is
green.

### Persistent storage on Azure

- NFS Azure Files needs an environment with a custom VNet. `mvhd-env` has none.
- SMB Azure Files carries Neo4j here and failed for Postgres (`initdb` chmods
  its data directory; gotchas of 2026-09-30 and 2026-10-02). NATS has not been
  tried on it, and the NATS documentation says nothing about network file
  systems either way.
- NATS takes no lock on its store directory: nats-server
  [PR #4407](https://github.com/nats-io/nats-server/pull/4407), which would
  have added one, was closed without merging. During a revision change the new
  replica starts before the old one stops, and both would mount the same
  share: two servers writing one store, the shape of the Neo4j store lock
  gotcha of 2026-10-04.
- A new share is a storage change the maintainer's account cannot make
  (Container Apps Contributor); it goes through the CI identity.
- What persistence would buy over a restart is the tasks in flight at the
  moment NATS goes. In the demo, a negotiation that stops halfway is started
  again.

## Decision

1. **The control plane's liveness covers its task streams.** A launcher
   extension, `NatsTaskStreamsLivenessExtension` in `runtimes/edc/controlplane`
   next to `EhdsPolicyVocabularyExtension`, registers one `LivenessProvider`.
   It reads the settings the subscribers read (`edc.nats.cn.subscriber.url`,
   `edc.nats.cn.subscriber.stream` with the default `cn-stream`, and the same
   for `tp`) and asks NATS whether both streams exist. A missing stream is
   unhealthy, and the failure names it. NATS unreachable stays healthy with a
   note: a restart cannot bring NATS back, and the upstream check already fails
   on a closed connection. The answer is cached for 10 s.
2. **Container Apps restarts the control plane on it.** `mvhd-controlplane`
   gets a startup probe and a liveness probe, HTTP GET
   `:8080/api/check/liveness`, every 30 s, failing after 3, set through
   `--yaml` (gotcha of 2026-11-05). A missing stream restarts the control plane
   within about two minutes, and its startup creates both streams and both
   consumers again (measured locally: back two seconds after a restart).
3. **Compose checks liveness too.** The control plane's compose healthcheck
   moves from `/api/check/health` to `/api/check/liveness`, so a missing stream
   shows as unhealthy. Compose restarts nothing on unhealthy; locally the file
   streams of PR #1018 stay what keeps the streams.
4. **A deliberate NATS change restarts the control plane after it.** Every
   script that can make a new `mvhd-nats` revision or replica while the stack
   runs restarts `mvhd-controlplane` once NATS answers, rather than waiting for
   the probe.
5. **No volume for NATS on Azure.** The task streams stay memory streams
   there; the restart, not the storage, brings them back.
6. **Upstream.** We propose to Eclipse EDC that `NatsSubscriber.isHealthy` ask
   `streamExists`, or that the storage type become a setting. The extension
   goes once the launcher's EDC version covers it.

The same change corrects the comment in `migrate-edc-to-v1.sh`.

## Consequences

- Every cause is covered (a deliberate change, the platform's, a crash) with no
  storage and no copy of EDC's stream configuration on Azure.
- After a NATS restart, negotiations answer 500 for about two minutes, not
  until someone notices.
- Tasks in flight when NATS goes are lost, as they are today. The negotiation
  or transfer stays in the state it reached, and the demo starts a new one.
- The liveness probe acts on every liveness component, Vault's included. A
  sealed Vault restarts the control plane every two minutes or so until it is
  unsealed. The start order brings Vault up first, so this happens only when
  Vault fails on its own, and then the control plane cannot sign anyway.
- One Java class to maintain in the launcher, and a control plane image and
  revision to roll out, with ADR-078's rollback. If an EDC upgrade renamed the
  streams without the settings, the check would fail and the control plane
  would restart in a loop: loud at the next deploy, not silent.
- A memory cap for JetStream (point 3 above) is not decided here. At a 5 %
  peak it can wait.

## Alternatives considered

- **An Azure Files (SMB) volume with file streams, the twin of PR #1018:**
  unproven for NATS on SMB, no store lock while two replicas share it during a
  revision change, and a storage change the maintainer cannot make, all to
  keep the tasks in flight.
- **Azure Files (NFS):** needs a VNet the environment does not have, and
  recreating `mvhd-env` is out of proportion.
- **An EmptyDir volume and a nats-box sidecar in `mvhd-nats` that recreates the
  streams and consumers:** copies EDC's stream and consumer configuration into
  our scripts, and whether a running subscriber resumes on a recreated consumer
  is not measured.
- **A watchdog in the 15-minute job (`mvhd-spe-idle-stop`, ADR-058):** up to 15
  minutes of 500s, Azure only, and the job would need a NATS client and the
  right to restart the control plane.
- **Script guards and a runbook alone (decision 4 without 1 to 3):** covers the
  deliberate change and leaves the platform's and a crash silent.
- **Nothing:** 30 days without an independent NATS restart, but the failure is
  silent and the next NATS image change causes it.
