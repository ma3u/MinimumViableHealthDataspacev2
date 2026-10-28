#!/usr/bin/env python3
"""Make the published German wallet iOS package graph resolvable.

The public mirror of `german-national-wallet/de-eudi-wallet-ios` ships the SPM
manifests unchanged but strips every test bundle: the `Modules/*/Tests`
directories are gone and so are the shared `logic-test` / `feature-test`
modules the test targets depend on. Xcode therefore refuses to resolve the
package graph at all ("invalid custom path './Tests'"), which blocks a plain
app build as well.

This rewrites each `Modules/*/Package.swift` in place to drop
  * every `.testTarget(...)` declaration, and
  * every `.package(name: "<logic|feature>-test", path: ...)` dependency,
leaving the product/target graph the app itself needs untouched.

Idempotent: running it on an already-patched tree is a no-op. Upstream source
is never redistributed from this repo — the script only patches a local clone.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

STRIPPED_TEST_MODULES = ("logic-test", "feature-test")
MARKER = "// patched by scripts/eudi/patch-ios-spm.py"


def find_block(text: str, start: int) -> int:
    """Return the index just past the balanced ``(...)`` opened at ``start``."""
    depth = 0
    in_string = False
    i = text.index("(", start)
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError("unbalanced parentheses in manifest")


def drop_test_targets(text: str) -> str:
    while True:
        match = re.search(r"\.testTarget\s*\(", text)
        if not match:
            return text
        end = find_block(text, match.start())
        # swallow the separating comma on whichever side carries it
        head = text[: match.start()].rstrip()
        tail = text[end:].lstrip()
        if head.endswith(","):
            head = head[:-1].rstrip()
        elif tail.startswith(","):
            tail = tail[1:].lstrip()
        text = head + "\n    " + tail


def drop_test_package_deps(text: str, modules=STRIPPED_TEST_MODULES) -> str:
    for module in modules:
        pattern = re.compile(
            r"[ \t]*\.package\(\s*name:\s*\"" + re.escape(module) + r"\".*?\),?\n",
            re.DOTALL,
        )
        text = pattern.sub("", text)
    return text


def tidy_trailing_commas(text: str) -> str:
    return re.sub(r",(\s*[\]\)])", r"\1", text)


RESOURCE_PLACEHOLDER = "PLACEHOLDER.txt"

RESOURCE_NOTE = """\
This directory is a placeholder created by scripts/eudi/patch-ios-spm.py.

The published mirror strips the licensed EUDI Diatype typeface but keeps the
`resources:` declaration in Package.swift that points at it. With the path
missing, SPM refuses to synthesise `Bundle.module` for the target and
CustomFonts.swift fails to compile with "'module' is inaccessible due to
'internal' protection level".

One placeholder file is enough to restore the resource bundle. The fonts are
still absent, so CustomFonts.registerFont finds no URL and returns without
registering; the app falls back to system fonts.
"""


def create_missing_resource_dirs(manifest: Path) -> list[str]:
    """Materialise resource directories the manifest declares but the mirror strips."""
    sources = manifest.parent / "Sources"
    created = []
    for match in re.finditer(r'\.(?:process|copy)\(\s*"([^"]+)"\s*\)', manifest.read_text()):
        target = sources / match.group(1)
        if target.exists():
            continue
        target.mkdir(parents=True, exist_ok=True)
        (target / RESOURCE_PLACEHOLDER).write_text(RESOURCE_NOTE)
        created.append(match.group(1))
    return created


def patch(manifest: Path) -> bool:
    original = manifest.read_text()
    if MARKER in original:
        return False
    # The 2026-09-16 sync ships the Tests directories and both test modules
    # again, so strip only what this checkout is actually missing: a manifest
    # whose Tests directory exists keeps its test targets, and a dependency on
    # logic-test / feature-test stays when that module directory is present.
    modules_dir = manifest.parent.parent
    patched = original
    if not (manifest.parent / "Tests").is_dir():
        patched = drop_test_targets(patched)
    missing = tuple(
        m for m in STRIPPED_TEST_MODULES if not (modules_dir / m).is_dir()
    )
    patched = tidy_trailing_commas(drop_test_package_deps(patched, missing))
    if patched == original:
        return False
    manifest.write_text(patched.rstrip() + "\n\n" + MARKER + "\n")
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <path-to-de-eudi-wallet-ios>", file=sys.stderr)
        return 2
    root = Path(argv[1]).expanduser().resolve()
    manifests = sorted(root.glob("Modules/*/Package.swift"))
    if not manifests:
        print(f"no Modules/*/Package.swift under {root}", file=sys.stderr)
        return 1
    changed = [m for m in manifests if patch(m)]
    print(f"patched {len(changed)}/{len(manifests)} manifests")
    for m in changed:
        print(f"  {m.relative_to(root)}")

    for manifest in manifests:
        for path in create_missing_resource_dirs(manifest):
            print(f"  created missing resource dir {manifest.parent.name}/Sources/{path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
