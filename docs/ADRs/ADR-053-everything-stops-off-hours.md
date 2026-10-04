# ADR-053: Everything stops off hours, and the UI says so

**Status:** Accepted (2026-10-04, Matthias Buchhorn)
**Date:** 2026-10-04
**Relates to:** [ADR-022](ADR-022-edc-connector-cost-vs-function.md), [ADR-027](ADR-027-edc-stack-off-hours-scaledown.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md), [ADR-046](ADR-046-vault-keeps-its-state-on-the-flexible-server.md)
**Supersedes:** the "never stops" list of [ADR-042](ADR-042-off-hours-scaledown-current-state.md) and [ADR-047](ADR-047-vault-stays-up-off-hours.md)
**Tracks:** [PR #482](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/482) (the cost estimate against the bill)

## Context

The off-hours schedule was meant to bill about 65 of the week's 168 hours.
The bill reads like a stack that runs around the clock: €741 for the month
against an estimate of €426, and nights and weekends cost about as much as
office hours.

Three causes, the first of which the repository already recorded:

1. **Scale-to-zero never reached zero.** The stop set `min=0` and relied on
   Container Apps to scale an idle app away. An app is idle only when nobody
   calls it, and nearly every app here is called by something: the EDC
   services poll Vault, the enricher holds a NATS connection, and the catalog
   crawler reached Neo4j and the UI every five minutes, all night. ADR-047
   measured it on Saturday 3 October: Vault, the UI, the control plane and the
   CFM agents each ran one replica at `min=0`.
2. **Four apps never stopped:** Keycloak, Vault, the federation gateway, and the
   old Postgres container (ADR-042, ADR-047).
3. **The database never stopped.** The Flexible Server stayed up for Keycloak.

The reasons for keeping Keycloak and Vault up have changed. Vault keeps its
state in the Flexible Server since ADR-046, so a restart no longer empties it.
Keycloak was kept up so that Klarbefund could sign in in the evening, and that
is a cost decision: the hub pays to run the whole identity tier and its
database all night for an occasional evening sign-in.

## Decision

1. **The evening stop stops everything except the UI.** It calls Container
   Apps' stop operation (`scripts/azure/set-app-power.sh`), not `min=0`, so an
   app has no replica whatever calls it. Twenty apps stop, consumers first:
   the four core apps, the seven EDC apps, the five CFM apps, NATS, the
   federation gateway, Keycloak, Vault and the old Postgres container.
2. **The Flexible Server stops last** and starts first. The start waits until it
   is Ready and starts nothing before.
3. **The UI stays reachable and says what is going on.** It goes to `min=0` with
   `LIVE_DEMO_OFFLINE=true`. A visitor wakes it alone. The middleware answers
   every page with an offline notice that names the next opening and links the
   same page on the static site, and answers every data route with a 503 and
   `{ error, staticSite }`. The liveness probe, NextAuth's session endpoints and
   `/api/keycloak-config` still answer, since none needs a backend. The morning
   start sets the flag back to `false` last, once the stack is up.
4. **The catalog crawler runs in office hours only** (`*/5 5-17 * * 1-5` UTC).
5. **A night or weekend session holds the stack** with the repository variable
   `LIVE_DEMO_HOLD_UNTIL`. Every scheduled stop before that instant is
   skipped. A manual start and a manual stop work on any day. The procedure is
   in `docs/knowledge/runbooks/live-demo-off-hours.md`.

## Consequences

- **Cost.** Outside the roughly 65 office hours a week, the only charges left are
  storage, the registry, Key Vault, logs, a stopped server's storage, and a UI
  replica for five minutes after each visit. The saving will be measured from
  Cost Management once a full week has run under this ADR. This ADR does not
  estimate it.
- **Klarbefund in the evening.** Connecting to EHDS and the hosted cloud analysis
  are unavailable off hours, because Keycloak and the federation gateway are
  stopped. Analysis on the device still works. This reverses the 2026-09-13
  decision recorded in ADR-042.
- **The morning start is a few minutes longer**, because the database starts from
  Stopped first. Visitors see the offline notice until it is done, not a page
  of errors.
- **Azure starts a stopped Flexible Server by itself after seven days.** No off
  period here is that long. If it happens, the server runs until the next
  evening stop stops it again.
- **Replica alerts fire every evening.** `mvhd-ui-down`, `mvhd-keycloak-down` and
  `mvhd-neo4j-down` (`scripts/azure/07-observability.sh`) mean "the stop
  worked" off hours. Scheduling them is left for a follow-up.
- **The UI gets a new revision twice a day**, one for each flip of the flag.
  Revisions are cheap. A flag that changes without a rebuild is worth that.
- **Not covered here:** the inactive revision `mvhd-dp-fhir--yxrimss`, which
  crashed with two replicas, and the second Neo4j revision that PR #482 found
  beside the active one. The first night will show whether a stop ends their
  replicas too. During the day they still bill, and the cost issue tracks them.
