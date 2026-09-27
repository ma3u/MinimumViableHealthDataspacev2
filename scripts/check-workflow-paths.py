#!/usr/bin/env python3
"""Every script a workflow runs must be in that workflow's paths filter.

Why this exists
---------------
`compliance.yml` only triggers on `scripts/run-*.sh`, `bruno/**`, `neo4j/**`
and a few named files. The suites it runs also depend on the seed scripts, on
`scripts/lib/`, and on most of `jad/`. So a push to main that fixed a seed
script did not re-run the suite, and the branch protection kept showing the
last, stale, red result. That is how main sat red on 2026-09-26 with the fix
already merged.

Enumerating the dependencies by hand is what drifted in the first place, so
this derives them instead: start from the paths the workflow names, follow
every `scripts/...`, `jad/...` and `ui/scripts/...` reference inside those
files, transitively, and assert each one is matched by the filter.

It checks the union of the filter, not which glob matched, so any glob that
covers a dependency is fine. A referenced file that does not exist is ignored:
the reference may be a comment, a URL fragment or a path built at runtime.

Usage:
  ./scripts/check-workflow-paths.py [workflow.yml ...]     # default: compliance.yml
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_WORKFLOWS = [REPO / ".github/workflows/compliance.yml"]

SUFFIX = r"(?:sh|py|sql|json|mjs|yml|yaml)"

# A reference to a repo file inside a script or workflow. Deliberately narrow:
# the three trees whose contents the compliance suites actually execute.
REF = re.compile(rf"\b(?:scripts|jad|ui/scripts)/[A-Za-z0-9_./-]+\.{SUFFIX}\b")

# A sibling or repo-relative call through the variables every script here sets:
#   SCRIPT_DIR  the referring script's own directory
#   REPO_DIR    the repository root
# Missing these is not academic: seed-identity-layer.sh runs
# "${SCRIPT_DIR}/repair-cp-sts-secrets.sh", which the plain pattern cannot see.
VAR_REF = re.compile(
    rf"\$\{{?(SCRIPT_DIR|REPO_DIR|REPO_ROOT|ROOT_DIR)\}}?/([A-Za-z0-9_./-]+\.{SUFFIX})\b"
)


def globs_of(workflow: Path) -> list[str]:
    """The `on.push.paths` list, read without a YAML dependency.

    The block is flat and hand-maintained, so an indentation-aware scan is
    enough and keeps this runnable on a machine with no PyYAML.
    """
    lines = workflow.read_text().splitlines()
    out: list[str] = []
    inside = False
    for line in lines:
        stripped = line.strip()
        if stripped in ("paths:", "paths-ignore:"):
            inside = stripped == "paths:"
            continue
        if inside:
            if stripped.startswith("- "):
                out.append(stripped[2:].strip().strip('"').strip("'"))
                continue
            if stripped and not stripped.startswith("#"):
                inside = False
    return out


def to_regex(glob: str) -> re.Pattern[str]:
    """GitHub path-filter semantics: `**` crosses separators, `*` does not."""
    parts = []
    i = 0
    while i < len(glob):
        if glob.startswith("**", i):
            parts.append(".*")
            i += 2
        elif glob[i] == "*":
            parts.append("[^/]*")
            i += 1
        elif glob[i] == "?":
            parts.append("[^/]")
            i += 1
        else:
            parts.append(re.escape(glob[i]))
            i += 1
    return re.compile("^" + "".join(parts) + "$")


COMMENT = re.compile(r"(?:^|\s)#.*$")
SQL_COMMENT = re.compile(r"(?:^|\s)--.*$")


def strip_comments(text: str, suffix: str) -> str:
    """Drop line comments, so a path merely discussed is not a dependency.

    Several scripts name a sibling in prose ("see scripts/azure/env.sh"), and
    counting those would demand globs for files the workflow never runs. The
    rule is conservative: a `#` at the start of a line or after whitespace,
    which leaves a URL fragment alone.
    """
    pattern = SQL_COMMENT if suffix == ".sql" else COMMENT
    return "\n".join(pattern.sub("", line) for line in text.splitlines())


def dependencies(seed: Path) -> set[str]:
    """Every repo file the seed file reaches, transitively."""
    seen: set[str] = set()
    queue = [seed]
    while queue:
        current = queue.pop()
        try:
            text = current.read_text(errors="replace")
        except (OSError, IsADirectoryError):
            continue
        text = strip_comments(text, current.suffix)
        refs = set(REF.findall(text))
        for var, tail in VAR_REF.findall(text):
            base = current.parent if var == "SCRIPT_DIR" else REPO
            resolved = (base / tail).resolve()
            try:
                refs.add(str(resolved.relative_to(REPO)))
            except ValueError:
                continue  # outside the repository
        for ref in refs:
            if ref in seen:
                continue
            target = REPO / ref
            if not target.is_file():
                continue  # a comment, a URL fragment, a runtime-built path
            seen.add(ref)
            queue.append(target)
    return seen


def main(argv: list[str]) -> int:
    workflows = [Path(a).resolve() for a in argv[1:]] or DEFAULT_WORKFLOWS
    failed = False
    for workflow in workflows:
        rel = workflow.relative_to(REPO)
        globs = globs_of(workflow)
        if not globs:
            print(f"  ~ {rel}: no on.push.paths filter, so every push runs it")
            continue
        patterns = [to_regex(g) for g in globs]
        deps = dependencies(workflow)
        missing = sorted(
            d for d in deps if not any(p.match(d) for p in patterns)
        )
        print(f"{rel}: {len(globs)} glob(s), {len(deps)} dependency file(s)")
        if missing:
            failed = True
            print(
                f"  FAIL: {len(missing)} file(s) this workflow runs are not in its paths filter.",
                file=sys.stderr,
            )
            print(
                "  A push changing one of them will not re-run the workflow, so the",
                file=sys.stderr,
            )
            print(
                "  last result stands and can be stale. Add a glob that covers each:",
                file=sys.stderr,
            )
            for m in missing:
                print(f"    {m}", file=sys.stderr)
        else:
            print("  OK: every file it runs re-triggers it")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
