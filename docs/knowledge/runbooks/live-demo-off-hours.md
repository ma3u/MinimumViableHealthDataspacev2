# Runbook: The live demo off hours, and working on it at night or at the weekend

[ADR-053](../../ADRs/ADR-053-everything-stops-off-hours.md). Outside office
hours, `ehds.mabu.red` stops completely: every Container App except the UI,
and the PostgreSQL Flexible Server. The UI stays reachable at zero replicas
and answers every page with an offline notice that links the same page on the
static site. This runbook covers the schedule, how to bring the stack up for a
session at night or at the weekend, how to keep it up, and how to put it back.

## The schedule

| When (UTC)                    | What                                                      | Berlin time            |
| ----------------------------- | --------------------------------------------------------- | ---------------------- |
| Mon to Fri 05:00              | Start: Postgres, then core apps, EDC, CFM, UI goes online | 07:00 CEST / 06:00 CET |
| Every day 18:00               | Stop: UI goes offline, all other apps stop, Postgres last | 20:00 CEST / 19:00 CET |
| Mon to Fri, 05:00 to 17:55    | Catalog crawler, every five minutes                       | office hours           |
| Berlin public holiday         | No start; the stack stays stopped                         |                        |
| Date in `KEEP_UP_DATES`       | No evening stop on that date (committed, for events)      |                        |
| Before `LIVE_DEMO_HOLD_UNTIL` | No stop at all (repository variable, for sessions)        |                        |

Everything is in `.github/workflows/aca-schedule.yml`. The stop and start of
single apps go through `scripts/azure/set-app-power.sh`.

**Local development is not affected.** `docker compose` and `npm run dev` know
nothing of the schedule; the flag `LIVE_DEMO_OFFLINE` is unset there, so the
UI is online. To look at the offline notice locally:

```bash
cd ui && LIVE_DEMO_OFFLINE=true npm run dev   # every page shows the notice
```

## A session at night or at the weekend

### 1. Hold the stack, so the evening stop leaves it alone

```bash
# Until when, in UTC. Every scheduled stop before this instant is skipped.
gh variable set LIVE_DEMO_HOLD_UNTIL --body "2026-10-10T22:00Z"
gh variable get LIVE_DEMO_HOLD_UNTIL
```

Set it **before** 18:00 UTC if you are starting in the afternoon and want to
carry on into the evening; then step 2 is not needed, the stack never stops.

### 2. Start it

```bash
gh workflow run aca-schedule.yml -f action=start
gh run watch "$(gh run list --workflow aca-schedule.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```

A manual start runs on any day, holidays included. It takes about ten
minutes: Postgres first (a few minutes from Stopped), then the apps in
dependency order, then the UI leaves offline mode, then the Keycloak login
check. The run is green only when a login can be served.

Check it from the laptop:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://ehds.mabu.red/api/graph   # 401, not 503
./scripts/azure/check-keycloak-health.sh https://auth.ehds.mabu.red edcv  # exit 0
```

### 3. If you need the catalog crawler

It runs in office hours only. One crawl by hand:

```bash
az containerapp job start --name mvhd-catalog-crawler --resource-group rg-mvhd-dev
```

### 4. Deploying during the session

Merge as usual; `deploy-azure.yml` updates images on running apps. **Start
first, then merge.** What a deploy does to a stopped app has not been tried
yet; expect its post-deploy checks to fail against a stack that is not there.
`az containerapp update --image` keeps the UI's environment, so a deploy at
night does not take the UI out of offline mode, and one in the day does not
put it in.

### 5. When you are done

```bash
gh variable delete LIVE_DEMO_HOLD_UNTIL
gh workflow run aca-schedule.yml -f action=stop
```

Forgot? The first scheduled stop after the hold expires stops it, which is
18:00 UTC on the day after at the latest. A hold that ends on a Sunday night
leaves the stack running through Monday, which is office hours anyway.

## What state is it in

```bash
az containerapp list -g rg-mvhd-dev \
  --query "sort_by([].{app:name, status:properties.runningStatus, min:properties.template.scale.minReplicas}, &app)" -o table
az containerapp show -n mvhd-ui -g rg-mvhd-dev \
  --query "properties.template.containers[0].env[?name=='LIVE_DEMO_OFFLINE'].value | [0]" -o tsv
az postgres flexible-server show -n mvhd-pg-b53a0449 -g rg-mvhd-dev --query state -o tsv
gh variable get LIVE_DEMO_HOLD_UNTIL
```

Off hours the expected picture is: every app `Stopped` except `mvhd-ui`
(`Running`, min 0, flag `true`), Postgres `Stopped`.

## When something is wrong

| Symptom                                               | Cause and fix                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start run red at "Start Postgres first"               | The server did not reach Ready in five minutes. `az postgres flexible-server show ... --query state`; start it by hand and re-run the start.             |
| UI still shows the offline notice after a green start | The flag is still `true`: re-run the start, or `az containerapp update -n mvhd-ui -g rg-mvhd-dev --set-env-vars LIVE_DEMO_OFFLINE=false`.                |
| UI online at night, pages full of errors              | The flag is `false` but the backends are stopped (a manual flag change, or a failed stop). Run the stop again.                                           |
| Start green but sign-in fails                         | See [keycloak-realm-drift](keycloak-realm-drift.md); `scripts/azure/restore-keycloak-realm.sh`.                                                          |
| IdentityHub logs `Private key ... not found`          | Vault started before its unseal finished; see `docs/gotchas.md` (2026-09-26). Restart `mvhd-vault`, then re-run `mvhd-vault-bootstrap`.                  |
| Postgres `Ready` on a weekend nobody started          | Azure starts a stopped Flexible Server by itself after seven days. Stop it again: `az postgres flexible-server stop -n mvhd-pg-b53a0449 -g rg-mvhd-dev`. |
| `mvhd-*-down` alerts every evening                    | Expected: the replica alerts of `scripts/azure/07-observability.sh` fire when the stop has worked. Mute them off hours or read them in office hours.     |
| Klarbefund cannot connect or analyse in the evening   | Expected: Keycloak and the hosted analysis are stopped. Analysis on the device still works.                                                              |
