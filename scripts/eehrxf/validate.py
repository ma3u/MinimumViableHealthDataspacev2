#!/usr/bin/env python3
"""Validate what the hub ingests against the EEHRxF profiles it claims (#1144).

Reads scripts/eehrxf/profiles.json, collects resources from the sources below,
gives each candidate a copy with meta.profile set to the profile under test,
runs the HL7 FHIR Validator once over all copies, and writes
scripts/eehrxf/validation-report.json. build.py turns that report into the
graph seed and the static mock, so /eehrxf shows validation results, not node
counts.

Sources, both of them what the hub actually takes in:

- klarbefund: the golden bundles of the shared FHIR writer
  (clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle*.json). The iPhone
  app and services/epa-ingest emit byte-identical bundles from it.
- synthea: scripts/eehrxf/samples/synthea-sample.json, a seeded Synthea run cut
  down to the resource types scripts/load_fhir_neo4j.py loads
  (sample_synthea.py writes it).
- documents: the FHIR documents the hub builds from the graph (#1171), Patient
  Summaries and laboratory reports of seeded patients, under
  scripts/eehrxf/samples/documents/ (ui/scripts/export-fhir-document-samples.ts
  writes them; a unit test keeps them equal to what the builders produce).
- facade: what the neo4j-proxy FHIR facade serves (/fhir/*), the mapper's
  resources for fixed graph rows, scripts/eehrxf/samples/facade-sample.json
  (services/neo4j-proxy/scripts/export-fhir-facade-samples.ts writes it; a
  proxy test keeps it equal to the mapper, and its meta.profile claims equal
  to what this report says passed).

A resource passes when the validator reports no issue of severity error or
fatal. Terminology is not checked (-tx n/a): see profiles.json.

German ePA profiles (#1172) sit in profiles.json's national section. Each of
their guides is validated in a run of its own and written to the report's
national section, which build.py does not read: a German result is never
shown as EEHRxF coverage on /eehrxf.

The gate (#1172). A guide whose status is draft or ballot is report-only: its
failures are written to the report and never change the exit code. Every
other guide gates: the script exits 1 when a gating profile fails more
resources than the baseline (the committed report) records for it as a gating
profile. So the known failures of a published guide do not fail a run, a new
one does, and a guide that turns published starts from zero.

The report carries no timestamp, so a rerun on unchanged inputs gives the same
file and CI can fail on a difference.

Usage:
    python3 scripts/eehrxf/validate.py            # validate and write the report
    python3 scripts/eehrxf/validate.py --keep     # keep the work directory
    python3 scripts/eehrxf/validate.py --baseline none   # no gate, report only
"""

from __future__ import annotations

import argparse
import collections
import copy
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "profiles.json"
REPORT = HERE / "validation-report.json"
GOLDEN_GLOB = "clients/ios/Tests/SharedTests/Fixtures/fhir-golden-bundle*.json"
SYNTHEA_SAMPLE = "scripts/eehrxf/samples/synthea-sample.json"
DOCUMENTS_DIR = "scripts/eehrxf/samples/documents"
FACADE_SAMPLE = "scripts/eehrxf/samples/facade-sample.json"

# At most this many resources per profile and source, so one validator run
# stays within a few minutes in CI.
MAX_PER_SOURCE = 20
TOP_ISSUES = 5
FILE_EXT = "http://hl7.org/fhir/StructureDefinition/operationoutcome-file"

LAB_CODES = {"laboratory", "LAB"}
IMAGING_CODES = {"imaging", "RAD", "radiology"}
# LOINC document types of the Composition a document Bundle starts with.
PATIENT_SUMMARY = "60591-5"
DISCHARGE_REPORT = "34105-7"
LAB_REPORT = "11502-2"


def loinc_type(resource: dict) -> set[str]:
    return {c.get("code", "") for c in resource.get("type", {}).get("coding", [])}


def first_composition(bundle: dict) -> dict:
    entries = bundle.get("entry", [])
    first = entries[0]["resource"] if entries else {}
    return first if first.get("resourceType") == "Composition" else {}


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def category_codes(resource: dict) -> set[str]:
    cats = resource.get("category", [])
    if isinstance(cats, dict):
        cats = [cats]
    return {c.get("code", "") for cat in cats for c in cat.get("coding", [])}


def matches_filter(resource: dict, source_filter: str | None) -> bool:
    if not source_filter:
        return True
    codes = category_codes(resource)
    if source_filter == "laboratory":
        return bool(codes & LAB_CODES)
    if source_filter == "imaging":
        return bool(codes & IMAGING_CODES)
    if source_filter == "patient-summary":
        return PATIENT_SUMMARY in loinc_type(resource)
    if source_filter == "discharge-report":
        return DISCHARGE_REPORT in loinc_type(resource)
    if source_filter == "patient-summary-document":
        return resource.get("type") == "document" and PATIENT_SUMMARY in loinc_type(first_composition(resource))
    if source_filter == "laboratory-report-bundle":
        # A lab report document, or a Bundle with no Composition (the writer's
        # collections, one lab report each). Never a Patient Summary.
        composition = first_composition(resource)
        return not composition or LAB_REPORT in loinc_type(composition)
    if source_filter == "laboratory-bundle":
        return resource.get("resourceType") == "Bundle" and any(
            e.get("resource", {}).get("resourceType") == "DiagnosticReport"
            and matches_filter(e["resource"], "laboratory")
            for e in resource.get("entry", [])
        )
    raise ValueError(f"unknown sourceFilter {source_filter!r}")


def collect_sources() -> dict[str, dict]:
    """Return {sourceId: {description, files, resources: [(origin, resource)]}}."""
    sources: dict[str, dict] = {}

    golden = sorted(glob.glob(str(ROOT / GOLDEN_GLOB)))
    res: list[tuple[str, dict]] = []
    for path in golden:
        bundle = json.loads(Path(path).read_text(encoding="utf-8"))["bundle"]
        name = Path(path).name
        res.append((name, bundle))
        for i, entry in enumerate(bundle.get("entry", [])):
            res.append((f"{name}#entry[{i}]", entry["resource"]))
    sources["klarbefund"] = {
        "description": "Golden bundles of the shared FHIR writer (Klarbefund iPhone app and services/epa-ingest)",
        "files": [str(Path(p).relative_to(ROOT)) for p in golden],
        "resources": res,
    }

    sample = ROOT / SYNTHEA_SAMPLE
    res = []
    if sample.exists():
        bundle = json.loads(sample.read_text(encoding="utf-8"))
        for i, entry in enumerate(bundle.get("entry", [])):
            res.append((f"synthea-sample.json#entry[{i}]", entry["resource"]))
    sources["synthea"] = {
        "description": "Seeded Synthea sample, cut to the resource types scripts/load_fhir_neo4j.py loads",
        "files": [SYNTHEA_SAMPLE] if sample.exists() else [],
        "resources": res,
    }
    sources["documents"] = collect_documents()
    sources["facade"] = collect_entries(
        FACADE_SAMPLE, "Resources the neo4j-proxy FHIR facade serves, mapped from fixed graph rows"
    )
    return sources


def collect_entries(rel: str, description: str) -> dict:
    """The entries of one collection Bundle, each a resource of its own."""
    path = ROOT / rel
    bundle = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {
        "description": description,
        "files": [rel] if path.exists() else [],
        "resources": [(f"{path.name}#entry[{i}]", e["resource"]) for i, e in enumerate(bundle.get("entry", []))],
    }


def collect_documents() -> dict:
    """The hub's own FHIR documents (#1171), one Bundle per file."""
    paths = sorted(p for p in (ROOT / DOCUMENTS_DIR).glob("*.json") if p.name != "graph-rows.json")
    return {
        "description": "FHIR documents the hub builds from the graph: Patient Summaries and laboratory reports of seeded patients",
        "files": [str(p.relative_to(ROOT)) for p in paths],
        "resources": [(p.name, json.loads(p.read_text(encoding="utf-8"))) for p in paths],
    }


REPORT_ONLY = {"draft", "ballot"}


def report_only(ig: dict) -> bool:
    """A draft or ballot guide reports; anything else (published, STU n) gates."""
    return ig.get("status", "").strip().lower() in REPORT_ONLY


def national(cfg: dict) -> dict:
    return cfg.get("national", {"igs": {}, "profiles": []})


def candidates(profile: dict, sources: dict[str, dict]) -> list[tuple[str, str, dict]]:
    """(sourceId, origin, resource) to validate against this profile."""
    out = []
    for sid in sorted(sources):
        picked = [
            (origin, r)
            for origin, r in sources[sid]["resources"]
            if r.get("resourceType") == profile["baseResource"]
            and matches_filter(r, profile.get("sourceFilter"))
        ]
        picked.sort(key=lambda x: x[0])
        out.extend((sid, origin, r) for origin, r in picked[:MAX_PER_SOURCE])
    return out


def ensure_validator(cfg: dict) -> Path:
    v = cfg["validator"]
    env = os.environ.get("EEHRXF_VALIDATOR_JAR")
    if env:
        return Path(env)
    cache = Path.home() / ".cache" / "mvhd"
    jar = cache / f"validator_cli-{v['version']}.jar"
    if not jar.exists():
        cache.mkdir(parents=True, exist_ok=True)
        print(f"Downloading HL7 FHIR Validator {v['version']} ...", file=sys.stderr)
        tmp = jar.with_suffix(".part")
        urllib.request.urlretrieve(v["url"], tmp)
        tmp.rename(jar)
    return jar


def file_name(profile_id: str, sid: str, n: int) -> str:
    return f"{profile_id}__{sid}__{n:03d}.json"


def write_inputs(
    cfg: dict, sources: dict, work: Path, profiles: list[dict] | None = None
) -> dict[str, tuple[str, str, str]]:
    """Write one copy per (profile, resource). Returns {file: (profileId, sid, origin)}."""
    index: dict[str, tuple[str, str, str]] = {}
    for profile in cfg["profiles"] if profiles is None else profiles:
        counter: collections.Counter = collections.Counter()
        for sid, origin, resource in candidates(profile, sources):
            r = copy.deepcopy(resource)
            r.setdefault("meta", {})["profile"] = [profile["canonical"]]
            name = file_name(profile["profileId"], sid, counter[sid])
            counter[sid] += 1
            (work / name).write_text(json.dumps(r, indent=1, sort_keys=True), encoding="utf-8")
            index[name] = (profile["profileId"], sid, origin)
    return index


def run_validator(cfg: dict, jar: Path, work: Path, out: Path, igs: list[dict] | None = None) -> None:
    v = cfg["validator"]
    cmd = ["java", "-jar", str(jar), "-version", v["fhirVersion"]]
    for ig in sorted(cfg["igs"].values() if igs is None else igs, key=lambda i: i["package"]):
        cmd += ["-ig", f"{ig['package']}#{ig['version']}"]
    cmd += ["-tx", "n/a"]
    for domain in v.get("allowedExtensionDomains", []):
        cmd += ["-extension", domain]
    cmd += ["-output", str(out), str(work)]
    print(" ".join(cmd[:4]) + " ...", file=sys.stderr)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    # The validator exits 1 when any file has errors; that is a result, not a failure.
    if not out.exists():
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise SystemExit(f"validator produced no output (exit {proc.returncode})")


GENERIC = [
    (re.compile(r"\[\d+\]"), "[n]"),
    (re.compile(r"'[^']{24,}'"), "'...'"),
    (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"), "<uuid>"),
]


def generic(text: str) -> str:
    for rx, repl in GENERIC:
        text = rx.sub(repl, text)
    return text[:240]


def parse_outcomes(out: Path) -> dict[str, list[dict]]:
    """{file name: [error issues]} from the validator's output."""
    data = json.loads(out.read_text(encoding="utf-8"))
    outcomes = [e["resource"] for e in data.get("entry", [])] if data.get("resourceType") == "Bundle" else [data]
    result: dict[str, list[dict]] = {}
    for oo in outcomes:
        fname = next(
            (Path(x.get("valueString", "")).name for x in oo.get("extension", []) if x.get("url") == FILE_EXT),
            None,
        )
        if fname is None:
            continue
        errors = [i for i in oo.get("issue", []) if i.get("severity") in ("error", "fatal")]
        result[fname] = errors
    return result


def issue_text(issue: dict) -> str:
    where = (issue.get("expression") or issue.get("location") or [""])[0]
    where = re.sub(r"^Bundle\.entry\[\d+\]\.resource", "entry", where)
    msg = issue.get("details", {}).get("text") or issue.get("diagnostics") or issue.get("code", "")
    return generic(f"{where}: {msg}" if where else msg)


def inputs_digest(sources: dict) -> str:
    h = hashlib.sha256()
    for sid in sorted(sources):
        for origin, r in sources[sid]["resources"]:
            h.update(origin.encode())
            h.update(json.dumps(r, sort_keys=True).encode())
    return h.hexdigest()[:16]


def ignored(cfg: dict, sid: str, issue: dict) -> bool:
    text = issue_text(issue)
    return any(
        rule["contains"] in text and sid in rule["sources"] for rule in cfg["validator"].get("ignoredIssues", [])
    )


def profile_results(cfg: dict, igs: dict, profile_list: list[dict], sources: dict, index: dict, outcomes: dict) -> dict:
    profiles = {}
    for profile in profile_list:
        pid = profile["profileId"]
        ig = igs[profile["ig"]]
        by_source: dict[str, dict] = {sid: {"tested": 0, "passed": 0} for sid in sorted(sources)}
        issues: collections.Counter = collections.Counter()
        for fname, (p, sid, _origin) in sorted(index.items()):
            if p != pid:
                continue
            if fname not in outcomes:
                raise SystemExit(f"validator returned no outcome for {fname}")
            errs = [i for i in outcomes[fname] if not ignored(cfg, sid, i)]
            by_source[sid]["tested"] += 1
            if not errs:
                by_source[sid]["passed"] += 1
            for text in {issue_text(i) for i in errs}:
                issues[text] += 1
        tested = sum(s["tested"] for s in by_source.values())
        passed = sum(s["passed"] for s in by_source.values())
        profiles[pid] = {
            "canonical": profile["canonical"],
            "ig": f"{ig['package']}#{ig['version']}",
            "gate": not report_only(ig),
            "tested": tested,
            "passed": passed,
            "failed": tested - passed,
            "bySource": by_source,
            "topIssues": [
                {"issue": text, "resources": n}
                for text, n in sorted(issues.items(), key=lambda kv: (-kv[1], kv[0]))[:TOP_ISSUES]
            ],
        }
    return profiles


def build_report(cfg: dict, sources: dict, index: dict, outcomes: dict) -> dict:
    nat = national(cfg)
    return {
        "$comment": "Written by scripts/eehrxf/validate.py; do not edit. build.py reads it.",
        "validator": {
            "version": cfg["validator"]["version"],
            "terminology": cfg["validator"]["terminology"],
            "passRule": "a resource passes when the validator reports no error or fatal issue",
            "maxPerSource": MAX_PER_SOURCE,
            "allowedExtensionDomains": cfg["validator"].get("allowedExtensionDomains", []),
            "ignoredIssues": cfg["validator"].get("ignoredIssues", []),
        },
        "igs": {k: f"{v['package']}#{v['version']}" for k, v in sorted(cfg["igs"].items())},
        "sources": {
            sid: {"description": s["description"], "files": s["files"], "resources": len(s["resources"])}
            for sid, s in sorted(sources.items())
        },
        "inputsDigest": inputs_digest(sources),
        "profiles": profile_results(cfg, cfg["igs"], cfg["profiles"], sources, index, outcomes),
        "national": {
            "$comment": "German ePA profiles (#1172). Not EEHRxF: build.py does not read this section, so /eehrxf never shows it as coverage.",
            "igs": {
                k: {"package": f"{v['package']}#{v['version']}", "status": v["status"], "gate": not report_only(v)}
                for k, v in sorted(nat["igs"].items())
            },
            "profiles": profile_results(cfg, nat["igs"], nat["profiles"], sources, index, outcomes),
        },
    }


def all_profiles(report: dict) -> dict[str, dict]:
    return {**report.get("profiles", {}), **report.get("national", {}).get("profiles", {})}


def gate_failures(report: dict, baseline: dict | None) -> list[str]:
    """Gating profiles that fail more resources than the baseline records for them as gating.

    A report-only profile never fails the run. A profile the baseline does not
    have, or had as report-only, is allowed no failure.
    """
    known = all_profiles(baseline or {})
    out = []
    for pid, p in sorted(all_profiles(report).items()):
        if not p.get("gate", True):
            continue
        before = known.get(pid)
        allowed = before["failed"] if before and before.get("gate", True) else 0
        if p["failed"] > allowed:
            out.append(f"{pid} ({p['ig']}): {p['failed']} of {p['tested']} fail, the baseline allows {allowed}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--keep", action="store_true", help="keep the work directory")
    ap.add_argument("--report", default=str(REPORT), help="where to write the report")
    ap.add_argument(
        "--baseline",
        default=str(REPORT),
        help="report whose failures a gating profile may keep (default: the committed report; none: no gate)",
    )
    args = ap.parse_args()

    baseline = None
    if args.baseline != "none" and Path(args.baseline).exists():
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    cfg = load_config()
    sources = collect_sources()
    jar = ensure_validator(cfg)
    work = Path(tempfile.mkdtemp(prefix="eehrxf-"))
    try:
        # One run for the EEHRxF guides, then one per German guide: they pin
        # other versions of the same HL7 Europe packages.
        nat = national(cfg)
        runs = [("eehrxf", list(cfg["igs"].values()), cfg["profiles"])]
        for key, ig in sorted(nat["igs"].items()):
            runs.append((f"national-{key}", [ig], [p for p in nat["profiles"] if p["ig"] == key]))
        index: dict[str, tuple[str, str, str]] = {}
        outcomes: dict[str, list[dict]] = {}
        for name, igs, profiles in runs:
            inputs = work / "in" / name
            inputs.mkdir(parents=True)
            run_index = write_inputs(cfg, sources, inputs, profiles)
            index.update(run_index)
            if not run_index:
                continue
            out = work / f"outcome-{name}.json"
            run_validator(cfg, jar, inputs, out, igs)
            outcomes.update(parse_outcomes(out))
        report = build_report(cfg, sources, index, outcomes)
    finally:
        if args.keep:
            print(f"work directory kept: {work}", file=sys.stderr)
        else:
            shutil.rmtree(work, ignore_errors=True)

    Path(args.report).write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    for pid, p in all_profiles(report).items():
        mode = "" if p["gate"] else "  (report-only)"
        print(f"{pid:32} {p['passed']:3}/{p['tested']:<3} passed{mode}")
    failures = gate_failures(report, baseline)
    for line in failures:
        print(f"gate: {line}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
