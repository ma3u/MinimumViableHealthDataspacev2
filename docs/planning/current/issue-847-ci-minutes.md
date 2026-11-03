---
title: "Cutting GitHub Actions job-minutes by about three quarters"
status: current
owner: ma3u
updated: 2026-11-03
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/847
adr: ../../ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md
---

The repository runs about 23,400 job-minutes of GitHub Actions a week. 78% of
them run on pushes to `main`, after the PR already passed. The task boxes live
in [#847](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/847);
this file keeps the measurement and the reasoning.

## Measured 2026-11-03

1000 runs and 5472 jobs from 2026-10-28 08:04 UTC to 2026-11-03 09:34 UTC
(6.06 days), from `actions/runs` and `actions/runs/{id}/jobs`.

| Trigger                  | Job-min / week | Share |
| ------------------------ | -------------: | ----: |
| push (almost all `main`) |         18,118 |   78% |
| pull_request             |          4,604 |   20% |
| workflow_dispatch        |            365 |    2% |
| schedule                 |            251 |    1% |

| Workflow                       | Runs | Job-min / week |
| ------------------------------ | ---: | -------------: |
| Test Suite                     |  198 |         13,150 |
| Protocol Compliance            |   56 |          2,670 |
| Deploy Next.js to GitHub Pages |   91 |          2,160 |
| CodeQL (Swift), macOS          |   17 |          1,750 |
| Deploy to Azure Container Apps |   90 |          1,230 |
| CodeQL (JS, Python, Actions)   |  229 |            990 |
| Demo Smoke                     |   75 |            655 |
| Security Scan                  |   23 |            360 |
| PR Gate (only required check)  |  141 |            250 |

A Test Suite run costs 19 job-min on a PR and 115 on a push to `main`.

## Four findings that shape the plan

1. **The repository is public.** GitHub documents standard hosted runners,
   macOS included, as free for public repositories, and the run timing
   endpoint reports 0 billable ms for every run checked. To be confirmed on
   the billing page. If confirmed, what is scarce is not minutes but 20
   concurrent jobs, 5 concurrent macOS jobs, the 10 GB cache and time to
   feedback (queue p99 13.3 min on Linux).
2. **The biggest job cannot fail.** `test.yml` `e2e-tests` takes 96 min:
   1240 tests, 1 worker, no Neo4j, 305 failures each retried twice, every
   step `continue-on-error`. The Pages `tests` job runs the same suite with a
   seeded Neo4j and 4 workers in 14.7 min.
3. **macOS runs without a result.** CodeQL Swift is cancelled at its 90 min
   timeout on every run (#765), and iOS Analyte Parity runs on every Test
   Suite run, including ones that touch no Swift.
4. **The cache is full.** 10.19 GB of 10 GB: CodeQL overlay databases 4.1 GB,
   Next.js caches 4.0 GB keyed on every source hash, Trivy 1.5 GB. The npm
   cache is left with 131 MB.

## What already runs on the developer side

`.pre-commit-config.yaml`: Prettier, shellcheck, hadolint, `tsc`, ESLint,
gitleaks, Semgrep, actionlint, API spec drift and shapes, docs facts, Bruno
coverage and strength. Pre-push: full Vitest with `--bail 1`, `npm audit` via
`scripts/check-npm-audit.py`, and CodeQL Swift (macOS only). PR Gate repeats
the pre-commit hooks on the changed files, so the Test Suite `lint` and
`secret-scan` jobs repeat the PR Gate.

## Changes, ordered by saving divided by risk

| PR  | Change                                                                  | Job-min / week saved | Risk                      |
| --- | ----------------------------------------------------------------------- | -------------------: | ------------------------- |
| 1   | Remove the no-backend E2E job (the Neo4j job already has WCAG, pentest) |                8,310 | low, it cannot fail today |
| 1   | CodeQL Swift on schedule and dispatch only until #765                   |          1,750 macOS | low, it produces nothing  |
| 1   | iOS Analyte Parity behind a job-level path filter, SwiftPM cache        |         ~1,150 macOS | low                       |
| 1   | `timeout-minutes` on every job, `concurrency` for PR runs               |                 ~100 | low                       |
| 2   | `nightly.yml`: Pages tests, Lighthouse, Compliance                      |               ~4,400 | medium, a day to notice   |
| 3   | Main push keeps Vitest only from the PR jobs                            |                 ~620 | low, nightly covers       |
| 3   | Demo Smoke without its push trigger (it races the deploy)               |                 ~600 | low, `e2e-azure` covers   |
| 3   | PR: drop duplicate lint and gitleaks, merge five scanner jobs into one  |                 ~370 | low                       |
| 4   | Cache hygiene, CodeQL `paths-ignore` for docs and iOS                   |                 ~250 | low                       |

Expected: from about 23,400 to about 6,200 job-min/week, macOS from about
3,030 to about 150.

## The nightly gate

`nightly.yml` starts with a job that compares `github.sha` with the head of
the last green run of the workflow on `main`. Same commit: every suite is
skipped. Any new commit: every suite runs; a manual run always runs them.
Per-suite path filters were left out (ADR-074): one run a day caps the cost,
and a second paths list per suite would drift.

```bash
last=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow nightly.yml \
  --branch main --status success --limit 1 --json headSha --jq '.[0].headSha // ""')
[ "$last" = "$GITHUB_SHA" ] && echo "no new commit since $last"
```

A red scheduled night opens the issue "Nightly suites failed" or comments on
it; the next green night closes it. Scheduled runs started up to six hours
late this week, so the cron uses an off-peak minute, not `:00`. The suites
run on ephemeral stacks only: Azure is stopped off hours
([ADR-053](../../ADRs/ADR-053-everything-stops-off-hours.md)). CVE and
`npm audit` scans keep their weekly run regardless of changes, since new
advisories arrive without a commit.

## Progress

- PR 1 merged 2026-11-03 in #848.
- PR 2 (`nightly.yml`, this ADR) in review.

## Nothing required is turned off

Ruleset `main` (id 24036169) requires one status check, `PR Gate`, with no
up-to-date requirement. None of the four PRs touches it. Vitest stays on
every PR and on every push to `main`, which guards against a squash merge that
differs from the tested head.

## Implementation notes

- `scripts/gen-docs-facts.py` reads `test.yml`, `compliance.yml`,
  `security-scan.yml`, `pr-gate.yml` and `deploy-azure.yml`; expect
  `docs-facts.json` to change with each PR.
- `scripts/check-workflow-paths.py` checks the paths filters of
  `compliance.yml`, `demo-smoke.yml` and three more; `nightly.yml` belongs in
  its list.

## Found on the way, outside this plan

- Protocol Compliance has failed on every push to `main` since 2026-11-01.
- 305 E2E tests fail without a backend; after PR 1 only the nightly run with
  Neo4j shows E2E results.

Raw measurement: `runs.tsv` and `jobs.tsv` were kept outside the repository;
re-measure with the command in #847 one week after PR 3.
