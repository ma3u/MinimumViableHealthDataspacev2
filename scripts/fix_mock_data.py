#!/usr/bin/env python3
"""Replace all trademark-violating mock data with the 5 approved fictional participants."""
import json
import os

MOCK_DIR = os.path.join(os.path.dirname(__file__), "..", "ui", "public", "mock")

# ── admin_tenants.json ──
admin_tenants = {
    "tenants": [
        {
            "id": "alpha-klinik-id",
            "version": 1,
            "properties": {
                "displayName": "AlphaKlinik Berlin",
                "role": "provider",
                "ehdsParticipantType": "data-holder",
                "organization": "AlphaKlinik Berlin GmbH",
                "country": "DE",
            },
            "participantProfiles": [
                {
                    "participantContextId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
                    "did": "did:web:alpha-klinik.de:participant",
                    "state": "ACTIVATED",
                }
            ],
        },
        {
            "id": "pharmaco-research-id",
            "version": 1,
            "properties": {
                "displayName": "PharmaCo Research AG",
                "role": "consumer",
                "ehdsParticipantType": "data-user",
                "organization": "PharmaCo Research AG",
                "country": "DE",
            },
            "participantProfiles": [
                {
                    "participantContextId": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
                    "did": "did:web:pharmaco.de:research",
                    "state": "ACTIVATED",
                }
            ],
        },
        {
            "id": "medreg-de-id",
            "version": 1,
            "properties": {
                "displayName": "MedReg DE",
                "role": "operator",
                "ehdsParticipantType": "health-data-access-body",
                "organization": "MedReg DE \u2014 National Medicines Regulatory Authority",
                "country": "DE",
            },
            "participantProfiles": [
                {
                    "participantContextId": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
                    "did": "did:web:medreg.de:hdab",
                    "state": "ACTIVATED",
                }
            ],
        },
        {
            "id": "limburg-mc-id",
            "version": 1,
            "properties": {
                "displayName": "Limburg Medical Centre",
                "role": "provider",
                "ehdsParticipantType": "data-holder",
                "organization": "Limburg Medical Centre",
                "country": "NL",
            },
            "participantProfiles": [
                {
                    "participantContextId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
                    "did": "did:web:lmc.nl:clinic",
                    "state": "ACTIVATED",
                }
            ],
        },
        {
            "id": "irs-fr-id",
            "version": 1,
            "properties": {
                "displayName": "Institut de Recherche Sant\u00e9",
                "role": "operator",
                "ehdsParticipantType": "health-data-access-body",
                "organization": "Institut de Recherche Sant\u00e9",
                "country": "FR",
            },
            "participantProfiles": [
                {
                    "participantContextId": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0",
                    "did": "did:web:irs.fr:hdab",
                    "state": "ACTIVATED",
                }
            ],
        },
    ],
    "summary": {
        "totalTenants": 5,
        "totalParticipants": 5,
        "byRole": {"provider": 2, "consumer": 1, "operator": 2},
    },
}

# ── participants_me.json ──
participants_me = {"tenants": admin_tenants["tenants"]}

# ── participants.json ──
participants = [
    {
        "@type": "ParticipantContext",
        "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
        "state": "ACTIVATED",
        "did": "did:web:alpha-klinik.de:participant",
        "apiTokenAlias": "alpha-klinik",
    },
    {
        "@type": "ParticipantContext",
        "participantId": "b2c3d4e5f6a748b1c2d3e4f5a6b7c8d9",
        "state": "ACTIVATED",
        "did": "did:web:pharmaco.de:research",
        "apiTokenAlias": "pharmaco-research",
    },
    {
        "@type": "ParticipantContext",
        "participantId": "c3d4e5f6a7b849c1d2e3f4a5b6c7d8e9",
        "state": "ACTIVATED",
        "did": "did:web:medreg.de:hdab",
        "apiTokenAlias": "medreg-de",
    },
    {
        "@type": "ParticipantContext",
        "participantId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
        "state": "ACTIVATED",
        "did": "did:web:lmc.nl:clinic",
        "apiTokenAlias": "limburg-mc",
    },
    {
        "@type": "ParticipantContext",
        "participantId": "e5f6a7b8c9d051e2f3a4b5c6d7e8f9a0",
        "state": "ACTIVATED",
        "did": "did:web:irs.fr:hdab",
        "apiTokenAlias": "irs-fr",
    },
]

# ── credentials.json ──
credentials = {
    "credentials": [
        {
            "credentialId": "vc:ehds-participant:alpha-klinik",
            "credentialType": "EHDSParticipantCredential",
            "subjectDid": "did:web:alpha-klinik.de:participant",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": "DataHolder",
            "holderName": "AlphaKlinik Berlin",
            "holderType": "CLINIC",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-07-24T00:00:00Z",
            "purpose": None,
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:ehds-participant:pharmaco-research",
            "credentialType": "EHDSParticipantCredential",
            "subjectDid": "did:web:pharmaco.de:research",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": "DataUser",
            "holderName": "PharmaCo Research AG",
            "holderType": "CRO",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-07-24T00:00:00Z",
            "purpose": None,
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:ehds-participant:medreg-de",
            "credentialType": "EHDSParticipantCredential",
            "subjectDid": "did:web:medreg.de:hdab",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": "HealthDataAccessBody",
            "holderName": "MedReg DE",
            "holderType": "HDAB",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-07-24T00:00:00Z",
            "purpose": None,
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:ehds-participant:limburg-mc",
            "credentialType": "EHDSParticipantCredential",
            "subjectDid": "did:web:lmc.nl:clinic",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": "DataHolder",
            "holderName": "Limburg Medical Centre",
            "holderType": "CLINIC",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-07-24T00:00:00Z",
            "purpose": None,
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:ehds-participant:irs-fr",
            "credentialType": "EHDSParticipantCredential",
            "subjectDid": "did:web:irs.fr:hdab",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": "HealthDataAccessBody",
            "holderName": "Institut de Recherche Sant\u00e9",
            "holderType": "HDAB",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-07-24T00:00:00Z",
            "purpose": None,
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:data-processing-purpose:pharmaco-research",
            "credentialType": "DataProcessingPurposeCredential",
            "subjectDid": "did:web:pharmaco.de:research",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": None,
            "holderName": "PharmaCo Research AG",
            "holderType": "CRO",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2025-10-22T00:00:00Z",
            "purpose": "Scientific research on therapeutic outcomes",
            "datasetId": None,
            "completeness": None,
            "conformance": None,
            "timeliness": None,
        },
        {
            "credentialId": "vc:data-quality-label:alpha-klinik",
            "credentialType": "DataQualityLabelCredential",
            "subjectDid": "did:web:alpha-klinik.de:participant",
            "issuerDid": "did:web:issuerservice%3A10016:issuer",
            "status": "active",
            "participantRole": None,
            "holderName": "AlphaKlinik Berlin",
            "holderType": "CLINIC",
            "issuedAt": "2025-07-24T00:00:00Z",
            "expiresAt": "2026-01-20T00:00:00Z",
            "purpose": None,
            "datasetId": "dataset:synthea-fhir-r4-mvd",
            "completeness": 0.95,
            "conformance": 0.92,
            "timeliness": 0.98,
        },
    ]
}

# ── negotiations.json ──
negotiations = [
    {
        "@type": "ContractNegotiation",
        "@id": "neg-001",
        "state": "FINALIZED",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "counterPartyId": "did:web:alpha-klinik.de:participant",
        "contractAgreementId": "agreement-001",
        "createdAt": 1719500000000,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-002",
        "state": "FINALIZED",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "counterPartyId": "did:web:lmc.nl:clinic",
        "contractAgreementId": "agreement-002",
        "createdAt": 1719600000000,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-003",
        "state": "FINALIZED",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "counterPartyId": "did:web:pharmaco.de:research",
        "contractAgreementId": "agreement-003",
        "createdAt": 1719700000000,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-004",
        "state": "FINALIZED",
        "counterPartyAddress": "http://hdab-dsp:8082/api/dsp",
        "counterPartyId": "did:web:medreg.de:hdab",
        "contractAgreementId": "agreement-004",
        "createdAt": 1719800000000,
    },
    {
        "@type": "ContractNegotiation",
        "@id": "neg-005",
        "state": "FINALIZED",
        "counterPartyAddress": "http://hdab-dsp:8082/api/dsp",
        "counterPartyId": "did:web:irs.fr:hdab",
        "contractAgreementId": "agreement-005",
        "createdAt": 1719900000000,
    },
]

# ── admin_audit.json ──
admin_audit = {
    "type": "all",
    "summary": {"transfers": 3, "negotiations": 5, "credentials": 5},
    "transfers": [
        {
            "id": "transfer-001",
            "state": "COMPLETED",
            "assetId": "asset-fhir-bundle-001",
            "contractId": "agreement-001",
            "timestamp": "2024-06-27T14:15:00Z",
        },
        {
            "id": "transfer-002",
            "state": "COMPLETED",
            "assetId": "asset-omop-cohort-diabetes",
            "contractId": "agreement-001",
            "timestamp": "2024-06-28T10:30:00Z",
        },
        {
            "id": "transfer-003",
            "state": "STARTED",
            "assetId": "asset-ehr-exchange-format",
            "contractId": "agreement-002",
            "timestamp": "2024-06-29T09:00:00Z",
        },
    ],
    "negotiations": [
        {
            "id": "neg-001",
            "state": "FINALIZED",
            "counterPartyId": "did:web:alpha-klinik.de:participant",
            "agreementId": "agreement-001",
            "timestamp": "2024-06-27T14:00:00Z",
        },
        {
            "id": "neg-002",
            "state": "FINALIZED",
            "counterPartyId": "did:web:lmc.nl:clinic",
            "agreementId": "agreement-002",
            "timestamp": "2024-06-28T10:00:00Z",
        },
        {
            "id": "neg-003",
            "state": "FINALIZED",
            "counterPartyId": "did:web:pharmaco.de:research",
            "agreementId": "agreement-003",
            "timestamp": "2024-06-29T09:00:00Z",
        },
        {
            "id": "neg-004",
            "state": "FINALIZED",
            "counterPartyId": "did:web:medreg.de:hdab",
            "agreementId": "agreement-004",
            "timestamp": "2024-06-30T11:00:00Z",
        },
        {
            "id": "neg-005",
            "state": "FINALIZED",
            "counterPartyId": "did:web:irs.fr:hdab",
            "agreementId": "agreement-005",
            "timestamp": "2024-07-01T08:00:00Z",
        },
    ],
    "credentials": [
        {
            "id": "vc-membership-001",
            "type": "MembershipCredential",
            "holder": "did:web:alpha-klinik.de:participant",
            "issuanceDate": "2024-06-01T00:00:00Z",
            "state": "ISSUED",
        },
        {
            "id": "vc-membership-002",
            "type": "MembershipCredential",
            "holder": "did:web:pharmaco.de:research",
            "issuanceDate": "2024-06-01T00:00:00Z",
            "state": "ISSUED",
        },
        {
            "id": "vc-membership-003",
            "type": "MembershipCredential",
            "holder": "did:web:medreg.de:hdab",
            "issuanceDate": "2024-06-01T00:00:00Z",
            "state": "ISSUED",
        },
        {
            "id": "vc-membership-004",
            "type": "MembershipCredential",
            "holder": "did:web:lmc.nl:clinic",
            "issuanceDate": "2024-06-01T00:00:00Z",
            "state": "ISSUED",
        },
        {
            "id": "vc-membership-005",
            "type": "MembershipCredential",
            "holder": "did:web:irs.fr:hdab",
            "issuanceDate": "2024-06-01T00:00:00Z",
            "state": "ISSUED",
        },
    ],
}

# ── assets.json ──
assets = {
    "assets": [
        {
            "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
            "participantName": "alpha-klinik",
            "@id": "asset-fhir-bundle-001",
            "@type": "Asset",
            "properties": {
                "name": "FHIR Patient Bundle \u2013 Synthetic 50",
                "description": "50 synthetic FHIR R4 patient bundles generated by Synthea for Massachusetts.",
                "contenttype": "application/fhir+json",
                "version": "1.0",
            },
            "dataAddress": {
                "@type": "DataAddress",
                "type": "HttpData",
                "baseUrl": "https://fhir-server.alpha-klinik.de/Patient",
            },
        },
        {
            "participantId": "a1b2c3d4e5f647a0b1c2d3e4f5a6b7c8",
            "participantName": "alpha-klinik",
            "@id": "asset-omop-cohort-diabetes",
            "@type": "Asset",
            "properties": {
                "name": "OMOP Cohort \u2013 Type 2 Diabetes",
                "description": "De-identified cohort of Type 2 Diabetes patients mapped to OMOP CDM v5.4.",
                "contenttype": "application/json",
                "version": "2.1",
            },
            "dataAddress": {
                "@type": "DataAddress",
                "type": "HttpData",
                "baseUrl": "https://omop.alpha-klinik.de/cohort/t2d",
            },
        },
        {
            "participantId": "d4e5f6a7b8c950d1e2f3a4b5c6d7e8f9",
            "participantName": "limburg-mc",
            "@id": "asset-ehr-exchange-format",
            "@type": "Asset",
            "properties": {
                "name": "EEHRxF Exchange Dataset",
                "description": "European EHR Exchange Format dataset for cross-border interoperability testing.",
                "contenttype": "application/xml",
                "version": "1.0",
            },
            "dataAddress": {
                "@type": "DataAddress",
                "type": "HttpData",
                "baseUrl": "https://eehrxf.lmc.nl/exchange",
            },
        },
    ]
}

# ── transfers.json ──
transfers = [
    {
        "@type": "TransferProcess",
        "@id": "transfer-001",
        "state": "COMPLETED",
        "type": "CONSUMER",
        "assetId": "asset-fhir-bundle-001",
        "contractId": "agreement-001",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "createdAt": 1719500500000,
    },
    {
        "@type": "TransferProcess",
        "@id": "transfer-002",
        "state": "COMPLETED",
        "type": "CONSUMER",
        "assetId": "asset-omop-cohort-diabetes",
        "contractId": "agreement-001",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "createdAt": 1719601000000,
    },
    {
        "@type": "TransferProcess",
        "@id": "transfer-003",
        "state": "STARTED",
        "type": "CONSUMER",
        "assetId": "asset-ehr-exchange-format",
        "contractId": "agreement-002",
        "counterPartyAddress": "http://provider-dsp:8082/api/dsp",
        "createdAt": 1719700500000,
    },
]

# ── compliance_tck.json ──
compliance_tck = {
    "timestamp": "2025-01-15T10:00:00Z",
    "summary": {"total": 20, "passed": 18, "failed": 1, "skipped": 1},
    "suites": {
        "DSP": {
            "passed": 5,
            "total": 6,
            "results": [
                {"id": "DSP-1.1", "category": "Schema Compliance", "suite": "DSP", "name": "Control Plane Readiness", "status": "pass", "detail": "GET /api/check/readiness \u2192 200"},
                {"id": "DSP-1.2", "category": "Schema Compliance", "suite": "DSP", "name": "Control Plane Liveness", "status": "pass", "detail": "GET /api/check/liveness \u2192 200"},
                {"id": "DSP-2.1", "category": "Catalog Protocol", "suite": "DSP", "name": "Catalog query \u2014 alpha-klinik", "status": "pass", "detail": "Catalog response type: dcat:Catalog"},
                {"id": "DSP-2.2", "category": "Catalog Protocol", "suite": "DSP", "name": "Catalog query \u2014 limburg-mc", "status": "pass", "detail": "Catalog response type: dcat:Catalog"},
                {"id": "DSP-2.3", "category": "Catalog Protocol", "suite": "DSP", "name": "Catalog query \u2014 pharmaco-research", "status": "pass", "detail": "Catalog response type: dcat:Catalog"},
                {"id": "DSP-2.4", "category": "Catalog Protocol", "suite": "DSP", "name": "Catalog query \u2014 medreg-de", "status": "skip", "detail": "HDAB does not host datasets"},
            ],
        },
        "DCP": {
            "passed": 7,
            "total": 8,
            "results": [
                {"id": "DCP-1.1", "category": "DID Resolution", "suite": "DCP", "name": "IdentityHub reachable", "status": "pass", "detail": "IdentityHub responded"},
                {"id": "DCP-2.1", "category": "Key Pair Management", "suite": "DCP", "name": "Key pairs \u2014 alpha-klinik", "status": "pass", "detail": "1 key pair(s) found"},
                {"id": "DCP-2.2", "category": "Key Pair Management", "suite": "DCP", "name": "Key pairs \u2014 pharmaco-research", "status": "pass", "detail": "1 key pair(s) found"},
                {"id": "DCP-2.3", "category": "Key Pair Management", "suite": "DCP", "name": "Key pairs \u2014 medreg-de", "status": "pass", "detail": "1 key pair(s) found"},
                {"id": "DCP-2.4", "category": "Key Pair Management", "suite": "DCP", "name": "Key pairs \u2014 limburg-mc", "status": "pass", "detail": "1 key pair(s) found"},
                {"id": "DCP-3.1", "category": "Issuer Service", "suite": "DCP", "name": "IssuerService reachable", "status": "pass", "detail": "IssuerService responded"},
                {"id": "DCP-3.2", "category": "Issuer Service", "suite": "DCP", "name": "EHDS credential definitions", "status": "pass", "detail": "2 credential definitions found"},
                {"id": "DCP-3.3", "category": "Issuer Service", "suite": "DCP", "name": "Issuer DID configured", "status": "fail", "detail": "Issuer DID not found in credential definitions"},
            ],
        },
        "EHDS": {
            "passed": 6,
            "total": 6,
            "results": [
                {"id": "EHDS-1.1", "category": "HealthDCAT-AP", "suite": "EHDS", "name": "HealthDataset nodes present", "status": "pass", "detail": "3 HealthDataset node(s)"},
                {"id": "EHDS-2.1", "category": "EEHRxF Profiles", "suite": "EHDS", "name": "EEHRxF profiles present", "status": "pass", "detail": "6 EEHRxF profile(s)"},
                {"id": "EHDS-3.1", "category": "OMOP CDM", "suite": "EHDS", "name": "OMOP Person nodes present", "status": "pass", "detail": "167 OMOPPerson node(s)"},
                {"id": "EHDS-4.1", "category": "Article 53 Enforcement", "suite": "EHDS", "name": "HDAB approval chains", "status": "pass", "detail": "3 approval chain(s)"},
                {"id": "EHDS-5.1", "category": "Verifiable Credentials", "suite": "EHDS", "name": "VC nodes in graph", "status": "pass", "detail": "8 VerifiableCredential node(s)"},
                {"id": "EHDS-6.1", "category": "Knowledge Graph", "suite": "EHDS", "name": "Total graph nodes", "status": "pass", "detail": "58,000+ total nodes"},
            ],
        },
    },
}

# ── Write all files ──
files = {
    "admin_tenants.json": admin_tenants,
    "participants_me.json": participants_me,
    "participants.json": participants,
    "credentials.json": credentials,
    "negotiations.json": negotiations,
    "admin_audit.json": admin_audit,
    "assets.json": assets,
    "transfers.json": transfers,
    "compliance_tck.json": compliance_tck,
}

for name, data in files.items():
    path = os.path.join(MOCK_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  \u2713 {name}")

print(f"\nDone \u2014 {len(files)} mock files updated with fictional participants.")
