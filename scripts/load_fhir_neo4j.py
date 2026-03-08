#!/usr/bin/env python3
"""
Phase 3b: Load Synthea FHIR R4 bundles into the Neo4j Health Knowledge Graph.

Reads every *.json bundle from neo4j/import/fhir/ and upserts nodes/
relationships into the Layer 3 (FHIR Clinical Graph) following the schema in
health-dataspace-graph-schema.md.

Usage:
    python3 scripts/load_fhir_neo4j.py [--dir neo4j/import/fhir] \
                                        [--uri bolt://localhost:7687] \
                                        [--user neo4j] \
                                        [--password healthdataspace] \
                                        [--dataset-id urn:uuid:charite:dataset:diab-001]

Requirements:
    pip install neo4j
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
    sys.exit("ERROR: neo4j package not found. Run: pip install neo4j")

# ── Cypher templates ──────────────────────────────────────────────────────────

MERGE_PATIENT = """
MERGE (p:Patient {id: $id})
SET p.name       = $name,
    p.birthDate  = $birthDate,
    p.gender     = $gender,
    p.deceased   = $deceased,
    p.city       = $city,
    p.state      = $state
"""

LINK_PATIENT_DATASET = """
MATCH (p:Patient {id: $patientId})
MATCH (hd:HealthDataset {id: $datasetId})
MERGE (p)-[:FROM_DATASET]->(hd)
"""

MERGE_ENCOUNTER = """
MERGE (e:Encounter {id: $id})
SET e.name   = $name,
    e.date   = $date,
    e.class  = $encClass,
    e.type   = $type,
    e.status = $status
WITH e
MATCH (p:Patient {id: $patientId})
MERGE (p)-[:HAS_ENCOUNTER]->(e)
"""

MERGE_CONDITION = """
MERGE (c:Condition {id: $id})
SET c.name      = $name,
    c.onsetDate = $onsetDate,
    c.code      = $code,
    c.display   = $display,
    c.system    = $system,
    c.status    = $status
WITH c
MATCH (p:Patient {id: $patientId})
MERGE (p)-[:HAS_CONDITION]->(c)
"""

LINK_CONDITION_SNOMED = """
MATCH (c:Condition {id: $conditionId})
MERGE (s:SnomedConcept {code: $code})
  ON CREATE SET s.name = $display, s.description = $display
MERGE (c)-[:CODED_BY]->(s)
"""

MERGE_OBSERVATION = """
MERGE (o:Observation {id: $id})
SET o.name      = $name,
    o.dateTime  = $dateTime,
    o.code      = $code,
    o.display   = $display,
    o.system    = $system,
    o.value     = $value,
    o.unit      = $unit,
    o.category  = $category
WITH o
MATCH (p:Patient {id: $patientId})
MERGE (p)-[:HAS_OBSERVATION]->(o)
"""

LINK_OBSERVATION_LOINC = """
MATCH (o:Observation {id: $observationId})
MERGE (l:LoincCode {code: $code})
  ON CREATE SET l.name = $display, l.description = $display
MERGE (o)-[:CODED_BY]->(l)
"""

MERGE_MEDICATION = """
MERGE (m:MedicationRequest {id: $id})
SET m.name    = $name,
    m.date    = $date,
    m.code    = $code,
    m.display = $display,
    m.system  = $system,
    m.status  = $status,
    m.intent  = $intent
WITH m
MATCH (p:Patient {id: $patientId})
MERGE (p)-[:HAS_MEDICATION]->(m)
"""

LINK_MEDICATION_RXNORM = """
MATCH (m:MedicationRequest {id: $medicationId})
MERGE (r:RxNormConcept {code: $code})
  ON CREATE SET r.name = $display, r.description = $display
MERGE (m)-[:CODED_BY]->(r)
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ref_id(reference: str) -> str:
    """Extract bare id from 'ResourceType/id' reference string."""
    return reference.split("/")[-1] if reference else ""


def _first_coding(concept: dict) -> tuple[str, str, str]:
    """Return (code, display, system) from a CodeableConcept."""
    codings = concept.get("coding", [])
    if not codings:
        return "", concept.get("text", ""), ""
    c = codings[0]
    return c.get("code", ""), c.get("display", concept.get("text", "")), c.get("system", "")


def _patient_name(resource: dict) -> str:
    names = resource.get("name", [])
    if not names:
        return resource.get("id", "Unknown")
    n = names[0]
    given = " ".join(n.get("given", []))
    family = n.get("family", "")
    return f"{given} {family}".strip() or resource.get("id", "Unknown")


# ── Resource processors ───────────────────────────────────────────────────────

def process_patient(tx, resource: dict, dataset_id: str):
    pid = resource["id"]
    tx.run(MERGE_PATIENT, id=pid,
           name=_patient_name(resource),
           birthDate=resource.get("birthDate", ""),
           gender=resource.get("gender", ""),
           deceased=resource.get("deceasedDateTime", resource.get("deceasedBoolean", False)),
           city=resource.get("address", [{}])[0].get("city", ""),
           state=resource.get("address", [{}])[0].get("state", ""))
    if dataset_id:
        tx.run(LINK_PATIENT_DATASET, patientId=pid, datasetId=dataset_id)


def process_encounter(tx, resource: dict, patient_id: str):
    eid = resource["id"]
    date = resource.get("period", {}).get("start", "")
    enc_class = resource.get("class", {}).get("code", "")
    enc_type = ""
    if resource.get("type"):
        _, enc_type, _ = _first_coding(resource["type"][0])
    tx.run(MERGE_ENCOUNTER, id=eid,
           name=f"Encounter {date[:10] if date else eid}",
           date=date, encClass=enc_class, type=enc_type,
           status=resource.get("status", ""),
           patientId=patient_id)


def process_condition(tx, resource: dict, patient_id: str):
    cid = resource["id"]
    code, display, system = _first_coding(resource.get("code", {}))
    onset = resource.get("onsetDateTime", resource.get("onsetPeriod", {}).get("start", ""))
    tx.run(MERGE_CONDITION, id=cid,
           name=display or cid,
           onsetDate=onset, code=code, display=display, system=system,
           status=resource.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", ""),
           patientId=patient_id)
    if code and "snomed" in system.lower():
        tx.run(LINK_CONDITION_SNOMED, conditionId=cid, code=code, display=display)


def process_observation(tx, resource: dict, patient_id: str):
    oid = resource["id"]
    code, display, system = _first_coding(resource.get("code", {}))
    vq = resource.get("valueQuantity", {})
    category = ""
    if resource.get("category"):
        _, category, _ = _first_coding(resource["category"][0])
    tx.run(MERGE_OBSERVATION, id=oid,
           name=display or oid,
           dateTime=resource.get("effectiveDateTime", ""),
           code=code, display=display, system=system,
           value=str(vq.get("value", "")), unit=vq.get("unit", ""),
           category=category,
           patientId=patient_id)
    if code and "loinc" in system.lower():
        tx.run(LINK_OBSERVATION_LOINC, observationId=oid, code=code, display=display)


def process_medication_request(tx, resource: dict, patient_id: str):
    mid = resource["id"]
    med = resource.get("medicationCodeableConcept", {})
    code, display, system = _first_coding(med)
    tx.run(MERGE_MEDICATION, id=mid,
           name=display or mid,
           date=resource.get("authoredOn", ""),
           code=code, display=display, system=system,
           status=resource.get("status", ""),
           intent=resource.get("intent", ""),
           patientId=patient_id)
    if code and "rxnorm" in system.lower():
        tx.run(LINK_MEDICATION_RXNORM, medicationId=mid, code=code, display=display)


PROCESSORS = {
    "Patient": process_patient,
    "Encounter": process_encounter,
    "Condition": process_condition,
    "Observation": process_observation,
    "MedicationRequest": process_medication_request,
}


# ── Bundle loader ─────────────────────────────────────────────────────────────

def load_bundle(session, bundle_path: str, dataset_id: str, stats: dict):
    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    if bundle.get("resourceType") != "Bundle":
        return

    # Index resources by (type, id) first, find patient id
    patient_id = None
    entries = bundle.get("entry", [])
    for entry in entries:
        r = entry.get("resource", {})
        if r.get("resourceType") == "Patient":
            patient_id = r["id"]
            break

    for entry in entries:
        r = entry.get("resource", {})
        rtype = r.get("resourceType", "")
        if rtype not in PROCESSORS:
            continue
        try:
            with session.begin_transaction() as tx:
                if rtype == "Patient":
                    PROCESSORS[rtype](tx, r, dataset_id)
                else:
                    PROCESSORS[rtype](tx, r, patient_id or "")
                tx.commit()
            stats[rtype] = stats.get(rtype, 0) + 1
        except Exception as e:
            print(f"  WARN: failed to load {rtype}/{r.get('id', '?')}: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    repo_root = Path(__file__).parent.parent
    default_fhir_dir = repo_root / "neo4j" / "import" / "fhir"

    parser = argparse.ArgumentParser(description="Load Synthea FHIR bundles into Neo4j")
    parser.add_argument("--dir", default=str(default_fhir_dir), help="Directory with *.json bundles")
    parser.add_argument("--uri", default="bolt://localhost:7687")
    parser.add_argument("--user", default="neo4j")
    parser.add_argument("--password", default="healthdataspace")
    parser.add_argument("--dataset-id", default="urn:uuid:charite:dataset:diab-001",
                        help="HealthDataset id to link patients to")
    args = parser.parse_args()

    bundles = sorted(glob.glob(os.path.join(args.dir, "*.json")))
    if not bundles:
        sys.exit(f"ERROR: No *.json files found in {args.dir}\n"
                 "Run scripts/generate-synthea.sh first.")

    print(f"=== Phase 3b: Load FHIR Bundles → Neo4j ===")
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
    print("  cat neo4j/fhir-to-omop-transform.cypher | "
          "docker exec -i health-dataspace-neo4j cypher-shell -u neo4j -p healthdataspace")


if __name__ == "__main__":
    main()
