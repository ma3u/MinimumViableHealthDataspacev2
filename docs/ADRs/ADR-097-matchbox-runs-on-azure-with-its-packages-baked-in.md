# ADR-097: Matchbox runs on Azure as an internal Container App, with its IG packages baked into the image

Date: 2026-11-20

Merged as ADR-095 in #1180 and renumbered the same day: ADR-095 is the push data plane on the Dataplane SDK, accepted under that number, and ADR-096 is kept for its Kafka broker decision.

**Status:** Proposed
**Relates to:** [ADR-029](ADR-029-dependency-version-pinning.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-058](ADR-058-azure-triggers-the-off-hours-schedule.md)
**Tracks:** [discussion #1169](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/1169), [#1174](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1174), [#1173](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1173)

## Context

Discussion #1169 settled how the hub speaks FHIR: no FHIR server of its own,
FHIR R4, and validation delegated to a validator, never written by hand.

- [PR #1176](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/1176)
  (#1174) added `POST /fhir/$validate` to the neo4j-proxy
  (`services/neo4j-proxy/src/fhir-validate.ts`). It forwards to Matchbox at
  `MATCHBOX_URL` (`src/config.ts`) and answers 503 without one. Matchbox ran
  only locally, `docker-compose.matchbox.yml`, v4.1.21 pinned by tag and
  digest, configured by an `application.yaml` that `scripts/eehrxf/build.py`
  generates from `scripts/eehrxf/profiles.json`, so it loads the IG packages
  the CI validator uses (#1144).
- [PR #1178](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/1178)
  (#1173) imports FHIR documents into a patient's record and validates each
  first through that `$validate`. On ehds.mabu.red it answers 503, because no
  validator runs on Azure, so the import cannot work there.

The maintainer decided Matchbox runs locally and on Azure. What that costs,
measured on 2026-11-20 with the pinned image:

- **First start: about five minutes** (308 s to a healthy actuator in the
  image build), almost all of it fetching FHIR R4 core, the six HL7 Europe IGs
  and 31 packages they depend on from the FHIR package servers and installing
  them into its H2 database (`/database`, 718 MB). On Azure every app stops
  each evening and starts each morning (ADR-053); a fresh container would pay
  those five minutes, and depend on packages.fhir.org, every working day.
- **Memory: about 3.4 GiB** once an engine is built for each of the six IGs
  (cgroup peak 3.54 GiB, steady 3.43 GiB). The image's JVM takes 70 % of the
  container's memory as its heap ceiling.

## Decision

1. **The packages are baked into the image.** `services/matchbox/Dockerfile`
   builds on the same pinned Matchbox image and runs `bake.sh` once in the
   build: it starts Matchbox with `application.yaml`, waits until it is up,
   checks that every IG the file names is installed, and stops it with
   SIGTERM so H2 closes its file. The image carries the populated `/database`;
   a container from it fetches nothing. Measured with `docker run --network
none`, 2 CPUs and 4 GB: healthy after 35 s, and `$validate` against
   `Observation-resultslab-eu-lab` (HL7 Europe Laboratory 2.1.0) answered 200
   with its OperationOutcome.
2. **One list.** `build.py` writes `services/matchbox/application.yaml` (it
   moved there from `scripts/eehrxf/matchbox/`), the Docker build context.
   `bake.sh` reads the IGs from that file and keeps none of its own;
   `build.py --check` fails on a stale file, and
   `scripts/eehrxf/test_eehrxf.py` fails when the IGs `bake.sh --list` reads
   differ from FHIR R4 core plus `profiles.json`. The local overlay builds
   the same image, so local and Azure validate against the same packages.
3. **An internal Container App, `mvhd-matchbox`.** Internal ingress only,
   target port 8080, one replica, 2 vCPU and 4 GiB (the Consumption profile
   pairs 4 GiB with 2 vCPU), a startup probe on
   `/matchboxv3/actuator/health` and readiness and liveness probes on its
   Spring groups. The proxy's `MATCHBOX_URL` is
   `http://mvhd-matchbox/matchboxv3/fhir`. HTTP inside the environment
   (`allowInsecure`): the proxy POSTs, and a redirect to HTTPS would turn a
   POST into a GET. No secret, so no Key Vault reference (ADR-036).
4. **Built when it changes, deployed like the others.** `deploy-azure.yml`
   tags the image with the git tree hash of `services/matchbox` and builds it
   only when that tag is not in ACR, then moves an existing app to it. No
   `:latest` (ADR-029, gotcha #6). `scripts/azure/22-matchbox.sh`, run by the
   workflow `matchbox.yml` as the CI identity, creates or updates the app and
   sets `MATCHBOX_URL` on the proxy once the app is Healthy.
5. **Stopped off hours with everything else (ADR-053).**
   `scripts/azure/offhours.sh` starts it first among the core apps, before
   the proxy, and stops it after the proxy; while it does not exist it is
   left out.

## Consequences

- The import of #1173 works on ehds.mabu.red in office hours, and
  `$validate` and `/fhir/metadata` say so; off hours it is 503 like every
  other backend.
- **Cost.** 2 vCPU and 4 GiB for the hours the stack runs (ADR-053: about
  13 hours on each working day). At Consumption list prices for West Europe
  that is about $0.07 an hour idle and $0.22 an hour active, roughly $20 to
  $60 a month; the Azure invoice is the measure. The image adds about 0.8 GB
  per tag to the registry; old tags are deleted by hand.
- **Memory headroom is thin.** 3.43 GiB steady of 4 GiB with all six engines
  built. A seventh IG, or the German national IGs, needs a measurement and
  likely 2.5 vCPU and 5 GiB (`MATCHBOX_CPU`, `MATCHBOX_MEMORY` in
  `scripts/azure/env.sh`).
- **Start time** moves from the morning to the build: about five minutes in
  CI on the merge that changes `services/matchbox`, none on a merge that does
  not. The start on Azure is the image pull (about 1.5 GB) plus well under a
  minute.
- **A package update is an image rebuild.** A new IG or version in
  `profiles.json` is `build.py`, a new tree hash, a new image on the next
  deploy. The packages are frozen at build time: the same tag validates the
  same way, until it is rebuilt.
- **The build needs the FHIR package servers.** If they are down, the build
  fails, loudly; the running app is unaffected.

## Alternatives considered

- **The upstream image on Azure, fetching at each start.** Five minutes and a
  dependency on packages.fhir.org every morning.
- **A persistent `/database` on an Azure Files share.** H2 on SMB is the
  shape that broke Postgres (`docs/gotchas.md`, 2026-09-30), and it would
  keep a cache that drifts from `profiles.json` without anyone seeing it.
- **Local `.tgz` files in `application.yaml` (`url: file:...`).** Matchbox
  still installs each package into its database at every start, and every
  transitive dependency would have to be listed and kept by hand.
- **Matchbox on Postgres (the Flexible Server).** A database for a read-only
  cache, and the validator would wait for Postgres each morning.
- **The HL7 validator CLI or a hosted validator.** The CLI is no server for
  `$validate`; a hosted one sends patient documents out of the hub.
