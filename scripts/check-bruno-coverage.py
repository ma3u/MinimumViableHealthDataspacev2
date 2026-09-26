#!/usr/bin/env python3
"""Fail when the Bruno collection and ui/src/app/api/ disagree.

#348, #349, ADR-032. The collection in bruno/MVHDv2 is what a hospital, an
access body or a research organisation uses to rehearse against this hub. On
2026-09-26 it covered 37 of 67 paths and 51 of 87 operations, and nothing
noticed, because nothing compared the two. This does.

It is a ratchet, like scripts/check-api-spec-drift.py. Operations that had no
request when it was written live in an allowlist; they do not fail the build,
so the backlog can be paid down deliberately. What fails:

  1. A NEW operation with no request.        Stops the decay.
  2. A request whose route is gone.          Catches drift the other way.
  3. A STALE allowlist entry, meaning one that now has a request or whose route
     no longer exists. The list can only shrink.
  4. A request with no assertion and no test. ADR-031: a check that cannot fail
     is worse than no check, and the collection used to be 49 of those.
  5. A line in static-mock.txt naming a file that is gone.
  6. A credential inside any .bru file. gitleaks 8.30.1 skips the .bru
     extension entirely (measured: a file holding a NextAuth JWE scans as
     0 bytes), which is how a forged session cookie sat in
     environments/Azure-Dev.bru from 2026-05-09. This check reads every .bru
     file itself, so the blind spot does not matter.

Usage:
    python3 scripts/check-bruno-coverage.py           # check, exit 1 on drift
    python3 scripts/check-bruno-coverage.py --update  # rewrite the allowlist
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(ROOT, "ui", "src", "app", "api")
COLLECTION = os.path.join(ROOT, "bruno", "MVHDv2")
ALLOWLIST = os.path.join(ROOT, "docs", "bruno-coverage-allowlist.txt")
STATIC_MOCK = os.path.join(COLLECTION, "static-mock.txt")

# Credentials that must never appear in a .bru file. Sessions are forged per
# run by scripts/run-api-tests.sh and passed to bru as environment variables.
SECRET_PATTERNS = [
    (re.compile(r"eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0"), "a NextAuth session cookie (JWE)"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\."), "a signed JWT"),
    (re.compile(r"(?i)\b(sessionToken\w*|password|apiKey|api_key)\s*:\s*\S{24,}"),
     "a credential-looking value"),
]
METHODS = ("get", "post", "put", "patch", "delete")

# Handled by NextAuth itself, not a REST endpoint anyone would send by hand.
IGNORED_PREFIXES = ("/api/auth/{}",)


def implemented():
    """Every exported HTTP handler under ui/src/app/api, as (path, METHOD)."""
    found = set()
    for dirpath, _dirnames, filenames in os.walk(API_DIR):
        if "route.ts" not in filenames:
            continue
        rel = dirpath[len(API_DIR):]
        path = "/api" + re.sub(r"\[(?:\.\.\.)?\w+\]", "{}", rel)
        if path.startswith(IGNORED_PREFIXES):
            continue
        src = open(os.path.join(dirpath, "route.ts"), encoding="utf-8").read()
        for m in re.findall(
            r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)", src
        ):
            found.add((path, m))
    return found


def normalise(url):
    """A .bru url as a route path: drop the host var, the query, and the values
    standing in for a dynamic segment."""
    url = re.sub(r"^\{\{\w+\}\}", "", url).split("?")[0]
    if not url.startswith("/api/"):
        return None  # a protocol-layer or proxy request, not a hub route
    # {{var}} and the literal ids the collection uses for a dynamic segment
    # Every dynamic segment compares as {}: the route's parameter name and the
    # value a request puts there carry no information for coverage.
    url = re.sub(r"\{\{[^}]+\}\}", "{}", url)
    url = re.sub(
        r"/(does-not-exist|not-a-component|alpha-klinik|controlplane|"
        r"[a-z0-9-]+-123|[a-z]+-whatever)(?=/|$)",
        "/{}",
        url,
    )
    return url


def requested():
    """Every (path, METHOD) the collection sends at a hub route, plus the files
    that carry no assertion at all and the ones carrying a credential."""
    ops, toothless, files, secrets = set(), [], [], []
    for dirpath, _dirnames, filenames in os.walk(COLLECTION):
        for name in sorted(filenames):
            if not name.endswith(".bru") or name in ("collection.bru", "folder.bru"):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, COLLECTION)
            files.append(rel)
            src = open(full, encoding="utf-8").read()
            for pattern, what in SECRET_PATTERNS:
                m = pattern.search(src)
                if m:
                    line = src[: m.start()].count("\n") + 1
                    secrets.append((rel, line, what))
                    break
            m = re.search(r"^(get|post|put|patch|delete)\s*\{\s*\n\s*url:\s*(\S+)",
                          src, re.M)
            if not m:
                continue
            if not re.search(r"^assert \{", src, re.M) and not re.search(r"^tests \{", src, re.M):
                toothless.append(rel)
            path = normalise(m.group(2))
            if path:
                ops.add((path, m.group(1).upper()))
    return ops, toothless, files, secrets


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
            "# Operations under ui/src/app/api/ that no request in bruno/MVHDv2 sends.\n"
            "# Generated and checked by scripts/check-bruno-coverage.py; see #349 and\n"
            "# ADR-032.\n"
            "#\n"
            "# This list may only shrink. Adding a line is not a fix, it is a decision to\n"
            "# ship an endpoint a partner cannot rehearse, and the reviewer should ask why.\n"
            "# Writing the request means deleting its line in the same commit, which the\n"
            "# check enforces.\n"
            "#\n"
            f"# Remaining: {len(pairs)}\n"
            "\n"
        )
        for line in fmt(pairs):
            fh.write(line + "\n")


def main():
    impl = implemented()
    ops, toothless, files, secrets = requested()
    allowed = load_allowlist()

    uncovered = impl - ops
    ghosts = ops - impl

    if "--update" in sys.argv:
        write_allowlist(uncovered)
        print(f"allowlist rewritten with {len(uncovered)} entries")
        return 0

    new_gap = uncovered - allowed
    stale = allowed - uncovered

    covered = len(impl & ops)
    print(f"implemented: {len(impl)}   requested: {covered} "
          f"({100 * covered // max(len(impl), 1)}%)   requests in collection: {len(files)}")
    print(f"allowlisted without a request: {len(allowed)}")

    failed = False

    if new_gap:
        failed = True
        print(f"\nFAIL: {len(new_gap)} operation(s) have no request in bruno/MVHDv2,")
        print("      and are not on the allowlist. Add a request to the folder of the")
        print("      persona that sends it (ADR-032), with a real assertion.")
        for line in fmt(new_gap):
            print(f"  + {line}")

    if ghosts:
        failed = True
        print(f"\nFAIL: {len(ghosts)} request(s) point at a route that does not exist.")
        for line in fmt(ghosts):
            print(f"  - {line}")

    if stale:
        failed = True
        print(f"\nFAIL: {len(stale)} allowlist entry(ies) are stale. The ratchet turns one")
        print("      way: run  python3 scripts/check-bruno-coverage.py --update")
        for line in fmt(stale):
            print(f"  ! {line}")

    if toothless:
        failed = True
        print(f"\nFAIL: {len(toothless)} request(s) carry neither an assert nor a test.")
        print("      A request that cannot fail is worse than no request (ADR-031).")
        for rel in toothless:
            print(f"  ? {rel}")

    if secrets:
        failed = True
        print(f"\nFAIL: {len(secrets)} .bru file(s) carry something that looks like a credential.")
        print("      Sessions are forged per run by scripts/run-api-tests.sh and passed as")
        print("      environment variables; nothing signed belongs in git. gitleaks does not")
        print("      scan .bru files at all, so this is the only check that sees them.")
        for rel, line, what in secrets:
            print(f"  ! {rel}:{line} {what}")

    if os.path.exists(STATIC_MOCK):
        missing = []
        for line in open(STATIC_MOCK, encoding="utf-8"):
            line = line.split("#", 1)[0].strip()
            if line and not os.path.exists(os.path.join(COLLECTION, line)):
                missing.append(line)
        if missing:
            failed = True
            print(f"\nFAIL: {len(missing)} line(s) in static-mock.txt name a request that is gone.")
            for rel in missing:
                print(f"  ? {rel}")

    if not failed:
        print("\nOK: the collection covers every route it claims to, and every request can fail.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
