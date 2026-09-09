# ADR-031: Every automated check must assert its outcome and exit non-zero on failure

**Status:** Proposed
**Date:** 2026-09-09
**Relates to:** [ADR-026](ADR-026-token-efficient-planning-structure.md), [ADR-029](ADR-029-dependency-version-pinning.md)
**Tracks:** [#115](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/115), [#116](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/116), [#169](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/169), [#170](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/170)

## Context

Four separate defects found in the same week were the same defect: an automated
step that ran, produced output, and reported success without asserting anything
about what it had produced.

| Where | What ran                                      | What was never asserted                                                                                                                                                                                                                |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #115  | Post-reset smoke specs                        | That the API calls were authenticated. Every protected route returned 401; `apiGet` asserted `expect(response.ok()).toBe(true)`, so two months of logs said "expected true, received false" and never once printed `401 Unauthorized`. |
| #116  | `deployed-image-scan`                         | That the images it resolved were pinned. It read the live ACA image list on every run and asserted nothing on it, while 8 of 15 apps ran `:latest` frozen on an April digest.                                                          |
| #169  | `seed-contract-negotiation.sh`                | That catalog discovery returned anything. A correct guard existed but was fed `"0\n0"` by `grep -c '\|' \|\| echo 0`, so `[ "0\n0" -eq 0 ]` errored and evaluated false.                                                               |
| #170  | `catalog-crawler` / `catalog-enricher` suites | Anything at all — no workflow runs them. Their only workflows deploy on push to `main`.                                                                                                                                                |

The costs were not theoretical. #115 made a real outage indistinguishable from
the standing failure: on 2026-09-07 the `edcv` realm went missing and every login
broke, the smoke job went red, and there was no way to separate that from the red
it had shown every week since 2026-07-17. #169's swallowed guard concealed an EDC
schema defect — `edc_contract_agreement` missing the `claims` column — that
terminates every contract negotiation and has been making the DSP TCK rows
_skip_ rather than pass. #170 meant four dependency PRs merged and redeployed two
production services on no automated signal at all.

A check that cannot fail is worse than no check. No check is an obvious gap; a
green check that asserts nothing is an actively misleading claim of coverage,
and it is trusted precisely when it should not be.

## Decision

Every automated check — CI job, seed script, scan, pre-commit hook, test helper
— must satisfy all four:

1. **Assert on the result, not on the mechanism.** Resolving a list, receiving a
   response, or completing a run is not evidence. State the property in the
   assertion.
2. **Exit non-zero when the property does not hold.** A failure that only prints
   is not a failure.
3. **Report enough to diagnose.** Include the status, the value, and the input.
   `expected true, received false` is not a diagnosis; `GET /api/catalog → 401
Unauthorized` is.
4. **Distinguish "cannot run" from "ran and passed."** A skip is a third
   outcome. Skipping on an auth error, a missing binary, or an unreachable
   service converts a broken test into a permanently green one — the same
   failure in a nicer colour.

Two consequences worth stating explicitly, because both were violated above:

- **A guard must be exercised at least once against the failing condition.**
  #169's guard was written correctly and had never once run. Prove the check
  fails before trusting that it passes.
- **A shell check must not swallow errors.** `set -euo pipefail`, and be
  deliberate about `|| true` / `|| echo` — `grep -c` already prints a count and
  exits 1 only because the count is zero, so `|| echo 0` corrupts the value it
  appears to protect.

## Consequences

**Easier.** A green run becomes evidence. The weekly reset can be trusted to
mean the environment works, which is the whole reason it exists. Real
regressions surface as new failures rather than being absorbed into standing
noise.

**Harder.** Checks that currently pass will start failing, and some of those
failures are real and old — the EDC schema defect behind #169 has probably been
there since the connector image was bumped in #97 Phase B. Adopting this means
budgeting for the backlog it exposes, not just the code change.

**New constraint.** A check that cannot yet assert its property should be
**skipped loudly with a reason**, or not written. It must not be left in a shape
where it can only pass. If an assertion turns out to be untestable — as three of
the #5 VC items are, with no endpoint accepting a crafted credential — retire it
with the reason rather than carrying it unticked.

## Alternatives considered

**Fix the four and move on.** Rejected: they were found in one week by looking,
not by anything systematic, so the base rate is unknown and probably higher. The
fifth instance would arrive the same way.

**Require test coverage thresholds.** Rejected: coverage measures which lines
executed, not whether anything was asserted about them. Every one of the four
above executed fine.

**A lint rule banning `|| true` in scripts.** Rejected as too narrow — it would
have caught #169 and none of the others. The common cause is the missing
assertion, not any single shell idiom.
