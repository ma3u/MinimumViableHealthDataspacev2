# ADR-072: SPE workspaces are stopped by default and start on demand

Date: 2026-11-02

**Status:** Accepted (2026-11-02)
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-058](ADR-058-azure-triggers-the-off-hours-schedule.md), [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)

## Status

Accepted (2026-11-02). Amends decision 8 of
[ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md) (the
morning start); extends [ADR-053](ADR-053-everything-stops-off-hours.md) and
[ADR-058](ADR-058-azure-triggers-the-off-hours-schedule.md).

## Context

The two SPE workspaces, `mvhd-spe-1` (AlphaKlinik Berlin) and `mvhd-spe-2`
(Limburg Medical Centre), are ACI confidential container groups (ADR-069).
Each start attests to the access body's Trustee (`spe-unlock`), gets the
extract key and reloads the sealed extract into a memory-backed Neo4j, so a
stop loses nothing that a start does not bring back. Measured on 2026-11-02,
from the start command: attested and key released after about 1 minute, the
proxy connected to SPE-1 after about 2, the data loaded after about 3, SPE-2
reachable after about 4.

Each group costs about €0.13 an hour while it runs. ADR-069 started both
with the stack every working morning and stopped them in the evening: about
13 hours a working day, roughly 280 hours a month each, about €73 a month
for the two, for workspaces that only federated questions use, and those
are asked a few times a day at most.

While a group is stopped, the proxy's federated paths and `/spe/status` wait
for it (5 s per workspace for a connection, longer for a read) and fail with
"no answer within 5000 ms"; `/admin/attestation` shows it unreachable, and a
researcher gets a generic error.

The off-hours identity `id-mvhd-offhours` was to get a custom role
`mvhd-aci-power` (read, start, stop, restart container groups, nothing
else). It cannot be created: the maintainer's PIM role excludes
`Microsoft.Authorization/roleDefinitions/write`. On 2026-11-02 the identity
got the built-in "Azure Container Instances Contributor Role" on the two
groups instead.

## Decision

1. **Stopped by default, started on demand.** The evening off-hours run
   still stops both groups first (ADR-069 decision 8). The morning run starts
   Trustee as before but no longer starts the groups. `offhours.sh` keeps a
   switch, `SPE_START_WITH_STACK` (default `false`; `true` restores the old
   morning start), which `18-offhours-jobs.sh` passes to the jobs.

2. **Who starts and stops.**

   - Start and Stop buttons on `/admin/attestation` and `/admin/components`,
     backed by `POST /api/admin/spe/power {action: "start"|"stop", spe:
"SPE-1"|"SPE-2"|"all"}`, for `EDC_ADMIN` and `HDAB_AUTHORITY` (the
     operator and the access body, which runs the Trustee).
   - A federated query (`GET /api/federated`, `POST /api/nlq` with
     `federated: true`, and a template that asks every SPE) that finds a
     workspace stopped starts it when the caller is `EDC_ADMIN`,
     `HDAB_AUTHORITY` or `DATA_USER`; a data user's query has passed the
     permit gate (Art. 61(1)) before it gets there. Anyone else is told the
     workspace is stopped and starts nothing.
   - The idle stop (decision 5), the evening run and the Stop button stop.

3. **The hub calls ARM with its own identity.** The UI's system-assigned
   managed identity calls `containerGroups/{name}`, `/start` and `/stop`
   (`ui/src/lib/azure-arm.ts`: `getContainerGroupState`,
   `startContainerGroup`, `stopContainerGroup`, api-version 2023-05-01). It
   needs the same role as the off-hours identity on the two groups. An ARM
   403 is answered with a 403 naming the role and the command an owner runs
   (`grantCommand()` in `ui/src/lib/spe-power.ts`):

   ```bash
   UI_PRINCIPAL=$(az containerapp show -g rg-mvhd-dev -n mvhd-ui --query identity.principalId -o tsv)
   for g in mvhd-spe-1 mvhd-spe-2; do
     az role assignment create --assignee-object-id "$UI_PRINCIPAL" \
       --assignee-principal-type ServicePrincipal \
       --role "Azure Container Instances Contributor Role" \
       --scope "$(az container show -g rg-mvhd-dev -n "$g" --query id -o tsv)"
   done
   ```

   `18-offhours-jobs.sh` does the same, idempotently, for both identities:
   the custom role at the resource group where it can be created, otherwise
   the built-in role on each existing group, and it says which.

4. **What a query gets while a workspace is not up.** On Azure the UI asks
   ARM before it asks the proxy, so nobody waits 5 s per workspace. A stopped
   or starting workspace answers **503** with
   `{error, spe: {id, state: "starting"|"stopped", etaSeconds}, spes: [...],
started}` and `Retry-After`; `etaSeconds` is 240 from stopped, less for a
   group whose containers started under three minutes ago. ARM unknown (off
   Azure, no Reader role, ARM slow) means the query goes on as before. `GET
/api/admin/spe` reports each workspace as `running`, `starting`, `stopped`
   or `unreachable` (`powerState`), with ARM's `armState` and the proxy's
   `lastQueriedAt`, and names the stopped ones in `/spe/status?skip=` so the
   proxy reports them at once instead of waiting.

5. **Idle stop.** The proxy, which queries the workspaces, records when it
   last asked each one: in memory on the query path (no write there), merged
   by the SPE sync into `(:SpeWorkspace {speId}).lastQueriedAt` in the hub
   graph every minute, and read back, so every replica reports the latest
   (`GET /spe/status`, `lastQueriedAt`). A new ACA job,
   `mvhd-spe-idle-stop`, runs `offhours.sh idle-stop` every 15 minutes as
   `id-mvhd-offhours`. It stops a running group when both its last query and
   its start (ARM, the neo4j container's start time) are older than
   `SPE_IDLE_STOP_MINUTES` (30). A just-started group is never stopped before
   it was used; a hold or keep-up date skips the idle stop, as it skips the
   evening stop; with the proxy unreachable the start time alone decides
   (nobody can query a workspace then); a group whose start time ARM does
   not report is left running until the evening. The job reads
   `http://mvhd-neo4j-proxy/spe/status` over the environment's internal
   ingress.

6. **What people see.** The admin pages show each workspace's state, Start
   or Stop for the two roles, the last query, and while it starts the line
   "Starting: attesting to Trustee, releasing the key, loading the data;
   about 3 to 4 minutes", polling every 10 s until it runs. `/query` shows
   "SPE-1 is starting (cold start, about 3 to 4 minutes): attesting,
   releasing the key, loading the data. Try again in a few minutes." instead
   of an error, in all five languages. The static demo starts nothing and
   says so.

7. **Where a workspace runs.** `/admin/attestation` showed "Docker Compose
   (local)" under SPE-1 on Azure: the loader in that group recorded its
   local default because `SPE_RUNS_ON` did not reach it, and the record won
   over the proxy's `SPE1_RUNS_ON`. The deployment's value on the proxy
   (`--wire-proxy`) now wins; the record wins only where nothing is
   configured (compose); the loader's default no longer names a place.

## Consequences

- Cost: the groups run only while used plus at most 30 to 45 minutes after.
  Two hours of use a working day is about 55 hours a month each, about €14
  for both instead of about €73. The idle job runs 96 times a day for about
  a minute at 0.5 vCPU and 1 GiB, about €3 a month at list price before the
  Container Apps free grant.
- The first federated question after a pause waits 3 to 4 minutes, and the
  researcher is told so; a demo that needs the workspaces warm presses
  Start beforehand or sets a hold.
- **The built-in role is broader than the custom one.** On the two groups
  only, it also allows create, update, delete, exec and reading logs, for
  two identities (`id-mvhd-offhours`, `mvhd-ui`). The data stays protected:
  exec and the containers' environment are bound by the group's ccePolicy,
  and a group recreated with another policy has another HOST_DATA, so
  Trustee does not release its key (ADR-069 decision 2). What a compromised
  identity could do is availability: stop or delete a workspace, which the
  next deployment recreates. When someone may define roles,
  `18-offhours-jobs.sh` creates `mvhd-aci-power` and assigns it at the
  resource group; the built-in assignments are then removed by hand.
- Each start re-attests and reloads, so every start is on the audit chain
  (spe.attestation, spe.key_release, spe.workspace_loaded); on demand means
  more of those entries, which is the point.
- Not verified on Azure yet: an ACA job reaching the proxy by its internal
  name, `instanceView.currentState.startTime` of the neo4j container in a
  confidential group, and the UI identity's ARM calls (it needs the role
  above first). Nothing was deployed with this change.

## Alternatives considered

- **Keep starting them every morning (ADR-069):** about €73 a month for
  idle workspaces; kept behind `SPE_START_WITH_STACK=true`.
- **Start them in the proxy:** the proxy has no ARM identity, and the UI
  already has one with the session's roles at hand.
- **Wait in the request until the workspace is up:** a 4-minute HTTP
  request outlives every timeout between the browser and the proxy.
- **Keep the last query time only in the proxy's memory:** with two proxy
  replicas the idle job would read a random one and could stop a workspace
  in use; the hub graph merges them.
- **The custom role `mvhd-aci-power`:** preferred, and still tried first;
  the maintainer's PIM role cannot create role definitions.
