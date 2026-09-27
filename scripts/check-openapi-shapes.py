#!/usr/bin/env python3
"""The OpenAPI spec must describe the shape the hub actually answers with.

Why this exists
---------------
scripts/check-api-spec-drift.py asks whether a route is documented. It never
asks whether the documentation is *right*. On 2026-09-27 it reported no drift
while the spec said `/api/graph` returns `edges` and the hub returned `links`,
and while three endpoints were declared as bare arrays that actually answer
with an envelope. A partner generating a client from the spec gets fields that
exist in no response, and nothing in CI notices.

The oracle is ui/public/mock/*.json. `.claude/rules/api-conventions.md`
requires every fixture to match the live response shape exactly, the static
export serves them as the API, and `13 Static export` in the API collection
asserts them. So they are a checked-in, deterministic record of the real shape,
which a pre-commit hook can compare against without a running stack.

Only top-level property names are compared. Types and nesting are a later
step; the failures that cost real time were all at this level.

Usage:
  ./scripts/check-openapi-shapes.py            # report and fail on drift
  ./scripts/check-openapi-shapes.py --list     # report only, always exit 0
"""

from __future__ import annotations

import json
import os
import re
import sys

try:
    import yaml
except ImportError:
    print("PyYAML is not installed; skipping the OpenAPI shape check", file=sys.stderr)
    sys.exit(0)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, "ui/public/openapi.yaml")
MOCK_DIR = os.path.join(REPO, "ui/public/mock")
API_TS = os.path.join(REPO, "ui/src/lib/api.ts")
ALLOWLIST = os.path.join(REPO, "docs/openapi-shape-allowlist.txt")


def load_allowlist() -> set[str]:
    if not os.path.exists(ALLOWLIST):
        return set()
    out = set()
    for line in open(ALLOWLIST):
        line = line.split("#")[0].strip()
        if line:
            out.add(line)
    return out


def endpoint_to_fixture() -> dict[str, str]:
    """The STATIC_MOCK_MAP in ui/src/lib/api.ts, read as data."""
    src = open(API_TS).read()
    out: dict[str, str] = {}
    for k, v in re.findall(r'"(/api/[^"?]+)":\s*"/mock/([^"]+)"', src):
        out.setdefault(k, v)
    for k, v in re.findall(r'\["(/api/[^"?]+)",\s*"/mock/([^"]+)"\]', src):
        out.setdefault(k, v)
    return out


def resolve(spec, node, seen=None):
    seen = seen or set()
    if not isinstance(node, dict):
        return {}
    if "$ref" in node:
        ref = node["$ref"]
        if ref in seen:
            return {}
        seen.add(ref)
        cur = spec
        for part in ref.lstrip("#/").split("/"):
            cur = (cur or {}).get(part, {})
        return resolve(spec, cur, seen)
    return node


def shape_of(spec, schema):
    """(is_array, properties, required) for one schema, unions across oneOf."""
    schema = resolve(spec, schema)
    branches = schema.get("oneOf") or schema.get("anyOf")
    if branches:
        # An endpoint that answers different shapes by parameter, such as
        # /api/patient/profile. Any branch may be what a given fixture holds,
        # so take the union and require nothing.
        props, arrays = set(), []
        for b in branches:
            is_arr, p, _ = shape_of(spec, b)
            props |= p
            arrays.append(is_arr)
        return (all(arrays), props, set())
    if schema.get("type") == "array":
        item = resolve(spec, schema.get("items") or {})
        return True, set((item.get("properties") or {}).keys()), set(item.get("required") or [])
    return False, set((schema.get("properties") or {}).keys()), set(schema.get("required") or [])


def declared_shape(spec, op):
    """(is_array, properties, required) of the first 2xx JSON response."""
    for code, resp in (op.get("responses") or {}).items():
        if not str(code).startswith("2"):
            continue
        r = resolve(spec, resp)
        schema = ((r.get("content") or {}).get("application/json") or {}).get("schema") or {}
        is_arr, props, required = shape_of(spec, schema)
        return (is_arr, props, required) if props else None
    return None


def actual_shape(payload):
    """(is_array, property names) of a fixture."""
    if isinstance(payload, list):
        first = next((x for x in payload if isinstance(x, dict)), None)
        return True, set(first.keys()) if first else set()
    if isinstance(payload, dict):
        return False, set(payload.keys())
    return None, set()


def main(argv: list[str]) -> int:
    report_only = "--list" in argv
    spec = yaml.safe_load(open(SPEC))
    mapping = endpoint_to_fixture()
    allow = load_allowlist()

    checked = 0
    problems: list[tuple[str, str, str]] = []
    notes: list[tuple[str, str]] = []
    for path, item in (spec.get("paths") or {}).items():
        op = (item or {}).get("get")
        if not op:
            continue
        fixture = mapping.get(path)
        if not fixture:
            continue
        fpath = os.path.join(MOCK_DIR, fixture)
        if not os.path.exists(fpath):
            continue
        declared = declared_shape(spec, op)
        if not declared:
            continue
        try:
            payload = json.load(open(fpath))
        except (json.JSONDecodeError, OSError) as err:
            problems.append((path, "unreadable", f"{fixture}: {err}"))
            continue
        checked += 1
        d_is_array, d_props, d_required = declared
        a_is_array, a_props = actual_shape(payload)

        if a_is_array is not None and d_is_array != a_is_array:
            kind = "array" if d_is_array else "object"
            real = "array" if a_is_array else "object"
            key = f"{path} container"
            if key not in allow:
                problems.append((path, "container", f"spec says {kind}, {fixture} is an {real}"))
            continue

        # A declared field the fixture lacks is only a defect when the spec
        # says it is required. Plenty are legitimately conditional: policies
        # carry `source` and `offline` only on the Neo4j fallback, the patient
        # index carries `lastEhrSync` only once a sync has happened, and the
        # audit trail carries `accesslogs` only when the filter asks for it.
        # Reported, so the list is visible, but not failed.
        missing_required = sorted(d_required - a_props)
        missing_optional = sorted((d_props - a_props) - d_required)
        extra = sorted(a_props - d_props)
        if missing_required and f"{path} required-absent" not in allow:
            problems.append((path, "required-absent", f"spec requires {missing_required}, not in {fixture}"))
        if missing_optional:
            notes.append((path, f"optional and not in {fixture}: {missing_optional}"))
        # A field the hub returns and the spec omits is always a defect: a
        # generated client will not have it. This is the rule that would have
        # caught `links` when the spec said `edges`.
        if extra and f"{path} undeclared" not in allow:
            problems.append((path, "undeclared", f"{fixture} has {extra}, spec does not declare them"))

    print(f"documented GET operations with a fixture to check against: {checked}")
    for path, detail in notes:
        print(f"  note  {path}: {detail}")
    if not problems:
        print("OK: the spec describes the shape the fixtures carry")
        return 0

    by_kind: dict[str, int] = {}
    for _, kind, _ in problems:
        by_kind[kind] = by_kind.get(kind, 0) + 1
    print(f"shape disagreements: {len(problems)}  {by_kind}")
    for path, kind, detail in problems:
        print(f"  {path}\n      {kind}: {detail}")
    if report_only:
        return 0
    print(
        "\nFAIL: a client generated from this spec would not match the hub.\n"
        "Fix the schema, or record the exception in docs/openapi-shape-allowlist.txt\n"
        "as a line like '/api/foo undeclared'.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
