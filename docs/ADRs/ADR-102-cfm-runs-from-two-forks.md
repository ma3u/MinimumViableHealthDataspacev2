# ADR-102: CFM runs from two forks, cfm and cfm-dataspace

Date: 2026-11-28

**Status:** Accepted (2026-11-28, Matthias Buchhorn; proposed the same day). Runs on the compose stack from both forks' `v0.1.0-mvhd.1`; Azure follows with task 9 of #1285.
**Supersedes:** [ADR-088](ADR-088-cfm-runs-from-our-fork-until-upstream-takes-the-patches.md) decision 1 (one fork, one integration tag) and decision 4 (CI builds one fork). ADR-088 decisions 2, 3, 5, 6 and 7 stay in force for both forks.
**Relates to:** [ADR-085](ADR-085-cfm-stays-as-eclipse-cfm-releases.md), [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md)
**Tracks:** [#1285](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1285), [#973](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973)

## Context

ADR-088 runs CFM from one fork, `ma3u/cfm`, with six patches on an
eclipse-cfm release tag. eclipse-cfm v0.1.0 (2026-11-24) moved the Tenant
Manager and every agent out of eclipse-cfm/cfm into a new repository,
eclipse-cfm/cfm-dataspace
([eclipse-cfm/cfm#257](https://github.com/eclipse-cfm/cfm/pull/257)).
eclipse-cfm/cfm keeps the engine (`common/`, the Provision Manager);
cfm-dataspace imports it as a Go module.

None of the six patches is covered by v0.1.0 (drop-check in #1285). Five
patch only code that now lives in cfm-dataspace. The token exchange patch
is split: the token provider is in cfm, the launchers that pass it its
configuration are in cfm-dataspace.

## Decision

1. **Two forks:**

   - [ma3u/cfm](https://github.com/ma3u/cfm), the token provider half of patch a;
   - [ma3u/cfm-dataspace](https://github.com/ma3u/cfm-dataspace), all six
     patches, the launcher half of patch a included.

   Each fork has its own `fix/*` branches, its own `mvhd/integration` and
   its own integration tag.

2. **One version.** Both tags are named `<release>-mvhd.<n>` and move
   together, so the eight images share one version.

   - cfm-dataspace's integration branch carries one commit of ours beyond the
     patches: `replace github.com/eclipse-cfm/cfm => github.com/ma3u/cfm <tag>`.
   - The cfm tag is therefore cut and pushed first.

3. **The images come from the fork that holds their code:**

   - pmanager from ma3u/cfm;
   - tmanager and the six agents from ma3u/cfm-dataspace.

   `.github/upstream.json` has one entry per upstream repository, each with a
   `fork` block that lists its images.
   [`scripts/build-cfm-fork-images.sh`](../../scripts/build-cfm-fork-images.sh)
   and [`scripts/azure/20-cfm-fork.sh`](../../scripts/azure/20-cfm-fork.sh)
   read the forks from there.

4. **CI checks every fork.** [`cfm-fork.yml`](../../.github/workflows/cfm-fork.yml)
   runs one matrix entry per fork block:

   - the fork's Go tests at its tag;
   - upstream main merged into its tag.

   A third job builds the eight images from both tags.

## Consequences

- A release of either upstream repository starts the routine of
  [runbook cfm-fork](../knowledge/runbooks/cfm-fork.md). The weekly upstream
  watch covers both repositories.
- A database created by v0.0.x needs one column added by hand before
  v0.1.0's Provision Manager can read its definitions
  (`orchestration_definitions.compensation_type`; runbook cfm-fork). It is an
  upstream gap, to be reported with the other findings once the ECA allows.
- A change to patch a touches both forks and needs the cfm tag before the
  cfm-dataspace one can be built.
- When upstream takes patch a's token provider half, the `replace` goes and
  ma3u/cfm can be archived, while cfm-dataspace stays a fork for as long as
  it carries patches (ADR-088 decision 7 per fork).

## Alternatives considered

- **Stay on v0.0.9-mvhd.2.** Every eclipse-cfm change from here lands in the
  new layout, so the rebase only gets harder; the "Patches on upstream main"
  check would stay red.
- **Vendor cfm into the cfm-dataspace fork.** One repository, but the
  engine's tests and upstream's history no longer apply to it, and the token
  provider patch could not go upstream as a branch.
