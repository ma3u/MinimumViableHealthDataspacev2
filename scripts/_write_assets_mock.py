#!/usr/bin/env python3
"""Write expanded mock assets data with all 12 FHIR asset types."""
import json
import os

def asset(aid, name, desc, ct="application/fhir+json"):
    return {
        "@id": aid,
        "@type": "Asset",
        "properties": {"name": name, "description": desc, "contenttype": ct},
        "name": name,
        "description": desc,
        "contenttype": ct,
        "edc:name": name,
        "edc:description": desc,
        "edc:contenttype": ct,
    }

assets = [
    {
        "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
        "identity": "did:web:alpha-klinik.de:participant",
        "assets": [
            asset("fhir-patient-search", "FHIR Patient Search",
                  "Search FHIR R4 patients by demographics and conditions."),
            asset("fhir-observation-bundle", "FHIR Observation Bundle",
                  "FHIR R4 Observation resources including vitals and lab results."),
            asset("fhir-care-plan", "FHIR Care Plan Registry",
                  "Structured CarePlan resources for chronic disease management with treatment goals and care team assignments."),
            asset("fhir-allergy-intolerance", "FHIR AllergyIntolerance Registry",
                  "AllergyIntolerance resources documenting drug allergies, food intolerances, and environmental sensitivities."),
            asset("fhir-procedure-bundle", "FHIR Procedure Bundle",
                  "Procedure resources documenting surgical interventions, diagnostic procedures, and therapeutic treatments."),
        ],
    },
    {
        "participantId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
        "identity": "did:web:lmc.nl:clinic",
        "assets": [
            asset("fhir-patient-everything", "FHIR Patient Everything",
                  "FHIR $everything operation for Limburg Medical Centre patients."),
            asset("fhir-cohort-bundle", "FHIR Cohort Bundle",
                  "Pre-built cohort bundles for epidemiological research queries."),
            asset("fhir-encounter-history", "FHIR Encounter History",
                  "Longitudinal encounter records including emergency, inpatient, outpatient, and ambulatory visits."),
            asset("fhir-diagnostic-report", "FHIR Diagnostic Reports",
                  "Diagnostic report resources including radiology, pathology, and laboratory reports."),
            asset("fhir-condition-list", "FHIR Condition Problem List",
                  "Active and resolved condition resources mapped to SNOMED CT and ICD-10 codes."),
            asset("fhir-immunization-record", "FHIR Immunization Records",
                  "Immunization resources including COVID-19, influenza, and childhood vaccination records."),
            asset("omop-cohort-statistics", "OMOP Cohort Statistics",
                  "Aggregated OMOP CDM cohort statistics from OHDSI tools.",
                  "application/json"),
            asset("healthdcatap-catalog", "HealthDCAT-AP Catalog",
                  "HealthDCAT-AP metadata catalog for LMC datasets.",
                  "application/ld+json"),
        ],
    },
    {
        "participantId": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
        "identity": "did:web:pharmaco.de:research",
        "assets": [
            asset("research-data-request", "Research Data Request",
                  "Submit EHDS-compliant data permit requests for secondary use research.",
                  "application/json"),
            asset("omop-analytics-query", "OMOP Analytics Query",
                  "Execute OMOP CDM analytics queries across federated datasets.",
                  "application/json"),
            asset("fhir-medication-request", "FHIR Medication Request Dataset",
                  "MedicationRequest resources covering prescriptions, dosage instructions, and drug interaction alerts."),
        ],
    },
    {
        "participantId": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
        "identity": "did:web:medreg.de:hdab",
        "assets": [
            asset("federated-healthdcatap-catalog", "Federated HealthDCAT-AP Catalog",
                  "Federated metadata catalog aggregating HealthDCAT-AP entries across the dataspace.",
                  "application/ld+json"),
        ],
    },
    {
        "participantId": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0",
        "identity": "did:web:irs.fr:hdab",
        "assets": [
            asset("fhir-medication-request", "FHIR Medication Request Dataset",
                  "MedicationRequest resources from Institut de Recherche Sant\u00e9 covering French national prescriptions."),
            asset("fhir-diagnostic-report", "FHIR Diagnostic Reports",
                  "Diagnostic report resources from French hospital network."),
        ],
    },
]

total = sum(len(g["assets"]) for g in assets)
out_path = os.path.join("ui", "public", "mock", "assets.json")
with open(out_path, "w") as f:
    json.dump(assets, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"OK: {total} assets across {len(assets)} participants written to {out_path}")
