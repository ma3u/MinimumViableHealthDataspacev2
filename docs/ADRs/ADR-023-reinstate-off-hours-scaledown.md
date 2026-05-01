# ADR-023: Reinstate Off-Hours ACA Scale-Down

**Status:** Accepted
**Date:** 2026-05-01
**Supersedes (partially):** [ADR-018](ADR-018-24x7-workaround-b.md) — section "Disable the off-hours scale-down" no longer applies; the schedule is back on.
**Relates to:** [ADR-016](ADR-016-aca-off-hours-scaledown.md), [ADR-022](ADR-022-edc-connector-cost-vs-function.md)

## Context

ADR-018 turned off the ADR-016 cron in April 2026 because:

- The `INF-STG-EU_EHDS` corporate subscription had no consumption cap, so the cost-control argument disappeared.
- The Postgres Flexible Server that the original `aca-schedule.yml` start/stop targeted no longer exists (Workaround B replaced it with a Container App).

Two months on, both premises are weaker:

1. **Cost is still cost** — the unlimited subscription doesn't make the bill invisible to the team, and the `/admin/components` cost panel now exposes a baseline of ~€385/mo with everything healthy. Roughly **40% of that** is paid for hours nobody is looking at the demo (nights + weekends).
2. **The README + `/docs/user-guide` already tell users** that `ehds.mabu.red` is "online Mon–Fri 07:00–20:00 Europe/Berlin" — so users already expect a weekday-hours service. The 24×7 promise was implicit, not contractual.
3. **ADR-022** removed seven apps from the always-on set (the broken EDC apps already at min=0). The schedule's new responsibility is just the seven _healthy_ apps, which is much smaller and safer than the original 13.

## Decision

Re-enable the cron in `.github/workflows/aca-schedule.yml`.

### Schedule

```
- cron: "0 5 * * 1-5"   # start: Mon–Fri 07:00 Europe/Berlin (CEST)
- cron: "0 18 * * *"    # stop:  daily   20:00 Europe/Berlin (CEST)
```

Saturday and Sunday have no `start` — the env stays at `0/0` over the weekend.

### Apps in scope

The schedule operates on the **seven healthy apps**:

| App                     | min/max during work hours                         |
| ----------------------- | ------------------------------------------------- |
| `mvhd-postgres`         | 1/1 (must come up first — Keycloak depends on it) |
| `mvhd-neo4j`            | 1/1                                               |
| `mvhd-keycloak`         | 1/1                                               |
| `mvhd-vault`            | 1/1                                               |
| `mvhd-neo4j-proxy`      | 1/2                                               |
| `mvhd-ui`               | 1/3                                               |
| `mvhd-catalog-enricher` | 1/1                                               |

The eight broken/unused apps (`controlplane`, `dp-fhir`, `dp-omop`, `identityhub`, `issuerservice`, `tenant-mgr`, `provision-mgr`, `nats`) are **deliberately excluded** — they're already at `min=0` per ADR-022 and the schedule must not flip them back on.

### Postgres on ACA (replaces the old Flex-Server start/stop)

Workaround B (ADR-018) put Postgres on a Container App. The schedule now treats it like any other ACA app:

- Stop: `az containerapp update --min-replicas 0 --max-replicas 0`
- Start: `az containerapp update --min-replicas 1 --max-replicas 1`, with a 20-second wait before Keycloak comes up so the JDBC pool finds a live socket.

Data persists via Azure Files mount (ADR-017), so `0/0 → 1/1` is non-destructive.

### Cold-start order on weekday morning

1. Postgres up first (DB available)
2. 20-second pause
3. The remaining six apps come up in parallel
4. 75-second pause for Neo4j + Vault stateful boot
5. Re-run `mvhd-vault-bootstrap` job (Vault is in-memory; gotcha #1 still applies)
6. Curl `https://mvhd-ui...azurecontainerapps.io` until HTTP 200 or 5 min timeout

The whole boot path is currently observed at ~3 minutes from cron trigger to UI healthy.

## Cost envelope

Assuming a steady ~€385/mo if everything ran 24/7:

| Window                           | Hours/week | Apps running   |
| -------------------------------- | ---------- | -------------- |
| On-hours (Mon–Fri 07–20)         | 65         | 7 healthy apps |
| Off-hours weeknights             | 55         | none           |
| Weekends (Fri 20:00 – Mon 07:00) | 59         | none           |

```
65 / 168 ≈ 39% of the week → ~€150/mo running + ~€32/mo storage = ~€180/mo total
```

**Net savings: ~€200/mo** vs 24/7. The unlimited subscription absorbs the 24/7 case, but explaining the saving each month is harder than running the schedule.

## Consequences

### Positive

- ~€200/mo savings on the steady bill, reflected in the `/admin/components` cost-estimator banner (the panel already labels Storage and Egress as estimates; the compute number drops automatically when the Mon–Fri window kicks in).
- Weekend cost = effectively €0 for compute (storage + ACR remain).
- Scope of "always-on" is small enough to fit in one screen: **seven** apps, not thirteen.
- Vault re-bootstrap and Neo4j persistence already proven by the original ADR-016 run from April; no new operational risk.

### Trade-offs

- **DST drift, same as before**: cron is UTC-only. April–October the window is exactly 07:00–20:00 local; November–March it shifts to 06:00–19:00 local. Acceptable.
- **No 24/7 access**: external visitors hitting `ehds.mabu.red` outside the window get a 502/empty page. The README documents this; the UI's `/auth/signin` doesn't currently render a friendly off-hours notice (follow-up work, low priority).
- **Cold start is ~3 minutes** at 07:00 sharp — acceptable for a demo, but the first user of the day will wait.
- **Manual override** still available via `workflow_dispatch` → choose `start` to bring it up early, `stop` to push it down early.

### Rollback

If the schedule causes pain, comment out the `schedule:` block again. The `workflow_dispatch` path keeps working. Restore the broken EDC apps to the include list only if they actually start booting on ACA (issue #25 outcome).

## References

- Workflow: `.github/workflows/aca-schedule.yml`
- Original schedule decision: [ADR-016: ACA Off-Hours Scale-Down](ADR-016-aca-off-hours-scaledown.md)
- Why it was disabled: [ADR-018: 24×7 Operation on INF-STG-EU_EHDS](ADR-018-24x7-workaround-b.md)
- App-list rationale (which apps are on the schedule, which are not): [ADR-022: EDC Connector — Function vs Cost](ADR-022-edc-connector-cost-vs-function.md)
- Persistent storage (why scale-to-0 is non-destructive): [ADR-017: Persistent Storage for Stateful Services on ACA](ADR-017-persistent-storage-aca.md)
