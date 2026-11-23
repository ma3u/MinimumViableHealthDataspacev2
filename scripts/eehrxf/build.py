#!/usr/bin/env python3
"""Write the EEHRxF graph seed and static mock from profiles.json and the report (#1144).

Outputs, both generated, never edited by hand:

- neo4j/register-eehrxf-profiles.cypher: categories, profiles, their links
  and the validation results, idempotent (MERGE, and DELETE only for what the
  config no longer lists).
- ui/public/mock/eehrxf.json: what GET /api/eehrxf answers for that graph, for
  the static export. Graph node counts cannot be known offline; they are kept
  from the previous mock.
- services/matchbox/application.yaml: the Matchbox configuration for the
  neo4j-proxy's $validate (#1174). The image in services/matchbox bakes the
  packages it names (ADR-097), for docker-compose.matchbox.yml and the
  Container App mvhd-matchbox alike, so the validator there loads the same IG
  packages as the one in CI, and a package it does not name is not in it.
- services/neo4j-proxy/src/fhir-extension-domains.ts: the extension domains
  the CI validator allows, which the proxy sends with every $validate as
  Matchbox's `extensions` parameter (Matchbox v4.1.21 does not carry the
  config's extensions into a $validate; see matchbox_config).

    python3 scripts/eehrxf/build.py          # write all four
    python3 scripts/eehrxf/build.py --check  # exit 1 if any is out of date
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "profiles.json"
REPORT = HERE / "validation-report.json"
CYPHER = ROOT / "neo4j" / "register-eehrxf-profiles.cypher"
MOCK = ROOT / "ui" / "public" / "mock" / "eehrxf.json"
MATCHBOX = ROOT / "services" / "matchbox" / "application.yaml"
EXTENSION_DOMAINS = ROOT / "services" / "neo4j-proxy" / "src" / "fhir-extension-domains.ts"


def coverage(tested: int, passed: int) -> str:
    """full: every tested resource passes; partial: some do; none: none do; untested: nothing to test."""
    if tested == 0:
        return "untested"
    if passed == tested:
        return "full"
    return "partial" if passed > 0 else "none"


def category_status(coverages: list[str]) -> str:
    if coverages and all(c == "full" for c in coverages):
        return "available"
    if any(c in ("full", "partial") for c in coverages):
        return "partial"
    if coverages and all(c == "untested" for c in coverages):
        return "untested"
    return "none"


def q(value) -> str:
    """A Cypher literal."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(q(v) for v in value) + "]"
    s = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{s}'"


def issue_lines(p: dict) -> list[str]:
    # No semicolons: some loaders split Cypher files on them.
    return [f"{i['resources']}x {i['issue']}".replace(";", ",") for i in p["topIssues"]]


def model(cfg: dict, report: dict) -> dict:
    """Everything both outputs need, computed once."""
    profiles = []
    for prof in cfg["profiles"]:
        ig = cfg["igs"][prof["ig"]]
        r = report["profiles"][prof["profileId"]]
        if r["canonical"] != prof["canonical"]:
            raise SystemExit(f"report is stale for {prof['profileId']}: rerun validate.py")
        profiles.append(
            {
                **prof,
                "igName": ig["name"],
                "igPackage": f"{ig['package']}#{ig['version']}",
                "status": ig["status"],
                "fhirVersion": "R4",
                "url": ig["home"] + "StructureDefinition-" + prof["canonical"].rsplit("/", 1)[1] + ".html",
                "tested": r["tested"],
                "passed": r["passed"],
                "failed": r["failed"],
                "bySource": r["bySource"],
                "topIssues": issue_lines(r),
                "coverage": coverage(r["tested"], r["passed"]),
            }
        )
    categories = []
    for cat in cfg["categories"]:
        members = [p for p in profiles if cat["categoryId"] in p["categories"]]
        categories.append(
            {
                **cat,
                "profileCount": len(members),
                "tested": sum(p["tested"] for p in members),
                "passed": sum(p["passed"] for p in members),
                "status": category_status([p["coverage"] for p in members]),
            }
        )
    run = {
        "validatorVersion": report["validator"]["version"],
        "terminology": report["validator"]["terminology"],
        "passRule": report["validator"]["passRule"],
        "maxPerSource": report["validator"]["maxPerSource"],
        "igs": [report["igs"][k] for k in sorted(report["igs"])],
        "igUrls": [cfg["igs"][k]["home"] for k in sorted(report["igs"])],
        "validatorUrl": cfg["validator"]["url"].split("/download/")[0] + "/tag/" + report["validator"]["version"],
        "sources": [f"{sid}: {s['description']}" for sid, s in report["sources"].items()],
        "inputsDigest": report["inputsDigest"],
    }
    planned = [
        {
            "guideId": g["guideId"],
            "name": g["name"],
            "igPackage": f"{g['package']}#{g['version']}",
            "status": g["status"],
            "url": g["home"],
            "issue": g.get("issue"),
            "scope": g["scope"],
        }
        for g in cfg.get("planned", [])
    ]
    act = {k: v for k, v in cfg["implementingAct"].items() if not k.startswith("$")}
    return {"profiles": profiles, "categories": categories, "run": run, "planned": planned, "act": act}


def cypher(m: dict) -> str:
    out = [
        "// ============================================================",
        "// EEHRxF priority categories, HL7 Europe profiles and validation results",
        "// ============================================================",
        "// GENERATED by scripts/eehrxf/build.py from scripts/eehrxf/profiles.json",
        "// and scripts/eehrxf/validation-report.json. Do not edit by hand (#1144).",
        "//",
        "// Categories are the six of EHDS Art. 14(1), Regulation (EU) 2025/327, each",
        "// defined by one annex of the EEHRxF implementing act (#1205).",
        "// coverage comes from the HL7 FHIR Validator, not from counting nodes:",
        "//   full = every tested resource passes, partial = some do, none = none do,",
        "//   untested = the hub ingests nothing of that type. resourceCount is the",
        "//   number of graph nodes of the base type, shown for context only.",
        "//",
        "// Run after: init-schema.cypher. Idempotent.",
        "// ============================================================",
        "",
        "// Categories the config no longer lists (rare-disease registries were never an Art. 14 category)",
        f"MATCH (c:EEHRxFCategory) WHERE NOT c.categoryId IN {q([c['categoryId'] for c in m['categories']])}",
        "DETACH DELETE c;",
        "",
        "// Profiles the config no longer lists",
        f"MATCH (p:EEHRxFProfile) WHERE p.profileId IS NOT NULL AND NOT p.profileId IN {q([p['profileId'] for p in m['profiles']])}",
        "DETACH DELETE p;",
        "",
    ]
    for c in m["categories"]:
        out += [
            f"MERGE (c:EEHRxFCategory {{categoryId: {q(c['categoryId'])}}})",
            f"SET c.name = {q(c['name'])},",
            f"    c.article = {q(c['article'])},",
            f"    c.annex = {q(c['annex'])},",
            f"    c.description = {q(c['description'])},",
            f"    c.ehdsDeadline = {q(c['ehdsDeadline'])},",
            f"    c.ehdsGroup = {q(c['ehdsGroup'])},",
            f"    c.status = {q(c['status'])},",
            f"    c.profileCount = {q(c['profileCount'])},",
            f"    c.tested = {q(c['tested'])},",
            f"    c.passed = {q(c['passed'])};",
            "",
        ]
    for p in m["profiles"]:
        out += [
            f"MERGE (p:EEHRxFProfile {{profileId: {q(p['profileId'])}}})",
            f"SET p.name = {q(p['name'])},",
            f"    p.igName = {q(p['igName'])},",
            f"    p.igPackage = {q(p['igPackage'])},",
            f"    p.fhirVersion = {q(p['fhirVersion'])},",
            f"    p.status = {q(p['status'])},",
            f"    p.canonical = {q(p['canonical'])},",
            f"    p.url = {q(p['url'])},",
            f"    p.baseResource = {q(p['baseResource'])},",
            "    p.description = null,",
            f"    p.tested = {q(p['tested'])},",
            f"    p.passed = {q(p['passed'])},",
            f"    p.failed = {q(p['failed'])},",
            f"    p.topIssues = {q(p['topIssues'])},",
            f"    p.coverage = {q(p['coverage'])};",
            "",
        ]
    ids = q([p["profileId"] for p in m["profiles"]])
    out += [
        "// Category links of the configured profiles: drop, then declare again",
        f"MATCH (p:EEHRxFProfile)-[r:PART_OF_CATEGORY]->(:EEHRxFCategory) WHERE p.profileId IN {ids} DELETE r;",
        "",
    ]
    for p in m["profiles"]:
        for cid in p["categories"]:
            out.append(
                f"MATCH (p:EEHRxFProfile {{profileId: {q(p['profileId'])}}}), "
                f"(c:EEHRxFCategory {{categoryId: {q(cid)}}}) MERGE (p)-[:PART_OF_CATEGORY]->(c);"
            )
    out += [
        "",
        "// Every profile builds on the EU core Patient except the Patient itself",
        f"MATCH (p:EEHRxFProfile)-[r:DEPENDS_ON]->(:EEHRxFProfile) WHERE p.profileId IN {ids} DELETE r;",
        "MATCH (p:EEHRxFProfile), (dep:EEHRxFProfile {profileId: 'patient-eu-core'})",
        f"WHERE p.profileId IN {ids} AND p.profileId <> 'patient-eu-core' AND p.baseResource <> 'Bundle'",
        "MERGE (p)-[:DEPENDS_ON]->(dep);",
        "",
        "// Guides the hub plans to track that are not (yet) validated: new HL7 Europe drafts",
        f"MATCH (g:EEHRxFPlannedGuide) WHERE NOT g.guideId IN {q([g['guideId'] for g in m['planned']])} DETACH DELETE g;",
    ]
    for g in m["planned"]:
        out += [
            f"MERGE (g:EEHRxFPlannedGuide {{guideId: {q(g['guideId'])}}})",
            f"SET g.name = {q(g['name'])},",
            f"    g.igPackage = {q(g['igPackage'])},",
            f"    g.status = {q(g['status'])},",
            f"    g.url = {q(g['url'])},",
            f"    g.issue = {q(g['issue']) if g['issue'] is not None else 'null'},",
            f"    g.scope = {q(g['scope'])};",
        ]
    act = m["act"]
    out += [
        "",
        "// The implementing act that lays down the EEHRxF (Art. 15(1)), whose annexes define the categories",
        f"MATCH (a:EEHRxFImplementingAct) WHERE a.reference <> {q(act['reference'])} DETACH DELETE a;",
        f"MERGE (a:EEHRxFImplementingAct {{reference: {q(act['reference'])}}})",
        "SET " + ",\n    ".join(f"a.{k} = {q(act[k])}" for k in sorted(act) if k != "reference") + ";",
        "MATCH (c:EEHRxFCategory), (a:EEHRxFImplementingAct {reference: " + q(act["reference"]) + "})",
        "MERGE (c)-[:DEFINED_IN]->(a);",
    ]
    out += [
        "",
        "// The validation run the results above come from",
        "MERGE (v:EEHRxFValidationRun {runId: 'current'})",
    ]
    run = m["run"]
    sets = [f"v.{k} = {q(run[k])}" for k in sorted(run)]
    out.append("SET " + ",\n    ".join(sets) + ";")
    out += [
        "",
        "// Graph nodes per base type, for context (not coverage)",
    ]
    for base in sorted({p["baseResource"] for p in m["profiles"]}):
        out += [
            f"OPTIONAL MATCH (n:{base}) WITH count(n) AS cnt",
            f"MATCH (p:EEHRxFProfile {{baseResource: {q(base)}}}) SET p.resourceCount = cnt;",
        ]
    out += [
        "",
        "MATCH (c:EEHRxFCategory)",
        "OPTIONAL MATCH (c)<-[:PART_OF_CATEGORY]-(p:EEHRxFProfile)",
        "WITH c, sum(coalesce(p.resourceCount, 0)) AS total",
        "SET c.totalResources = total;",
        "",
    ]
    return "\n".join(out)


def matchbox_config(cfg: dict) -> str:
    """Matchbox's application.yaml: FHIR R4 core and every IG of profiles.json, pinned.

    Matchbox fetches each package (and its dependencies) from the FHIR package
    servers by name and version at its first start and keeps them in its
    database. services/matchbox/bake.sh makes that first start part of the
    image build and reads the IGs to check from this file, so the image holds
    exactly these packages (ADR-097). Terminology as the CI validator runs:
    no terminology server. Read-only, so nothing can install a package or
    change a resource through its API.

    The `extensions` line does not reach a validation in Matchbox v4.1.21:
    each $validate copies the server's settings into a new context, and the
    copy arrives without it (measured 2026-11-20: CliContext extensions=null
    with this line, and with MATCHBOX_FHIR_CONTEXT_EXTENSIONS=any). Only the
    request parameter `extensions` sets it, so the proxy sends the domains
    with every call (extension_domains_ts). The line stays for a Matchbox
    that honours it; changing it would also change the image (ADR-097).
    """
    v = cfg["validator"]
    lines = [
        "# GENERATED by scripts/eehrxf/build.py from scripts/eehrxf/profiles.json; do not edit.",
        "# Matchbox for POST /fhir/$validate on the neo4j-proxy (#1174). The image in",
        "# services/matchbox bakes these packages in at build time (bake.sh, ADR-097),",
        "# for docker-compose.matchbox.yml and the Container App mvhd-matchbox. The IG",
        "# packages are the ones the CI validator uses (#1144), so both validate",
        "# against the same guides.",
        "server:",
        "  servlet:",
        "    context-path: /matchboxv3",
        "hapi:",
        "  fhir:",
        "    implementationguides:",
        "      fhir_r4_core:",
        "        name: hl7.fhir.r4.core",
        f"        version: {v['fhirVersion']}",
        "        url: classpath:/hl7.fhir.r4.core.tgz",
    ]
    for key in sorted(cfg["igs"]):
        ig = cfg["igs"][key]
        lines += [
            f"      {key}:",
            f"        name: {ig['package']}",
            f'        version: "{ig["version"]}"',
        ]
    lines += [
        "matchbox:",
        "  fhir:",
        "    context:",
        f'      fhirVersion: "{v["fhirVersion"]}"',
        "      txServer: n/a",
        "      httpReadOnly: true",
        f'      extensions: "{",".join(v["allowedExtensionDomains"])}"',
        "",
    ]
    return "\n".join(lines)


def extension_domains_ts(cfg: dict) -> str:
    """The proxy's list of allowed extension domains, as Prettier writes it.

    services/neo4j-proxy/src/fhir-validate.ts sends each as an `extensions`
    parameter with every $validate, so Matchbox allows unknown extensions
    from these domains, as the CI validator does, and from no other.
    """
    lines = [
        "// GENERATED by scripts/eehrxf/build.py from scripts/eehrxf/profiles.json; do not edit.",
        "// The extension domains the CI validator allows (validator.allowedExtensionDomains).",
        "// fhir-validate.ts sends each with every $validate as Matchbox's `extensions`",
        "// parameter: Matchbox v4.1.21 does not apply the config's extensions to a",
        "// $validate (ADR-097).",
        "export const ALLOWED_EXTENSION_DOMAINS: readonly string[] = [",
    ]
    lines += [f"  {json.dumps(d)}," for d in cfg["validator"]["allowedExtensionDomains"]]
    lines += ["];", ""]
    return "\n".join(lines)


def mock(m: dict, previous: dict | None) -> dict:
    old_counts: dict[str, int] = {}
    old_resource_counts: dict[str, int] = {}
    if previous:
        old_resource_counts = previous.get("summary", {}).get("resourceCounts", {})
        for c in previous.get("categories", []):
            for p in c.get("profiles", []):
                old_counts.setdefault(p.get("baseResource", ""), p.get("resourceCount", 0))
    counts = {**old_counts, **old_resource_counts}

    def prof(p: dict) -> dict:
        return {
            "profileId": p["profileId"],
            "name": p["name"],
            "igName": p["igName"],
            "igPackage": p["igPackage"],
            "fhirVersion": p["fhirVersion"],
            "status": p["status"],
            "canonical": p["canonical"],
            "url": p["url"],
            "baseResource": p["baseResource"],
            "coverage": p["coverage"],
            "tested": p["tested"],
            "passed": p["passed"],
            "failed": p["failed"],
            "topIssues": p["topIssues"],
            "resourceCount": counts.get(p["baseResource"], 0),
        }

    order = sorted(m["categories"], key=lambda c: (c["ehdsGroup"], c["categoryId"]))
    categories = []
    for c in order:
        members = sorted(
            (p for p in m["profiles"] if c["categoryId"] in p["categories"]), key=lambda p: p["profileId"]
        )
        categories.append(
            {
                "categoryId": c["categoryId"],
                "name": c["name"],
                "article": c["article"],
                "annex": c["annex"],
                "description": c["description"],
                "ehdsDeadline": c["ehdsDeadline"],
                "ehdsGroup": c["ehdsGroup"],
                "status": c["status"],
                "totalResources": sum(counts.get(p["baseResource"], 0) for p in members),
                "profileCount": c["profileCount"],
                "tested": c["tested"],
                "passed": c["passed"],
                "profiles": [prof(p) for p in members],
            }
        )
    tested = sum(p["tested"] for p in m["profiles"])
    passed = sum(p["passed"] for p in m["profiles"])
    return {
        "categories": categories,
        "summary": {
            "totalCategories": len(m["categories"]),
            "totalProfiles": len(m["profiles"]),
            "testedProfiles": sum(1 for p in m["profiles"] if p["tested"] > 0),
            "passingProfiles": sum(1 for p in m["profiles"] if p["coverage"] == "full"),
            "resourcesTested": tested,
            "resourcesPassed": passed,
            "passRatePercent": round(100 * passed / tested) if tested else 0,
            "resourceCounts": {k: counts[k] for k in sorted(counts) if k},
        },
        "validation": m["run"],
        "planned": m["planned"],
        "implementingAct": m["act"],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="fail if the outputs are out of date")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    m = model(cfg, report)
    previous = json.loads(MOCK.read_text(encoding="utf-8")) if MOCK.exists() else None
    want = {
        CYPHER: cypher(m),
        MOCK: json.dumps(mock(m, previous), indent=2, ensure_ascii=False) + "\n",
        MATCHBOX: matchbox_config(cfg),
        EXTENSION_DOMAINS: extension_domains_ts(cfg),
    }
    def same(p: Path, text: str) -> bool:
        if not p.exists():
            return False
        # Prettier reflows the mock on commit; compare it as data, the Cypher as text.
        if p.suffix == ".json":
            return json.loads(p.read_text(encoding="utf-8")) == json.loads(text)
        return p.read_text(encoding="utf-8") == text

    stale = [p for p, text in want.items() if not same(p, text)]
    if args.check:
        for p in stale:
            print(f"out of date: {p.relative_to(ROOT)} (run python3 scripts/eehrxf/build.py)", file=sys.stderr)
        return 1 if stale else 0
    for p, text in want.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        print(f"wrote {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
