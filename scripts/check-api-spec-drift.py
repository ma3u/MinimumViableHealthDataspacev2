#!/usr/bin/env python3
"""Fail when ui/src/app/api/ and ui/public/openapi.yaml disagree.

Phase 2 of #338 (discussion #110). Between 2026-08-03 and 2026-09-26 the
implemented operations grew 61 -> 87 while the spec stayed at 49, so documented
coverage fell from 80% to 56%. Nothing compared the two, so nothing objected.

This is a ratchet, not a wall. The 38 operations that were already undocumented
when it was written live in an allowlist; they do not fail the build, so the
backlog can be paid down deliberately instead of blocking every merge. What
fails:

  1. A NEW undocumented operation.          Stops the decay.
  2. A documented operation with no route.  Drift has only ever run one way;
                                            this catches the day it does not.
  3. A STALE allowlist entry, meaning one that is now documented or whose route
     is gone. This is what makes it a ratchet: the list can only shrink, and
     documenting a route forces you to remove its line in the same commit.
  4. A documented operation whose `x-required-roles` is not the list its
     handler passes to requireAuth(). The spec tells a reader which role to
     sign in with; on 2026-11-11, 35 of 88 documented operations were gated
     to a role and the spec did not say which. An operation any signed-in
     participant may call carries no `x-required-roles`, and neither does one
     the spec declares anonymous (`security: []`).

Usage:
    python3 scripts/check-api-spec-drift.py           # check, exit 1 on drift
    python3 scripts/check-api-spec-drift.py --update  # rewrite the allowlist
"""

import os
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "ui", "src", "app", "api")
SPEC = os.path.join(ROOT, "ui", "public", "openapi.yaml")
ALLOWLIST = os.path.join(ROOT, "docs", "api-spec-drift-allowlist.txt")
METHODS = ("get", "post", "put", "patch", "delete")


def implemented():
    """Every exported HTTP handler under ui/src/app/api, as (path, METHOD)."""
    found = set()
    for dirpath, _dirnames, filenames in os.walk(API_DIR):
        if "route.ts" not in filenames:
            continue
        rel = dirpath[len(API_DIR):]
        # Next.js dynamic segments: [id] and [...slug] both become {id}/{slug}
        path = "/api" + re.sub(r"\[(?:\.\.\.)?(\w+)\]", r"{\1}", rel)
        src = open(os.path.join(dirpath, "route.ts"), encoding="utf-8").read()
        for m in re.findall(
            r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)", src
        ):
            found.add((path, m))
    return found


def load_spec():
    return yaml.safe_load(open(SPEC, encoding="utf-8"))


def documented(spec):
    return {
        (path, method.upper())
        for path, item in (spec.get("paths") or {}).items()
        for method in item
        if method in METHODS
    }


# Role lists a route passes to requireAuth() by name instead of as a literal.
ROLE_CONSTANTS = {"SPE_POWER_ROLES": ["EDC_ADMIN", "HDAB_AUTHORITY"]}
ANY_SESSION = "any session"


def _roles_of(args, where):
    args = args.strip()
    if not args:
        return ANY_SESSION
    if args.startswith("["):
        return sorted(
            set(re.findall(r'"(\w+)"', args)) | set(re.findall(r"Roles\.(\w+)", args))
        )
    if args in ROLE_CONSTANTS:
        return sorted(ROLE_CONSTANTS[args])
    sys.exit(
        f"{where}: requireAuth({args}) names a role list this check cannot "
        "read. Add it to ROLE_CONSTANTS in scripts/check-api-spec-drift.py."
    )


def gates():
    """The roles each handler admits: a sorted list, ANY_SESSION, or None when
    the handler calls requireAuth() nowhere (anonymous, or a token only)."""
    found = {}
    for dirpath, _dirnames, filenames in os.walk(API_DIR):
        if "route.ts" not in filenames:
            continue
        path = "/api" + re.sub(r"\[(?:\.\.\.)?(\w+)\]", r"{\1}", dirpath[len(API_DIR):])
        src = open(os.path.join(dirpath, "route.ts"), encoding="utf-8").read()
        # File-local helpers that call requireAuth(), such as requireAdmin().
        helpers = {}
        for m in re.finditer(r"function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n", src):
            if m.group(1).upper() in (x.upper() for x in METHODS):
                continue
            calls = re.findall(r"requireAuth\(([^)]*)\)", m.group(2))
            if calls:
                helpers[m.group(1)] = [_roles_of(c, path) for c in calls]
        handlers = list(
            re.finditer(
                r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b", src
            )
        )
        for i, h in enumerate(handlers):
            end = handlers[i + 1].start() if i + 1 < len(handlers) else len(src)
            body = src[h.end():end]
            calls = [_roles_of(c, path) for c in re.findall(r"requireAuth\(([^)]*)\)", body)]
            for name, lists in helpers.items():
                if re.search(r"\b" + name + r"\(", body):
                    calls += lists
            if not calls:
                gate = None
            elif ANY_SESSION in calls:
                gate = ANY_SESSION
            else:
                gate = sorted({role for roles in calls for role in roles})
            found[(path, h.group(1))] = gate
    return found


def role_drift(spec):
    """Documented operations whose x-required-roles is not their gate."""
    code = gates()
    wrong = []
    for path, item in (spec.get("paths") or {}).items():
        for method, op in item.items():
            if method not in METHODS or (path, method.upper()) not in code:
                continue
            gate = code[(path, method.upper())]
            want = gate if isinstance(gate, list) and op.get("security") != [] else None
            have = op.get("x-required-roles")
            have = sorted(have) if have else None
            if have != want:
                wrong.append(
                    f"{method.upper()} {path}: the spec says {have or 'no roles'}, "
                    f"the handler admits {want or gate or 'no session at all'}"
                )
    return sorted(wrong)


def load_allowlist():
    if not os.path.exists(ALLOWLIST):
        return set()
    entries = set()
    for line in open(ALLOWLIST, encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        method, _, path = line.partition(" ")
        entries.add((path.strip(), method.strip().upper()))
    return entries


def fmt(pairs):
    return [f"{m} {p}" for p, m in sorted(pairs, key=lambda x: (x[0], x[1]))]


def write_allowlist(pairs):
    with open(ALLOWLIST, "w", encoding="utf-8") as fh:
        fh.write(
            "# Operations implemented under ui/src/app/api/ that ui/public/openapi.yaml\n"
            "# does not document yet. Generated and checked by\n"
            "# scripts/check-api-spec-drift.py; see #338.\n"
            "#\n"
            "# This list may only shrink. Adding a line to it is not a fix, it is a\n"
            "# decision to ship an undocumented endpoint, and the reviewer should ask\n"
            "# why. Documenting an operation means deleting its line here in the same\n"
            "# commit, which the check enforces.\n"
            "#\n"
            f"# Remaining: {len(pairs)}\n"
            "\n"
        )
        for line in fmt(pairs):
            fh.write(line + "\n")


def main():
    spec = load_spec()
    impl, doc = implemented(), documented(spec)
    allowed = load_allowlist()

    undocumented = impl - doc
    ghosts = doc - impl

    if "--update" in sys.argv:
        write_allowlist(undocumented)
        print(f"allowlist rewritten with {len(undocumented)} entries")
        return 0

    new_drift = undocumented - allowed
    # Stale: on the list, but either now documented or no longer implemented.
    stale = allowed - undocumented

    print(f"implemented: {len(impl)}   documented: {len(doc)}   "
          f"covered: {len(impl & doc)} ({100 * len(impl & doc) // max(len(impl), 1)}%)")
    print(f"allowlisted undocumented: {len(allowed)}")

    failed = False

    if new_drift:
        failed = True
        print(f"\nFAIL: {len(new_drift)} operation(s) implemented but not documented,")
        print("      and not on the allowlist. Document them in ui/public/openapi.yaml.")
        for line in fmt(new_drift):
            print(f"  + {line}")

    if ghosts:
        failed = True
        print(f"\nFAIL: {len(ghosts)} operation(s) documented but not implemented.")
        print("      Remove them from ui/public/openapi.yaml, or add the route.")
        for line in fmt(ghosts):
            print(f"  - {line}")

    if stale:
        failed = True
        print(f"\nFAIL: {len(stale)} allowlist entry(ies) are stale. The ratchet only")
        print(f"      turns one way: run  python3 {os.path.relpath(__file__, ROOT)} --update")
        for line in fmt(stale):
            print(f"  ! {line}")

    wrong_roles = role_drift(spec)
    if wrong_roles:
        failed = True
        print(f"\nFAIL: {len(wrong_roles)} operation(s) whose x-required-roles is not the")
        print("      handler's gate. Write the list requireAuth() gets, or drop the key")
        print("      when any signed-in participant may call it.")
        for line in wrong_roles:
            print(f"  ~ {line}")

    if not failed:
        print("\nOK: no new spec drift, and the spec names each operation's roles.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
