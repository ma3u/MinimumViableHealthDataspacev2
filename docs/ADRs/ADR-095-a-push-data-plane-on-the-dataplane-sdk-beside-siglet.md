# ADR-095: A data plane on the DataPlane SDK, beside siglet, that delivers into an attested SPE over HTTP and Kafka

Date: 2026-11-19

**Status:** Proposed
**Revisits:** [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md) decision 5 (siglet is the only data plane) and [ADR-076](ADR-076-edc-1-runtimes-are-built-here.md) decision 2 (own Java data planes), neither of which it edits
**Relates to:** [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md), [ADR-072](ADR-072-spe-workspaces-start-on-demand.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md)
**Tracks:** [#888](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/888)

## Context

Since the move to EDC 1.0 the hub has one data plane, siglet 0.1.6, and one
transfer type, `HttpData-PULL`
([`jad/siglet-edc1.toml`](../../jad/siglet-edc1.toml)). siglet is a token
service: it answers the control plane's Data Plane Signaling (DPS), issues an
access token, and moves no data. The data is read from the Neo4j proxy at
`/dataspace/data`
([`routes/dataspace.ts`](../../services/neo4j-proxy/src/routes/dataspace.ts)).

Three things do not fit that shape.

1. **A transfer into a secure processing environment passes through the hub's
   web server.** `POST /api/transfers/{id}/import` pulls the transfer's data
   in the UI's server and posts it to the proxy, which writes it into the
   workspace
   ([`spe-import.ts`](../../services/neo4j-proxy/src/spe-import.ts), #876).
   EHDS Art. 73 has the data end in the SPE; here it is first held by a
   component that is neither the holder's nor the SPE's. The import also does
   not look at the workspace's attestation: it writes into whatever answers.
2. **Pull is the only direction.** A large extract, a file (the sealed extract
   of ADR-068 decision 3) or a feed has no transfer type. ADR-076 planned Java
   data planes on the Eclipse DataPlane SDK for this; ADR-078 put siglet in
   their place and left the rest open.
3. **A pull stops after an hour.** siglet's consumer side renews a token with a
   proof signed by the participant's key, found through a signing-key mapping
   that nothing in the hub creates (#881 finding 23, #888).

What exists upstream, read on 2026-11-19:

- [`dataplane-sdk-java` v1.2.1](https://github.com/eclipse-dataplane-core/dataplane-sdk-java/releases/tag/v1.2.1),
  on Maven Central. EDC 1.0.0-RC8 pins this version for its own tests
  ([`libs.versions.toml` at `v1.0.0-RC8`](https://github.com/eclipse-edc/Connector/blob/v1.0.0-RC8/gradle/libs.versions.toml#L11)).
  It carries the DPS messages and state machine, Jersey controllers, Postgres
  stores, and hooks for push (`OnPrepare` on the consumer, `OnStart` on the
  provider). Its README says what it leaves out: authentication, authorization
  and hardening.
- The control plane already has the other half: the signaling callback API on
  port 8182 (`/api/signaling/transfers/{id}/dataflow/{prepared|started|completed|errored}`),
  and an `oauth2_client_credentials` authorization that sends a token to a data
  plane and checks the `sub` of a callback against the data plane's id
  ([`Oauth2CredentialsSignalingAuthorization.java` at `v1.0.0-RC8`](https://github.com/eclipse-edc/Connector/blob/v1.0.0-RC8/data-protocols/data-plane-signaling/data-plane-signaling-oauth2/src/main/java/org/eclipse/edc/signaling/oauth2/logic/Oauth2CredentialsSignalingAuthorization.java)).
  A transfer request can carry `dataplaneMetadata`, which reaches the data
  plane's `prepare`
  ([`DataPlaneSignalingFlowController.java`](https://github.com/eclipse-edc/Connector/blob/v1.0.0-RC8/data-protocols/data-plane-signaling/data-plane-signaling-core/src/main/java/org/eclipse/edc/signaling/logic/DataPlaneSignalingFlowController.java)).
- siglet's management API (port 8083) takes a signing-key mapping per
  participant context: a Vault transit key name and a `kid`
  ([`docs/siglet.md`, "Refresh Flow Detail"](https://github.com/eclipse-dataplane-core/dsdk-facet-rs/blob/siglet-v0.1.6/docs/siglet.md)).

## Decision

1. **A second data plane, `mvhd-dataplane`, built here on `dataplane-sdk-java`
   1.2.1.** A fourth module of [`runtimes/edc`](../../runtimes/edc), same
   Dockerfile, same version catalog. It uses the SDK's `Dataplane`, its DPS
   messages and its Postgres stores (database `dataplane_v1`), and brings its
   own HTTP layer, because the SDK's controllers know one control plane and no
   participant context.

2. **siglet stays for pull.** Each participant context registers two data
   planes: `siglet-<context>` with `HttpData-PULL`, as today, and
   `mvhd-dp-<context>` with the five types of decision 3. The control plane selects by
   transfer type. Nothing about a pull changes.

3. **Five transfer types, all ending in an SPE inbox.**

   | Type              | What moves                                                  | How                                                                                     |
   | ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
   | `HttpData-PUSH`   | one FHIR bundle, the answer of the dataset's route          | one `POST`, body and SHA-256                                                            |
   | `HttpStream-PUSH` | the dataset as NDJSON, one resource per line                | numbered chunks, each written as it arrives, then a closing message with count and hash |
   | `HttpFile-PUSH`   | the answer as one opaque file, such as an encrypted extract | one `PUT` of bytes with its media type and SHA-256, at most 16 MiB                      |
   | `Kafka-PUSH`      | the dataset as a stream of records                          | the provider writes to a topic the consumer named; the consumer reads it into the inbox |
   | `Kafka-PULL`      | the same                                                    | the provider offers a topic; the consumer reads it into the inbox                       |

   A dataset is read page by page (a FHIR bundle's `next` link), so a long
   recording is never whole in memory. The test data is a synthetic long-term
   ECG, a Holter recording of 24 hours at 250 Hz with two leads, one FHIR
   Observation with sampled data per 30 s (`ecg-holter-stream`, and
   `ecg-holter-hour` for the routine check).

   On a Kafka transfer the inbox token stays with the consumer's data plane:
   the provider gets a topic to write to, never a way into the workspace. The
   stream ends with a record that carries the count and the SHA-256 of
   everything sent; the consumer's side closes the inbox only when both agree
   with what it read. The provider reports the transfer completed when the
   consumer's side has read the topic to its end.

   The limits are the workspace's: 5,000 records per dataset
   (`SPE_INBOX_STREAM_MAX_RECORDS` for a stream).

4. **The consumer's side opens the inbox; the provider's side delivers.** DPS
   has it this way round: on a push the consumer's data plane answers
   `prepare` with the address to push to.

   - `prepare` (consumer): the data plane asks the Neo4j proxy to open an inbox
     for this flow in the workspace named by `dataplaneMetadata.speId`
     (default `SPE-1`). The answer is the inbox address, a one-time token bound
     to the flow, and the workspace's attestation record.
   - `start` (provider): the data plane reads the address, checks the
     attestation record against its own policy, waits until the consumer's
     side has reported the transfer started, reads the dataset from the proxy,
     and pushes it. Then it reports `completed`, or `errored` with the reason.

   The wait is not in DPS. The consumer's control plane refuses a completion
   until it has processed the start message, with a 400 the provider does not
   retry, and a small dataset is delivered faster than that. So the consumer's
   data plane tells the inbox when its control plane calls `started`, and the
   provider's reads that before it delivers (`docs/gotchas.md`, 2026-11-19).

5. **No push into a workspace that is not attested.** The proxy opens an inbox
   only for a workspace whose latest attestation passed, and says in the
   address which kind it was: `workload`, `node`, or `simulated` (ADR-068
   decision 5). The provider's data plane refuses anything below its floor,
   `DATAPLANE_ATTESTATION_FLOOR`: `simulated` on compose and in CI, `workload`
   on Azure. A refusal ends the transfer `TERMINATED` with the reason, and is
   written to the audit chain.

   Honest limit: the provider reads the attestation record the proxy relays.
   It does not verify Trustee's token itself. That needs the provider to hold
   Trustee's signing key, and is the next step, not this one.

6. **Every step is on the audit chain.** The proxy appends to the `spe` chain
   (ADR-045): inbox opened (flow, agreement, dataset, both parties, the
   attestation's evidence digest and policy id), each receipt (records or
   bytes, SHA-256), completion, and any refusal. The data plane sends the hash
   it computed; the proxy compares it with what arrived and refuses a
   difference.

7. **Signaling is authenticated both ways.** The data plane is registered
   with an `oauth2_client_credentials` profile. The control plane calls it
   with a Keycloak token of the client `dataplane-signaling`, which the data
   plane verifies. The data plane calls back with a short-lived token it signs
   itself (RS256: the control plane's image cannot verify ES256, see
   `docs/gotchas.md`, 2026-11-19), `sub` the data plane's id for that context, verified by the control
   plane against the data plane's JWKS. siglet's registration stays as it is.

8. **The dataset is read with a token, as on a pull, and leaves pseudonymised.**
   The provider's data plane asks the proxy for the dataset with a token it
   signs: `datasetId`, `sub` the consumer, `aud` the provider. The proxy's
   token check gains this second issuer; the token still decides what is
   served. A pull is pseudonymised by the hub's UI for the roles that do not
   see identity (#475); a push never passes the UI, so the proxy pseudonymises
   what it hands out for a push, with the same rule and the same key
   (`PATIENT_PSEUDONYM_KEY`), and the inbox refuses a Patient that still
   carries a name, an address, an identifier or a full birth date.

9. **Token renewal: a transit key and a mapping per participant.** Seed and
   provisioning create a Vault transit key `siglet-<context>`, publish its
   public key in the participant's DID document, and write the mapping to
   siglet. A check pulls after the token has expired, with the lifetime
   shortened in the test's configuration.

10. **The hub's import keeps working and is no longer the only way.**
    `POST /api/transfers/{id}/import` stays for pull transfers. A push
    transfer needs no import: it arrives in the workspace by itself.

## Consequences

- A transfer can end in the SPE without the hub's web server holding the data,
  and never in a workspace that failed attestation.
- One more Java process (512 MB) and one more database. On Azure: one
  Container App, one database on the Flexible Server, one Keycloak client.
  Nothing on Azure changes with this ADR; that is a step of its own, on
  Matthias's go.
- The data plane's HTTP layer, its two token checks and its attestation floor
  are ours to keep correct. The DPS TCK runs against it in CI.
- A participant registers two data planes. A seed or a provisioning that
  registers one leaves that participant without push, and says so in the
  dataspace checks.
- A stream that stops in the middle leaves what arrived in the workspace,
  marked incomplete, and on the audit chain (`push-stream-started` without a
  `push-received`). A suspended flow resumes at the next page only while the
  data plane keeps running; there is no replay across a restart.
- The compose stack's Kafka broker (profile `streaming`) is plain text and
  unauthenticated. A broker that two organisations share needs TLS, SASL and
  an ACL per topic and group; the data address has room for them, and nothing
  sets them yet. On `Kafka-PULL` the provider sees no attestation, so the
  floor of decision 5 holds for the push types only.
- `HttpFile-PUSH` stores the file in the workspace's graph. That bounds it to
  16 MiB; a larger sealed extract needs object storage inside the SPE.

## Alternatives considered

- **siglet with a push transfer type.** siglet issues tokens and moves no data;
  a push needs a component that reads and writes.
- **Replace siglet.** It works for pull, the CFM agents provision it, and
  writing our own token service would be the larger risk.
- **Push from the Neo4j proxy without a data plane.** The control plane would
  not know the transfer's state; completion and failure would not be DSP
  messages.
- **A Rust data plane on `dataplane-sdk-rust`.** The repository builds Java
  runtimes already (ADR-076); a second toolchain for one service did not pay.
- **Verify Trustee's token in the provider's data plane now.** Right, and
  larger: key distribution between the access body and every holder. Named in
  decision 5 as the next step.

## Open for the maintainer

1. The floor on Azure: `workload` (ACI confidential containers only), or
   `node` as well?
2. Should the hub's import (decision 10) be removed once push is on Azure, so
   that the SPE can only be reached through an attested push?
