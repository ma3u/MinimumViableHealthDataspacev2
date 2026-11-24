---
type: service
title: Data plane (push and streaming into an SPE)
description: The hub's own Data Plane Signaling data plane on the Eclipse DataPlane SDK; delivers a transfer into an attested SPE workspace over HTTP or Kafka.
resource: runtimes/edc/dataplane, docker-compose.jad.yml (service dataplane, port 8090; kafka under profile streaming), ADR-095
tags: [dataplane, dps, kafka, spe, transfer]
status: draft
---

[ADR-095](../../ADRs/ADR-095-a-push-data-plane-on-the-dataplane-sdk-beside-siglet.md).
siglet stays the data plane of an HTTP pull; this one is registered beside it
for every participant context as `mvhd-dp-<context>`.

| Transfer type     | Way into the workspace                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `HttpData-PUSH`   | the provider posts one FHIR bundle into the inbox                                 |
| `HttpStream-PUSH` | the provider posts the dataset as NDJSON chunks                                   |
| `HttpFile-PUSH`   | the provider puts one file, at most 16 MiB                                        |
| `Kafka-PUSH`      | the provider writes to the consumer's topic; the consumer reads it into the inbox |
| `Kafka-PULL`      | the provider offers a topic; the consumer reads it into the inbox                 |

- **Inbox:** the [neo4j-proxy](neo4j-proxy.md) opens one per flow
  (`POST /spe/<id>/inbox`), only for a workspace whose attestation passed, and
  writes every step to the `spe` audit chain. Read back with
  `GET /spe/<id>/inbox/<flow>`; the flow id is the consumer's transfer id.
- **Floor:** `DATAPLANE_ATTESTATION_FLOOR` (`simulated` on compose, `workload`
  by default). A push below it ends the transfer `TERMINATED` with the reason.
- **Identity:** what `/dataspace/push-source` hands out is pseudonymised in
  the proxy (`PATIENT_PSEUDONYM_KEY`, the UI's key), and the inbox refuses a
  Patient that still carries identity.
- **Signaling auth:** the control plane calls with a token of the Keycloak
  client `dataplane-signaling`; callbacks carry an RS256 token the data plane
  signs (JWKS at `/.well-known/jwks.json`).
- **Seed:** `scripts/seed-dataplane.sh` on a running stack (database
  `dataplane_v1`, the client, the container, the registrations);
  `jad/seed-data-assets.sh` and the hub's onboarding register it for
  participants (`scripts/lib/push-dataplane.sh`).
- **Kafka logins:** one per job (`KafkaLogins.java`): the admin client
  (topics, a reader's offsets), the writer and the reader, from
  `DATAPLANE_KAFKA_{ADMIN,SEND,LISTEN}_SASL_*`, each falling back to
  `DATAPLANE_KAFKA_SASL_*`. On Azure they are the three Event Hubs policies
  (ADR-096 decision 3).
- **DPS TCK:** `DpsTckTest` runs dps-tck 1.3.3 against the data plane's own
  HTTP layer in every build: 23 tests, push and pull, both sides (the HTTP
  profile's tests are left out).
- **Checks:** `scripts/run-ehds-dataspace-checks.sh` PUSH-4b.1 to 4b.5;
  `scripts/check-streaming-transfer.sh` streams a synthetic long-term ECG
  (`ecg-holter-hour`, or `ASSET=ecg-holter-stream` for the 24 hours) through a
  real negotiation.
- **Not on Azure yet.** Limits: the Kafka broker on compose is plain text;
  inboxes and Kafka flows are held in memory by one proxy and one data plane
  replica; `docs/gotchas.md` 2026-11-19 and 2026-11-20 have what cost time.
