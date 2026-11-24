---
type: runbook
title: The push data plane on Azure
description: The gated steps, commands and rollback that bring mvhd-dataplane (ADR-095) to rg-mvhd-dev, with Event Hubs as its Kafka broker (ADR-096) and siglet's token renewal.
resource: issue #888, ADR-095, ADR-096, scripts/azure/23-dataplane.sh
tags: [runbook, dataplane, kafka, eventhubs, azure]
status: draft
---

# Runbook: the push data plane on Azure (#888)

[ADR-095](../../ADRs/ADR-095-a-push-data-plane-on-the-dataplane-sdk-beside-siglet.md)
decides the data plane, [ADR-096](../../ADRs/ADR-096-the-kafka-broker-on-azure-is-event-hubs.md)
its broker on Azure. On compose it runs since PR #1204; this runbook brings it
to `rg-mvhd-dev`. One script does every step: `scripts/azure/23-dataplane.sh`.
Its `--check` reports all of them and changes nothing; run it first, between
steps and at the end.

Matthias approves every step that changes Azure. Nothing runs during a live
demo or a load test. The `az` session lasts an hour (conditional access): log
in again before each block, and after activating PIM, since a role activated
after `az login` is not in the token.

## The proxy at one replica (ADR-099)

An SPE inbox is held in the memory of the proxy replica that opened it
([dataplane](../services/dataplane.md)), so a push whose calls reach another
replica answers 401 and the transfer ends `TERMINATED`. Matthias decided on
2026-11-24 ([ADR-099](../../ADRs/ADR-099-the-proxy-runs-one-replica-while-spe-inboxes-are-in-memory.md)):
the proxy runs at most one replica while inboxes are in memory. Step 8 sets it;
`--check` reports two as missing.

## Steps, in order

Each step names its gate. A failed gate stops the run.

**0. Window and login.** 07:00 to 20:00 Berlin (ADR-053), no demo, no load
test. PIM active (`~/.claude/scripts/az-pim-activate.sh --check`), then
`az login`. Gate: `scripts/azure/check-keycloak-health.sh` exits 0.

**1. Merge first.** The off-hours jobs run the `offhours.sh` of `main`; until
this branch is merged they do not know `mvhd-dataplane`, and would leave it
running at night. Gate: `--check` shows "the off-hours jobs ... name
mvhd-dataplane".

**2. Image.** `DOCKER_CONTEXT=orbstack scripts/azure/23-dataplane.sh images`
(push-edc1-images.sh with `RUNTIME=dataplane`, the tag of the source). Gate:
`--check` shows the image present.

**3. Secrets.** `23-dataplane.sh secrets`: the database role's password and the
data plane's signing key (an RSA private JWK with a kid), generated into Key
Vault and never printed. Without a stored key, a restart would change the key
and callbacks sent before it would stop verifying. Gate: both names present.

**4. Database.** The workflow **Data plane database** (`dataplane-database.yml`),
`plan` then `apply`, as the CI identity. It creates the role `dataplane` and the
database `dataplane_v1` it owns, from a one-shot job inside the environment
(the Flexible Server admits Azure addresses only). Gate: the workflow's last
line "OK: dataplane logs in".

**5. Event Hubs.** `23-dataplane.sh eventhubs`: three shared access policies on
`evhns-mvhd-b53a0449` and their connection strings in Key Vault. The app logs
in with all three, one per job (see "The Event Hubs logins" below).
Gate: three policies and three secret names present.

**6. Keycloak.** `23-dataplane.sh keycloak`: the client `dataplane-signaling` in
realm `edcv`, its secret generated into Key Vault. Gate: `--check` gets a token
for the client.

**7. The app.** `DATAPLANE_AZURE_GO=mvhd-dataplane 23-dataplane.sh app`. Internal
ingress on 8090, one replica, floor `workload`, `SASL_SSL` to Event Hubs on
9093, three Key Vault references. Review the definition first with
`23-dataplane.sh render <dir>`. Gate: the revision is Healthy and its log says
`Kafka evhns-mvhd-b53a0449.servicebus.windows.net:9093 (SASL_SSL)`.

**8. Wire.** `DATAPLANE_WIRE_GO="controlplane proxy ui" 23-dataplane.sh wire`:

- control plane: port 8182 (the signaling API) inside the environment, by an
  ingress change that starts no revision; the data plane's callbacks arrive
  there;
- proxy: at most one replica (ADR-099), then `DATAPLANE_JWKS_URL`, `SPE_INBOX_PUBLIC_URL`, and `PATIENT_PSEUDONYM_KEY`
  from the Key Vault secret `patient-pseudonym-key`. That secret is created
  from the UI's own key (its `PATIENT_PSEUDONYM_KEY`, or the `NEXTAUTH_SECRET`
  it falls back to), so no pseudonym a researcher has seen changes;
- UI: `PUSH_DATAPLANE_URL`, its client secret and token endpoint, and the same
  pseudonym key, so onboarding registers the push data plane too.

Gate: `--check` shows every setting present; both revisions Healthy.

**9. Register.** `23-dataplane.sh register`: `mvhd-dp-<context>` for every
participant context, from a one-shot job inside the environment. From now on
`edc-seed-data-assets.yml` registers it as well, because the app exists. Gate:
the job's log lists every context with 2xx.

**10. Token renewal.** `scripts/azure/17-siglet.sh` (siglet resolves `did:web`
over http and advertises `http://mvhd-siglet:8082/token`), then the workflow
`edc-seed-siglet-key-mappings.yml`, `plan` then `apply`. Gate: the apply's
read-back lists every participant with its transit key, kid and mapping.

**11. End to end.** Start SPE-1 (the admin's SPE page, or
`POST /api/admin/spe/power {"action":"start","spe":"SPE-1"}`) and wait until it
is attested; with the floor at `workload` a simulated workspace is refused.
Then `23-dataplane.sh check-streaming`: PharmaCo Research AG negotiates
AlphaKlinik Berlin's one-hour ECG and has it pushed over Event Hubs into SPE-1.
Gate: `Kafka-PUSH: COMPLETED`, 121 records, and "event hubs in use: 0 of 10"
afterwards.

## The Event Hubs logins (ADR-096 decision 3)

The data plane logs in with one policy per job: `mvhd-dataplane-manage` for
the admin client only (it creates and deletes a transfer's topic, which on
Event Hubs needs Manage, and reads a reader's offsets), `mvhd-dataplane-send`
for the writer, `mvhd-dataplane-listen` for the reader
(`DATAPLANE_KAFKA_{ADMIN,SEND,LISTEN}_SASL_*`, `KafkaLogins.java`). Each falls
back to `DATAPLANE_KAFKA_SASL_*`, so one login still works.

What stays open: the admin login reaches every topic in the namespace, and one
process serves every participant context, so there is no separation between
participants at the broker. Acceptable while one operator runs one data plane
for the demo participants; a second organisation's data plane needs a
namespace or policies of its own.

## ADR-096 level 3: the local data plane against Event Hubs

Before a long run, check what Event Hubs does differently from Apache Kafka:
topic creation and deletion, the idempotent producer, committed offsets. Run the
local data plane against the namespace with a compose override kept out of git:

```bash
az keyvault secret show --vault-name kv-mvhd-b53a0449 --name eventhubs-dataplane-manage-connection --query value -o tsv > "$TMPDIR/eh-conn"
```

Then start the data plane with `DATAPLANE_KAFKA_BOOTSTRAP=evhns-mvhd-b53a0449.servicebus.windows.net:9093`,
`DATAPLANE_KAFKA_SECURITY_PROTOCOL=SASL_SSL`, `DATAPLANE_KAFKA_SASL_USERNAME=$ConnectionString`
and the password read from that file into the environment of one
`docker compose up -d --no-deps dataplane`, run `scripts/check-streaming-transfer.sh`
with `KAFKA_CONTAINER=none`, and delete the file. Never print it, never write it
to a tracked file. Gate: both profiles COMPLETED and no event hub left.

## Rollback

Each step is undone on its own, newest first:

- `DATAPLANE_WIRE_GO="proxy ui" 23-dataplane.sh unwire`: the push routes answer
  503 and onboarding registers siglet alone. The proxy stays at one replica;
  `az containerapp update -n mvhd-neo4j-proxy -g rg-mvhd-dev --max-replicas 2`
  brings back ADR-061's second one once no push is in flight. The pseudonym key stays: it is the
  UI's own value. The control plane's port mapping stays; nothing outside the
  environment reaches it.
- The registrations: `DELETE /v5/participants/<ctx>/dataplanes/mvhd-dp-<ctx>`
  per context. A transfer of a push type then fails at selection, a pull is
  untouched.
- The app: `az containerapp delete -n mvhd-dataplane -g rg-mvhd-dev`.
- The database and role, the Keycloak client and the Key Vault secrets can
  stay; they cost nothing.
- The Event Hubs namespace bills about 20 EUR a month until it is deleted
  (ADR-096). Deleting it is Matthias's decision.

## What this does not do

- The provider reads the attestation the proxy relays; it does not verify
  Trustee's token itself (ADR-095, decision 5).
- The DPS TCK has not run against the data plane.
- Inboxes and Kafka flows are held in memory: a restart of the proxy or the
  data plane in the middle of a transfer ends it.
