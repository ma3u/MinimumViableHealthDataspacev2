#!/usr/bin/env python3
"""Generate sample FHIR R4 Bundle data for the FHIR viewer in completed transfers."""
import json
import random
from datetime import datetime, timedelta

random.seed(123)

# Synthetic patient data (Synthea-style)
given_names = ["Erika", "Hans", "Maria", "Jan", "Sophie", "Lars", "Anna", "Pieter", "Claudia", "Friedrich",
               "Ingrid", "Willem", "Margot", "Heinrich", "Lotte", "Gerhard", "Helga", "Dieter", "Renate", "Karl"]
family_names = ["Mueller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Schulz",
                "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Braun"]

conditions = [
    {"code": "44054006", "display": "Diabetes mellitus type 2", "category": "encounter-diagnosis"},
    {"code": "38341003", "display": "Hypertensive disorder", "category": "encounter-diagnosis"},
    {"code": "195662009", "display": "Acute viral pharyngitis", "category": "encounter-diagnosis"},
    {"code": "40055000", "display": "Chronic sinusitis", "category": "encounter-diagnosis"},
    {"code": "73211009", "display": "Diabetes mellitus", "category": "encounter-diagnosis"},
    {"code": "185086009", "display": "Chronic obstructive bronchitis", "category": "encounter-diagnosis"},
    {"code": "53741008", "display": "Coronary arteriosclerosis", "category": "encounter-diagnosis"},
    {"code": "431855005", "display": "Chronic kidney disease stage 1", "category": "encounter-diagnosis"},
    {"code": "267036007", "display": "Dyspnea", "category": "encounter-diagnosis"},
    {"code": "59621000", "display": "Essential hypertension", "category": "encounter-diagnosis"},
    {"code": "698754002", "display": "Chronic pain", "category": "encounter-diagnosis"},
    {"code": "230690007", "display": "Cerebrovascular accident", "category": "encounter-diagnosis"},
]

observations = [
    {"code": "8310-5", "display": "Body temperature", "unit": "Cel", "range": (36.0, 38.5)},
    {"code": "8867-4", "display": "Heart rate", "unit": "/min", "range": (55, 110)},
    {"code": "8480-6", "display": "Systolic blood pressure", "unit": "mmHg", "range": (100, 180)},
    {"code": "8462-4", "display": "Diastolic blood pressure", "unit": "mmHg", "range": (60, 110)},
    {"code": "2085-9", "display": "HDL Cholesterol", "unit": "mg/dL", "range": (30, 90)},
    {"code": "2089-1", "display": "LDL Cholesterol", "unit": "mg/dL", "range": (60, 220)},
    {"code": "2339-0", "display": "Glucose [Mass/volume] in Blood", "unit": "mg/dL", "range": (65, 300)},
    {"code": "4548-4", "display": "Hemoglobin A1c", "unit": "%", "range": (4.5, 12.0)},
    {"code": "6690-2", "display": "Leukocytes [#/volume]", "unit": "10*3/uL", "range": (3.5, 12.0)},
    {"code": "718-7", "display": "Hemoglobin [Mass/volume]", "unit": "g/dL", "range": (10.0, 18.0)},
    {"code": "2160-0", "display": "Creatinine [Mass/volume]", "unit": "mg/dL", "range": (0.5, 2.5)},
    {"code": "33914-3", "display": "eGFR", "unit": "mL/min/{1.73_m2}", "range": (30, 120)},
]

medications = [
    {"code": "860975", "display": "Metformin hydrochloride 500 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "314076", "display": "Lisinopril 10 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "197361", "display": "Amlodipine 5 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "310798", "display": "Hydrochlorothiazide 25 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "259255", "display": "Atorvastatin 20 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "313782", "display": "Omeprazole 20 MG Delayed Release Oral Capsule", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "198211", "display": "Aspirin 81 MG Oral Tablet", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
    {"code": "835829", "display": "Insulin Glargine 100 UNT/ML Injectable Solution", "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
]

immunizations = [
    {"code": "08", "display": "Hepatitis B vaccine", "system": "http://hl7.org/fhir/sid/cvx"},
    {"code": "140", "display": "Influenza, seasonal, injectable", "system": "http://hl7.org/fhir/sid/cvx"},
    {"code": "207", "display": "SARS-COV-2 (COVID-19) vaccine, mRNA", "system": "http://hl7.org/fhir/sid/cvx"},
    {"code": "33", "display": "Pneumococcal polysaccharide vaccine", "system": "http://hl7.org/fhir/sid/cvx"},
    {"code": "113", "display": "Td (adult) preservative free", "system": "http://hl7.org/fhir/sid/cvx"},
]

allergies = [
    {"code": "387207008", "display": "Ibuprofen", "reaction": "Hives"},
    {"code": "7980", "display": "Penicillin G", "reaction": "Anaphylaxis"},
    {"code": "1191", "display": "Aspirin", "reaction": "Bronchospasm"},
    {"code": "2670", "display": "Codeine", "reaction": "Nausea"},
]

procedures = [
    {"code": "430193006", "display": "Medication reconciliation", "system": "http://snomed.info/sct"},
    {"code": "76601001", "display": "Intramuscular injection", "system": "http://snomed.info/sct"},
    {"code": "252160004", "display": "Standard chest X-ray", "system": "http://snomed.info/sct"},
    {"code": "710824005", "display": "Assessment of health and social care needs", "system": "http://snomed.info/sct"},
    {"code": "171207006", "display": "Depression screening", "system": "http://snomed.info/sct"},
    {"code": "73761001", "display": "Colonoscopy", "system": "http://snomed.info/sct"},
    {"code": "40701008", "display": "Echocardiography", "system": "http://snomed.info/sct"},
]


def make_patient(pid):
    given = random.choice(given_names)
    family = random.choice(family_names)
    gender = "female" if given in ["Erika", "Maria", "Sophie", "Anna", "Claudia", "Ingrid", "Margot", "Lotte", "Helga", "Renate"] else "male"
    birth_year = random.randint(1940, 2000)
    return {
        "resourceType": "Patient",
        "id": pid,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Patient"]},
        "text": {"status": "generated", "div": f"<div xmlns='http://www.w3.org/1999/xhtml'>{given} {family}</div>"},
        "identifier": [{"system": "http://alpha-klinik.de/fhir/patient-id", "value": pid}],
        "name": [{"use": "official", "family": family, "given": [given]}],
        "gender": gender,
        "birthDate": f"{birth_year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        "address": [{"city": random.choice(["Berlin", "Munich", "Hamburg", "Maastricht", "Amsterdam", "Rotterdam"]),
                      "country": random.choice(["DE", "NL"])}],
    }


def make_condition(pid, cid):
    c = random.choice(conditions)
    onset = datetime(2026, 1, 1) - timedelta(days=random.randint(30, 3650))
    return {
        "resourceType": "Condition",
        "id": cid,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Condition"]},
        "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
        "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": c["category"]}]}],
        "code": {"coding": [{"system": "http://snomed.info/sct", "code": c["code"], "display": c["display"]}], "text": c["display"]},
        "subject": {"reference": f"Patient/{pid}"},
        "onsetDateTime": onset.strftime("%Y-%m-%d"),
    }


def make_observation(pid, oid):
    o = random.choice(observations)
    val = round(random.uniform(o["range"][0], o["range"][1]), 1)
    eff = datetime(2026, 3, random.randint(1, 20), random.randint(6, 22), random.randint(0, 59))
    return {
        "resourceType": "Observation",
        "id": oid,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/vitalsigns"]},
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs", "display": "Vital Signs"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": o["code"], "display": o["display"]}], "text": o["display"]},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": eff.isoformat() + "Z",
        "valueQuantity": {"value": val, "unit": o["unit"], "system": "http://unitsofmeasure.org", "code": o["unit"]},
    }


def make_encounter(pid, eid):
    start = datetime(2026, 3, random.randint(1, 20), random.randint(8, 18))
    end = start + timedelta(hours=random.randint(1, 48))
    return {
        "resourceType": "Encounter",
        "id": eid,
        "status": random.choice(["finished", "in-progress"]),
        "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": random.choice(["AMB", "IMP", "EMER"]), "display": random.choice(["ambulatory", "inpatient", "emergency"])},
        "subject": {"reference": f"Patient/{pid}"},
        "period": {"start": start.isoformat() + "Z", "end": end.isoformat() + "Z"},
    }


def make_medication_request(pid, mid):
    m = random.choice(medications)
    return {
        "resourceType": "MedicationRequest",
        "id": mid,
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {"coding": [{"system": m["system"], "code": m["code"], "display": m["display"]}], "text": m["display"]},
        "subject": {"reference": f"Patient/{pid}"},
        "authoredOn": datetime(2026, 3, random.randint(1, 20)).strftime("%Y-%m-%d"),
        "dosageInstruction": [{"text": f"{random.choice(['Once', 'Twice', 'Three times'])} daily", "timing": {"repeat": {"frequency": random.randint(1, 3), "period": 1, "periodUnit": "d"}}}],
    }


def make_immunization(pid, iid):
    v = random.choice(immunizations)
    return {
        "resourceType": "Immunization",
        "id": iid,
        "status": "completed",
        "vaccineCode": {"coding": [{"system": v["system"], "code": v["code"], "display": v["display"]}], "text": v["display"]},
        "patient": {"reference": f"Patient/{pid}"},
        "occurrenceDateTime": (datetime(2026, 1, 1) - timedelta(days=random.randint(30, 730))).strftime("%Y-%m-%d"),
    }


def make_allergy(pid, aid):
    a = random.choice(allergies)
    return {
        "resourceType": "AllergyIntolerance",
        "id": aid,
        "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]},
        "type": "allergy",
        "category": ["medication"],
        "criticality": random.choice(["low", "high"]),
        "code": {"coding": [{"system": "http://snomed.info/sct", "code": a["code"], "display": a["display"]}], "text": a["display"]},
        "patient": {"reference": f"Patient/{pid}"},
        "reaction": [{"manifestation": [{"coding": [{"display": a["reaction"]}]}]}],
    }


def make_procedure(pid, prid):
    p = random.choice(procedures)
    performed = datetime(2026, 3, random.randint(1, 20), random.randint(8, 18))
    return {
        "resourceType": "Procedure",
        "id": prid,
        "status": "completed",
        "code": {"coding": [{"system": p["system"], "code": p["code"], "display": p["display"]}], "text": p["display"]},
        "subject": {"reference": f"Patient/{pid}"},
        "performedDateTime": performed.isoformat() + "Z",
    }


def make_diagnostic_report(pid, drid):
    eff = datetime(2026, 3, random.randint(1, 20), random.randint(8, 18))
    return {
        "resourceType": "DiagnosticReport",
        "id": drid,
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0074", "code": "LAB", "display": "Laboratory"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": "58410-2", "display": "Complete blood count (CBC)"}], "text": "Complete Blood Count"},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": eff.isoformat() + "Z",
        "conclusion": random.choice(["All values within normal range", "Elevated WBC count", "Low hemoglobin", "Elevated glucose"]),
    }


# Generate different bundle types matching each asset type
def make_patient_bundle(count=10):
    entries = []
    for i in range(count):
        pid = f"patient-{i+1:04d}"
        entries.append({"fullUrl": f"urn:uuid:{pid}", "resource": make_patient(pid), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_observation_bundle(count=15):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        oid = f"obs-{i+1:04d}"
        entries.append({"fullUrl": f"urn:uuid:{oid}", "resource": make_observation(pid, oid), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_everything_bundle(count=25):
    entries = []
    for i in range(min(5, count)):
        pid = f"patient-{i+1:04d}"
        entries.append({"fullUrl": f"urn:uuid:{pid}", "resource": make_patient(pid), "search": {"mode": "match"}})
        entries.append({"fullUrl": f"urn:uuid:enc-{i+1:04d}", "resource": make_encounter(pid, f"enc-{i+1:04d}"), "search": {"mode": "include"}})
        for j in range(2):
            entries.append({"fullUrl": f"urn:uuid:cond-{i+1:04d}-{j}", "resource": make_condition(pid, f"cond-{i+1:04d}-{j}"), "search": {"mode": "include"}})
            entries.append({"fullUrl": f"urn:uuid:obs-{i+1:04d}-{j}", "resource": make_observation(pid, f"obs-{i+1:04d}-{j}"), "search": {"mode": "include"}})
        entries.append({"fullUrl": f"urn:uuid:med-{i+1:04d}", "resource": make_medication_request(pid, f"med-{i+1:04d}"), "search": {"mode": "include"}})
        entries.append({"fullUrl": f"urn:uuid:imm-{i+1:04d}", "resource": make_immunization(pid, f"imm-{i+1:04d}"), "search": {"mode": "include"}})
    return make_bundle(entries, len(entries))


def make_condition_bundle(count=12):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:cond-{i+1:04d}", "resource": make_condition(pid, f"cond-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_medication_bundle(count=10):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:med-{i+1:04d}", "resource": make_medication_request(pid, f"med-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_encounter_bundle(count=10):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:enc-{i+1:04d}", "resource": make_encounter(pid, f"enc-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_diagnosticreport_bundle(count=8):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:dr-{i+1:04d}", "resource": make_diagnostic_report(pid, f"dr-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_immunization_bundle(count=8):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:imm-{i+1:04d}", "resource": make_immunization(pid, f"imm-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_allergy_bundle(count=6):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:allergy-{i+1:04d}", "resource": make_allergy(pid, f"allergy-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_procedure_bundle(count=8):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({"fullUrl": f"urn:uuid:proc-{i+1:04d}", "resource": make_procedure(pid, f"proc-{i+1:04d}"), "search": {"mode": "match"}})
    return make_bundle(entries, count)


def make_careplan_bundle(count=5):
    entries = []
    for i in range(count):
        pid = f"patient-{random.randint(1,20):04d}"
        entries.append({
            "fullUrl": f"urn:uuid:cp-{i+1:04d}",
            "resource": {
                "resourceType": "CarePlan",
                "id": f"cp-{i+1:04d}",
                "status": "active",
                "intent": "plan",
                "title": random.choice(["Diabetes Management Plan", "Hypertension Care Plan", "Post-Surgery Recovery", "Chronic Pain Management"]),
                "subject": {"reference": f"Patient/{pid}"},
                "period": {"start": "2026-01-01", "end": "2026-12-31"},
                "activity": [{"detail": {"status": "in-progress", "description": random.choice(["Monitor blood glucose daily", "Weekly BP check", "Physical therapy 3x/week", "Monthly lab work"])}}],
            },
            "search": {"mode": "match"},
        })
    return make_bundle(entries, count)


def make_bundle(entries, total):
    return {
        "resourceType": "Bundle",
        "id": f"bundle-{random.randint(10000,99999)}",
        "meta": {"lastUpdated": datetime(2026, 3, 20, random.randint(8, 20), random.randint(0, 59)).isoformat() + "Z"},
        "type": "searchset",
        "total": total,
        "link": [{"relation": "self", "url": "https://alpha-klinik.de/fhir/Patient"}],
        "entry": entries,
    }


BUNDLE_GENERATORS = {
    "fhir-patient-search": make_patient_bundle,
    "fhir-observation-bundle": make_observation_bundle,
    "fhir-patient-everything": make_everything_bundle,
    "fhir-cohort-bundle": lambda: make_everything_bundle(15),
    "fhir-condition-list": make_condition_bundle,
    "fhir-medication-request": make_medication_bundle,
    "fhir-encounter-history": make_encounter_bundle,
    "fhir-diagnostic-report": make_diagnosticreport_bundle,
    "fhir-immunization-record": make_immunization_bundle,
    "fhir-allergy-intolerance": make_allergy_bundle,
    "fhir-procedure-bundle": make_procedure_bundle,
    "fhir-care-plan": make_careplan_bundle,
}

# Generate one sample bundle per asset type
fhir_bundles = {}
for asset_id, generator in BUNDLE_GENERATORS.items():
    fhir_bundles[asset_id] = generator()

with open("ui/public/mock/fhir_bundles.json", "w") as f:
    json.dump(fhir_bundles, f, indent=2)

total_resources = sum(len(b["entry"]) for b in fhir_bundles.values())
print(f"Generated {len(fhir_bundles)} FHIR bundles with {total_resources} total resources")
for aid, b in fhir_bundles.items():
    types = set(e["resource"]["resourceType"] for e in b["entry"])
    print(f"  {aid}: {len(b['entry'])} entries ({', '.join(sorted(types))})")
