# Architecture Diagrams

Interactive diagrams of the Health Dataspace v2 architecture.

> **Rendered version:** [/docs/architecture](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/architecture)

## 5-Layer Knowledge Graph

The Neo4j knowledge graph organises health data across five architectural layers:

1. **L1 DSP Marketplace** — connector discovery, contract negotiation, ODRL policies
2. **L2 HealthDCAT-AP** — dataset metadata, distributions, quality metrics
3. **L3 FHIR R4 Clinical** — Patient, Encounter, Condition, Observation, Medication, Procedure
4. **L4 OMOP CDM Analytics** — Person, ConditionOccurrence, Measurement, DrugExposure
5. **L5 Biomedical Ontology** — SNOMED CT, LOINC, RxNorm, ICD-10

## Data Flow Pipeline

```
Synthea → FHIR R4 Bundles → Neo4j Graph → OMOP CDM → Analytics Dashboard
```

Each stage preserves full provenance through graph relationships (MAPS_TO, HAS_CONCEPT).

## Deployment Topology — Full JAD Stack (19 Services)

### Infrastructure Layer

| Service         | Port          | Purpose                           |
| --------------- | ------------- | --------------------------------- |
| Traefik         | :80 / :8090   | API gateway, \*.localhost routing |
| PostgreSQL 17   | :5432         | Runtime store (8 databases)       |
| HashiCorp Vault | :8200         | Secret management (dev mode)      |
| Keycloak        | :8080         | OIDC SSO (realm: edcv)            |
| NATS            | :4222 / :8222 | Async event mesh (JetStream)      |

### EDC-V / DCore Layer

| Service         | Port   | Purpose                       | Depends On          |
| --------------- | ------ | ----------------------------- | ------------------- |
| Control Plane   | :11003 | DSP protocol + management API | PG, Vault, NATS, KC |
| Data Plane FHIR | :11002 | FHIR PUSH transfer type       | PG, Vault, CP       |
| Data Plane OMOP | :11012 | OMOP PULL transfer type       | PG, Vault, CP       |

### Identity (DCP) Layer

| Service        | Port   | Purpose                   | Depends On    |
| -------------- | ------ | ------------------------- | ------------- |
| Identity Hub   | :11005 | DCP v1.0 — DID + VC store | PG, Vault, KC |
| Issuer Service | :10013 | VC issuance + DID:web     | PG, Vault, KC |

### CFM Layer

| Service           | Port   | Purpose                                                      | Depends On |
| ----------------- | ------ | ------------------------------------------------------------ | ---------- |
| Tenant Manager    | :11006 | CFM tenant lifecycle                                         | PG, KC     |
| Provision Manager | :11007 | CFM resource provisioning                                    | PG, KC, CP |
| 4 CFM Agents      | —      | Background provisioning (KC, EDCV, registration, onboarding) | Various    |

### Application Layer

| Service     | Port          | Purpose                       | Depends On |
| ----------- | ------------- | ----------------------------- | ---------- |
| Neo4j 5     | :7474 / :7687 | Knowledge graph (APOC + n10s) | —          |
| Neo4j Proxy | :9090         | Express bridge: UI ↔ Neo4j   | CP         |
| Next.js UI  | :3000 / :3003 | Application frontend          | Neo4j      |

### Static Export

| Target       | URL                                           | Notes                                   |
| ------------ | --------------------------------------------- | --------------------------------------- |
| GitHub Pages | ma3u.github.io/MinimumViableHealthDataspacev2 | Static export, mock data, no API routes |

## DSP Contract Negotiation

1. Data User queries HealthDCAT-AP catalog
2. Data User submits data permit application (EHDS Art. 45-49)
3. HDAB Authority approves and issues Data Permit VC
4. Data User sends Contract Negotiation Request (DSP Protocol)
5. Data Holder verifies permit VC and evaluates policy
6. Contract Agreement → Transfer Request → Data Transfer (FHIR/OMOP)

## Identity & Trust Framework (DCP)

- **Identity Hub** — DID + VC store (DCP v1.0)
- **Issuer Service** — Mints EHDS-specific credentials (Membership, Participant, Data Permit)
- **Keycloak** — SSO/OIDC authentication
- **Trust Anchor** — Credential registry for VC verification
- **Secure Token Service** — JWT/OAuth2 token exchange
