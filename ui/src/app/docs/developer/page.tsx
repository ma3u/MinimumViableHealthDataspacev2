"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";

const PAGES_BASE = "/MinimumViableHealthDataspacev2";
const GITHUB_REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const basePath =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? PAGES_BASE : "";

const jadArchitectureDiagram = `graph TB
  subgraph "API Gateway"
    TF["Traefik :80<br/>*.localhost routing"]
  end

  subgraph "Infrastructure"
    PG["PostgreSQL 17<br/>:5432 — 8 databases"]
    KC["Keycloak<br/>:8080 — OIDC SSO"]
    VAULT["HashiCorp Vault<br/>:8200 — Secrets"]
    NATS["NATS<br/>:4222 — Event Mesh"]
  end

  subgraph "EDC-V / DCore"
    CP["Control Plane<br/>:11003 — DSP Protocol"]
    DP_F["Data Plane FHIR<br/>:11002 — PUSH"]
    DP_O["Data Plane OMOP<br/>:11012 — PULL"]
  end

  subgraph "Identity (DCP)"
    IH["Identity Hub<br/>:11005 — DID + VC"]
    IS["Issuer Service<br/>:10013 — VC Issuance"]
  end

  subgraph "CFM"
    TM["Tenant Manager<br/>:11006"]
    PM["Provision Manager<br/>:11007"]
  end

  subgraph "Application"
    NEO["Neo4j 5<br/>:7474 / :7687"]
    PROXY["Neo4j Proxy<br/>:9090 — Express"]
    UI["Next.js UI<br/>:3000 / :3003"]
  end

  TF --> CP & IH & IS & TM & PM & PROXY
  CP --> PG & VAULT & NATS
  DP_F --> PG & VAULT & CP
  DP_O --> PG & VAULT & CP
  IH --> PG & VAULT & KC
  IS --> PG & VAULT & KC
  TM --> PG & KC
  PM --> PG & KC & CP
  PROXY --> NEO & CP
  UI --> PROXY & KC
  KC --> PG`;

const graphSchemaDiagram = `erDiagram
  Patient ||--o{ Encounter : HAS_ENCOUNTER
  Encounter ||--o{ Condition : HAS_CONDITION
  Encounter ||--o{ Observation : HAS_OBSERVATION
  Patient ||--o{ MedicationRequest : HAS_MEDICATION
  Patient ||--o{ Procedure : HAS_PROCEDURE
  Patient ||--|| Person : MAPS_TO
  Encounter ||--|| VisitOccurrence : MAPS_TO
  Condition ||--|| ConditionOccurrence : MAPS_TO
  Observation ||--|| Measurement : MAPS_TO
  MedicationRequest ||--|| DrugExposure : MAPS_TO
  Procedure ||--|| ProcedureOccurrence : MAPS_TO
  ConditionOccurrence }|--|| SnomedConcept : HAS_CONCEPT
  Measurement }|--|| LoincConcept : HAS_CONCEPT
  DrugExposure }|--|| RxNormConcept : HAS_CONCEPT`;

const cicdDiagram = `graph LR
  subgraph "Developer Workflow"
    DEV[Local Dev<br/>npm run dev]
    TEST["Vitest<br/>1,613 tests"]
    LINT[ESLint +<br/>15 pre-commit hooks]
  end

  subgraph "CI Pipeline — test.yml"
    CI_UNIT["Unit Tests<br/>+ Coverage"]
    CI_SEC["Security<br/>gitleaks + Trivy"]
    CI_LINT[Lint + Audit]
    CI_E2E["E2E + WCAG<br/>+ Pentest"]
    CI_K8S["Kubescape<br/>K8s Posture"]
  end

  subgraph "Compliance — compliance.yml"
    DSP["DSP 2025-1<br/>TCK"]
    DCP["DCP v1.0"]
    EHDS["EHDS Domain"]
  end

  subgraph "Deployment"
    PAGES["GitHub Pages<br/>Static Export"]
  end

  DEV --> TEST --> LINT
  LINT --> CI_UNIT & CI_SEC & CI_LINT & CI_E2E & CI_K8S
  CI_UNIT & CI_SEC & CI_LINT --> PAGES
  LINT -.-> DSP & DCP & EHDS`;

const dataFlowDiagram = `sequenceDiagram
  participant SY as Synthea
  participant NEO as Neo4j Graph
  participant PROXY as Neo4j Proxy
  participant UI as Next.js UI

  SY->>NEO: load_fhir_neo4j.py<br/>(127 patients → FHIR R4)
  NEO->>NEO: fhir-to-omop-transform.cypher<br/>(FHIR → OMOP CDM)
  NEO->>NEO: HAS_CONCEPT → SNOMED/LOINC/RxNorm
  UI->>PROXY: /api/graph, /api/catalog, /nlq
  PROXY->>NEO: Parameterised Cypher
  NEO-->>PROXY: Graph data
  PROXY-->>UI: JSON response`;

/** TOC entry helper */
function TocLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="hover:text-indigo-900 dark:hover:text-indigo-300"
      >
        {children}
      </a>
    </li>
  );
}

export default function DeveloperGuidePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6"
      >
        <ArrowLeft size={14} /> Back to Docs
      </Link>
      <h1 className="text-3xl font-bold mb-2">Developer Guide</h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Technical documentation for developing, testing, and deploying the
        Health Dataspace v2 platform — an EHDS regulation reference
        implementation built on Eclipse Dataspace Components.
      </p>

      {/* Resources */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-sm text-[var(--text-primary)]"
        >
          GitHub Repository <ExternalLink size={12} />
        </a>
        <Link
          href="/docs/developer/api"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-sm text-[var(--text-primary)]"
        >
          Swagger UI →
        </Link>
        <a
          href={`${GITHUB_REPO}/tree/main/bruno/MVHDv2`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-sm text-[var(--text-primary)]"
        >
          Bruno Collection <ExternalLink size={12} />
        </a>
      </div>

      {/* TOC */}
      <nav className="border border-[var(--border)] rounded-xl p-5 mb-10">
        <h2 className="font-semibold mb-3">Contents</h2>
        <ul className="text-sm space-y-1.5 text-indigo-700 dark:text-indigo-400 columns-1 md:columns-2">
          <TocLink href="#onboarding">Onboarding</TocLink>
          <TocLink href="#jad-architecture">JAD Stack Architecture</TocLink>
          <TocLink href="#prerequisites">Prerequisites</TocLink>
          <TocLink href="#quick-start">Quick Start (Minimal)</TocLink>
          <TocLink href="#jad-quick-start">Quick Start (Full JAD)</TocLink>
          <TocLink href="#seeding">Data Seeding Pipeline</TocLink>
          <TocLink href="#project-structure">Project Structure</TocLink>
          <TocLink href="#graph-schema">Neo4j Graph Schema</TocLink>
          <TocLink href="#postgres-schema">PostgreSQL Schema</TocLink>
          <TocLink href="#integration-flows">Integration Flows</TocLink>
          <TocLink href="#api-reference">API Reference</TocLink>
          <TocLink href="#testing">Testing</TocLink>
          <TocLink href="#quality-gates">Quality Gates</TocLink>
          <TocLink href="#cicd">CI/CD Pipeline</TocLink>
          <TocLink href="#reports">Latest Reports</TocLink>
          <TocLink href="#releases">Release Notes</TocLink>
          <TocLink href="#project-links">Planning & Issues</TocLink>
          <TocLink href="#conventions">Conventions</TocLink>
        </ul>
      </nav>

      {/* Onboarding */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="onboarding">
          Onboarding
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          New to the project? Follow this quick-start path to get productive
          within your first day.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              1. Get Running
            </h4>
            <ol className="text-[var(--text-secondary)] text-xs space-y-1 list-decimal ml-4">
              <li>Clone the repository</li>
              <li>
                <code>docker compose up -d</code> (Neo4j)
              </li>
              <li>Seed schema &amp; data (cypher-shell)</li>
              <li>
                <code>cd ui &amp;&amp; npm install &amp;&amp; npm run dev</code>
              </li>
              <li>
                Open <code>http://localhost:3000</code>
              </li>
            </ol>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
              2. Explore the Platform
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>Switch personas via the User Menu</li>
              <li>Explore the Graph Explorer (center node)</li>
              <li>Browse the Data Catalog</li>
              <li>Check Patient Portal (PATIENT role)</li>
              <li>Review ODRL policies (HDAB role)</li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-400">
              3. Key Concepts
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>
                <strong>DSP:</strong> Dataspace Protocol — sovereign data
                exchange
              </li>
              <li>
                <strong>DCP:</strong> Decentralised Claims — DID + VC identity
              </li>
              <li>
                <strong>FHIR R4:</strong> Clinical data standard (EHR)
              </li>
              <li>
                <strong>OMOP CDM:</strong> Analytics layer for research
              </li>
              <li>
                <strong>EHDS:</strong> EU regulation for health data sharing
              </li>
            </ul>
          </div>
        </div>
        <a
          href={`${GITHUB_REPO}/blob/main/docs/onboarding-guide.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
        >
          Full Onboarding Guide &rarr; <ExternalLink size={12} />
        </a>
      </section>

      {/* JAD Architecture */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="jad-architecture">
          JAD Stack Architecture
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The full JAD (Java Application Deployment) stack runs 19 Docker
          services orchestrated via{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            docker-compose.yml
          </code>{" "}
          +{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            docker-compose.jad.yml
          </code>
          . Services are grouped into five layers:
        </p>
        <MermaidDiagram
          chart={jadArchitectureDiagram}
          caption="JAD stack — 19 services with dependency relationships"
        />

        {/* Service table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Service
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Port
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Traefik
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Purpose
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Depends On
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {[
                [
                  "Traefik",
                  ":80 / :8090",
                  "traefik.localhost",
                  "API gateway & reverse proxy",
                  "—",
                ],
                [
                  "PostgreSQL 17",
                  ":5432",
                  "—",
                  "Runtime store (8 databases)",
                  "—",
                ],
                [
                  "Vault",
                  ":8200",
                  "vault.localhost",
                  "Secret management (dev mode)",
                  "—",
                ],
                [
                  "Keycloak",
                  ":8080",
                  "keycloak.localhost",
                  "OIDC SSO (realm: edcv, 7 users)",
                  "PostgreSQL",
                ],
                [
                  "NATS",
                  ":4222 / :8222",
                  "—",
                  "Async event mesh (JetStream)",
                  "—",
                ],
                [
                  "Control Plane",
                  ":11003",
                  "cp.localhost",
                  "DSP protocol + management API",
                  "PG, Vault, NATS, KC",
                ],
                [
                  "Data Plane FHIR",
                  ":11002",
                  "dp-fhir.localhost",
                  "FHIR PUSH transfer type",
                  "PG, Vault, CP",
                ],
                [
                  "Data Plane OMOP",
                  ":11012",
                  "dp-omop.localhost",
                  "OMOP PULL transfer type",
                  "PG, Vault, CP",
                ],
                [
                  "Identity Hub",
                  ":11005",
                  "ih.localhost",
                  "DCP v1.0 — DID + VC store",
                  "PG, Vault, KC",
                ],
                [
                  "Issuer Service",
                  ":10013",
                  "issuer.localhost",
                  "VC issuance + DID:web",
                  "PG, Vault, KC",
                ],
                [
                  "Tenant Manager",
                  ":11006",
                  "tm.localhost",
                  "CFM tenant lifecycle",
                  "PG, KC",
                ],
                [
                  "Provision Manager",
                  ":11007",
                  "pm.localhost",
                  "CFM resource provisioning",
                  "PG, KC, CP",
                ],
                [
                  "Neo4j 5",
                  ":7474 / :7687",
                  "—",
                  "Knowledge graph (APOC + n10s)",
                  "—",
                ],
                [
                  "Neo4j Proxy",
                  ":9090",
                  "proxy.localhost",
                  "Express bridge: UI ↔ Neo4j",
                  "CP",
                ],
                [
                  "Next.js UI",
                  ":3000 / :3003",
                  "—",
                  "Application frontend",
                  "Neo4j",
                ],
              ].map(([service, port, traefik, purpose, deps]) => (
                <tr key={service} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-medium text-[var(--text-primary)]">
                    {service}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{port}</td>
                  <td className="px-3 py-1.5 font-mono">{traefik}</td>
                  <td className="px-3 py-1.5">{purpose}</td>
                  <td className="px-3 py-1.5">{deps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[var(--text-secondary)] text-xs mt-2">
          Plus 4 background CFM agents (keycloak, edcv, registration,
          onboarding) and 1 one-shot seed container. Vault-bootstrap runs as a
          sidecar.
        </p>
      </section>

      {/* Prerequisites */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="prerequisites">
          Prerequisites
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              Required
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>
                <strong>Node.js 20+</strong> — runtime for UI and proxy
              </li>
              <li>
                <strong>Docker Desktop</strong> — with Docker Compose V2
              </li>
              <li>
                <strong>8 GB Docker RAM</strong> — required for full JAD stack
              </li>
              <li>
                <strong>Git</strong> — with pre-commit hooks enabled
              </li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
              Optional
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>
                <strong>Python 3.11+</strong> — for Synthea FHIR data loading
              </li>
              <li>
                <strong>gitleaks</strong> — local secret scanning (
                <code>brew install gitleaks</code>)
              </li>
              <li>
                <strong>lychee</strong> — broken link checker (
                <code>brew install lychee</code>)
              </li>
              <li>
                <strong>Playwright browsers</strong> — for E2E tests (
                <code>npx playwright install</code>)
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Port Requirements</h4>
          <p className="text-[var(--text-secondary)] text-xs">
            The JAD stack requires these ports to be free:{" "}
            <code className="text-[var(--text-primary)]">
              80, 3000, 3003, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222,
              9090, 10013, 11002, 11003, 11005, 11006, 11007, 11012
            </code>
          </p>
        </div>
      </section>

      {/* Quick Start Minimal */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="quick-start">
          Quick Start — Minimal Stack
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Run Neo4j + Next.js UI with synthetic data. No JAD services needed.
        </p>
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              1. Start Neo4j &amp; load schema
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`docker compose up -d

# Initialize schema (idempotent — safe to re-run)
cat neo4j/init-schema.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace

# Load synthetic data (127 patients, 5300+ nodes)
cat neo4j/insert-synthetic-schema-data.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              2. Start the UI
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`cd ui
npm install
npm run dev          # → http://localhost:3000

npm test             # Run 1,613 unit tests
npm run lint         # ESLint (max 55 warnings)`}</pre>
          </div>
        </div>
      </section>

      {/* Quick Start JAD */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="jad-quick-start">
          Quick Start — Full JAD Stack
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The bootstrap script starts all 19 services with health checks,
          initializes Vault secrets, imports the Keycloak realm, and runs the
          7-phase seed pipeline.
        </p>
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              1. Bootstrap everything
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`# Full stack — takes ~3-5 min on first run
./scripts/bootstrap-jad.sh

# Check status & endpoints
./scripts/bootstrap-jad.sh --status`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              2. Seed the dataspace
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`# Run all 7 seed phases (sequential, strict order)
./jad/seed-all.sh

# Resume from a specific phase
./jad/seed-all.sh --from 3

# Run only one phase
./jad/seed-all.sh --only 5`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-[var(--success-text)]">
              3. Access the platform
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`# Live UI (production build)
open http://localhost:3003

# Keycloak Admin Console
open http://keycloak.localhost  # admin / admin

# Neo4j Browser
open http://localhost:7474      # neo4j / healthdataspace

# Traefik Dashboard
open http://traefik.localhost`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
              Common operations
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`./scripts/bootstrap-jad.sh --ui-only   # Rebuild UI only (fast)
./scripts/bootstrap-jad.sh --seed      # Re-run seed pipeline
./scripts/bootstrap-jad.sh --pull      # Pull latest images
./scripts/bootstrap-jad.sh --down      # Stop all services
./scripts/bootstrap-jad.sh --reset     # Stop + remove volumes`}</pre>
          </div>
        </div>
      </section>

      {/* Seeding Pipeline */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="seeding">
          Data Seeding Pipeline
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The 7-phase seed pipeline populates the dataspace with tenants,
          credentials, policies, assets, and contracts. Phases must run in
          strict order — each depends on the previous.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Phase
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Script
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Target Service
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  What It Does
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {[
                [
                  "1",
                  "seed-health-tenants.sh",
                  "Tenant Manager",
                  "Create 5 participant tenants via CFM",
                ],
                [
                  "2",
                  "seed-ehds-credentials.sh",
                  "Issuer Service",
                  "Register EHDS credential types",
                ],
                [
                  "3",
                  "seed-ehds-policies.sh",
                  "Control Plane",
                  "Create ODRL policies for all participants",
                ],
                [
                  "4",
                  "seed-data-assets.sh",
                  "Control Plane",
                  "Register data assets + contracts",
                ],
                [
                  "5",
                  "seed-contract-negotiation.sh",
                  "Control Plane",
                  "PharmaCo ↔ AlphaKlinik negotiations + data planes",
                ],
                [
                  "6",
                  "seed-federated-catalog.sh",
                  "Control Plane",
                  "MedReg ↔ LMC federated catalog negotiation",
                ],
                [
                  "7",
                  "seed-data-transfer.sh",
                  "Data Plane",
                  "Verify EDR tokens and data plane transfers",
                ],
              ].map(([phase, script, target, desc]) => (
                <tr key={phase} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-mono font-bold text-[var(--text-primary)]">
                    {phase}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{script}</td>
                  <td className="px-3 py-1.5">{target}</td>
                  <td className="px-3 py-1.5">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 border border-amber-500/20 bg-amber-500/5 rounded-lg p-3">
          <p className="text-[var(--text-secondary)] text-xs">
            <strong className="text-amber-700 dark:text-amber-400">
              Important:
            </strong>{" "}
            Vault secrets are lost on Docker restart (in-memory dev mode).
            Re-run{" "}
            <code className="text-xs">./scripts/bootstrap-jad.sh --seed</code>{" "}
            after any <code className="text-xs">docker compose down</code>.
          </p>
        </div>
      </section>

      {/* Project Structure */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="project-structure">
          Project Structure
        </h2>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <pre className="text-xs text-[var(--text-primary)] overflow-x-auto whitespace-pre">{`├── .github/workflows/         # CI/CD (test.yml, pages.yml, compliance.yml)
├── connector/                 # EDC-V connector (Gradle multi-module)
│   ├── controlplane/          # DSP + Management API
│   ├── dataplane/             # FHIR + OMOP data planes
│   └── identityhub/           # DCP Identity Hub
├── docs/                      # Architecture docs, journeys, ADRs, reports
├── jad/                       # JAD infrastructure configs
│   ├── keycloak-realm.json    # Keycloak realm (edcv, 7 users, 6 roles)
│   ├── edcv-assets/           # Contract definitions & ODRL policies
│   ├── seed-*.sh              # 7-phase seed scripts
│   └── openapi/               # OpenAPI specifications
├── k8s/                       # Kubernetes / OrbStack manifests
├── neo4j/                     # Cypher scripts & data
│   ├── init-schema.cypher     # Constraints, indexes, vector indexes
│   ├── insert-synthetic-schema-data.cypher
│   └── fhir-to-omop-transform.cypher
├── scripts/                   # Automation (bootstrap, synthea, compliance)
├── services/neo4j-proxy/      # Express bridge (Neo4j ↔ UI)
├── ui/                        # Next.js 14 application
│   ├── src/app/               # 16 pages, 36 API routes
│   ├── src/components/        # Shared React components
│   ├── src/lib/               # auth.ts, api.ts, graph-constants.ts
│   ├── __tests__/unit/        # Vitest unit tests
│   ├── __tests__/e2e/         # Playwright specs (journeys/)
│   └── public/mock/           # 38 JSON fixtures for static export
├── docker-compose.yml         # Minimal stack (Neo4j + UI)
└── docker-compose.jad.yml     # Full JAD stack (19 services)`}</pre>
        </div>
      </section>

      {/* Graph Schema */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="graph-schema">
          Neo4j Graph Schema
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The 5-layer knowledge graph spans 27 node labels with 70+ indexes and
          3 vector indexes for GraphRAG. Schema defined in{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            neo4j/init-schema.cypher
          </code>{" "}
          (idempotent — safe to re-run).
        </p>
        <MermaidDiagram
          chart={graphSchemaDiagram}
          caption="Core entity-relationship diagram (FHIR ↔ OMOP mapping)"
        />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">5 Semantic Layers</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1.5">
              <li>
                <span className="text-[#2471A3] font-medium">
                  L1 Marketplace:
                </span>{" "}
                Participant, DataProduct, Contract, HDABApproval, OdrlPolicy
              </li>
              <li>
                <span className="text-[#148F77] font-medium">
                  L2 HealthDCAT-AP:
                </span>{" "}
                Catalogue, HealthDataset, Distribution, DataService
              </li>
              <li>
                <span className="text-[#1E8449] font-medium">L3 FHIR R4:</span>{" "}
                Patient, Encounter, Condition, Observation, MedicationRequest
              </li>
              <li>
                <span className="text-[#CA6F1E] font-medium">L4 OMOP CDM:</span>{" "}
                OMOPPerson, ConditionOccurrence, DrugExposure, Measurement
              </li>
              <li>
                <span className="text-[#7D3C98] font-medium">L5 Ontology:</span>{" "}
                SnomedConcept, ICD10Code, RxNormConcept, LoincCode
              </li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Key Conventions</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>
                Labels:{" "}
                <code className="text-indigo-700 dark:text-indigo-400">
                  PascalCase
                </code>
              </li>
              <li>
                Relationships:{" "}
                <code className="text-indigo-700 dark:text-indigo-400">
                  UPPER_SNAKE_CASE
                </code>
              </li>
              <li>
                Properties:{" "}
                <code className="text-indigo-700 dark:text-indigo-400">
                  camelCase
                </code>
              </li>
              <li>
                Always <code>MERGE</code>, never <code>CREATE</code>
              </li>
              <li>
                Constraints use <code>IF NOT EXISTS</code>
              </li>
              <li>3 fulltext indexes (clinical, catalog, ontology search)</li>
              <li>3 vector indexes (384-dim, cosine — for GraphRAG)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* PostgreSQL Schema */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="postgres-schema">
          PostgreSQL Schema
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          PostgreSQL serves as the runtime store for all JAD services — EDC-V
          state machines, Keycloak identity, and CFM tenant metadata. Neo4j
          holds the health knowledge graph. This split follows{" "}
          <strong>ADR-1</strong>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Database
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Service
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Contents
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {[
                [
                  "controlplane",
                  "EDC-V Control Plane",
                  "Contract negotiations, transfer processes, asset definitions, policy store",
                ],
                [
                  "dataplane_fhir",
                  "DCore FHIR",
                  "FHIR data plane state, EDR tokens, transfer tracking",
                ],
                [
                  "dataplane_omop",
                  "DCore OMOP",
                  "OMOP data plane state, EDR tokens, transfer tracking",
                ],
                [
                  "identityhub",
                  "Identity Hub",
                  "DID documents, verifiable credential store, key pairs",
                ],
                [
                  "issuerservice",
                  "Issuer Service",
                  "Credential definitions, attestation records, issued VCs",
                ],
                [
                  "keycloak",
                  "Keycloak",
                  "Users, roles, realm config, sessions, client scopes",
                ],
                [
                  "cfm_tenant",
                  "Tenant Manager",
                  "Tenant records, VPA (Virtual Participant Agents)",
                ],
                [
                  "cfm_provision",
                  "Provision Manager",
                  "Provisioning tasks, resource allocation records",
                ],
              ].map(([db, service, contents]) => (
                <tr key={db} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-mono font-medium text-[var(--text-primary)]">
                    {db}
                  </td>
                  <td className="px-3 py-1.5">{service}</td>
                  <td className="px-3 py-1.5">{contents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            Neo4j vs PostgreSQL Split
          </h4>
          <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
            <li>
              <strong>Neo4j:</strong> Health knowledge graph (FHIR, OMOP,
              ontologies), graph traversal queries, semantic search, GraphRAG
              vectors
            </li>
            <li>
              <strong>PostgreSQL:</strong> EDC-V runtime state machines, OIDC
              sessions, tenant metadata, credential storage — transactional ACID
              workloads
            </li>
            <li>
              <strong>Rationale:</strong> Graph queries for clinical
              relationships are orders of magnitude faster in Neo4j; EDC-V
              requires PostgreSQL for its state machine persistence
            </li>
          </ul>
        </div>
      </section>

      {/* Integration Flows */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="integration-flows">
          Integration Flows
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Two canonical flows cover 90% of real-world EHDS integrations. Pick
          the one that matches your role, then use the{" "}
          <Link
            href="/docs/developer/reference"
            className="text-indigo-700 dark:text-indigo-300 underline"
          >
            Scalar API Reference
          </Link>{" "}
          to try each endpoint from the browser.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Data Consumer */}
          <div className="border border-[var(--border)] rounded-lg p-5 bg-[var(--surface-1)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="font-semibold text-base text-[var(--text-primary)]">
                Data Consumer flow
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Researcher / pharma / HTA body discovers and requests cross-border
              health data.
            </p>
            <ol className="text-xs text-[var(--text-secondary)] space-y-2 list-decimal ml-4">
              <li>
                <strong>Discover</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/catalog
                </code>{" "}
                returns HealthDCAT-AP datasets
              </li>
              <li>
                <strong>Inspect</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/assets
                </code>{" "}
                for access policies (ODRL)
              </li>
              <li>
                <strong>Negotiate</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  POST /api/negotiations
                </code>{" "}
                opens a DSP 2025-1 contract
              </li>
              <li>
                <strong>Attest</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  POST /api/credentials/present
                </code>{" "}
                proves role via DCP VC
              </li>
              <li>
                <strong>Transfer</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/transfers/:id
                </code>{" "}
                monitors the data plane
              </li>
              <li>
                <strong>Analyse</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/analytics
                </code>{" "}
                or{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  POST /api/nlq
                </code>
              </li>
            </ol>
            <div className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              Role:{" "}
              <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                DATA_USER
              </code>{" "}
              · Persona: Dr. Petra Lang (PharmaCo Research)
            </div>
          </div>

          {/* Data Provider */}
          <div className="border border-[var(--border)] rounded-lg p-5 bg-[var(--surface-1)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="font-semibold text-base text-[var(--text-primary)]">
                Data Provider flow
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Hospital / clinic / registry publishes datasets for secondary use.
            </p>
            <ol className="text-xs text-[var(--text-secondary)] space-y-2 list-decimal ml-4">
              <li>
                <strong>Register</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  POST /api/participants
                </code>{" "}
                creates a did:web identity
              </li>
              <li>
                <strong>Publish</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  POST /api/catalog
                </code>{" "}
                adds a HealthDCAT-AP dataset
              </li>
              <li>
                <strong>Policy</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  PUT /api/assets/:id
                </code>{" "}
                attaches an ODRL policy
              </li>
              <li>
                <strong>HDAB approval</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/compliance
                </code>{" "}
                tracks approval state
              </li>
              <li>
                <strong>Accept</strong> →{" "}
                <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  GET /api/negotiations
                </code>{" "}
                shows incoming contract offers
              </li>
              <li>
                <strong>Deliver</strong> → data plane pushes FHIR/OMOP bundles
                to the consumer
              </li>
            </ol>
            <div className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              Role:{" "}
              <code className="bg-[var(--surface-2)] px-1 py-0.5 rounded">
                DATA_HOLDER
              </code>{" "}
              · Persona: Dr. Klaus Weber (AlphaKlinik Berlin)
            </div>
          </div>
        </div>
      </section>

      {/* API Reference */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="api-reference">
          API Reference
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          38 Next.js API routes proxy to Neo4j and EDC-V services. Routes are
          disabled in static export — mock data served from{" "}
          <code className="text-xs bg-[var(--surface-2)] px-1 py-0.5 rounded">
            ui/public/mock/*.json
          </code>
          .
        </p>
        <div className="flex flex-wrap gap-3 mb-4 text-sm">
          <Link
            href="/docs/developer/reference"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-indigo-500 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-medium"
          >
            Scalar API Reference →
          </Link>
          <Link
            href="/docs/developer/api"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-[var(--text-primary)]"
          >
            Swagger UI →
          </Link>
          <a
            href="/openapi.yaml"
            download="ehds-integration-hub-openapi.yaml"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-[var(--text-primary)]"
          >
            Download openapi.yaml
          </a>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/bruno/MVHDv2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-[var(--text-primary)]"
          >
            Bruno collection ↗
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Route
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Methods
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {[
                ["/api/graph", "GET", "Knowledge graph nodes & relationships"],
                [
                  "/api/graph/node, /expand, /validate",
                  "GET/POST",
                  "Node details, expansion, schema validation",
                ],
                [
                  "/api/catalog",
                  "GET/POST/DELETE",
                  "HealthDCAT-AP dataset catalog",
                ],
                ["/api/analytics", "GET", "OMOP cohort analytics aggregates"],
                [
                  "/api/patient/*",
                  "GET",
                  "Patient profile, insights, research programmes",
                ],
                ["/api/eehrxf", "GET", "EEHRxF profile alignment data"],
                [
                  "/api/compliance, /tck",
                  "GET",
                  "EHDS compliance status, DSP TCK results",
                ],
                [
                  "/api/credentials/*",
                  "GET/POST",
                  "Verifiable credential management",
                ],
                [
                  "/api/negotiations/*",
                  "GET/POST",
                  "DSP contract negotiation lifecycle",
                ],
                [
                  "/api/participants/*",
                  "GET",
                  "Participant registry and profiles",
                ],
                ["/api/transfers/*", "GET", "Data transfer history and status"],
                ["/api/assets", "GET", "EDC-V asset registry"],
                ["/api/tasks", "GET", "Transfer task queue"],
                ["/api/nlq", "POST", "Natural language query (via proxy)"],
                ["/api/federated", "POST", "Federated cross-participant query"],
                ["/api/trust-center", "GET", "Trust center configuration"],
                ["/api/health", "GET", "Health check endpoint (public)"],
              ].map(([route, methods, desc]) => (
                <tr key={route} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                    {route}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{methods}</td>
                  <td className="px-3 py-1.5">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Testing */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="testing">
          Testing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Unit Tests (Vitest)</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1">
              <li>
                <strong>1,613 tests</strong> across 80+ files
              </li>
              <li>
                <strong>93.8% statement</strong> / <strong>94.7% line</strong>{" "}
                coverage
              </li>
              <li>MSW for API mocking, Testing Library for components</li>
              <li>
                <a
                  href={`https://ma3u.github.io${PAGES_BASE}/test-reports/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                >
                  View Test Report <ExternalLink size={10} />
                </a>
              </li>
            </ul>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`npm test               # Run once
npm run test:watch     # Watch mode
npm run test:coverage  # With v8 coverage`}</pre>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              E2E Tests (Playwright)
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1">
              <li>
                <strong>19 spec files</strong> (J001–J260 journeys)
              </li>
              <li>
                WCAG 2.2 AA accessibility audit (
                <code>27-wcag-accessibility</code>)
              </li>
              <li>
                OWASP/BSI security &amp; pentest (
                <code>28-security-pentest</code>)
              </li>
              <li>
                <a
                  href={`${basePath}/e2e-report/`}
                  className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                >
                  Playwright Report <ExternalLink size={10} />
                </a>
              </li>
            </ul>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`npm run test:e2e       # Headless (chromium)
npm run test:e2e:ui    # Interactive UI

# Against JAD stack
PLAYWRIGHT_BASE_URL=http://localhost:3003 \\
  npm run test:e2e`}</pre>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">DSP 2025-1 TCK</h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Validates EDC connector implements Dataspace Protocol correctly —
              catalog queries, contract negotiations, transfer processes.
            </p>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`./scripts/run-dsp-tck.sh`}</pre>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">DCP v1.0</h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Verifies Decentralized Claims Protocol — DID resolution,
              credential presentation, trust framework.
            </p>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`./scripts/run-dcp-tests.sh`}</pre>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">EHDS Domain</h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Health domain compliance — FHIR R4 bundles, OMOP transformation,
              HDAB approval chains, patient rights.
            </p>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`./scripts/run-ehds-tests.sh`}</pre>
          </div>
        </div>

        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2" id="user-journey">
            EHDS User Journey
          </h4>
          <p className="text-[var(--text-secondary)] text-xs mb-2">
            The full 8-step EHDS secondary-use journey with sequence diagrams,
            persona mappings, and E2E test coverage:
          </p>
          <a
            href={`${GITHUB_REPO}/blob/main/docs/FULL_USER_JOURNEY.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 text-xs underline inline-flex items-center gap-1"
          >
            View Full User Journey <ExternalLink size={10} />
          </a>
        </div>
      </section>

      {/* Quality Gates */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="quality-gates">
          Quality Gates
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          Four-stage quality pipeline aligned with BSI C5, OWASP Top 10, EHDS
          regulation, and WCAG 2.2 AA.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ["15", "Pre-commit hooks"],
            ["2", "Pre-push gates"],
            ["13", "CI jobs"],
            ["3", "Compliance suites"],
          ].map(([count, label]) => (
            <div
              key={label}
              className="border border-[var(--border)] rounded-lg p-3 text-center"
            >
              <div className="text-xl font-bold text-[var(--text-primary)]">
                {count}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                {label}
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/docs/developer/quality-gates"
          className="inline-flex items-center gap-1 text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
        >
          View full Quality Gates documentation &rarr;
        </Link>
      </section>

      {/* CI/CD */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="cicd">
          CI/CD Pipeline
        </h2>
        <MermaidDiagram
          chart={cicdDiagram}
          caption="CI/CD workflow — test.yml (8 jobs), compliance.yml (3 suites), pages.yml (deploy)"
        />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              test.yml — Every Push
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
              <li>UI Tests (Vitest) + coverage upload</li>
              <li>Neo4j Proxy Tests (Vitest)</li>
              <li>ESLint lint check</li>
              <li>Secret scan (gitleaks v8.27.2, SHA-256 verified)</li>
              <li>Dependency audit (npm audit --audit-level=high)</li>
              <li>Trivy security scan (v0.69.3, CVE-2026-33634 safe)</li>
              <li>Kubescape K8s posture (NSA + CIS frameworks)</li>
              <li>E2E + WCAG 2.2 AA + Security pentest (main only)</li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              pages.yml — Deploy to GitHub Pages
            </h4>
            <ol className="text-[var(--text-secondary)] text-xs space-y-1 list-decimal ml-4">
              <li>Run full Vitest suite with coverage</li>
              <li>Build Next.js for E2E, run Playwright</li>
              <li>Run WCAG 2.2 AA accessibility audit</li>
              <li>Run OWASP/BSI security tests</li>
              <li>
                Disable API routes (
                <code>mv src/app/api /tmp/api_disabled</code>)
              </li>
              <li>
                Build static export (<code>NEXT_PUBLIC_STATIC_EXPORT=true</code>
                )
              </li>
              <li>Copy test reports to output</li>
              <li>Deploy to GitHub Pages</li>
            </ol>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              compliance.yml — Weekly + Push to Main
            </h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Runs 3 protocol compliance suites against the full JAD stack: DSP
              2025-1 TCK, DCP v1.0, and EHDS domain tests. Scheduled: Monday
              06:00 UTC.
            </p>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              deploy-azure.yml — Azure Deployment
            </h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Deploys 13 Container Apps + 3 jobs to Azure via OIDC federation.
              Includes E2E smoke tests against the live Azure environment.
            </p>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              reset-demo.yml — Nightly Reset
            </h4>
            <p className="text-[var(--text-secondary)] text-xs">
              Scheduled at 02:00 UTC daily. Restarts stateful services,
              re-bootstraps Vault/Keycloak, reseeds data, and runs smoke tests.
              Ensures GDPR data minimisation.
            </p>
          </div>
        </div>
      </section>

      {/* Latest Reports */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="reports">
          Latest Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: "Test Coverage Report",
              href: `https://ma3u.github.io${PAGES_BASE}/test-reports/`,
              desc: "Vitest coverage report with per-file breakdown",
              external: true,
            },
            {
              title: "Playwright E2E Report",
              href: `${basePath}/e2e-report/`,
              desc: "E2E test results with screenshots and traces",
              external: false,
            },
            {
              title: "CI Workflow Runs",
              href: `${GITHUB_REPO}/actions/workflows/test.yml`,
              desc: "GitHub Actions test suite history",
              external: true,
            },
            {
              title: "Compliance Runs",
              href: `${GITHUB_REPO}/actions/workflows/compliance.yml`,
              desc: "DSP TCK, DCP, EHDS compliance results",
              external: true,
            },
            {
              title: "Security Advisories",
              href: `${GITHUB_REPO}/security`,
              desc: "Trivy SARIF findings and dependency alerts",
              external: true,
            },
            {
              title: "GitHub Pages Deploy",
              href: `${GITHUB_REPO}/actions/workflows/pages.yml`,
              desc: "Static export build and deployment history",
              external: true,
            },
          ].map((r) => (
            <a
              key={r.title}
              href={r.href}
              target={r.external ? "_blank" : undefined}
              rel={r.external ? "noopener noreferrer" : undefined}
              className="border border-[var(--border)] rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
            >
              <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                {r.title}
                {r.external && <ExternalLink size={12} />}
              </h4>
              <p className="text-[var(--text-secondary)] text-xs">{r.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Data Flow */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="data-flow">
          Data Flow
        </h2>
        <MermaidDiagram
          chart={dataFlowDiagram}
          caption="Data pipeline: Synthea → Neo4j → Proxy → UI"
        />
      </section>

      {/* Release Notes */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="releases">
          Release Notes
        </h2>
        <div className="space-y-3">
          {[
            {
              version: "v1.2.0",
              date: "2026-04-12",
              highlights:
                "Azure Container Apps deployment, SIMPL-Open gap analysis, nightly demo reset, 14 ADRs, quality gates documentation",
            },
            {
              version: "v1.1.0",
              date: "2026-04-10",
              highlights:
                "WCAG 2.2 AA zero violations, ODRL policy enforcement, OWASP/BSI security pentest, 778 Playwright assertions",
            },
            {
              version: "v1.0.0",
              date: "2026-04-08",
              highlights:
                "Initial release: 5-layer Neo4j knowledge graph, 127 synthetic patients, DSP 2025-1 + DCP v1.0, 7 personas, GitHub Pages demo",
            },
          ].map((r) => (
            <a
              key={r.version}
              href={`${GITHUB_REPO}/releases/tag/${r.version}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[var(--border)] rounded-lg px-4 py-3 flex items-start gap-3 hover:border-indigo-500/50 transition-colors block"
            >
              <span className="text-xs font-mono text-[var(--success-text)] bg-[var(--success-text)]/10 px-2 py-0.5 rounded shrink-0">
                {r.version}
              </span>
              <div>
                <span className="text-[var(--text-secondary)] text-xs">
                  {r.date}
                </span>
                <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                  {r.highlights}
                </p>
              </div>
            </a>
          ))}
        </div>
        <a
          href={`${GITHUB_REPO}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
        >
          All releases <ExternalLink size={12} />
        </a>
      </section>

      {/* Planning & Issues */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="project-links">
          Planning & Issues
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: "Planning Document",
              href: `${GITHUB_REPO}/blob/main/docs/planning-health-dataspace-v2.md`,
              desc: "Project roadmap, phase tracking, cross-cutting concerns, and ADR index",
            },
            {
              title: "GitHub Issues",
              href: `${GITHUB_REPO}/issues`,
              desc: "Feature requests, bug reports, and task tracking",
            },
            {
              title: "CI/CD Workflows",
              href: `${GITHUB_REPO}/actions`,
              desc: "test.yml, pages.yml, compliance.yml, deploy-azure.yml, reset-demo.yml",
            },
            {
              title: "SIMPL-Open Gap Analysis",
              href: `${GITHUB_REPO}/blob/main/docs/simpl-ehds-gap-analysis.md`,
              desc: "Comprehensive SIMPL vs EHDS gap analysis — DID/SSI rationale, supply chain transparency",
            },
            {
              title: "Onboarding Guide",
              href: `${GITHUB_REPO}/blob/main/docs/onboarding-guide.md`,
              desc: "New developer onboarding — first day checklist, key concepts, common tasks",
            },
          ].map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[var(--border)] rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
            >
              <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                {link.title}
                <ExternalLink size={12} />
              </h4>
              <p className="text-[var(--text-secondary)] text-xs">
                {link.desc}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* Conventions */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="conventions">
          Conventions
        </h2>
        <div className="border border-[var(--border)] rounded-lg p-4">
          <ul className="text-[var(--text-secondary)] text-sm space-y-2">
            <li>
              <strong>Commit messages:</strong> Conventional Commits format
              (feat:, fix:, docs:, chore:)
            </li>
            <li>
              <strong>Branch strategy:</strong> Feature branches → PR to main
            </li>
            <li>
              <strong>Pre-commit:</strong> 15 hooks — Prettier, ESLint,
              TypeScript, gitleaks, broken links, screenshot guard
            </li>
            <li>
              <strong>Pre-push:</strong> Full Vitest suite (--bail), npm audit
              (HIGH+)
            </li>
            <li>
              <strong>Cypher:</strong> UPPER_SNAKE_CASE relationships,
              PascalCase labels, camelCase properties, always MERGE
            </li>
            <li>
              <strong>TypeScript:</strong> Strict mode, no any, @/* path alias →
              ui/src/*
            </li>
            <li>
              <strong>Fictional orgs only:</strong> AlphaKlinik Berlin, PharmaCo
              Research AG, MedReg DE, Limburg Medical Centre, Institut de
              Recherche Santé
            </li>
          </ul>
        </div>
      </section>

      {/* Related */}
      <section className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-6">
        <h2 className="font-semibold mb-2">Related Documentation</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/user-guide"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            User Guide
          </Link>
          <Link
            href="/docs/architecture"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
          >
            Architecture Diagrams
          </Link>
          <a
            href={`${GITHUB_REPO}/blob/main/docs/FULL_USER_JOURNEY.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
          >
            EHDS User Journey <ExternalLink size={12} />
          </a>
          <a
            href={`${GITHUB_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
          >
            Releases <ExternalLink size={12} />
          </a>
          <a
            href="https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
          >
            Azure EHDS Portal <ExternalLink size={12} />
          </a>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
          >
            GitHub Repository <ExternalLink size={12} />
          </a>
        </div>
      </section>
    </div>
  );
}
