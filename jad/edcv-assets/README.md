# EDC-V Asset Registration (Phase 4a)

This directory contains the EDC-V Management API payloads for registering the
three health data assets described in **ADR-2** onto the Clinic's control plane.

## Assets

| File                              | Asset ID                            | Type                | Data Address                               |
| --------------------------------- | ----------------------------------- | ------------------- | ------------------------------------------ |
| `fhir-cohort-asset.json`          | `asset-fhir-cohort-synthea-2026`    | FhirCohort          | `http://neo4j-proxy:9090/fhir/Bundle`      |
| `omop-analytics-asset.json`       | `asset-omop-analytics-synthea-2026` | OmopAnalytics       | `http://neo4j-proxy:9090/omop/cohort`      |
| `healthdcatap-catalog-asset.json` | `asset-catalog-healthdcatap-2026`   | HealthDcatApCatalog | `http://neo4j-proxy:9090/catalog/datasets` |

## Policies

| File                               | Policy ID                     | Description                                       |
| ---------------------------------- | ----------------------------- | ------------------------------------------------- |
| `policy-ehds-research-access.json` | `policy-ehds-research-access` | EHDS Art. 53 purpose, 90-day limit, k≥5 anonymity |

## Contract Definitions

| File                              | Selects Assets         | Access Policy                 | Contract Policy               |
| --------------------------------- | ---------------------- | ----------------------------- | ----------------------------- |
| `contract-def-fhir-research.json` | `type = FhirCohort`    | `policy-ehds-research-access` | `policy-ehds-research-access` |
| `contract-def-omop-research.json` | `type = OmopAnalytics` | `policy-ehds-research-access` | `policy-ehds-research-access` |

## Registration (requires running EDC-V control plane)

```bash
# Register all assets, policies, and contract definitions
EDC_MGMT="http://localhost:11003/api/mgmt/v3"
AUTH="X-Api-Key: password"

# 1. Create policy
curl -X POST "$EDC_MGMT/policydefinitions" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d @policy-ehds-research-access.json

# 2. Create assets
for asset in fhir-cohort-asset.json omop-analytics-asset.json healthdcatap-catalog-asset.json; do
  curl -X POST "$EDC_MGMT/assets" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d @"$asset"
done

# 3. Create contract definitions
for cd in contract-def-fhir-research.json contract-def-omop-research.json; do
  curl -X POST "$EDC_MGMT/contractdefinitions" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d @"$cd"
done

# 4. Verify assets are discoverable
curl "$EDC_MGMT/assets/request" -H "$AUTH" -H "Content-Type: application/json" -d '{}'
```

## Data Flow

```
Consumer (CRO)         EDC-V Control Plane           DCore Data Plane          Neo4j Proxy          Neo4j
    │                        │                             │                       │                  │
    │  DSP CatalogRequest    │                             │                       │                  │
    ├───────────────────────►│                             │                       │                  │
    │  CatalogResponse       │                             │                       │                  │
    │◄───────────────────────┤                             │                       │                  │
    │                        │                             │                       │                  │
    │  ContractNegotiation   │                             │                       │                  │
    ├───────────────────────►│                             │                       │                  │
    │  ContractAgreement     │  (policy eval + VC check)   │                       │                  │
    │◄───────────────────────┤                             │                       │                  │
    │                        │                             │                       │                  │
    │  TransferRequest       │                             │                       │                  │
    ├───────────────────────►│  DPS: StartTransfer         │                       │                  │
    │                        ├────────────────────────────►│                       │                  │
    │                        │                             │  HTTP GET/POST        │                  │
    │                        │                             ├──────────────────────►│  Cypher Query    │
    │                        │                             │                       ├─────────────────►│
    │                        │                             │                       │  Result Set      │
    │                        │                             │  JSON/FHIR Response   │◄─────────────────┤
    │  Data (PUSH or PULL)   │                             │◄──────────────────────┤                  │
    │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                       │                  │
    │                        │  DPS: TransferComplete      │                       │                  │
    │  TransferCompletion    │◄────────────────────────────┤                       │                  │
    │◄───────────────────────┤                             │                       │                  │
```
