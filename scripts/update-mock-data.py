#!/usr/bin/env python3
"""Update mock JSON files for GitHub Pages static export."""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), "..", "ui", "public", "mock")

# --- participants.json ---
participants = [
    {
        "@type": "ParticipantContext",
        "@id": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
        "identity": "did:web:alpha-klinik.de:participant",
        "state": "ACTIVATED",
        "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
        "displayName": "AlphaKlinik Berlin",
        "role": "DATA_HOLDER",
        "slug": "alpha-klinik",
    },
    {
        "@type": "ParticipantContext",
        "@id": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
        "identity": "did:web:pharmaco.de:research",
        "state": "ACTIVATED",
        "participantId": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
        "displayName": "PharmaCo Research AG",
        "role": "DATA_USER",
        "slug": "pharmaco",
    },
    {
        "@type": "ParticipantContext",
        "@id": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
        "identity": "did:web:medreg.de:hdab",
        "state": "ACTIVATED",
        "participantId": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
        "displayName": "MedReg DE",
        "role": "HDAB",
        "slug": "medreg",
    },
    {
        "@type": "ParticipantContext",
        "@id": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
        "identity": "did:web:lmc.nl:clinic",
        "state": "ACTIVATED",
        "participantId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
        "displayName": "Limburg Medical Centre",
        "role": "DATA_HOLDER",
        "slug": "lmc",
    },
    {
        "@type": "ParticipantContext",
        "@id": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0",
        "identity": "did:web:irs.fr:hdab",
        "state": "ACTIVATED",
        "participantId": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0",
        "displayName": "Institut de Recherche Santé",
        "role": "HDAB",
        "slug": "irs",
    },
]

# --- assets.json (nested format matching live API) ---
assets = [
    {
        "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
        "identity": "did:web:alpha-klinik.de:participant",
        "assets": [
            {
                "@id": "fhir-patient-search",
                "@type": "Asset",
                "properties": {
                    "name": "FHIR Patient Search",
                    "description": "Search FHIR R4 patients by demographics and conditions.",
                    "contenttype": "application/fhir+json",
                },
                "name": "FHIR Patient Search",
                "description": "Search FHIR R4 patients by demographics and conditions.",
                "contenttype": "application/fhir+json",
                "edc:name": "FHIR Patient Search",
                "edc:description": "Search FHIR R4 patients by demographics and conditions.",
                "edc:contenttype": "application/fhir+json",
            },
            {
                "@id": "fhir-observation-bundle",
                "@type": "Asset",
                "properties": {
                    "name": "FHIR Observation Bundle",
                    "description": "FHIR R4 Observation resources including vitals and lab results.",
                    "contenttype": "application/fhir+json",
                },
                "name": "FHIR Observation Bundle",
                "description": "FHIR R4 Observation resources including vitals and lab results.",
                "contenttype": "application/fhir+json",
                "edc:name": "FHIR Observation Bundle",
                "edc:description": "FHIR R4 Observation resources including vitals and lab results.",
                "edc:contenttype": "application/fhir+json",
            },
        ],
    },
    {
        "participantId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
        "identity": "did:web:lmc.nl:clinic",
        "assets": [
            {
                "@id": "fhir-patient-everything",
                "@type": "Asset",
                "properties": {
                    "name": "FHIR Patient Everything",
                    "description": "FHIR $everything operation for Limburg Medical Centre patients.",
                    "contenttype": "application/fhir+json",
                },
                "name": "FHIR Patient Everything",
                "edc:name": "FHIR Patient Everything",
                "edc:contenttype": "application/fhir+json",
            },
            {
                "@id": "fhir-cohort-bundle",
                "@type": "Asset",
                "properties": {
                    "name": "FHIR Cohort Bundle",
                    "description": "Pre-built cohort bundles for epidemiological research queries.",
                    "contenttype": "application/fhir+json",
                },
                "name": "FHIR Cohort Bundle",
                "edc:name": "FHIR Cohort Bundle",
                "edc:contenttype": "application/fhir+json",
            },
            {
                "@id": "omop-cohort-statistics",
                "@type": "Asset",
                "properties": {
                    "name": "OMOP Cohort Statistics",
                    "description": "Aggregated OMOP CDM cohort statistics from OHDSI tools.",
                    "contenttype": "application/json",
                },
                "name": "OMOP Cohort Statistics",
                "edc:name": "OMOP Cohort Statistics",
                "edc:contenttype": "application/json",
            },
            {
                "@id": "healthdcatap-catalog",
                "@type": "Asset",
                "properties": {
                    "name": "HealthDCAT-AP Catalog",
                    "description": "HealthDCAT-AP metadata catalog for LMC datasets.",
                    "contenttype": "application/ld+json",
                },
                "name": "HealthDCAT-AP Catalog",
                "edc:name": "HealthDCAT-AP Catalog",
                "edc:contenttype": "application/ld+json",
            },
        ],
    },
    {
        "participantId": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
        "identity": "did:web:pharmaco.de:research",
        "assets": [
            {
                "@id": "research-data-request",
                "@type": "Asset",
                "properties": {
                    "name": "Research Data Request",
                    "description": "Submit EHDS-compliant data permit requests for secondary use research.",
                    "contenttype": "application/json",
                },
                "name": "Research Data Request",
                "edc:name": "Research Data Request",
                "edc:contenttype": "application/json",
            },
            {
                "@id": "omop-analytics-query",
                "@type": "Asset",
                "properties": {
                    "name": "OMOP Analytics Query",
                    "description": "Execute OMOP CDM analytics queries across federated datasets.",
                    "contenttype": "application/json",
                },
                "name": "OMOP Analytics Query",
                "edc:name": "OMOP Analytics Query",
                "edc:contenttype": "application/json",
            },
        ],
    },
    {
        "participantId": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
        "identity": "did:web:medreg.de:hdab",
        "assets": [
            {
                "@id": "federated-healthdcatap-catalog",
                "@type": "Asset",
                "properties": {
                    "name": "Federated HealthDCAT-AP Catalog",
                    "description": "Federated metadata catalog aggregating HealthDCAT-AP entries across the dataspace.",
                    "contenttype": "application/ld+json",
                },
                "name": "Federated HealthDCAT-AP Catalog",
                "edc:name": "Federated HealthDCAT-AP Catalog",
                "edc:contenttype": "application/ld+json",
            }
        ],
    },
]

# --- negotiations.json ---
negotiations = [
    {
        "@type": "ContractNegotiation",
        "@id": "neg-patient-001",
        "type": "CONSUMER",
        "protocol": "dataspace-protocol-http:2025-1",
        "state": "FINALIZED",
        "counterPartyId": "did:web:alpha-klinik.de:participant",
        "counterPartyAddress": "https://alpha-klinik.de/dsp/2025-1",
        "assetId": "fhir-patient-search",
        "contractAgreementId": "agreement-patient-001",
        "createdAt": 1773505604439,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-observation-001",
        "type": "CONSUMER",
        "protocol": "dataspace-protocol-http:2025-1",
        "state": "FINALIZED",
        "counterPartyId": "did:web:alpha-klinik.de:participant",
        "counterPartyAddress": "https://alpha-klinik.de/dsp/2025-1",
        "assetId": "fhir-observation-bundle",
        "contractAgreementId": "agreement-observation-001",
        "createdAt": 1773505695984,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-cohort-001",
        "type": "CONSUMER",
        "protocol": "dataspace-protocol-http:2025-1",
        "state": "FINALIZED",
        "counterPartyId": "did:web:lmc.nl:clinic",
        "counterPartyAddress": "https://lmc.nl/dsp/2025-1",
        "assetId": "fhir-cohort-bundle",
        "contractAgreementId": "agreement-cohort-001",
        "createdAt": 1773505700000,
    },
]

# --- transfers.json ---
transfers = [
    {
        "@type": "TransferProcess",
        "@id": "transfer-patient-001",
        "state": "STARTED",
        "stateTimestamp": 1773505610000,
        "type": "CONSUMER",
        "assetId": "fhir-patient-search",
        "contractId": "agreement-patient-001",
        "transferType": "HttpData-PULL",
    },
    {
        "@type": "TransferProcess",
        "@id": "transfer-observation-001",
        "state": "STARTED",
        "stateTimestamp": 1773505710000,
        "type": "CONSUMER",
        "assetId": "fhir-observation-bundle",
        "contractId": "agreement-observation-001",
        "transferType": "HttpData-PULL",
    },
    {
        "@type": "TransferProcess",
        "@id": "transfer-cohort-001",
        "state": "REQUESTED",
        "stateTimestamp": 1773505720000,
        "type": "CONSUMER",
        "assetId": "fhir-cohort-bundle",
        "contractId": "agreement-cohort-001",
        "transferType": "HttpData-PULL",
    },
]


def write(name, data):
    path = os.path.join(BASE, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✓ {name} ({os.path.getsize(path)} bytes)")


print("Writing mock data:")
write("participants.json", participants)
write("assets.json", assets)
write("negotiations.json", negotiations)
write("transfers.json", transfers)
print("Done.")
