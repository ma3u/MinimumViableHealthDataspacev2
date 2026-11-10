---
type: runbook
title: Keeping the CFM fork in step with eclipse-cfm
description: Where the hub's fork of eclipse-cfm/cfm lives, how its main stays in sync, and what to do on a new upstream release: drop-check, rebase, re-tag, rebuild, re-check.
resource: issue #973, ADR-085, docs/planning/current/issue-973-cfm-0-0-7-spike.md (round 4)
tags: [runbook, cfm, upstream, fork]
status: draft
---

# Runbook: keeping the CFM fork in step with eclipse-cfm (#973)

The hub's `cfm` compose profile runs [eclipse-cfm/cfm](https://github.com/eclipse-cfm/cfm)
with six fixes that make it work on EDC 1.0 runtimes outside Kubernetes
([ADR-085](../../ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md); the
fixes, why each is needed and how they were measured:
[spike note, round 4](../../planning/current/issue-973-cfm-0-0-7-spike.md)).
They live in Matthias's fork, `ma3u/cfm`. The fork must not drift: each patch
stays a small branch on an upstream release tag, and a patch upstream makes
unnecessary is dropped.

## What is where

| Thing             | Where                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The fork          | `ma3u/cfm`, a GitHub fork of eclipse-cfm/cfm (to be created; until then the clone below)                                        |
| Local clone       | `../cfm` next to this repository, remote `upstream` = eclipse-cfm/cfm, `origin` = the fork                                      |
| Patches           | one `fix/*` branch each on the base tag, with Go tests, listed in `.github/upstream.json` (`fork.patches`)                      |
| Integration       | `mvhd/integration`: the base tag with every patch merged, tagged `<base>-mvhd.<n>` (`fork.tag`)                                 |
| Images            | `mvhd/cfm-<name>:<base without v>-mvhd.<n>`, built by `scripts/build-cfm-fork-images.sh` from the tag, labelled with its commit |
| What the hub runs | the image tags in `docker-compose.jad.yml`, profile `cfm`                                                                       |

`<n>` counts changes to the patches on one base: `v0.0.7-mvhd.1`, `.2`, and
on the next release `v0.0.8-mvhd.1`. A tag is never moved; a new one is made.

## Rules

- Commits in the fork are Matthias's: `git config user.email
matthias.buchhorn@web.de` in the clone (his ECA), conventional commit
  messages as upstream uses them, no assistant co-author or "Generated with"
  line, so a branch can go upstream unchanged.
- Nothing is posted to eclipse-cfm (issue, pull request, discussion)
  without Matthias's go.
- The fork's `main` carries no commit of ours. It only ever fast-forwards to
  upstream's `main`; the patches are on `fix/*` branches.

## Every week: the upstream watch

`.github/workflows/upstream-watch.yml` runs `scripts/check-upstream-releases.py`
on Mondays. For eclipse-cfm/cfm it prints a `fork:` line: how far the fork's
`main` is behind upstream's, whether the fork's base is still `known`, and how
many patches are on which tag. When the fork's main is behind:

```bash
gh repo sync ma3u/cfm --branch main
```

(or "Sync fork" on the fork's page). That fast-forwards `main` only and
touches no other branch.

## On a new upstream release

The watch opens "Upstream release: eclipse-cfm/cfm vX" with this routine as
tasks. With `OLD` the current base (`fork.base`) and `NEW` the release:

1. **Sync and fetch.**
   ```bash
   gh repo sync ma3u/cfm --branch main
   cd ../cfm && git fetch upstream --tags && git fetch origin
   ```
2. **Drop-check, per patch.** Read the release notes and what changed in the
   files the patch touches (`fork.patches[].drop_when` says what upstream would
   have to do):
   ```bash
   git log --oneline "$OLD..$NEW" -- common/tokenexchange agent tmanager/core
   ```
   A patch upstream now covers is dropped: no longer merged, the branch kept
   as history, and the drop said in the spike note and in #973. A rebase that
   leaves a branch empty is the same signal.
3. **Rebase the remaining patches** onto the release, and test each:
   ```bash
   git switch fix/<name>
   git rebase --onto "$NEW" "$OLD"
   go test -short $(go list ./... | grep -v /sqlstore)
   ```
   The `sqlstore` packages start Postgres through Testcontainers; run them
   when Docker is free. Push a rebased patch branch with
   `git push --force-with-lease origin fix/<name>`: these branches are ours
   and their old state stays reachable through the previous tag.
4. **Integrate and tag.**
   ```bash
   git switch -C mvhd/integration "$NEW"
   git merge --no-ff fix/<name>        # each remaining patch
   go test -short $(go list ./... | grep -v /sqlstore)
   git tag -a "$NEW-mvhd.1" -m "<release> with <patches>"
   git push --force-with-lease origin mvhd/integration && git push origin "$NEW-mvhd.1"
   ```
   Patches that touch the same file conflict only in its copyright header's
   contributor line; keep both descriptions on one line.
5. **Rebuild and switch the hub** (a branch and pull request here):
   ```bash
   CFM_REF="$NEW-mvhd.1" scripts/build-cfm-fork-images.sh
   ```
   Move the image tags in `docker-compose.jad.yml` (profile `cfm`), and in
   `.github/upstream.json` move `known`, `fork.base`, `fork.tag` and the patch
   list.
6. **Re-check locally**, beside the compose stack:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.jad.yml --profile cfm up -d
   ./scripts/seed-cfm.sh && ./scripts/check-cfm-onboarding.sh   # 12 passed, 0 failed
   ./scripts/run-ehds-identity-checks.sh && ./scripts/run-ehds-dataspace-checks.sh && ./scripts/run-ehds-tests.sh
   ```
   The suites at their 1.0 floors. The spike note's round 4 says how the
   stack was shared and reset; leave it as you found it.

## When upstream fixes everything

When the drop-check has dropped every patch, the profile goes back to
eclipse-cfm's own release images (`ghcr.io/eclipse-cfm/cfm/<name>:<tag>`,
pinned by digest), the `fork` block leaves `.github/upstream.json`, and the
fork can be archived.
