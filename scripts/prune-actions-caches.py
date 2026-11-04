#!/usr/bin/env python3
"""Delete Actions caches that nothing will restore again (#847).

Why this exists
---------------
The repository's cache was full: 10.7 GB of a 10 GB limit on 2026-11-04, in
84 entries. When it is over the limit GitHub evicts the least recently used
entries, and among them were the npm caches every job restores, so jobs paid
for cold installs while the space went to entries no job would read again:

- 18 CodeQL overlay databases on main, 180 MB each, one per push. A pull
  request restores only the newest.
- 16 Next.js build caches of the Pages job and 6 of the nightly, one per
  change to `ui/src`. The build restores only the newest, by prefix.
- 3 Playwright browser caches, one per lockfile, and Trivy databases by date.
- Caches of pull requests that are already merged or closed. A cache saved on
  `refs/pull/N/merge` can only be restored by that pull request.

GitHub drops an entry only after seven days without access, so these stayed.

What it deletes
---------------
1. Every cache whose ref is a pull request that is no longer open.
2. For the rolling families below, every entry but the newest per ref and
   family. A family is the key without its hashes, run ids and dates, so
   `nextjs-site-<lock>-<src>` and a CodeQL database per commit each collapse
   to one family, while the CodeQL language and version stay in it.

npm caches are left alone: one key per lockfile is legitimate, several of
them are current at once, and all are read on every push.

Usage:
  ./scripts/prune-actions-caches.py            # list what would go
  ./scripts/prune-actions-caches.py --apply    # delete it

Needs `gh` with a token that may write Actions (GITHUB_TOKEN with
`actions: write` in a workflow). GITHUB_REPOSITORY picks the repository,
default the one `gh` sees in the current directory.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

ROLLING = ("codeql-overlay-base-database-", "nextjs-", "playwright-", "cache-trivy-")

# Hashes (sha1, sha256), run ids and dates, each with its leading dash.
VARIABLE_PART = re.compile(r"-(?:[0-9a-f]{40,}|[0-9]{8,}|[0-9]{4}-[0-9]{2}-[0-9]{2})(?=-|$)")
PR_REF = re.compile(r"^refs/pull/([0-9]+)/")


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def repo() -> str:
    return os.environ.get("GITHUB_REPOSITORY") or json.loads(
        gh("repo", "view", "--json", "nameWithOwner")
    )["nameWithOwner"]


def caches(name: str) -> list[dict]:
    out = gh("api", "--paginate", f"repos/{name}/actions/caches?per_page=100",
             "--jq", ".actions_caches[]")
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def open_prs(name: str) -> set[int]:
    out = gh("api", "--paginate", f"repos/{name}/pulls?state=open&per_page=100", "--jq", ".[].number")
    return {int(n) for n in out.split()}


def family(key: str) -> str:
    return VARIABLE_PART.sub("", key)


def select(entries: list[dict], open_numbers: set[int]) -> list[tuple[dict, str]]:
    doomed: list[tuple[dict, str]] = []
    newest: dict[tuple[str, str], dict] = {}
    for c in entries:
        pr = PR_REF.match(c["ref"])
        if pr and int(pr.group(1)) not in open_numbers:
            doomed.append((c, f"PR #{pr.group(1)} is closed"))
            continue
        if not c["key"].startswith(ROLLING):
            continue
        slot = (c["ref"], family(c["key"]))
        kept = newest.get(slot)
        if kept is None:
            newest[slot] = c
        elif c["created_at"] > kept["created_at"]:
            doomed.append((kept, "superseded"))
            newest[slot] = c
        else:
            doomed.append((c, "superseded"))
    return doomed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="delete, not only list")
    args = parser.parse_args()

    name = repo()
    entries = caches(name)
    doomed = select(entries, open_prs(name))

    mb = lambda cs: sum(c["size_in_bytes"] for c in cs) / 1048576  # noqa: E731
    for c, why in sorted(doomed, key=lambda d: (d[0]["ref"], d[0]["key"])):
        print(f"{c['size_in_bytes'] / 1048576:7.0f} MB  {c['ref']:<24} {c['key']}  ({why})")
        if args.apply:
            gh("api", "-X", "DELETE", f"repos/{name}/actions/caches/{c['id']}")
    gone = [c for c, _ in doomed]
    verb = "Deleted" if args.apply else "Would delete"
    print(f"{verb} {len(gone)} of {len(entries)} caches, {mb(gone):.0f} of {mb(entries):.0f} MB; "
          f"{mb(entries) - mb(gone):.0f} MB stay.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
