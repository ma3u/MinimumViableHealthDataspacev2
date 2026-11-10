#!/usr/bin/env python3
"""Report the upstream releases the hub has not taken in yet.

Dependabot reads npm, pip, Gradle, Dockerfiles and compose files. It cannot see
a specification (DSP, DCP, Data Plane Signaling), a TCK the hub runs, or a
component it builds from source (CFM). Until 2026-11-08 nothing watched those:
the hub said "DSP 2025-1" while two errata had been published, and CFM moved to
eclipse-cfm with a release a week while the local stack ran March images.

`.github/upstream.json` lists each repository with `known`, the newest release
this repo has taken into account. This asks GitHub for each repository's
releases and reports the ones published after `known`.

    scripts/check-upstream-releases.py                 # report, exit 1 if any
    scripts/check-upstream-releases.py --json
    scripts/check-upstream-releases.py --open-issues   # one issue per new release

With --open-issues it opens an issue "Upstream release: <repo> <tag>" for the
newest release of each repository, unless one with that title exists (open or
closed), and exits 0.

An entry with a `fork` block (eclipse-cfm/cfm, ADR-085) is a component the hub
builds from its own fork with patches. For it the report also says how far the
fork's main is behind upstream's main and whether the fork's base tag is still
`known`, and the issue for a new release lists the fork routine: sync, a
drop-check per patch, rebase, re-tag, rebuild, re-check (`fork.runbook`). A
fork that does not exist yet is reported, not counted as an error. Exit 2 when a repository could not be asked or its `known`
release is not among its releases: unknown is not the same as up to date.
Needs `gh`, signed in locally or GH_TOKEN in a workflow.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / ".github" / "upstream.json"
THIS_REPO = "ma3u/MinimumViableHealthDataspacev2"
LABELS = ["dependencies", "upstream"]


def gh(*args: str) -> str:
    return subprocess.run(
        ["gh", *args], check=True, capture_output=True, text=True
    ).stdout


def releases(repo: str) -> list[dict]:
    """The repository's published releases, newest first."""
    rows = json.loads(gh("api", f"repos/{repo}/releases?per_page=50"))
    rows = [r for r in rows if not r["draft"] and r["published_at"]]
    return sorted(rows, key=lambda r: r["published_at"], reverse=True)


def newer(entry: dict, rows: list[dict]) -> list[dict]:
    """The releases published after `known`, newest first."""
    known = next((r for r in rows if r["tag_name"] == entry["known"]), None)
    if known is None:
        raise LookupError(
            f"{entry['repo']} has no release {entry['known']} among its last {len(rows)}"
        )
    return [
        r
        for r in rows
        if r["published_at"] > known["published_at"]
        and (entry.get("prerelease") or not r["prerelease"])
    ]


def fork_status(entry: dict) -> str:
    """How the fork stands against upstream: main behind, base tag against `known`."""
    fork = entry["fork"]
    owner = fork["repo"].split("/")[0]
    notes = []
    if fork["base"] != entry["known"]:
        notes.append(f"base {fork['base']} is not known {entry['known']}: rebase pending")
    try:
        cmp = json.loads(gh("api", f"repos/{entry['repo']}/compare/main...{owner}:main"))
        behind = cmp.get("behind_by", 0)
        notes.append(
            f"{fork['repo']} main {behind} behind upstream main" if behind
            else f"{fork['repo']} main in sync"
        )
    except subprocess.CalledProcessError:
        notes.append(f"{fork['repo']} not found: create it as a fork of {entry['repo']}")
    notes.append(f"{len(fork['patches'])} patch(es) on {fork['tag']}")
    return "; ".join(notes)


def fork_tasks(entry: dict, tag: str) -> list[str]:
    """The fork routine for a new upstream release, as tasks."""
    fork = entry["fork"]
    version = tag.lstrip("v")
    lines = [
        "",
        f"## The fork ({fork['repo']}, [runbook](https://github.com/{THIS_REPO}/blob/main/{fork['runbook']}))",
        "",
        f"The hub runs {entry['repo']} {fork['base']} with {len(fork['patches'])} patch(es) "
        f"from `{fork['integration']}`, tagged `{fork['tag']}`.",
        "",
        f"- [ ] Sync the fork's main: `gh repo sync {fork['repo']} --branch main`.",
        f"- [ ] Drop-check: for each patch, does {tag} fix it upstream? Then drop the branch and say so in #{entry['issue']}.",
    ]
    lines += [
        f"  - [ ] `{p['branch']}` ({p['fix']}, #{p['issue']}): drop when {p['drop_when']}."
        for p in fork["patches"]
    ]
    lines += [
        f"- [ ] Rebase the remaining patches onto {tag}, merge them into a new `{fork['integration']}` from {tag}, "
        f"tag `{tag}-mvhd.1`, push branches and tag to {fork['repo']}.",
        f"- [ ] `CFM_REF={tag}-mvhd.1 scripts/build-cfm-fork-images.sh`, and move the image tags in "
        f"`docker-compose.jad.yml` to `{version}-mvhd.1`.",
        "- [ ] Re-check locally: `./scripts/seed-cfm.sh && ./scripts/check-cfm-onboarding.sh` (12 passed), "
        "and the identity, dataspace and health domain suites at their floors.",
        f"- [ ] Move `fork.base`, `fork.tag` and the patch list in `.github/upstream.json` with `known`.",
    ]
    return lines


def title(repo: str, tag: str) -> str:
    return f"Upstream release: {repo} {tag}"


def issue_exists(text: str) -> bool:
    rows = json.loads(
        gh(
            "issue", "list", "-R", THIS_REPO, "--state", "all",
            "--search", f'"{text}" in:title', "--json", "title", "--limit", "20",
        )
    )
    return any(r["title"] == text for r in rows)


def body(entry: dict, new: list[dict]) -> str:
    top = new[0]
    kind = " (pre-release)" if top["prerelease"] else ""
    lines = [
        f"{entry['repo']} published [{top['tag_name']}]({top['html_url']}) "
        f"on {top['published_at'][:10]}{kind}. The hub knows {entry['known']}, "
        f"used in `{entry['where']}`.",
    ]
    if len(new) > 1:
        lines += ["", f"Also published since {entry['known']}:"]
        lines += [
            f"- [{r['tag_name']}]({r['html_url']}) ({r['published_at'][:10]})"
            for r in new[1:]
        ]
    lines += [
        "",
        "## Open tasks",
        "",
        f"- [ ] Read the release notes; note in #{entry['issue']} what reaches the hub.",
        f"- [ ] Take it in under #{entry['issue']}, or decide not to and say why there.",
        f"- [ ] Move `known` for {entry['repo']} in `.github/upstream.json` to "
        f"`{top['tag_name']}`, so the next run stops reporting it.",
    ]
    if "fork" in entry:
        lines += fork_tasks(entry, top["tag_name"])
    lines += [
        "",
        "Opened by the weekly upstream watch (`scripts/check-upstream-releases.py`, "
        "`.github/workflows/upstream-watch.yml`).",
    ]
    return "\n".join(lines) + "\n"


def open_issue(entry: dict, new: list[dict]) -> str:
    text = title(entry["repo"], new[0]["tag_name"])
    if issue_exists(text):
        return "issue exists"
    args = ["issue", "create", "-R", THIS_REPO, "--title", text, "--body", body(entry, new)]
    for label in LABELS:
        args += ["--label", label]
    return gh(*args).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--open-issues", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    entries = json.loads(MANIFEST.read_text())["repos"]
    report, errors, behind = [], 0, 0
    for entry in entries:
        row = {"repo": entry["repo"], "known": entry["known"], "issue": entry["issue"]}
        try:
            new = newer(entry, releases(entry["repo"]))
        except (subprocess.CalledProcessError, LookupError) as e:
            detail = e.stderr.strip() if isinstance(e, subprocess.CalledProcessError) else str(e)
            row.update(status="error", detail=detail)
            errors += 1
            report.append(row)
            continue
        row["newer"] = [r["tag_name"] for r in new]
        row["status"] = "behind" if new else "current"
        if "fork" in entry:
            row["fork"] = fork_status(entry)
        if new:
            behind += 1
            if args.open_issues:
                row["detail"] = open_issue(entry, new)
        report.append(row)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for r in report:
            extra = ", ".join(r.get("newer", [])) or r.get("detail", "")
            print(f"{r['status']:8} {r['repo']:52} known {r['known']:12} {extra}")
            if r.get("fork"):
                print(f"{'':8} {'fork:':52} {r['fork']}")
        print(f"{behind} behind, {errors} unknown, of {len(report)}")

    if errors:
        return 2
    return 1 if behind and not args.open_issues else 0


if __name__ == "__main__":
    sys.exit(main())
