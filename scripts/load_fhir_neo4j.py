#!/usr/bin/env python3
"""
Phase 3b: Load Synthea FHIR R4 bundles into the Neo4j Health Knowledge Graph.

Uses UNWIND bulk upserts (one Cypher call per resource type per bundle) for
fast loading of large cohorts.

Usage:
    python3 scripts/load_fhir_neo4j.py [--dir neo4j/import/fhir] \
                                        [--uri bolt://localhost:7687] \
                                        [--user neo4j] \
                                        [--password healthdataspace] \
                                        [--dataset-id urn:uuid:riverside:dataset:diab-001]
"""

import argparse
import glob
import json
import os
import sys
from pathlib import Path

try:
    from neo4j import GraphDatabase
except ImportError:
    sys.exit("ERROR: neo4j package not found.  Run: pip install neo4j")

# ── Bulk UNWIND Cypher (one call per resource type per bundle) ────────────────

# Terminology nodes are merged on the key neo4j/init-schema.cypher makes
# unique (#1215): SnomedConcept.conceptId, LoincCode.loincNumber,
# RxNormConcept.rxcui. Merged on `code`, the constraint never saw them and a
# concept the seeds had already written existed twice. `code` stays as a
# property for the readers that show it. The seeds write SNOMED CT and RxNorm
# keys as integers and as strings, so an existing concept is looked up by
# either before a new one is made; neo4j/migrate-terminology-keys.cypher
# merges what an earlier run split. test_load_fhir_neo4j.py checks the keys.

UPSERT_PATIENTS = """
UNWIND $rows AS row
MERGE (p:Patient {id: row.id})
SET p.resourceId = row.id,
    p.name      = row.name,
    p.birthDate = row.birthDate,
    p.gender    = row.gender,
    p.deceased  = row.deceased,
    p.city      = row.city,
    p.state     = row.state
WITH p, row WHERE row.datasetId <> ''
MATCH (hd:HealthDataset {datasetId: row.datasetId})
MERGE (p)-[:FROM_DATASET]->(hd)
"""

UPSERT_ENCOUNTERS = """
UNWIND $rows AS row
MERGE (e:Encounter {id: row.id})
SET e.resourceId = row.id,
    e.name   = row.name,
    e.date   = row.date,
    e.class  = row.encClass,
    e.type   = row.type,
    e.status = row.status
WITH e, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_ENCOUNTER]->(e)
"""

UPSERT_CONDITIONS = """
UNWIND $rows AS row
MERGE (c:Condition {id: row.id})
SET c.resourceId = row.id,
    c.name      = row.name,
    c.onsetDate = row.onsetDate,
    c.code      = row.code,
    c.display   = row.display,
    c.system    = row.system,
    c.status    = row.status
WITH c, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_CONDITION]->(c)
"""

LINK_CONDITIONS_SNOMED = """
UNWIND $rows AS row
MATCH (c:Condition {id: row.id})
OPTIONAL MATCH (known:SnomedConcept)
  WHERE known.conceptId = toString(row.code)
WITH c, row, head(collect(known)) AS known
FOREACH (k IN CASE WHEN known IS NULL THEN [] ELSE [known] END |
  MERGE (c)-[:CODED_BY]->(k))
FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
  MERGE (s:SnomedConcept {conceptId: toString(row.code)})
    ON CREATE SET s.code = row.code, s.name = row.display,
                  s.description = row.display
    ON MATCH SET s.code = coalesce(s.code, row.code)
  MERGE (c)-[:CODED_BY]->(s))
"""

UPSERT_OBSERVATIONS = """
UNWIND $rows AS row
MERGE (o:Observation {id: row.id})
SET o.resourceId = row.id,
    o.name     = row.name,
    o.dateTime = row.dateTime,
    o.code     = row.code,
    o.display  = row.display,
    o.system   = row.system,
    o.value    = row.value,
    o.valueQuantity = row.value,
    o.unit     = row.unit,
    o.ucumCode = row.ucumCode,
    o.category = row.category,
    o.codingSystems  = row.codingSystems,
    o.codingCodes    = row.codingCodes,
    o.codingDisplays = row.codingDisplays,
    o.componentCodes    = row.componentCodes,
    o.componentDisplays = row.componentDisplays,
    o.componentValues   = row.componentValues,
    o.componentUnits    = row.componentUnits,
    o.componentUcumCodes = row.componentUcumCodes,
    o.componentAbsentCodes = row.componentAbsentCodes
WITH o, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_OBSERVATION]->(o)
"""

# #1218: an Observation's SNOMED CT codings beside its LOINC code.
LINK_OBSERVATIONS_SNOMED = """
UNWIND $rows AS row
MATCH (o:Observation {id: row.id})
MERGE (s:SnomedConcept {conceptId: toString(row.code)})
  ON CREATE SET s.code = row.code, s.name = row.display,
                s.description = row.display
  ON MATCH SET s.code = coalesce(s.code, row.code)
MERGE (o)-[:CODED_BY]->(s)
"""

LINK_OBSERVATIONS_LOINC = """
UNWIND $rows AS row
MATCH (o:Observation {id: row.id})
MERGE (l:LoincCode {loincNumber: row.code})
  ON CREATE SET l.code = row.code, l.name = row.display,
                l.description = row.display
  ON MATCH SET l.code = coalesce(l.code, row.code)
MERGE (o)-[:CODED_BY]->(l)
"""

UPSERT_MEDICATIONS = """
UNWIND $rows AS row
MERGE (m:MedicationRequest {id: row.id})
SET m.resourceId = row.id,
    m.name    = row.name,
    m.date    = row.date,
    m.code    = row.code,
    m.display = row.display,
    m.system  = row.system,
    m.status  = row.status,
    m.intent  = row.intent
WITH m, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_MEDICATION]->(m)
"""

LINK_MEDICATIONS_RXNORM = """
UNWIND $rows AS row
MATCH (m:MedicationRequest {id: row.id})
OPTIONAL MATCH (known:RxNormConcept)
  WHERE known.rxcui = toString(row.code)
WITH m, row, head(collect(known)) AS known
FOREACH (k IN CASE WHEN known IS NULL THEN [] ELSE [known] END |
  MERGE (m)-[:CODED_BY]->(k))
FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
  MERGE (r:RxNormConcept {rxcui: toString(row.code)})
    ON CREATE SET r.code = row.code, r.name = row.display,
                  r.description = row.display
    ON MATCH SET r.code = coalesce(r.code, row.code)
  MERGE (m)-[:CODED_BY]->(r))
"""

UPSERT_PROCEDURES = """
UNWIND $rows AS row
MERGE (pr:Procedure {id: row.id})
SET pr.resourceId = row.id,
    pr.name            = row.name,
    pr.performedStart  = row.performedStart,
    pr.performedEnd    = row.performedEnd,
    pr.code            = row.code,
    pr.display         = row.display,
    pr.system          = row.system,
    pr.status          = row.status
WITH pr, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_PROCEDURE]->(pr)
"""

LINK_PROCEDURES_SNOMED = """
UNWIND $rows AS row
MATCH (pr:Procedure {id: row.id})
OPTIONAL MATCH (known:SnomedConcept)
  WHERE known.conceptId = toString(row.code)
WITH pr, row, head(collect(known)) AS known
FOREACH (k IN CASE WHEN known IS NULL THEN [] ELSE [known] END |
  MERGE (pr)-[:CODED_BY]->(k))
FOREACH (_ IN CASE WHEN known IS NULL THEN [1] ELSE [] END |
  MERGE (s:SnomedConcept {conceptId: toString(row.code)})
    ON CREATE SET s.code = row.code, s.name = row.display,
                  s.description = row.display
    ON MATCH SET s.code = coalesce(s.code, row.code)
  MERGE (pr)-[:CODED_BY]->(s))
"""


# ── Bundle parser ─────────────────────────────────────────────────────────────

UCUM = "http://unitsofmeasure.org"


def _number(v):
    """A quantity's value as a number, or None (#1218: it was a string)."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _quantity(q):
    """(value, printed unit, UCUM code) of a FHIR Quantity.

    The unit as the source printed it, and the UCUM code only when the source
    says it is one (system unitsofmeasure.org); the FHIR facade maps a printed
    unit without one (#1214)."""
    q = q or {}
    printed = (q.get("unit") or q.get("code") or "").strip()
    ucum = (q.get("code") or "").strip() if q.get("system") == UCUM else ""
    return _number(q.get("value")), printed, ucum


def _codings(concept):
    """Every coding of a CodeableConcept, LOINC first (#1218)."""
    codings = [c for c in (concept or {}).get("coding", []) if c.get("code")]
    return sorted(codings, key=lambda c: "loinc" not in (c.get("system") or "").lower())


def _components(r):
    """An Observation's components as aligned lists (#1218).

    Neo4j keeps no null in a list, so a component without a numeric value is
    named in componentAbsentCodes rather than given an empty slot."""
    out = {k: [] for k in ("componentCodes", "componentDisplays", "componentValues",
                           "componentUnits", "componentUcumCodes", "componentAbsentCodes")}
    for comp in r.get("component") or []:
        cs = _codings(comp.get("code"))
        if not cs:
            continue
        value, unit, ucum = _quantity(comp.get("valueQuantity"))
        if value is None:
            out["componentAbsentCodes"].append(cs[0]["code"])
            continue
        out["componentCodes"].append(cs[0]["code"])
        out["componentDisplays"].append(cs[0].get("display") or (comp.get("code") or {}).get("text") or "")
        out["componentValues"].append(value)
        out["componentUnits"].append(unit)
        out["componentUcumCodes"].append(ucum)
    return out


def parse_bundle(bundle_path: str, dataset_id: str):
    """Parse a FHIR bundle into typed row lists ready for UNWIND upserts."""
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    if bundle.get("resourceType") != "Bundle":
        return None

    entries = bundle.get("entry", [])

    # Find patient id first
    patient_id = ""
    for entry in entries:
        r = entry.get("resource", {})
        if r.get("resourceType") == "Patient":
            patient_id = r["id"]
            break

    patients, encounters, conditions, observations, medications, procedures = [], [], [], [], [], []
    snomed_rows, loinc_rows, rxnorm_rows, proc_snomed_rows = [], [], [], []
    obs_snomed_rows = []

    for entry in entries:
        r = entry.get("resource", {})
        rtype = r.get("resourceType", "")

        if rtype == "Patient":
            pid = r["id"]
            names = r.get("name", [])
            n = names[0] if names else {}
            given = " ".join(n.get("given", []))
            family = n.get("family", "")
            name = f"{given} {family}".strip() or pid
            patients.append({
                "id": pid, "name": name,
                "birthDate": r.get("birthDate", ""),
                "gender": r.get("gender", ""),
                "deceased": r.get("deceasedDateTime", r.get("deceasedBoolean", False)),
                "city": (r.get("address") or [{}])[0].get("city", ""),
                "state": (r.get("address") or [{}])[0].get("state", ""),
                "datasetId": dataset_id or "",
            })

        elif rtype == "Encounter" and patient_id:
            eid = r["id"]
            date = r.get("period", {}).get("start", "")
            enc_class = r.get("class", {}).get("code", "")
            enc_type_codings = (r.get("type") or [{}])[0].get("coding", [])
            enc_type = (
                enc_type_codings[0].get("display", enc_type_codings[0].get("code", ""))
                if enc_type_codings else ""
            )
            encounters.append({
                "id": eid,
                "name": f"Encounter {date[:10] if date else eid}",
                "date": date, "encClass": enc_class, "type": enc_type,
                "status": r.get("status", ""), "patientId": patient_id,
            })

        elif rtype == "Condition" and patient_id:
            cid = r["id"]
            codings = r.get("code", {}).get("coding", [])
            code = codings[0].get("code", "") if codings else ""
            display = (
                codings[0].get("display", r.get("code", {}).get("text", ""))
                if codings else ""
            )
            system = codings[0].get("system", "") if codings else ""
            onset = r.get("onsetDateTime", (r.get("onsetPeriod") or {}).get("start", ""))
            cs_codings = (r.get("clinicalStatus") or {}).get("coding", [])
            status = cs_codings[0].get("code", "") if cs_codings else ""
            row = {
                "id": cid, "name": display or cid, "onsetDate": onset,
                "code": code, "display": display, "system": system,
                "status": status, "patientId": patient_id,
            }
            conditions.append(row)
            if code and "snomed" in system.lower():
                snomed_rows.append({"id": cid, "code": code, "display": display})

        elif rtype == "Observation" and patient_id:
            oid = r["id"]
            # #1218: every coding, LOINC first; the first is the node's code.
            codings = _codings(r.get("code"))
            text = (r.get("code") or {}).get("text", "")
            primary = codings[0] if codings else {}
            code = primary.get("code", "")
            display = primary.get("display", text) if codings else ""
            system = primary.get("system", "")
            value, unit, ucum = _quantity(r.get("valueQuantity"))
            cat_codings = (r.get("category") or [{}])[0].get("coding", [])
            cat = cat_codings[0].get("code", "") if cat_codings else ""
            row = {
                "id": oid, "name": display or oid,
                "dateTime": r.get("effectiveDateTime", ""),
                "code": code, "display": display, "system": system,
                "value": value, "unit": unit or None, "ucumCode": ucum or None,
                "category": cat, "patientId": patient_id,
                "codingSystems": [c.get("system", "") for c in codings],
                "codingCodes": [c["code"] for c in codings],
                "codingDisplays": [c.get("display", "") for c in codings],
                **_components(r),
            }
            observations.append(row)
            for c in codings:
                sys_ = (c.get("system") or "").lower()
                link = {"id": oid, "code": c["code"], "display": c.get("display", display)}
                if "loinc" in sys_:
                    loinc_rows.append(link)
                elif "snomed" in sys_:
                    obs_snomed_rows.append(link)

        elif rtype == "MedicationRequest" and patient_id:
            mid = r["id"]
            med = r.get("medicationCodeableConcept") or {}
            codings = med.get("coding", [])
            code = codings[0].get("code", "") if codings else ""
            display = codings[0].get("display", med.get("text", "")) if codings else ""
            system = codings[0].get("system", "") if codings else ""
            row = {
                "id": mid, "name": display or mid,
                "date": r.get("authoredOn", ""),
                "code": code, "display": display, "system": system,
                "status": r.get("status", ""), "intent": r.get("intent", ""),
                "patientId": patient_id,
            }
            medications.append(row)
            if code and "rxnorm" in system.lower():
                rxnorm_rows.append({"id": mid, "code": code, "display": display})

        elif rtype == "Procedure" and patient_id:
            prid = r["id"]
            codings = r.get("code", {}).get("coding", [])
            code = codings[0].get("code", "") if codings else ""
            display = (
                codings[0].get("display", r.get("code", {}).get("text", ""))
                if codings else ""
            )
            system = codings[0].get("system", "") if codings else ""
            period = r.get("performedPeriod") or {}
            performed_start = period.get("start", r.get("performedDateTime", ""))
            performed_end = period.get("end", "")
            row = {
                "id": prid, "name": display or prid,
                "performedStart": performed_start,
                "performedEnd": performed_end,
                "code": code, "display": display, "system": system,
                "status": r.get("status", ""),
                "patientId": patient_id,
            }
            procedures.append(row)
            if code and "snomed" in system.lower():
                proc_snomed_rows.append({"id": prid, "code": code, "display": display})

    return {
        "patients": patients, "encounters": encounters,
        "conditions": conditions, "snomed_rows": snomed_rows,
        "observations": observations, "loinc_rows": loinc_rows,
        "obs_snomed_rows": obs_snomed_rows,
        "medications": medications, "rxnorm_rows": rxnorm_rows,
        "procedures": procedures, "proc_snomed_rows": proc_snomed_rows,
    }


def load_bundle(session, bundle_path: str, dataset_id: str, stats: dict):
    data = parse_bundle(bundle_path, dataset_id)
    if data is None:
        return
    try:
        with session.begin_transaction() as tx:
            if data["patients"]:
                tx.run(UPSERT_PATIENTS, rows=data["patients"])
                stats["Patient"] = stats.get("Patient", 0) + len(data["patients"])
            if data["encounters"]:
                tx.run(UPSERT_ENCOUNTERS, rows=data["encounters"])
                stats["Encounter"] = stats.get("Encounter", 0) + len(data["encounters"])
            if data["conditions"]:
                tx.run(UPSERT_CONDITIONS, rows=data["conditions"])
                if data["snomed_rows"]:
                    tx.run(LINK_CONDITIONS_SNOMED, rows=data["snomed_rows"])
                stats["Condition"] = stats.get("Condition", 0) + len(data["conditions"])
            if data["observations"]:
                tx.run(UPSERT_OBSERVATIONS, rows=data["observations"])
                if data["loinc_rows"]:
                    tx.run(LINK_OBSERVATIONS_LOINC, rows=data["loinc_rows"])
                if data["obs_snomed_rows"]:
                    tx.run(LINK_OBSERVATIONS_SNOMED, rows=data["obs_snomed_rows"])
                stats["Observation"] = stats.get("Observation", 0) + len(data["observations"])
            if data["medications"]:
                tx.run(UPSERT_MEDICATIONS, rows=data["medications"])
                if data["rxnorm_rows"]:
                    tx.run(LINK_MEDICATIONS_RXNORM, rows=data["rxnorm_rows"])
                stats["MedicationRequest"] = (
                    stats.get("MedicationRequest", 0) + len(data["medications"])
                )
            if data["procedures"]:
                tx.run(UPSERT_PROCEDURES, rows=data["procedures"])
                if data["proc_snomed_rows"]:
                    tx.run(LINK_PROCEDURES_SNOMED, rows=data["proc_snomed_rows"])
                stats["Procedure"] = (
                    stats.get("Procedure", 0) + len(data["procedures"])
                )
            tx.commit()
    except Exception as e:
        print(f"\n  WARN [{os.path.basename(bundle_path)}]: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    repo_root = Path(__file__).parent.parent
    default_fhir_dir = repo_root / "neo4j" / "import" / "fhir"

    parser = argparse.ArgumentParser(
        description="Load Synthea FHIR bundles into Neo4j (bulk UNWIND)"
    )
    parser.add_argument("--dir", default=str(default_fhir_dir),
                        help="Directory with *.json bundles")
    parser.add_argument("--uri", default="bolt://localhost:7687")
    parser.add_argument("--user", default="neo4j")
    parser.add_argument("--password", default="healthdataspace")
    parser.add_argument("--dataset-id", default="urn:uuid:riverside:dataset:diab-001",
                        help="HealthDataset id to link patients to")
    parser.add_argument("--start-index", type=int, default=0,
                        help="Start loading from this bundle index (0-based)")
    parser.add_argument("--end-index", type=int, default=None,
                        help="Stop loading at this bundle index (exclusive)")
    args = parser.parse_args()

    # Override from environment variables (for scripted use)
    uri = os.environ.get("NEO4J_URI", args.uri)
    user = os.environ.get("NEO4J_USER", args.user)
    password = os.environ.get("NEO4J_PASSWORD", args.password)

    bundles = sorted(glob.glob(os.path.join(args.dir, "*.json")))
    if not bundles:
        sys.exit(
            f"ERROR: No *.json files found in {args.dir}\n"
            "Run scripts/generate-synthea.sh first."
        )

    # Apply index range for federated/partial loading
    bundles = bundles[args.start_index:args.end_index]

    print("=== Phase 3b: Load FHIR Bundles → Neo4j ===")
    print(f"Bundles   : {len(bundles)} (index {args.start_index}–{args.end_index or 'end'})")
    print(f"Neo4j URI : {uri}")
    print(f"Dataset   : {args.dataset_id}")
    print("")

    driver = GraphDatabase.driver(uri, auth=(user, password))
    stats: dict = {}

    with driver.session() as session:
        for i, path in enumerate(bundles, 1):
            label = os.path.basename(path)
            print(f"  [{i:3d}/{len(bundles)}] {label}", end="\r", flush=True)
            load_bundle(session, path, args.dataset_id, stats)

    driver.close()

    print("\n")
    print("✓ Import complete")
    print("")
    for rtype, count in sorted(stats.items()):
        print(f"  {rtype:<25} {count:>6} nodes upserted")
    print("")
    print("Next: run FHIR → OMOP transform:")
    print(
        "  cat neo4j/fhir-to-omop-transform.cypher | "
        "docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace"
    )


if __name__ == "__main__":
    main()
