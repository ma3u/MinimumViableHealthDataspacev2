#!/usr/bin/env python3
"""A successful-path request must assert something an empty answer fails.

Why this exists
---------------
`res.body.applications: isArray` is satisfied by `{"applications": []}`. A hub
that lost its entire graph answers that, and the request stays green. 62 of
the collection's 111 live 2xx requests were in that state when this was
written (#375), which is more than half of the evidence the hub offers a
partner rehearsing against it.

It is not theoretical. `05 Dataspace Operator/14` sent the wrong kind of id,
got `200 []` back, and passed for as long as it existed (#369). It surfaced
only because the same call threw on CI rather than returning empty.

A request counts as strong when it does at least one of:
  - index an element, `res.body[0].id`
  - compare a value: eq, neq, contains, matches, gt, gte, lt, lte, length,
    isString, isNumber, isBoolean
  - assert a count, a membership or a non-empty collection in its tests block

`13 Static export` is exempt: those read fixtures from the published site,
where a shape check is all there is to make.

The ratchet is docs/bruno-soft-assertion-allowlist.txt, listing the requests
that are still soft. A new soft request fails the build. Deleting a line is
how progress is recorded, and the file is meant to shrink to nothing.

Usage:
  ./scripts/check-bruno-strength.py           # fail on a new soft request
  ./scripts/check-bruno-strength.py --list    # print every soft request
  ./scripts/check-bruno-strength.py --write   # rewrite the allowlist
"""

from __future__ import annotations

import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(REPO, "bruno/MVHDv2")
ALLOWLIST = os.path.join(REPO, "docs/bruno-soft-assertion-allowlist.txt")
EXEMPT_FOLDERS = {"13 Static export"}

VALUE_OPS = (
    "eq", "neq", "contains", "matches", "gt", "gte", "lt", "lte",
    "length", "isString", "isNumber", "isBoolean",
)
# Chai reads several ways for the same claim: `to.be.a(` and `to.be.an(`,
# `to.not.be.empty` and `.that.is.not.empty`. Missing a spelling marks a
# strong request soft, which is the safe direction but still wrong, so match
# on the claim rather than one phrasing of it.
STRONG_IN_TESTS = re.compile(
    r"\.not\.empty|not\.be\.empty|to\.be\.(?:above|below|at\.least|at\.most)"
    r"|\.length|to\.equal|to\.include|to\.contain|to\.be\.an?\(|to\.have\.property"
)


def block(text: str, name: str) -> str:
    m = re.search(rf"^{name} \{{\n(.*?)^\}}", text, re.S | re.M)
    return m.group(1) if m else ""


def load_allowlist() -> set[str]:
    if not os.path.exists(ALLOWLIST):
        return set()
    out = set()
    for line in open(ALLOWLIST):
        line = line.split("#")[0].strip()
        if line:
            out.add(line)
    return out


def scan() -> tuple[list[str], int]:
    """(soft request names, number of live 2xx requests)."""
    soft, total = [], 0
    for dirpath, _, files in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)
        if "environments" in rel_dir or rel_dir in EXEMPT_FOLDERS:
            continue
        for fn in sorted(files):
            if not fn.endswith(".bru") or fn in ("folder.bru", "collection.bru"):
                continue
            text = open(os.path.join(dirpath, fn)).read()
            asserts = [l.strip() for l in block(text, "assert").splitlines() if l.strip()]
            tests = block(text, "tests")

            expected = None
            for a in asserts:
                m = re.match(r"res\.status:\s*eq\s+(\d+)", a)
                if m:
                    expected = int(m.group(1))
            if expected is None:
                m = re.search(r"expect\(res\.getStatus\(\)\)\.to\.equal\((\d+)\)", tests)
                if m:
                    expected = int(m.group(1))
            if expected is None and any("gte 200" in a for a in asserts):
                expected = 200
            if expected is None or not (200 <= expected < 300):
                continue
            total += 1

            strong = False
            for a in asserts:
                lhs, _, rhs = a.partition(":")
                if lhs.startswith("res.status"):
                    continue
                rhs = rhs.strip()
                if "[" in lhs or any(rhs.startswith(op) for op in VALUE_OPS):
                    strong = True
            if STRONG_IN_TESTS.search(tests):
                strong = True
            if not strong:
                soft.append(os.path.relpath(os.path.join(dirpath, fn), ROOT)[: -len(".bru")])
    return sorted(soft), total


def main(argv: list[str]) -> int:
    soft, total = scan()
    if "--write" in argv:
        with open(ALLOWLIST, "w") as fh:
            fh.write(HEADER)
            for name in soft:
                fh.write(name + "\n")
        print(f"wrote {len(soft)} entries to {os.path.relpath(ALLOWLIST, REPO)}")
        return 0

    allowed = load_allowlist()
    print(f"live 2xx requests: {total}   soft: {len(soft)}   allowlisted: {len(allowed)}")
    if "--list" in argv:
        for name in soft:
            print(f"  {name}")
        return 0

    new = [n for n in soft if n not in allowed]
    fixed = sorted(allowed - set(soft))
    if fixed:
        print(f"\n{len(fixed)} request(s) are no longer soft. Remove them from the allowlist:")
        for name in fixed:
            print(f"  {name}")
    if new:
        print(
            f"\nFAIL: {len(new)} successful-path request(s) would pass on an empty answer:",
            file=sys.stderr,
        )
        for name in new:
            print(f"  {name}", file=sys.stderr)
        print(
            "\nAssert something an empty answer fails: a count, an element, or a value.\n"
            "Where emptiness is legitimate on a fresh stack, seed the subject first or\n"
            "skip loudly with the reason, the way the journey folders do.",
            file=sys.stderr,
        )
        return 1
    if fixed:
        return 1
    print("OK: no successful-path request is softer than the recorded baseline")
    return 0


HEADER = """# Successful-path requests that would still pass if the hub answered with an
# empty collection. Checked by scripts/check-bruno-strength.py (#375).
#
# A new soft request fails the build. Deleting a line is how progress is
# recorded: strengthen the request, then remove it from here. This file is
# meant to shrink to nothing.
#
# Regenerate with: ./scripts/check-bruno-strength.py --write
"""

if __name__ == "__main__":
    sys.exit(main(sys.argv))
