# ADR-027: EDC Stack in Off-Hours Scale-Down (FinOps Cost Correction)

**Status:** Accepted
**Date:** 2026-05-18
**Relates to:** [ADR-016](ADR-016-aca-off-hours-scaledown.md), [ADR-022](ADR-022-edc-connector-cost-vs-function.md), [ADR-023](ADR-023-reinstate-off-hours-scaledown.md), [ADR-024](ADR-024-full-edc-provisioning-per-participant.md)
**Tracking:** FinOps cost review on subscription `INF-STG-EU_EHDS` (DISIT Cloud Team, May 2026)

## Context

The DISIT Cloud Team's FinOps review flagged a cost surge on `INF-STG-EU_EHDS`
in May 2026 — Container Apps (`microsoft.app/containerapps`) running above the
April daily average.

Root cause: a **gap between two ADRs**.

- **ADR-023** reinstated the off-hours scale-down cron (`aca-schedule.yml`).
  At that time (2026-05-01) the EDC apps were at `min=0` per ADR-022 Option C,
  so the schedule only managed the **7 "healthy" apps**. Its code carried a
  `NOTE` explicitly excluding the 8 EDC apps ("they don't boot on ACA today").
- **ADR-024** (2026-05-04) superseded ADR-022 Option C and provisioned the
  **full EDC stack at `min=1`** via `scripts/azure/04-edc-services.sh`
  (`--min-replicas 1 --max-replicas 1` for controlplane, dp-fhir, dp-omop,
  identityhub, issuerservice, tenant-mgr, provision-mgr, nats).

ADR-024's own cost section assumed the result would be **~€100-130/mo**
_"combined with off-hours scale-down (ADR-016, ADR-023)"_. But the schedule
was never updated to include the EDC apps. The 8 EDC apps therefore ran
**24/7** — billing through every night and weekend — instead of weekday
hours. ADR-022 estimated the full EDC stack at `min=1` costs **~€252-272/mo**;
left 24/7, roughly **60% of that (~€150-165/mo)** was spent on hours when
nobody uses the `ehds.mabu.red` demo.

## Decision

**Extend `aca-schedule.yml` to scale the 8 EDC apps with the rest of the
stack** — restoring the cost envelope ADR-024 assumed.

The schedule now manages **all 15 Container Apps**:

| Group         | Apps                                                                                        | Work-hours scale        |
| ------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| Core (7)      | postgres, neo4j, keycloak, vault, neo4j-proxy, ui, catalog-enricher                         | 1/1 (proxy 1/2, ui 1/3) |
| EDC stack (8) | nats, controlplane, dp-fhir, dp-omop, identityhub, issuerservice, tenant-mgr, provision-mgr | 1/1                     |

Off-hours (nightly 20:00 Europe/Berlin + all weekend) every app is scaled to
`0/0`. The operating window is unchanged: **Mon-Fri 07:00-20:00 Europe/Berlin**,
the weekday-hours service already documented in the README.

### Start ordering

EDC apps have boot-time dependencies, so the start job is sequenced:

1. **Postgres** first (+20 s) — controlplane, identityhub, issuerservice and
   the data planes all use Postgres datasources.
2. **NATS** with the core apps — JetStream must be ready before the
   controlplane subscriber starts.
3. 75 s stateful wait (Neo4j + Vault).
4. **Restore EDC stack** — the 7 remaining EDC apps to `1/1`.

Stop ordering is irrelevant — all apps scale to `0/0` in any order.

## Consequences

### Positive

- EDC apps run **~65 h/week instead of 168 h/week** (≈61 % less runtime).
- Total subscription scale-down saving rises to **~€250-300/mo**; the realised
  monthly figure converges on ADR-024's intended **~€100-130/mo**.
- No loss of function: the demo's operating window is unchanged, and protocol
  compliance (`/compliance/tck`) is still observable during weekday hours.

### Negative / accepted

- Weekday morning cold-start grows by one step (~1-2 min) for the EDC restore.
- If an EDC app crash-loops, it is now also restarted by the morning cron —
  acceptable, and made visible in `/admin/components`.

### Neutral

- The schedule still uses workflow-dispatch SP credentials (memory:
  `project_aca_job_write_via_ci`) — no new permissions required.

## Rollback

Revert the `aca-schedule.yml` change. The EDC apps return to 24/7 `min=1`
(ADR-024 baseline). One-line, no data impact — scale-to-zero is non-destructive
(Postgres + Neo4j persist on Azure Files, ADR-017).

## References

- ADR-024 — Full EDC Provisioning per Participant (the `min=1` decision)
- ADR-023 — Reinstate Off-Hours ACA Scale-Down (the schedule)
- ADR-022 — EDC Connector cost analysis (~€252-272/mo for the full stack)
- `.github/workflows/aca-schedule.yml` — the implementation
