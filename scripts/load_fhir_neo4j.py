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
                                        [--dataset-id urn:uuid:charite:dataset:diab-001]
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

UPSERT_PATIENTS = """
UNWIND $rows AS row
MERGE (p:Patient {id: row.id})
SET p.name      = row.name,
    p.birthDate = row.birthDate,
    p.gender    = row.gender,
    p.deceased  = row.deceased,
    p.city      = row.city,
    p.state     = row.state
WITH p, row WHERE row.datasetId <> ''
MATCH (hd:HealthDataset {id: row.datasetId})
MERGE (p)-[:FROM_DATASET]->(hd)
"""

UPSERT_ENCOUNTERS = """
UNWIND $rows AS row
MERGE (e:Encounter {id: row.id})
SET e.name   = row.name,
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
SET c.name      = row.name,
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
MERGE (s:SnomedConcept {code: row.code})
  ON CREATE SET s.name = row.display, s.description = row.display
MERGE (c)-[:CODED_BY]->(s)
"""

UPSERT_OBSERVATIONS = """
UNWIND $rows AS row
MERGE (o:Observation {id: row.id})
SET o.name     = row.name,
    o.dateTime = row.dateTime,
    o.code     = row.code,
    o.display  = row.display,
    o.system   = row.system,
    o.value    = row.value,
    o.unit     = row.unit,
    o.category = row.category
WITH o, row WHERE row.patientId <> ''
MATCH (p:Patient {id: row.patientId})
MERGE (p)-[:HAS_OBSERVATION]->(o)
"""

LINK_OBSERVATIONS_LOINC = """
UNWIND $rows AS row
MATCH (o:Observation {id: row.id})
MERGE (l:LoincCode {code: row.code})
  ON CREATE SET l.name = row.display, l.description = row.display
MERGE (o)-[:CODED_BY]->(l)
"""

UPSERT_MEDICATIONS = """
UNWIND $rows AS row
MERGE (m:MedicationRequest {id: row.id})
SET m.name    = row.name,
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
MERGE (r:RxNormConcept {code: row.code})
  ON CREATE SET r.name = row.display, r.description = row.display
MERGE (m)-[:CODED_BY]->(r)
"""

UPSERT_PROCEDURES = """
UNWIND $rows AS row
MERGE (pr:Procedure {id: row.id})
SET pr.name            = row.name,
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
MERGE (s:SnomedConcept {code: row.code})
  ON CREATE SET s.name = row.display, s.description = row.display
MERGE (pr)-[:CODED_BY]->(s)
"""


# ── Bundle parser ─────────────────────────────────────────────────────────────

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
            codings = r.get("code", {}).get("coding", [])
            code = codings[0].get("code", "") if codings else ""
            display = (
                codings[0].get("display", r.get("code", {}).get("text", ""))
                if codings else ""
            )
            system = codings[0].get("system", "") if codings else ""
            vq = r.get("valueQuantity") or {}
            cat_codings = (r.get("category") or [{}])[0].get("coding", [])
            cat = cat_codings[0].get("code", "") if cat_codings else ""
            row = {
                "id": oid, "name": display or oid,
                "dateTime": r.get("effectiveDateTime", ""),
                "code": code, "display": display, "system": system,
                "value": str(vq.get("value", "")), "unit": vq.get("unit", ""),
                "category": cat, "patientId": patient_id,
            }
            observations.append(row)
            if code and "loinc" in system.lower():
                loinc_rows.append({"id": oid, "code": code, "display": display})

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
    parser.add_argument("--dataset-id", default="urn:uuid:charite:dataset:diab-001",
                        help="HealthDataset id to link patients to")
    args = parser.parse_args()

    bundles = sorted(glob.glob(os.path.join(args.dir, "*.json")))
    if not bundles:
        sys.exit(
            f"ERROR: No *.json files found in {args.dir}\n"
            "Run scripts/generate-synthea.sh first."
        )

    print("=== Phase 3b: Load FHIR Bundles → Neo4j ===")
    print(f"Bundles   : {len(bundles)}")
    print(f"Neo4j URI : {args.uri}")
    print(f"Dataset   : {args.dataset_id}")
    print("")

    driver = GraphDatabase.driver(args.uri, auth=(args.user, args.password))
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
