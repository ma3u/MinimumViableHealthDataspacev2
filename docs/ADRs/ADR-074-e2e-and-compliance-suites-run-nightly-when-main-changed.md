# ADR-074: E2E, compliance and performance suites run nightly when main changed, not on every push

Date: 2026-11-03

**Status:** Accepted (2026-11-03)
**Relates to:** [ADR-053](ADR-053-everything-stops-off-hours.md)
**Tracks:** [#847](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/847), [#765](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/765)

## Status

Accepted with the pull request that adds `.github/workflows/nightly.yml`.
The plan and the measurement are in
`docs/planning/current/issue-847-ci-minutes.md`.

## Context

Measured from 1000 runs between 2026-10-28 and 2026-11-03, the repository
ran about 23,400 job-minutes of GitHub Actions a week, 78% of them on pushes
to `main` after the PR already passed. The repository is public and on the
free plan, so the scarce resources are 20 concurrent jobs, 5 concurrent macOS
jobs, the 10 GB cache (full at 10.19 GB) and the time until a change gets
feedback.

Three suites ran on every push to `main` (about 15 a day) and decided
nothing at that moment:

- The Pages `tests` job: Vitest coverage and the Playwright suite with a
  seeded Neo4j, WCAG 2.2 AA and the OWASP/BSI checks, 14.7 min, every step
  `continue-on-error`. Its output is the `pages-test-reports` artifact, which
  the site job already took from the latest finished run, not its own.
- Lighthouse in `test.yml`, about 6 min.
- Protocol Compliance: four jobs that each boot the JAD stack, about 45
  job-min per run. It had failed on every push since 2026-11-01 without
  blocking anything.

Only `PR Gate` is a required status check (ruleset `main`). A fourth suite,
an E2E copy without Neo4j in `test.yml`, was removed outright in #848: it
could not fail.

## Decision

1. The E2E suite (with the WCAG 2.2 AA and pentest specs), Lighthouse and
   Protocol Compliance run in one scheduled workflow, `nightly.yml`, once a
   day and on `workflow_dispatch`, not on push to `main`.
2. A scheduled run skips every suite when `main` is still at the commit of
   the last green run of `nightly.yml`. One commit of any kind is enough to
   run them all; a manual run always runs them. A red night is therefore
   repeated the next night even without a new commit, until it is green.
3. `compliance.yml` becomes a reusable workflow (`workflow_call`) that
   `nightly.yml` calls; it keeps `workflow_dispatch` for a run against the
   local stack or the Azure demo. Its push trigger, its paths filter and its
   weekly schedule go. Its four jobs keep their own stacks; folding them into
   one boot is a later change, the saving is in running once a day.
4. The E2E reports reach the GitHub Pages site as before: the site job takes
   the newest `pages-test-reports` artifact of `main`, now the nightly's.
5. A failing scheduled night opens an issue titled "Nightly suites failed",
   or comments on the open one; the next green night closes it.
6. CVE and `npm audit` scans keep their weekly schedule regardless of
   changes, since advisories arrive without a commit.
7. `PR Gate` stays the only required check; Vitest stays on every PR and
   every push to `main`.
8. Nightly suites run on ephemeral stacks only, never against Azure, which is
   stopped at night (ADR-053).

## Consequences

- About 4,400 job-minutes a week fewer, on top of the 11,000 of #848.
- A regression that only E2E, Lighthouse or compliance catches is found up to
  a day after the merge, not minutes after. The merge was never blocked by
  these suites, so no protection is lost, only speed of notice; the issue
  makes the notice reach someone.
- The test reports on GitHub Pages are at most a day old.
- GitHub starts scheduled runs late, by hours on busy days, and once dropped
  them for a day (2026-10-06, ADR-058). A missed night delays notice by
  another day; a manual run of `nightly.yml` is the remedy.
- Developers who want E2E before merging run `npm run test:e2e` against the
  compose stack locally.

## Alternatives considered

- **Keep per-push runs and only cache harder.** Caching cuts setup, not the
  suites themselves, and the suites are most of the cost.
- **Skip each suite separately by the paths it depends on.** Saves a few runs
  on days with only documentation changes, at the cost of a second paths list
  per suite that drifts, which is what `scripts/check-workflow-paths.py` was
  written against. One run a day caps the cost anyway.
- **Shard Playwright across runners.** Each shard pays the build and the
  Neo4j seed again, about 4 min, and the suite with Neo4j already finishes in
  under 15 min on 4 workers.
- **Run E2E on every PR as a required check.** It needs Neo4j and the JAD
  stack to be meaningful and would make every PR wait 15 to 45 min; the
  local hooks and PR Gate cover the per-change risk.
- **A self-hosted runner.** Free minutes are not the constraint on a public
  repository, and a self-hosted runner on a public repository runs code from
  fork PRs.
