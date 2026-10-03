#!/usr/bin/env python3
"""npm audit gate with time-boxed, per-advisory exceptions.

`npm audit --audit-level=high` has no way to say "this one advisory is known,
tracked and accepted until a date". When an advisory has no patched version
(GHSA-vfj7-8cjw-p6xm in braces, #435), the plain command blocks every push
and fails CI until someone either bypasses the hook or upgrades a major
version under pressure. This script keeps the gate strict everywhere else.

It runs `npm audit --json` in the given directory and fails on any high or
critical finding unless every advisory behind it is listed in
docs/npm-audit-exceptions.json with a reason, an issue and an expiry date.
A finding reached only through excepted advisories is excused; one that
mixes an excepted advisory with any other is not. An expired exception
fails the gate, so an exception cannot quietly become permanent.

Usage:
  python3 scripts/check-npm-audit.py ui              # all dependencies
  python3 scripts/check-npm-audit.py ui --omit=dev   # production only
  python3 scripts/check-npm-audit.py ui --from-json audit.json  # tests
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCEPTIONS = ROOT / "docs" / "npm-audit-exceptions.json"
BLOCKING = {"high", "critical"}
GHSA = re.compile(r"GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}")


def load_exceptions(today: dt.date) -> tuple[set[str], list[str]]:
    """Active advisory ids, and the problems with the file itself."""
    if not EXCEPTIONS.exists():
        return set(), []
    active, problems = set(), []
    for e in json.loads(EXCEPTIONS.read_text())["exceptions"]:
        missing = [k for k in ("advisory", "reason", "issue", "expires") if not e.get(k)]
        if missing:
            problems.append(f"exception {e.get('advisory', '?')} lacks {', '.join(missing)}")
            continue
        if dt.date.fromisoformat(e["expires"]) < today:
            problems.append(
                f"exception {e['advisory']} expired on {e['expires']} "
                f"(issue #{e['issue']}): fix it or renew it deliberately"
            )
            continue
        active.add(e["advisory"])
    return active, problems


def advisory_id(via: dict) -> str:
    m = GHSA.search(via.get("url", "")) or GHSA.search(str(via.get("source", "")))
    return m.group(0) if m else f"npm-{via.get('source', '?')}"


def blocking_findings(report: dict, excepted: set[str]) -> list[str]:
    vulns: dict = report.get("vulnerabilities", {})
    memo: dict[str, bool] = {}

    def excused(name: str, seen: frozenset[str] = frozenset()) -> bool:
        """True when every advisory reachable from this package is excepted."""
        if name in memo:
            return memo[name]
        if name in seen or name not in vulns:
            return True
        ok = True
        for via in vulns[name].get("via", []):
            if isinstance(via, dict):
                ok = ok and advisory_id(via) in excepted
            else:
                ok = ok and excused(via, seen | {name})
        memo[name] = ok
        return ok

    out = []
    for name, v in sorted(vulns.items()):
        if v.get("severity") in BLOCKING and not excused(name):
            ids = sorted({advisory_id(x) for x in v.get("via", []) if isinstance(x, dict)})
            out.append(f"{v['severity']:8} {name}  {', '.join(ids) or '(via ' + ', '.join(x for x in v['via'] if isinstance(x, str)) + ')'}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("directory")
    ap.add_argument("--omit", choices=["dev"])
    ap.add_argument("--from-json", type=Path, help="read a saved `npm audit --json` instead")
    ap.add_argument("--today", help="override the date, for tests (YYYY-MM-DD)")
    args = ap.parse_args()

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    excepted, problems = load_exceptions(today)

    if args.from_json:
        report = json.loads(args.from_json.read_text())
    else:
        cmd = ["npm", "audit", "--json"] + (["--omit=dev"] if args.omit else [])
        proc = subprocess.run(cmd, cwd=args.directory, capture_output=True, text=True)
        try:
            report = json.loads(proc.stdout)
        except json.JSONDecodeError:
            print(f"npm audit produced no JSON (exit {proc.returncode}):\n{proc.stderr}", file=sys.stderr)
            return 2

    blocking = blocking_findings(report, excepted)
    for p in problems:
        print(f"EXCEPTION PROBLEM: {p}")
    if blocking:
        print(f"npm audit: {len(blocking)} high/critical finding(s) without an active exception:")
        for b in blocking:
            print(f"  {b}")
    if excepted:
        print(f"active exceptions ({EXCEPTIONS.relative_to(ROOT)}): {', '.join(sorted(excepted))}")
    if blocking or problems:
        return 1
    print("npm audit: no high/critical finding outside the active exceptions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
