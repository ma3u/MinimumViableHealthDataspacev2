#!/usr/bin/env python3
"""Generate 100 transfer mock entries with FHIR payload data for completed transfers."""
import json
import random
from datetime import datetime, timedelta

random.seed(42)

participants = [
    {"id": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8", "did": "did:web:alpha-klinik.de:participant", "name": "AlphaKlinik Berlin", "domain": "alpha-klinik.de"},
    {"id": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9", "did": "did:web:lmc.nl:clinic", "name": "Limburg Medical Centre", "domain": "lmc.nl"},
    {"id": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9", "did": "did:web:pharmaco.de:research", "name": "PharmaCo Research AG", "domain": "pharmaco.de"},
    {"id": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9", "did": "did:web:medreg.de:hdab", "name": "MedReg DE", "domain": "medreg.de"},
    {"id": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0", "did": "did:web:irs.fr:hdab", "name": "Institut de Recherche Sante", "domain": "irs.fr"},
]

asset_types = [
    {"id": "fhir-patient-search", "name": "FHIR Patient Search", "resourceTypes": ["Patient"], "providers": [0, 1]},
    {"id": "fhir-observation-bundle", "name": "FHIR Observation Bundle", "resourceTypes": ["Observation"], "providers": [0, 1]},
    {"id": "fhir-patient-everything", "name": "FHIR Patient Everything", "resourceTypes": ["Patient", "Encounter", "Condition", "Observation", "MedicationRequest", "Procedure", "AllergyIntolerance", "Immunization", "DiagnosticReport"], "providers": [1]},
    {"id": "fhir-cohort-bundle", "name": "FHIR Cohort Bundle", "resourceTypes": ["Patient", "Condition", "Observation"], "providers": [1]},
    {"id": "fhir-condition-list", "name": "FHIR Condition List", "resourceTypes": ["Condition"], "providers": [0, 1]},
    {"id": "fhir-medication-request", "name": "FHIR MedicationRequest Bundle", "resourceTypes": ["MedicationRequest", "Medication"], "providers": [0]},
    {"id": "fhir-encounter-history", "name": "FHIR Encounter History", "resourceTypes": ["Encounter", "Location", "Practitioner"], "providers": [0, 1]},
    {"id": "fhir-diagnostic-report", "name": "FHIR DiagnosticReport Bundle", "resourceTypes": ["DiagnosticReport", "Observation", "Specimen"], "providers": [0, 1]},
    {"id": "fhir-immunization-record", "name": "FHIR Immunization Record", "resourceTypes": ["Immunization", "Patient"], "providers": [1]},
    {"id": "fhir-allergy-intolerance", "name": "FHIR AllergyIntolerance List", "resourceTypes": ["AllergyIntolerance"], "providers": [0]},
    {"id": "fhir-procedure-bundle", "name": "FHIR Procedure Bundle", "resourceTypes": ["Procedure", "Encounter"], "providers": [0, 1]},
    {"id": "fhir-care-plan", "name": "FHIR CarePlan Bundle", "resourceTypes": ["CarePlan", "Goal", "Condition"], "providers": [0]},
]

# 80 COMPLETED, 10 STARTED, 5 REQUESTED, 5 TERMINATED
state_pool = ["COMPLETED"] * 80 + ["STARTED"] * 10 + ["REQUESTED"] * 5 + ["TERMINATED"] * 5
random.shuffle(state_pool)

base_time = datetime(2026, 3, 20, 8, 0, 0)

transfers = []
negotiations = []

for i in range(100):
    asset = random.choice(asset_types)
    provider_idx = random.choice(asset["providers"])
    provider = participants[provider_idx]
    consumer_idx = random.choice([j for j in range(len(participants)) if j != provider_idx])
    consumer = participants[consumer_idx]

    state = state_pool[i]
    ts = base_time + timedelta(minutes=random.randint(0, 720))
    ts_ms = int(ts.timestamp() * 1000)

    tid = f"transfer-{asset['id']}-{i + 1:03d}"
    aid = f"agreement-{asset['id']}-{i + 1:03d}"
    nid = f"neg-{asset['id']}-{i + 1:03d}"

    entry_count = random.randint(1, 250)

    transfer = {
        "@type": "TransferProcess",
        "@id": tid,
        "state": state,
        "stateTimestamp": ts_ms,
        "type": "CONSUMER",
        "assetId": asset["id"],
        "contractId": aid,
        "transferType": "HttpData-PULL",
        "counterPartyId": provider["did"],
        "counterPartyAddress": f"https://{provider['domain']}/dsp/2025-1",
    }

    if state == "COMPLETED":
        transfer["dataPayload"] = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": entry_count,
            "containedResourceTypes": asset["resourceTypes"],
            "link": [
                {
                    "relation": "self",
                    "url": f"https://{provider['domain']}/fhir/{asset['resourceTypes'][0]}?_count={entry_count}",
                }
            ],
            "provider": provider["name"],
            "transferredAt": ts.isoformat() + "Z",
            "sizeBytes": entry_count * random.randint(800, 4000),
        }

    transfers.append(transfer)

    neg = {
        "@type": "ContractNegotiation",
        "@id": nid,
        "type": "CONSUMER",
        "protocol": "dataspace-protocol-http:2025-1",
        "state": "FINALIZED",
        "counterPartyId": provider["did"],
        "counterPartyAddress": f"https://{provider['domain']}/dsp/2025-1",
        "assetId": asset["id"],
        "contractAgreementId": aid,
        "createdAt": ts_ms - random.randint(60000, 600000),
    }
    negotiations.append(neg)

transfers.sort(key=lambda x: x["stateTimestamp"], reverse=True)

with open("ui/public/mock/transfers.json", "w") as f:
    json.dump(transfers, f, indent=2)

with open("ui/public/mock/negotiations.json", "w") as f:
    json.dump(negotiations, f, indent=2)

completed = [t for t in transfers if t["state"] == "COMPLETED"]
states = {}
for t in transfers:
    s = t["state"]
    states[s] = states.get(s, 0) + 1

print(f"Generated {len(transfers)} transfers")
print(f"States: {states}")
print(f"With dataPayload: {sum(1 for t in completed if 'dataPayload' in t)}")
