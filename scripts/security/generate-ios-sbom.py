#!/usr/bin/env python3
"""CycloneDX bill of materials for the Klarbefund iPhone app.

The app declares no third-party package (Package.swift, project.yml), so a
package scanner finds nothing to list. What it links are Apple frameworks,
and this script lists them from the import statements in the sources, so the
claim "no third-party software" is checkable from the bill itself rather
than from reading the build files (BSI TR-03161 O.TrdP).

    generate-ios-sbom.py clients/ios > docs/sbom/klarbefund-ios.cdx.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

APPLE = "Apple Inc."
IMPORT = re.compile(r"^\s*import\s+([A-Za-z_][A-Za-z0-9_]*)", re.M)


def main(root: Path) -> None:
    manifest = (root / "Package.swift").read_text(encoding="utf-8")
    if ".package(" in manifest:
        sys.exit("Package.swift declares an external package; this generator assumes none")
    project = (root / "project.yml").read_text(encoding="utf-8")
    if "\npackages:" in project:
        sys.exit("project.yml declares Swift packages; this generator assumes none")

    own = {"Shared", "MeinBefund"}
    frameworks: dict[str, set[str]] = {}
    for source in sorted((root / "Sources").rglob("*.swift")):
        for name in IMPORT.findall(source.read_text(encoding="utf-8")):
            if name in own:
                continue
            frameworks.setdefault(name, set()).add(str(source.relative_to(root)))

    version = re.search(r"MARKETING_VERSION:\s*\"?([0-9.]+)", project)
    build = re.search(r"CURRENT_PROJECT_VERSION:\s*\"?([0-9]+)", project)
    platforms = re.search(r"platforms:\s*\[(.*?)\]", manifest)

    components = []
    for name, files in sorted(frameworks.items()):
        components.append(
            {
                "type": "framework",
                "name": name,
                "supplier": {"name": APPLE},
                "description": "Apple system framework, shipped with iOS; not bundled with the app",
                "scope": "required",
                "properties": [
                    {"name": "klarbefund:imported-by", "value": f}
                    for f in sorted(files)
                ],
            }
        )

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "Klarbefund",
                "version": version.group(1) if version else "unversioned",
                "description": "iPhone lab-report scanner, clients/ios; no third-party package",
                "properties": [
                    {"name": "klarbefund:build", "value": build.group(1) if build else "unknown"},
                    {"name": "klarbefund:platforms", "value": platforms.group(1).strip() if platforms else ""},
                    {"name": "klarbefund:third-party-packages", "value": "0"},
                ],
            },
            "tools": [{"name": "generate-ios-sbom.py", "vendor": "MinimumViableHealthDataspace"}],
        },
        "components": components,
    }
    json.dump(bom, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: generate-ios-sbom.py <clients/ios>")
    main(Path(sys.argv[1]))
