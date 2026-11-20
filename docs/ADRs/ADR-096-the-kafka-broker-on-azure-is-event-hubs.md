# ADR-096: The Kafka broker on Azure is Event Hubs; Compose keeps Apache Kafka

Date: 2026-11-20

**Status:** Accepted (decided by the maintainer, 2026-11-20)
**Relates to:** ADR-095 (on the data plane branch, not yet on main) (the push data plane that writes and reads the stream), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md) (Postgres moved off Azure Files for the same reason), [ADR-053](ADR-053-everything-stops-off-hours.md)
**Tracks:** [#888](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/888)

## Context

ADR-095 adds `Kafka-PUSH` and `Kafka-PULL`. On Compose the broker is an Apache
Kafka container (profile `streaming`), plain text and without login. On Azure
there is no broker yet, and the one we run there must keep its log across a
restart: a stream of a 24-hour ECG recording outlives any single replica.

The first choice was Kafka as one more Container App. It failed on storage:

- The Container Apps environment `mvhd-env` is not VNet-injected (Consumption
  profile only, checked 2026-11-20). Azure Files over NFS needs a VNet and a
  Premium FileStorage account; the only account, `stmvhddev3e2079`, is
  Standard_LRS.
- Container Apps mounts no managed disks. What is left is Azure Files over SMB.
- Kafka on SMB is not supported upstream: it memory-maps its index files and
  locks its log directory. Postgres already crash-looped on the same kind of
  share (`docs/gotchas.md`, 2026-09-30 and 2026-10-02), which is why ADR-041
  moved it to Flexible Server.

The options were an SMB share with a restart test, a small VM with a managed
disk, a new VNet-injected environment with NFS (every app moves), or a managed
broker.

## Decision

1. **On Azure the broker is Azure Event Hubs, Standard tier**, through its
   Kafka endpoint. Namespace `evhns-mvhd-b53a0449` in `rg-mvhd-dev`, West
   Europe, one throughput unit, TLS 1.2 minimum. Created 2026-11-20. The log is
   Event Hubs' own storage; there is no volume to run.
2. **The data plane speaks Kafka to both brokers.** Only its client settings
   differ: on Azure `SASL_SSL` with mechanism `PLAIN`, user `$ConnectionString`,
   on port 9093. The connection strings live in Key Vault `kv-mvhd-b53a0449`
   and reach the data plane as `keyvaultref` secrets (ADR-036). No secret is in
   the repository or in a data address.
3. **Access is split by role.** One shared access policy with `Send` for the
   providers' data planes, one with `Listen` for the consumers'. A per-topic
   policy replaces Kafka ACLs where a topic lives long enough to carry one.
4. **Compose keeps Apache Kafka** for development and CI. How the stream is
   tested locally is below.

## Testing the stream locally

The same Kafka client code runs against both brokers, so most of the testing
stays local. There are three levels:

1. **Every day: the Compose broker.** Start the stack with the `streaming`
   profile and run the Kafka-PUSH and Kafka-PULL seeds against the test ECG,
   as on 2026-11-20 (121 records each, same SHA-256). CI runs the same thing.
   No Azure account is needed.
2. **The login path: a Compose broker with SASL.** A second listener on the
   local broker with `SASL_PLAINTEXT` and `PLAIN`, so that the data plane's
   SASL settings are exercised before they meet Event Hubs. Without it the
   first time the auth code runs is on Azure.
3. **Parity before a deploy: the local data plane against Event Hubs.** Point
   the local data plane at `evhns-mvhd-b53a0449` with a policy for a test
   event hub, and run one short stream. This catches what Event Hubs does
   differently from Apache Kafka (below). It needs `az login` and a key from
   Key Vault, so it is a manual check, not CI.

## Consequences

- No broker to patch, back up or move off SMB. Messages are kept for the event
  hub's retention, 1 to 7 days on Standard. The broker buffers a transfer; once
  the consumer has stored a batch in the SPE and committed its offset, the
  data is in the workspace.
- **Event Hubs is not Apache Kafka.** The data plane must handle these, each
  checked in the first Azure run (level 3 above):
  - Standard allows **at most 10 event hubs per namespace**. ADR-095 opens one
    topic per transfer, so the data plane must delete a transfer's topic when
    the transfer ends, or several transfers fail to start.
  - Topic creation through the Kafka admin API, the idempotent producer, and
    committed consumer-group offsets must each be confirmed on Event Hubs
    before a long run.
  - The maximum message size is 1 MB. One FHIR Observation per 30-second ECG
    strip is well below it.
- **Cost.** About 20 EUR a month for one throughput unit, billed while the
  namespace exists. Unlike the Container Apps, the off-hours schedule
  (ADR-053) cannot stop it; deleting the namespace is the only way to stop the
  cost.
- **The maintainer's earlier choice (Kafka on Container Apps, 2026-11-20) is
  replaced** by this decision, on the same day, once the storage limit was
  known.

## Alternatives considered

- **Kafka on Container Apps with an SMB share.** Cheapest and closest to
  Compose, but unsupported storage for Kafka; a restart test that passes once
  does not show the log survives the next one.
- **Kafka on a small VM with a managed disk.** Real POSIX storage, about
  30 EUR a month, but one more machine to patch and to fit into the off-hours
  schedule.
- **A new VNet-injected environment with Premium NFS.** The correct storage for
  self-run Kafka, but every app moves to a new environment; a project of its
  own.
