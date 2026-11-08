# ADR-079: E2E runs on the pull requests that can break it, and a failure is red

Date: 2026-11-07

**Status:** Proposed
**Supersedes:** decision 1 of [ADR-074](ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md) for the Playwright suite, and its rejected alternatives "Shard Playwright across runners" and "Run E2E on every PR"
**Relates to:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), [ADR-053](ADR-053-everything-stops-off-hours.md)
**Tracks:** [#951](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/951), [#847](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/847)

## Status

Proposed with the pull request that adds `.github/workflows/e2e.yml`.

## Context

On 2026-11-07 the Playwright report published at `/e2e-report/` showed 15
failures from a run on 2026-04-03. It was not a CI report: a laptop run
committed into `ui/public/e2e-report/` and never replaced. The CI report was
at `/ci-e2e-report/`, and it showed the last of three Playwright steps, the
40 security tests, all green.

The nightly run of that day (run 42350606873, commit ba42e850) reported
success. Its Playwright step had 293 failures, 564 skipped tests and 386
passes, and the WCAG step 11 more failures. Every Playwright step had
`continue-on-error`, so the job was green and the "Nightly suites failed"
issue of ADR-074 never opened. The failures had built up over weeks:

- **No session.** Since ADR-044 (2026-10-02) every API route needs a session.
  88 tests called them without one.
- **No Keycloak in CI.** Every spec that signs in calls `loginAs()`, which
  needs Keycloak; the nightly has none, so those specs skipped. 564 tests,
  half the suite, never ran in CI.
- **A thin graph and no proxy.** The nightly loaded `init-schema` and the
  synthetic data, 123 nodes. Credentials, trust centres, persona overviews
  and jurisdictions are in the other seeds of `neo4j/seed.sh`, so the
  journeys that read them found nothing; and without the neo4j-proxy the
  NLQ, the audit trail and the JSON-LD catalogue answered 502.
- **UI changes without the tests.** Pages changed on purpose (the graph
  legend, the user guide's sections, the theme palette, the negotiate and
  transfer pages of #876) and no pull request ran the specs that cover them.

ADR-074 accepted "found up to a day after the merge" for E2E. In practice it
was never found, because the night could not be red and because the
pull request that changed a page never ran the journeys of that page.

## Decision

1. **A failing E2E is red.** No Playwright step has `continue-on-error`. The
   nightly runs every spec once, with `--retries=1` (a test that passes on
   the retry is reported flaky, not failed), and a failure fails the job, so
   the issue of ADR-074 decision 5 opens.
2. **Pull requests run the specs they can break** (`.github/workflows/e2e.yml`).
   `scripts/select-e2e-specs.sh` reads the diff: a changed spec, or a route
   under `ui/src/app/<route>/` whose path a spec visits, selects those specs;
   shared code (lib, components, messages, config, E2E helpers) selects every
   spec, split over three runners; a change that no spec exercises starts
   nothing. Drafts run nothing until they are ready for review. It is not a
   required check until it has been green on ten pull requests in a row.
3. **CI signs in without Keycloak.** With `E2E_FORGED_SESSIONS=1`, `loginAs()`
   puts a forged NextAuth session of the realm user on the browser, with the
   user's realm roles, as the API collection already does
   (`scripts/forge-bruno-session.mjs`). The Keycloak sign-in and sign-out
   themselves are tested where a Keycloak answers
   (`skipIfKeycloakDown({ realKeycloak: true })`): locally and in Demo Smoke.
4. **CI tests the demo graph through the proxy.** Both workflows seed with
   `neo4j/seed.sh`, the runner that seeds Azure, with APOC (`SEED_DIR` points
   it at `neo4j/`), and start the neo4j-proxy: the NLQ, the DSP audit trail
   and the JSON-LD catalogue answer through it. There is no EDC connector and
   no Postgres task store; the journeys that need one skip and say so
   (`apiGetTasksOrSkip`, `apiGetPoliciesOrSkip`), as the testing rules ask.
5. **The site shows the night's report.** `/e2e-report/` is the nightly's
   Playwright report; the committed snapshot is deleted (22 MB that also
   went into every UI image).
6. **The static demo is tested as published.** The nightly runs spec 19
   against GitHub Pages, without a build or a database.
7. **Locally, the same run.** `scripts/run-e2e-local.sh` starts a throwaway
   Neo4j with the demo graph, builds the UI and runs Playwright as CI does;
   `--changed` runs the selection of decision 2. It is the check to run
   before pushing a UI change.

## Consequences

- A pull request that changes a page learns which journeys it breaks before
  it merges, in about ten minutes, without waiting for a night.
- About two thirds of UI pull requests change shared code and run every
  spec; measured on the last 40 commits to main: 25 every spec, 12 none,
  3 between 9 and 17 specs. On a public repository the minutes are free; the
  three shards take three of the 20 concurrent jobs while they run.
- The 564 tests that skipped in CI now run. A regression in what a signed-in
  persona sees is caught in CI, not by a person in the demo.
- A forged session does not test Keycloak. That stays with Demo Smoke and
  local runs, as decision 3 says.
- The nightly is red until the suite is green, and then on every regression.

## Alternatives considered

- **Keep E2E nightly only and remove `continue-on-error`.** Makes the night
  red, but still a day after the merge and for the whole team of one, who
  then fixes someone else's change.
- **Run every spec on every pull request.** Simpler, and the selection buys
  little when shared code changed; but a third of pull requests need no or
  few specs, and those return in minutes instead of ten.
- **Map every component and library file to the pages that import it.**
  Narrower selections, at the cost of an import graph that is easy to get
  wrong; a selection too narrow is the failure this ADR is about.
- **Start Keycloak in CI.** Tests the real sign-in, at the cost of a realm
  import and a minute per runner, and still not the deployment's Keycloak,
  which Demo Smoke checks.
