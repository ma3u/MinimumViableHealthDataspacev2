# ADR-058: Azure triggers the off-hours stop and start, as a managed identity

**Status:** Proposed
**Date:** 2026-10-07
**Amends:** [ADR-053](ADR-053-everything-stops-off-hours.md) (what stops and in which order is unchanged; who triggers it changes)
**Relates to:** [ADR-029](ADR-029-dependency-version-pinning.md), [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-041](ADR-041-managed-postgres-on-azure-containerised-locally.md)
**Tracks:** [Issue #595](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/595)

## Context

ADR-053 stops every Container App and the Flexible Server each evening and
starts them on working-day mornings. GitHub's `schedule` event triggered it,
through `.github/workflows/aca-schedule.yml`. GitHub runs scheduled workflows
best effort, and on this repository that stopped meaning "a little late":

| date       | what fired                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-05 | the stop at 23:49 UTC instead of 18:13                                                                                                                                                   |
| 2026-10-06 | no run of the schedule at all, and one scheduled run of any workflow in the whole repository; the site was down in the morning until a manual start, and the stack ran through the night |

#565 moved the crons off the hour and added a second attempt. That covers a
late run, not a dropped one. A manual dispatch is reliable, but it needs a
person, or a watchdog in a maintainer's session that needs a terminal login.

## Decision

Azure triggers the schedule itself, and nobody signs in for it.

- **Two Container Apps jobs** in `mvhd-env` with a cron trigger:
  `mvhd-offhours-stop` at 18:13 UTC daily and `mvhd-offhours-start` at 05:17
  UTC Monday to Friday. A third, `mvhd-offhours-check`, is manual only: it
  signs in and decides both without changing anything.
- **A user-assigned managed identity**, `id-mvhd-offhours`, which the jobs
  sign in as (`az login --identity`). No GitHub token, no person, no secret.
  Its roles are the narrowest that do the work: Container Apps Contributor and
  Reader on `rg-mvhd-dev`, Contributor on the Flexible Server alone (stop and
  start), Key Vault Secrets User on `kv-mvhd-b53a0449` (the realm restore reads
  the Keycloak admin password).
- **One script**, `scripts/azure/offhours.sh`, holds the logic that lived in
  the workflow's YAML: the decision (Berlin holidays, keep-up dates, holds,
  already done) and the stop and start in ADR-053's order. The jobs and the
  workflow both run it.
- **The code the jobs run** is downloaded at each execution from this public
  repository at `REPO_REF`, the commit `deploy-azure.yml` last deployed, which
  sets it on every deploy. The image is pinned (`azure-cli:2.91.0`, ADR-029).
- **The workflow stays** for a manual start or stop, and as a fallback: its
  crons fire an hour after the jobs and find nothing to do when the job did
  its work.
- **A hold** moves from a GitHub repository variable, which the job cannot
  read without a GitHub token, to a tag on the app `mvhd-ui`,
  `live-demo-hold-until`: the job reads it, and the maintainer's Container
  Apps Contributor role can write it. The variable still holds the workflow.

`scripts/azure/18-offhours-jobs.sh` creates the identity, its roles and the
jobs; it needs the PIM role once (role assignments). After that the CI
identity keeps `REPO_REF` current.

## Consequences

- The stack stops and starts when GitHub drops scheduled runs. The cron is
  UTC, as before: in winter the times are an hour earlier in Berlin.
- The off-hours logic is a script that can be run and tested outside a
  workflow; a decision can be checked without changing anything
  (`offhours.sh decide stop`, `18-offhours-jobs.sh --dry-run`).
- A new identity with standing rights on the resource group. Its rights are
  scoped as above, and it has no credential to leak: only the jobs can use it.
- The jobs depend on GitHub for the code (raw.githubusercontent.com at a pinned
  commit). If that is unreachable, the execution fails and says so; the
  workflow fallback an hour later depends on GitHub too. An alert on a failed
  execution is the next step (#595).
- Jobs cost almost nothing: two executions of a few minutes a day on the
  consumption profile.

## Alternatives considered

- **More cron entries in the workflow.** On 2026-10-06 GitHub dropped every
  scheduled run of the repository; more entries are more runs to drop.
- **An Azure schedule that calls `workflow_dispatch`.** Keeps the logic in
  YAML, but needs a GitHub token stored in Azure, a credential to rotate and
  to leak, for a job a managed identity does without one.
- **A watchdog in a maintainer's Claude session.** Used once, for 2026-10-07,
  as a stopgap; it fires only while that session runs and the laptop is awake.
- **Azure Automation or a Logic App.** Another service to run and pay for, with
  the same identity question; a Container Apps job sits in the environment the
  stack already has.
