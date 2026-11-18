#!/usr/bin/env python3
"""Write scripts/eehrxf/samples/synthea-sample.json from a seeded Synthea run (#1144).

The hub's patients come from Synthea (scripts/generate-synthea.sh) through
scripts/load_fhir_neo4j.py. The full output is hundreds of megabytes and
gitignored, so validate.py checks a committed sample instead: the same Synthea
version and export flags, a fixed seed and reference date, cut to the resource
types the loader reads, at most PER_KIND resources of each type (Observations
per category).

Rerun only when the Synthea version, the loader's resource types or the sample
size change:

    python3 scripts/eehrxf/sample_synthea.py --jar /path/to/synthea-with-dependencies.jar
"""

from __future__ import annotations

import argparse
import glob
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts" / "eehrxf" / "samples" / "synthea-sample.json"

SYNTHEA_VERSION = "3.3.0"
SEED = "1144"
REFERENCE_DATE = "20261101"
POPULATION = "10"
PER_KIND = 20
# The types scripts/load_fhir_neo4j.py loads (L177 to L272 on 2026-11-17).
LOADED_TYPES = ("Patient", "Encounter", "Condition", "Observation", "MedicationRequest", "Procedure")


def kind(resource: dict) -> str:
    if resource["resourceType"] != "Observation":
        return resource["resourceType"]
    codes = sorted(
        c.get("code", "") for cat in resource.get("category", []) for c in cat.get("coding", [])
    )
    return "Observation/" + (codes[0] if codes else "none")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--jar", required=True, help=f"synthea-with-dependencies.jar, version {SYNTHEA_VERSION}")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory(prefix="synthea-") as tmp:
        cmd = [
            "java", "-jar", args.jar,
            "-s", SEED, "-cs", SEED, "-r", REFERENCE_DATE, "-p", POPULATION,
            "--exporter.fhir.export=true",
            "--exporter.fhir.version=R4",
            "--exporter.hospital.fhir.export=false",
            "--exporter.practitioner.fhir.export=false",
            f"--exporter.baseDirectory={tmp}",
            "--exporter.subdir=fhir",
            "Massachusetts",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
        files = sorted(glob.glob(f"{tmp}/fhir/*.json"))
        picked: dict[str, list[dict]] = {}
        for path in files:
            bundle = json.loads(Path(path).read_text(encoding="utf-8"))
            if bundle.get("resourceType") != "Bundle":
                continue
            for entry in bundle.get("entry", []):
                r = entry["resource"]
                if r.get("resourceType") not in LOADED_TYPES:
                    continue
                bucket = picked.setdefault(kind(r), [])
                if len(bucket) < PER_KIND:
                    bucket.append({"fullUrl": entry.get("fullUrl"), "resource": r})

    entries = [e for k in sorted(picked) for e in picked[k]]
    sample = {
        "resourceType": "Bundle",
        "id": "synthea-sample",
        "identifier": {
            "system": "urn:mvhd:eehrxf-sample",
            "value": f"synthea-{SYNTHEA_VERSION}-seed-{SEED}-ref-{REFERENCE_DATE}-p{POPULATION}",
        },
        "type": "collection",
        "entry": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(sample, indent=1) + "\n", encoding="utf-8")
    for k in sorted(picked):
        print(f"{k:40} {len(picked[k])}")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(entries)} resources)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
