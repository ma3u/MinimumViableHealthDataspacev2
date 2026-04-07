"use client";

import MermaidDiagram from "@/components/MermaidDiagram";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const architectureOverview = `graph TB
  subgraph "Layer 1 — DSP Marketplace"
    MP[DataspaceConnector<br/>EDC-V + DCore]
    CAT[FederatedCatalog<br/>DSP Discovery]
  end

  subgraph "Layer 2 — HealthDCAT-AP"
    DS[Dataset Metadata<br/>DCAT-AP Profiles]
    DIST[Distributions<br/>FHIR / OMOP endpoints]
    QUAL[Quality Metrics<br/>DQV Dimensions]
  end

  subgraph "Layer 3 — FHIR R4 Clinical"
    PAT[Patient]
    ENC[Encounter]
    COND[Condition]
    OBS[Observation]
    MED[MedicationRequest]
    PROC[Procedure]
  end

  subgraph "Layer 4 — OMOP CDM"
    PERS[Person]
    VO[VisitOccurrence]
    CO[ConditionOccurrence]
    MEAS[Measurement]
    DE[DrugExposure]
    PO[ProcedureOccurrence]
  end

  subgraph "Layer 5 — Ontology"
    SNOMED[SNOMED CT]
    LOINC[LOINC]
    RXNORM[RxNorm]
    ICD10[ICD-10]
  end

  MP --> DS
  CAT --> DS
  DS --> DIST
  DS --> QUAL
  DIST --> PAT
  PAT --> ENC --> COND
  PAT --> OBS
  PAT --> MED
  PAT --> PROC
  PAT -. "MAPS_TO" .-> PERS
  ENC -. "MAPS_TO" .-> VO
  COND -. "MAPS_TO" .-> CO
  OBS -. "MAPS_TO" .-> MEAS
  MED -. "MAPS_TO" .-> DE
  PROC -. "MAPS_TO" .-> PO
  CO -. "HAS_CONCEPT" .-> SNOMED
  MEAS -. "HAS_CONCEPT" .-> LOINC
  DE -. "HAS_CONCEPT" .-> RXNORM
  CO -. "HAS_CONCEPT" .-> ICD10`;

const dataFlowDiagram = `sequenceDiagram
  participant SY as Synthea
  participant FHIR as FHIR R4 Bundles
  participant NEO as Neo4j Graph
  participant OMOP as OMOP CDM Layer
  participant AN as Analytics Dashboard

  SY->>FHIR: Generate synthetic patients
  FHIR->>NEO: load_fhir_neo4j.py<br/>(Patient, Encounter, Condition...)
  NEO->>NEO: Create FHIR nodes & relationships
  NEO->>OMOP: fhir-to-omop-transform.cypher
  Note over NEO,OMOP: MAPS_TO relationships<br/>Patient→Person, Encounter→Visit...
  OMOP->>OMOP: HAS_CONCEPT → SNOMED/LOINC/RxNorm
  OMOP->>AN: Cohort analytics queries
  AN->>AN: Render dashboards & charts`;

const deploymentDiagram = `graph LR
  subgraph "Docker Compose Stack"
    NEO4J["Neo4j 5<br/>:7474 / :7687<br/>APOC + n10s"]
    PROXY["Neo4j Proxy<br/>:3001<br/>Node.js"]
    UI["Next.js UI<br/>:3000<br/>React 18"]
  end

  subgraph "JAD Infrastructure"
    PG["PostgreSQL<br/>EDC Runtime Store"]
    KC["Keycloak<br/>SSO / OIDC"]
    VAULT["HashiCorp Vault<br/>Secrets"]
    NATS["NATS<br/>Event Mesh"]
  end

  subgraph "EDC-V Stack"
    CP["Control Plane<br/>DSP / Management API"]
    DP["Data Plane<br/>FHIR + OMOP"]
    IH["Identity Hub<br/>DCP / VC"]
  end

  subgraph "GitHub Pages"
    STATIC["Static Export<br/>Demo Site"]
  end

  UI --> PROXY --> NEO4J
  UI --> CP
  CP --> PG
  CP --> VAULT
  CP --> NATS
  CP --> DP
  IH --> KC
  IH --> VAULT
  UI -.->|"next export"| STATIC`;

const dspNegotiationFlow = `sequenceDiagram
  participant DH as Data Holder<br/>(Provider EDC)
  participant DU as Data User<br/>(Consumer EDC)
  participant CAT as Federated Catalog
  participant HDAB as HDAB Authority

  DU->>CAT: Query HealthDCAT-AP catalog
  CAT-->>DU: Dataset metadata + access policies
  DU->>HDAB: Submit data permit application<br/>(EHDS Art. 45-49)
  HDAB-->>DU: Approved data permit (VC)
  DU->>DH: Contract Negotiation Request<br/>(DSP Protocol)
  DH->>DH: Verify data permit VC
  DH->>DH: Evaluate access policy
  DH-->>DU: Contract Agreement
  DU->>DH: Transfer Request
  DH-->>DU: Data transfer (FHIR/OMOP)
  Note over DH,DU: Sovereign data exchange<br/>with full audit trail`;

const identityTrustDiagram = `graph TB
  subgraph "DCP Identity Layer"
    IH[Identity Hub<br/>DID + VC Store]
    IS[Issuer Service<br/>VC Issuance]
    STS[Secure Token Service<br/>JWT / OAuth2]
  end

  subgraph "Trust Anchors"
    DID[DID:web Resolution]
    KC[Keycloak OIDC<br/>SSO Provider]
    TA[Trust Anchor<br/>Credential Registry]
  end

  subgraph "Verifiable Credentials"
    EHDS[EHDS Membership VC]
    HDAB_VC[Data Permit VC<br/>Art. 46]
    ORG[Organisation VC]
    PART[Participant VC<br/>Gaia-X Compliance]
  end

  subgraph "Protected Resources"
    MGMT[Management API]
    DSP[DSP Endpoints]
    DATA[Data Plane]
  end

  KC --> STS
  IS --> IH
  DID --> IH
  TA --> IS
  IS --> EHDS & HDAB_VC & ORG & PART
  IH --> STS
  STS --> MGMT & DSP & DATA`;

export default function ArchitecturePage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>
      <h1 className="text-3xl font-bold mb-2">Architecture</h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Interactive diagrams of the Health Dataspace v2 architecture — 5-layer
        graph model, data flows, deployment topology, and identity trust
        framework.
      </p>

      {/* 5-Layer Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="five-layer-model">
          5-Layer Knowledge Graph
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The Neo4j knowledge graph organises health data across five
          architectural layers: DSP Marketplace (connector discovery),
          HealthDCAT-AP (dataset metadata), FHIR R4 (clinical data), OMOP CDM
          (research analytics), and Ontology (terminology alignment).
        </p>
        <MermaidDiagram
          chart={architectureOverview}
          caption="Fig 1. Five-layer knowledge graph architecture"
        />
      </section>

      {/* Data Flow */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="data-flow">
          Data Flow Pipeline
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Synthetic patient data flows from Synthea generation through FHIR R4
          resource loading into Neo4j, then transforms to OMOP CDM for research
          analytics. Each stage preserves full provenance through graph
          relationships.
        </p>
        <MermaidDiagram
          chart={dataFlowDiagram}
          caption="Fig 2. End-to-end data flow from Synthea to analytics"
        />
      </section>

      {/* Deployment */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="deployment">
          Deployment Topology
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The platform runs as Docker Compose services locally, with the Next.js
          UI also deployed as a static export to GitHub Pages for the demo site.
          The JAD infrastructure provides PostgreSQL, Keycloak SSO, Vault
          secrets, and NATS event mesh.
        </p>
        <MermaidDiagram
          chart={deploymentDiagram}
          caption="Fig 3. Deployment architecture and service topology"
        />
      </section>

      {/* DSP Negotiation */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="negotiation">
          DSP Contract Negotiation
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The Dataspace Protocol (DSP) governs how data holders and data users
          negotiate access to health datasets. The EHDS regulation adds HDAB
          approval as a pre-requisite for data permit issuance before contract
          negotiation can proceed.
        </p>
        <MermaidDiagram
          chart={dspNegotiationFlow}
          caption="Fig 4. DSP contract negotiation with EHDS compliance"
        />
      </section>

      {/* Identity & Trust */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="identity-trust">
          Identity & Trust Framework
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The Decentralized Claims Protocol (DCP) manages identity, credentials,
          and trust. Identity Hub stores DIDs and Verifiable Credentials, the
          Issuer Service mints EHDS-specific credentials, and Keycloak provides
          SSO/OIDC authentication.
        </p>
        <MermaidDiagram
          chart={identityTrustDiagram}
          caption="Fig 5. DCP identity and trust architecture"
        />
      </section>

      {/* Legend */}
      <section className="border border-[var(--border)] rounded-xl p-6">
        <h3 className="font-semibold mb-3">Diagram Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-[var(--text-secondary)]">
          <div>
            <span className="text-indigo-400">■</span> Solid lines — direct data
            flow or API calls
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">■</span> Dashed lines
            — mapping / transformation relationships
          </div>
          <div>
            <span className="text-indigo-400">●</span> Subgraphs — logical
            boundary groupings
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">●</span> Participants
            — protocol actors in sequence diagrams
          </div>
        </div>
      </section>
    </div>
  );
}
