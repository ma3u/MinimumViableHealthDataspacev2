# ADR-075: A minor release every month, starting with v2.1.0

Date: 2026-11-04

**Status:** Accepted (2026-11-04)
**Relates to:** [ADR-074](ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md)
**Tracks:** [#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839)

## Context

The hub's version is the `version` in `ui/package.json`. When a merge to
`main` changes it, `.github/workflows/release.yml` tags `vX.Y.Z`, writes the
release notes from the commit log since the previous tag and publishes a
GitHub Release. The mechanism works; nothing decides when to use it.

- Eleven tags, v1.0.0 (2026-03-30) to v2.0.0 (2026-09-29). Between v2.0.0 and
  2026-11-04, about 350 commits reached `main` without a release.
- v1.4.3 is a tag without a release.
- `main` is what runs live (every push deploys to Azure Container Apps and
  GitHub Pages), so a release has never marked a deployment. It marks a point
  a reader can cite: "the hub as of v2.1.0", a changelog to read, a tag to
  check out.
- With no cadence, a partner who wants to know what changed reads 350 commit
  subjects or nothing.

The iPhone app is versioned apart (`clients/ios/project.yml`, a build number
per TestFlight upload) and is not affected.

## Decision

1. **A minor release on the first working day of each month**, v2.1.0 on
   2026-11-04, then v2.2.0 in December and so on. It is cut even when the
   month was quiet: the point is that a reader can rely on the rhythm.
2. **A patch release in between** (v2.1.1) only for a fix a partner needs
   before the next month: a broken flow on the live hub, a security fix.
3. **A major release** (v3.0.0) when something a partner integrates against
   breaks: an API route removed or changed in shape, the graph model changed
   so that existing Cypher no longer runs, a protocol version dropped. It can
   fall on the monthly date or not.
4. **The release is a pull request**, `chore(release): vX.Y.Z`, which changes:

   - `version` in `ui/package.json` and the root entries of `ui/package-lock.json`;
   - the release list of the developer guide (`ui/src/app/docs/developer/page.tsx`),
     with a one-line highlight in all five languages.

   On merge, `release.yml` tags and publishes the notes from the commit log.
   The maintainer may put a short hand-written summary above the generated
   list in the GitHub Release afterwards, as v2.0.0 has.

5. The SDLC (`docs/SDLC.md`, section 8) describes the rhythm.

## Consequences

- A release always exists that is at most a month old, and its notes list at
  most a month of commits.
- The work per release is one small PR: the version, the lockfile, one line
  of highlights in five languages.
- The developer guide's release list grows by one entry a month; older entries
  stay, so the page keeps the history a reader can follow.
- Nothing changes about deploying: `main` is still what runs live.

## Alternatives considered

- **Release per milestone.** Clear when a milestone lands, but the last
  release would again be months old between milestones, which is the state
  this ADR ends.
- **`main` is the release, no cadence.** Honest about deployment, but leaves
  partners without a citable version or a readable changelog.
- **release-please or semantic-release.** They would open the release PR and
  choose the bump from Conventional Commits automatically. Worth adopting
  once the commit convention is enforced by a hook (SDLC section 11); until
  then a person decides the bump.
