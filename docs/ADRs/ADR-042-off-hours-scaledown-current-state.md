# ADR-042: Off-hours scale-down, the state that runs today

**Status:** Accepted (2026-10-02, #404)
**Date:** 2026-10-02
**Supersedes:** [ADR-016](ADR-016-aca-off-hours-scaledown.md), section 1 of [ADR-018](ADR-018-24x7-workaround-b.md) ("Disable the off-hours scale-down"), [ADR-023](ADR-023-reinstate-off-hours-scaledown.md), [ADR-027](ADR-027-edc-stack-off-hours-scaledown.md)
**Does not supersede:** the rest of ADR-018 (Postgres as a Container App), ADR-041
**Tracks:** [#404](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/404)

## Context

One switch, four decisions. ADR-016 introduced a nightly scale-down of
`rg-mvhd-dev` in April 2026. ADR-018 turned it off when the stack moved to
the `INF-STG-EU_EHDS` subscription. ADR-023 turned it back on for seven
"healthy" apps. ADR-027 extended it to the eight EDC apps that ADR-024 had
provisioned at `min=1`. After that, the workflow kept changing without an
ADR:

- **#92 (2026-06-05).** `--max-replicas 0` was rejected by Azure on every
  run, the error was swallowed, and the job went green while nothing scaled.
  Scale-to-zero is `min=0, max=1`. The stop job now reads `minReplicas` back
  after each update and fails if it is not 0.
- **2026-09-13.** `mvhd-postgres` and `mvhd-keycloak` were taken out of the
  stop list. MeinBefund users scan a lab report in the evening; with
  Keycloak down they cannot sign in, and the quota counter lives in the same
  Postgres. `mvhd-claude-federation` was never in the list.
- **2026-09-14/15.** The start job checks the `edcv` realm and restores it
  with `scripts/azure/restore-keycloak-realm.sh`, as a `continue-on-error`
  step, followed by a hard check that Keycloak can serve a login
  (`check-keycloak-health.sh`).
- **#253 (2026-09-22).** `KEEP_UP_DATES` skips the evening stop on listed
  dates (14 October, the HL7 webinar).
- **#318 (2026-09-30).** The five CFM apps (the control-plane shim and four
  provisioning agents) joined both lists; for one night they were stopped by
  nobody and started by nobody.

A reader who wants to know what happens at 20:00 has to replay ADR-016,
-018, -023 and -027 and then read the workflow anyway, because the
workflow's header comment still says "scales all 21 Container Apps" while
its own stop step says 18.

## Decision

`.github/workflows/aca-schedule.yml` is the single implementation, and this
ADR records what it does as of 2026-10-02.

**Window.** Start Mon to Fri 05:00 UTC, stop daily 18:00 UTC: 07:00 to
20:00 Europe/Berlin in summer, one hour earlier in winter (accepted drift,
as in ADR-016). No start on weekends. A date in `KEEP_UP_DATES` skips that
evening's stop. `workflow_dispatch` runs `start` or `stop` by hand.

**What stops (18 apps to `min=0, max=1`).** Core: `mvhd-neo4j`,
`mvhd-vault`, `mvhd-neo4j-proxy`, `mvhd-ui`, `mvhd-catalog-enricher`. EDC:
`mvhd-nats`, `mvhd-controlplane`, `mvhd-dp-fhir`, `mvhd-dp-omop`,
`mvhd-identityhub`, `mvhd-issuerservice`, `mvhd-tenant-mgr`,
`mvhd-provision-mgr`. CFM: `mvhd-cfm-cp-shim`, `mvhd-cfm-kcagent`,
`mvhd-cfm-edcvagent`, `mvhd-cfm-regagent`, `mvhd-cfm-obagent`. Each update
is verified by reading `minReplicas` back; one failure fails the job.

**What never stops.** `mvhd-postgres`, `mvhd-keycloak` (sign-in and the
quota counter for MeinBefund, evenings and weekends), and
`mvhd-claude-federation`.

**Start order.** Postgres first (it stays up, but a manual stop may have
taken it down), then the core apps with NATS, a 75 s wait for Neo4j and
Vault, the Keycloak realm check and restore, the seven remaining EDC apps,
the five CFM apps, the Vault bootstrap job, and finally a UI reachability
check and a Keycloak login check. Work-hours scale: `mvhd-neo4j-proxy`
`1/2`, `mvhd-ui` `1/3`, everything else `1/1`.

**Rule for change.** A new Container App goes into both the stop list and
the matching start step in the same PR, or into the "never stops" list
with its reason. A change to the window, the lists or the order updates
this ADR, rather than adding a fifth.

## Consequences

- The four older ADRs stay as history (an accepted ADR is not edited); this
  one is where the current state is read.
- The workflow's header comment said "scales all 21 Container Apps"; it now
  says 18 of 21 and points here.
- Keeping Postgres and Keycloak up costs two apps' worth of the saving that
  ADR-027 was after. Revisit if identity and quota state move out of the
  cluster.
- The start job still re-runs the Vault bootstrap job "because Vault is
  in-memory". The local compose Vault is file-backed since 2026-09-26; whether
  the Azure Vault needs the bootstrap on every start is open and belongs to
  whoever settles Vault persistence on ACA (ADR-017, ADR-036).

## Alternatives considered

- **Amend ADR-027 in place.** Rejected: the corpus rule is to supersede, not
  edit, an accepted ADR.
- **Leave it to the workflow comments.** Rejected: they have already drifted
  from the code they sit on (21 vs 18).
- **Run 24x7 again (ADR-018).** Rejected for now: the demo is documented as a
  weekday-hours service, and the two apps that evening users need already
  stay up.
