"use client";

import MermaidDiagram from "@/components/MermaidDiagram";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

const GITHUB_REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";

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

const deploymentDiagram = `graph TB
  subgraph INFRA["Infrastructure Layer"]
    TFK["Traefik<br/>API Gateway<br/>:80 / :8090"]
    PG["PostgreSQL 17<br/>8 databases<br/>:5432"]
    VAULT["HashiCorp Vault<br/>Secrets (dev)<br/>:8200"]
    NATS["NATS JetStream<br/>Event Mesh<br/>:4222 / :8222"]
    KC["Keycloak<br/>OIDC SSO<br/>:8080 / :9000"]
    VB["vault-bootstrap<br/>Sidecar Init"]
  end

  subgraph EDCV["EDC-V / DCore Layer"]
    CP["Control Plane<br/>DSP + Mgmt API<br/>:11003"]
    DPFHIR["Data Plane FHIR<br/>DCore FHIR<br/>:11002"]
    DPOMOP["Data Plane OMOP<br/>DCore OMOP<br/>:11012"]
  end

  subgraph IDENTITY["Identity Layer"]
    IH["Identity Hub<br/>DCP / VC Store<br/>:11005"]
    IS["Issuer Service<br/>VC Issuance<br/>:10013"]
  end

  subgraph CFM["CFM Layer"]
    TM["Tenant Manager<br/>:11006"]
    PM["Provision Manager<br/>:11007"]
    CFMKC["cfm-keycloak-agent"]
    CFMEDCV["cfm-edcv-agent"]
    CFMREG["cfm-registration-agent"]
    CFMONB["cfm-onboarding-agent"]
  end

  subgraph APP["Application Layer"]
    NEO4J["Neo4j 5<br/>Knowledge Graph<br/>:7474 / :7687"]
    NEO4J2["Neo4j SPE2<br/>Federated<br/>:7475 / :7688"]
    PROXY["Neo4j Proxy<br/>Express Bridge<br/>:9090"]
    UI["Next.js UI<br/>Graph Explorer<br/>:3000 / :3003"]
  end

  subgraph STATIC["Static Export"]
    GHP["GitHub Pages<br/>Demo Site"]
  end

  subgraph SEED["One-Shot"]
    JADSEED["jad-seed<br/>Phases 1-7"]
  end

  %% Infrastructure dependencies
  KC --> PG
  VB --> VAULT
  VB --> KC

  %% EDC-V dependencies
  CP --> PG
  CP --> VAULT
  CP --> NATS
  CP --> KC
  DPFHIR --> PG
  DPFHIR --> VAULT
  DPFHIR --> CP
  DPOMOP --> PG
  DPOMOP --> VAULT
  DPOMOP --> CP

  %% Identity dependencies
  IH --> PG
  IH --> VAULT
  IH --> KC
  IS --> PG
  IS --> VAULT
  IS --> KC

  %% CFM dependencies
  TM --> PG
  TM --> KC
  PM --> PG
  PM --> KC
  PM --> CP
  CFMKC --> KC
  CFMEDCV --> CP
  CFMREG --> IH
  CFMONB --> TM

  %% Application dependencies
  PROXY --> CP
  PROXY --> NEO4J
  UI --> PROXY
  UI --> CP

  %% Routing
  TFK --> UI
  TFK --> CP
  TFK --> DPFHIR
  TFK --> DPOMOP
  TFK --> IH
  TFK --> IS
  TFK --> TM
  TFK --> PM

  %% Static export
  UI -.->|"next export"| GHP`;

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

interface ServiceInfo {
  name: string;
  port: string;
  depends: string;
  purpose: string;
  layer: string;
}

const services: ServiceInfo[] = [
  {
    name: "Traefik",
    port: ":80 / :8090",
    depends: "--",
    purpose: "API gateway, reverse proxy, *.localhost routing",
    layer: "Infrastructure",
  },
  {
    name: "PostgreSQL 17",
    port: ":5432",
    depends: "--",
    purpose:
      "Shared database (8 DBs: controlplane, dataplane-fhir, dataplane-omop, identityhub, issuerservice, keycloak, tenant-mgr, provision-mgr)",
    layer: "Infrastructure",
  },
  {
    name: "HashiCorp Vault",
    port: ":8200",
    depends: "--",
    purpose: "Secrets management (dev/in-memory mode, lost on restart)",
    layer: "Infrastructure",
  },
  {
    name: "NATS JetStream",
    port: ":4222 / :8222",
    depends: "--",
    purpose: "Async event mesh for DSP protocol events",
    layer: "Infrastructure",
  },
  {
    name: "Keycloak",
    port: ":8080 / :9000",
    depends: "PostgreSQL",
    purpose: "OIDC SSO provider, realm edcv, 7 personas",
    layer: "Infrastructure",
  },
  {
    name: "vault-bootstrap",
    port: "--",
    depends: "Vault, Keycloak",
    purpose: "Init sidecar: seeds Vault secrets and Keycloak config",
    layer: "Infrastructure",
  },
  {
    name: "Control Plane",
    port: ":11003",
    depends: "PostgreSQL, Vault, NATS, Keycloak",
    purpose: "EDC-V runtime: DSP negotiation, management API, policy engine",
    layer: "EDC-V / DCore",
  },
  {
    name: "Data Plane FHIR",
    port: ":11002",
    depends: "PostgreSQL, Vault, Control Plane",
    purpose: "DCore data plane for FHIR R4 resource transfer",
    layer: "EDC-V / DCore",
  },
  {
    name: "Data Plane OMOP",
    port: ":11012",
    depends: "PostgreSQL, Vault, Control Plane",
    purpose: "DCore data plane for OMOP CDM data transfer",
    layer: "EDC-V / DCore",
  },
  {
    name: "Identity Hub",
    port: ":11005",
    depends: "PostgreSQL, Vault, Keycloak",
    purpose: "DCP: DID resolution, Verifiable Credential storage",
    layer: "Identity",
  },
  {
    name: "Issuer Service",
    port: ":10013",
    depends: "PostgreSQL, Vault, Keycloak",
    purpose: "VC issuance: EHDS membership, data permits, org credentials",
    layer: "Identity",
  },
  {
    name: "Tenant Manager",
    port: ":11006",
    depends: "PostgreSQL, Keycloak",
    purpose: "CFM: multi-tenant participant management",
    layer: "CFM",
  },
  {
    name: "Provision Manager",
    port: ":11007",
    depends: "PostgreSQL, Keycloak, Control Plane",
    purpose: "CFM: automated resource provisioning",
    layer: "CFM",
  },
  {
    name: "cfm-keycloak-agent",
    port: "--",
    depends: "Keycloak",
    purpose: "Background: syncs Keycloak realm configuration",
    layer: "CFM",
  },
  {
    name: "cfm-edcv-agent",
    port: "--",
    depends: "Control Plane",
    purpose: "Background: manages EDC-V connector lifecycle",
    layer: "CFM",
  },
  {
    name: "cfm-registration-agent",
    port: "--",
    depends: "Identity Hub",
    purpose: "Background: handles participant DID registration",
    layer: "CFM",
  },
  {
    name: "cfm-onboarding-agent",
    port: "--",
    depends: "Tenant Manager",
    purpose: "Background: automates tenant onboarding workflows",
    layer: "CFM",
  },
  {
    name: "Neo4j 5",
    port: ":7474 / :7687",
    depends: "--",
    purpose: "Knowledge graph: 5-layer model, APOC + n10s plugins",
    layer: "Application",
  },
  {
    name: "Neo4j SPE2",
    port: ":7475 / :7688",
    depends: "--",
    purpose: "Secondary graph instance (federated profile)",
    layer: "Application",
  },
  {
    name: "Neo4j Proxy",
    port: ":9090",
    depends: "Neo4j, Control Plane",
    purpose: "Express bridge: FHIR/OMOP REST endpoints over Neo4j",
    layer: "Application",
  },
  {
    name: "Next.js UI",
    port: ":3000 / :3003",
    depends: "Neo4j Proxy",
    purpose: "Graph Explorer: 16 pages, 36 API routes, 7 personas",
    layer: "Application",
  },
  {
    name: "jad-seed",
    port: "--",
    depends: "All services",
    purpose: "One-shot: phases 1-7 data seeding (Synthea, FHIR, OMOP, DSP)",
    layer: "Seed",
  },
  {
    name: "GitHub Pages",
    port: "--",
    depends: "Next.js UI (static export)",
    purpose: "Public demo site with mock data fixtures",
    layer: "Static",
  },
];

const layerColors: Record<string, string> = {
  Infrastructure:
    "bg-blue-900/30 text-blue-300 dark:bg-blue-900/30 dark:text-blue-300",
  "EDC-V / DCore":
    "bg-emerald-900/30 text-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300",
  Identity:
    "bg-purple-900/30 text-purple-300 dark:bg-purple-900/30 dark:text-purple-300",
  CFM: "bg-amber-900/30 text-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  Application:
    "bg-cyan-900/30 text-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300",
  Seed: "bg-gray-800/30 text-gray-300 dark:bg-gray-800/30 dark:text-gray-300",
  Static: "bg-gray-800/30 text-gray-300 dark:bg-gray-800/30 dark:text-gray-300",
};

const tocItems = [
  { id: "five-layer-model", label: "1. Five-Layer Knowledge Graph" },
  { id: "data-flow", label: "2. Data Flow Pipeline" },
  { id: "deployment", label: "3. Deployment Topology" },
  { id: "service-dependencies", label: "4. Service Dependencies" },
  { id: "negotiation", label: "5. DSP Contract Negotiation" },
  { id: "identity-trust", label: "6. Identity & Trust Framework" },
  { id: "simpl-compliance", label: "7. SIMPL-Open & Compliance" },
  { id: "adrs", label: "8. Architecture Decision Records" },
];

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
        graph model, data flows, deployment topology, service dependencies, and
        identity trust framework.
      </p>

      {/* Table of Contents */}
      <nav className="border border-[var(--border)] rounded-xl p-5 mb-12 bg-[var(--surface)]">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Contents
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {tocItems.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 5-Layer Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="five-layer-model">
          1. Five-Layer Knowledge Graph
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
          2. Data Flow Pipeline
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
          3. Deployment Topology
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The full JAD stack runs 19+ Docker Compose services across six layers:
          infrastructure (Traefik, PostgreSQL, Vault, NATS, Keycloak), EDC-V /
          DCore (Control Plane, dual Data Planes), Identity (Identity Hub,
          Issuer Service), CFM (Tenant/Provision Managers, 4 background agents),
          Application (Neo4j, Proxy, UI), and a static GitHub Pages export. The
          same topology is deployed to{" "}
          <a
            href="https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline hover:opacity-80"
          >
            Azure Container Apps
          </a>{" "}
          (13 apps + 3 jobs, see{" "}
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-012-azure-container-apps.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline hover:opacity-80"
          >
            ADR-012
          </a>
          ). Arrows show runtime dependencies.
        </p>
        <MermaidDiagram
          chart={deploymentDiagram}
          caption="Fig 3. Full deployment topology — 19+ services with dependency graph"
        />
      </section>

      {/* Service Dependencies Table */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="service-dependencies">
          4. Service Dependencies
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Complete inventory of all services in the docker-compose.yml and
          docker-compose.jad.yml stacks, their exposed ports, upstream
          dependencies, and purpose.
        </p>
        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">
                  Service
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">
                  Layer
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">
                  Port(s)
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">
                  Depends On
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)]">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => (
                <tr
                  key={svc.name}
                  className={`border-b border-[var(--border)] ${
                    i % 2 === 0 ? "" : "bg-[var(--surface)]/30"
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--text-primary)] whitespace-nowrap">
                    {svc.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        layerColors[svc.layer] || ""
                      }`}
                    >
                      {svc.layer}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">
                    {svc.port}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] text-xs">
                    {svc.depends}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)] text-xs">
                    {svc.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* DSP Negotiation */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="negotiation">
          5. DSP Contract Negotiation
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
          6. Identity & Trust Framework
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

      {/* SIMPL-Open & Compliance */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-3" id="simpl-compliance">
          7. SIMPL-Open & Compliance
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          This reference implementation aligns with the EU SIMPL-Open programme
          for federated data spaces. The architecture satisfies EHDS regulation,
          DSP 2025-1, DCP v1.0, and supply chain transparency requirements.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">SIMPL-Open Alignment</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1.5 list-disc ml-4">
              <li>
                <strong>DSP 2025-1:</strong> Sovereign data exchange via Control
                Plane
              </li>
              <li>
                <strong>DCP v1.0:</strong> DID:web identity + Verifiable
                Credentials
              </li>
              <li>
                <strong>Trust Framework:</strong> Gaia-X compatible credential
                attestation
              </li>
              <li>
                <strong>Federated Catalog:</strong> HealthDCAT-AP 3.0 metadata
                profiles
              </li>
              <li>
                <strong>SBOM:</strong> CycloneDX 1.5 supply chain transparency
              </li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              Regulatory Compliance
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1.5 list-disc ml-4">
              <li>
                <strong>EHDS Art. 3-12:</strong> Patient rights (access,
                rectification, portability)
              </li>
              <li>
                <strong>EHDS Art. 50-51:</strong> Secondary use — HDAB approval,
                data permits
              </li>
              <li>
                <strong>GDPR Art. 15-22:</strong> Data subject rights
                enforcement
              </li>
              <li>
                <strong>EU CRA Art. 13:</strong> SBOM mandate, vulnerability
                disclosure
              </li>
              <li>
                <strong>BSI C5:</strong> Cloud security baseline (DEV, OPS
                controls)
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/simpl-ehds-gap-analysis.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            SIMPL-Open Gap Analysis &rarr;
          </a>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-013-simpl-open-alignment.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            ADR-013: SIMPL Alignment &rarr;
          </a>
          <Link
            href="/docs/developer/quality-gates"
            className="text-sm text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Quality Gates &rarr;
          </Link>
        </div>
      </section>

      {/* ADRs */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="adrs">
          8. Architecture Decision Records
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          All ADRs are maintained as standalone Markdown files in{" "}
          <a
            href={`${GITHUB_REPO}/tree/main/docs/ADRs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 dark:text-indigo-400 underline inline-flex items-center gap-1"
          >
            docs/ADRs/ <ExternalLink size={10} />
          </a>
          .
        </p>
        <div className="space-y-3">
          {[
            {
              id: "ADR-001",
              file: "ADR-001-postgresql-neo4j-split.md",
              title: "PostgreSQL / Neo4j Split",
              desc: "EDC runtime metadata in PostgreSQL (8 databases), health knowledge graph in Neo4j.",
            },
            {
              id: "ADR-002",
              file: "ADR-002-edc-data-plane-architecture.md",
              title: "Dual EDC Data Planes",
              desc: "Separate FHIR R4 (PUSH) and OMOP CDM (PULL) data planes for type-safe access.",
            },
            {
              id: "ADR-003",
              file: "ADR-003-healthdcat-ap-alignment.md",
              title: "HealthDCAT-AP Alignment",
              desc: "Graph nodes aligned with HealthDCAT-AP 3.0 profile for EU catalog interoperability.",
            },
            {
              id: "ADR-004",
              file: "ADR-004-nextjs-unified-frontend.md",
              title: "Next.js App Router",
              desc: "Client SPA with 36 API routes proxying to Neo4j and EDC-V; static export for demo.",
            },
            {
              id: "ADR-005",
              file: "ADR-005-jad-cfm-source-builds.md",
              title: "Source Builds from Public Repos",
              desc: "Build EDC-V, DCore, CFM from source using Gradle multi-module layout.",
            },
            {
              id: "ADR-006",
              file: "ADR-006-ghcr-image-publishing.md",
              title: "GHCR Image Publishing",
              desc: "Publish OCI images to GitHub Container Registry for consistent deployments.",
            },
            {
              id: "ADR-007",
              file: "ADR-007-did-web-dsp-negotiation.md",
              title: "DID:web for Participant Identity",
              desc: "W3C DID:web method for decentralised participant identification.",
            },
            {
              id: "ADR-008",
              file: "ADR-008-testing-strategy.md",
              title: "Vitest + MSW + Playwright Testing",
              desc: "1,613 unit tests with MSW API mocking, 19 Playwright E2E specs, pre-push gate.",
            },
            {
              id: "ADR-009",
              file: "ADR-009-issuerservice-credential-fix.md",
              title: "Credential Issuance Flow",
              desc: "EHDS membership, data permits, and org VCs issued via DCP Issuer Service.",
            },
            {
              id: "ADR-010",
              file: "ADR-010-wcag-accessibility.md",
              title: "WCAG 2.2 AA Accessibility",
              desc: "Zero WCAG violations enforced by automated axe-core audits in CI.",
            },
            {
              id: "ADR-011",
              file: "ADR-011-security-testing.md",
              title: "Security Penetration Testing",
              desc: "OWASP ZAP + BSI C5 baseline scans integrated into CI pipeline.",
            },
            {
              id: "ADR-012",
              file: "ADR-012-azure-container-apps.md",
              title: "Azure Container Apps Deployment",
              desc: "13 Container Apps + 3 jobs on Azure with OIDC federation and VNet isolation.",
            },
            {
              id: "ADR-013",
              file: "ADR-013-simpl-open-alignment.md",
              title: "SIMPL-Open Alignment",
              desc: "Gap analysis and alignment roadmap for EU SIMPL-Open programme compatibility.",
            },
            {
              id: "ADR-014",
              file: "ADR-014-weekly-demo-reset.md",
              title: "Weekly Demo Reset",
              desc: "Scheduled Monday 05:15 UTC reset of demo state for GDPR data minimisation.",
            },
            {
              id: "ADR-015",
              file: "ADR-015-single-vm-dev-deployment.md",
              title: "Single-VM Dev Deployment",
              desc: "Single-VM fallback deployment mode for personal Visual Studio subscription budgets.",
            },
            {
              id: "ADR-016",
              file: "ADR-016-aca-off-hours-scaledown.md",
              title: "ACA Off-Hours Scale-Down",
              desc: "Weekday business-hours scaling schedule to reduce Azure Container Apps cost by ~60%.",
            },
            {
              id: "ADR-017",
              file: "ADR-017-persistent-storage-aca.md",
              title: "Persistent Storage for Stateful Services",
              desc: "Azure Files volume mounts for Neo4j, PostgreSQL, and Vault on Container Apps.",
            },
            {
              id: "ADR-018",
              file: "ADR-018-24x7-workaround-b.md",
              title: "24×7 Operation — Workaround B",
              desc: "Postgres-on-ACA workaround for INF-STG-EU_EHDS subscription policy constraints.",
            },
          ].map((adr) => (
            <a
              key={adr.id}
              href={`${GITHUB_REPO}/blob/main/docs/ADRs/${adr.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[var(--border)] rounded-lg px-4 py-3 flex items-start gap-3 hover:border-indigo-500/50 transition-colors"
            >
              <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/50 px-2 py-0.5 rounded shrink-0">
                {adr.id}
              </span>
              <div>
                <span className="font-semibold text-sm">{adr.title}</span>
                <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                  {adr.desc}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Legend */}
      <section className="border border-[var(--border)] rounded-xl p-6">
        <h3 className="font-semibold mb-3">Diagram Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-[var(--text-secondary)]">
          <div>
            <span className="text-indigo-700 dark:text-indigo-400">■</span>{" "}
            Solid lines — direct data flow or API calls
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">■</span> Dashed lines
            — mapping / transformation relationships
          </div>
          <div>
            <span className="text-indigo-700 dark:text-indigo-400">●</span>{" "}
            Subgraphs — logical boundary groupings
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
