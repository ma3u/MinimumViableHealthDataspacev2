"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";

const PAGES_BASE = "/MinimumViableHealthDataspacev2";
const basePath =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? PAGES_BASE : "";

const techStackDiagram = `graph TB
  subgraph "Frontend"
    NEXT["Next.js 14<br/>React 18"]
    TW["Tailwind CSS"]
    D3["react-force-graph-2d"]
    MERM["Mermaid.js<br/>Diagrams"]
  end

  subgraph "Backend"
    PROXY["Neo4j Proxy<br/>Node.js :3001"]
    NEO["Neo4j 5<br/>APOC + n10s"]
    AUTH["NextAuth.js<br/>Keycloak OIDC"]
  end

  subgraph "Dataspace"
    EDC["EDC-V<br/>Control Plane"]
    DCORE["DCore<br/>Data Plane"]
    CFM["CFM<br/>Credential Framework"]
    IH["Identity Hub<br/>DCP"]
  end

  subgraph "Testing"
    VIT["Vitest<br/>Unit Tests"]
    PW["Playwright<br/>E2E Tests"]
    MSW["MSW<br/>API Mocks"]
  end

  NEXT --> TW & D3 & MERM
  NEXT --> PROXY --> NEO
  NEXT --> AUTH
  NEXT --> EDC
  EDC --> DCORE
  EDC --> CFM
  CFM --> IH`;

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
    TEST[Vitest<br/>1490 tests]
    LINT[ESLint<br/>Pre-commit]
  end

  subgraph "CI Pipeline"
    PR[Push to main]
    CI_BUILD[npm ci + build]
    CI_TEST[Run tests]
    CI_LINT[Lint check]
  end

  subgraph "Deployment"
    PAGES[GitHub Pages<br/>Static Export]
    DOCKER[Docker Compose<br/>Full Stack]
  end

  DEV --> TEST --> LINT --> PR
  PR --> CI_BUILD --> CI_TEST --> CI_LINT
  CI_LINT --> PAGES
  DEV --> DOCKER`;

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
      <p className="text-[var(--text-secondary)] mb-8">
        Technical documentation for developers building and extending the Health
        Dataspace v2 platform.
      </p>

      {/* TOC */}
      <nav className="border border-[var(--border)] rounded-xl p-5 mb-10">
        <h2 className="font-semibold mb-3">Contents</h2>
        <ul className="text-sm space-y-1.5 text-indigo-400">
          <li>
            <a href="#tech-stack" className="hover:text-indigo-300">
              Technology Stack
            </a>
          </li>
          <li>
            <a href="#quick-start" className="hover:text-indigo-300">
              Quick Start
            </a>
          </li>
          <li>
            <a href="#project-structure" className="hover:text-indigo-300">
              Project Structure
            </a>
          </li>
          <li>
            <a href="#graph-schema" className="hover:text-indigo-300">
              Neo4j Graph Schema
            </a>
          </li>
          <li>
            <a href="#api-reference" className="hover:text-indigo-300">
              API Reference
            </a>
          </li>
          <li>
            <a href="#testing" className="hover:text-indigo-300">
              Testing
            </a>
          </li>
          <li>
            <a href="#user-journey" className="hover:text-indigo-300">
              EHDS User Journey
            </a>
          </li>
          <li>
            <a href="#cicd" className="hover:text-indigo-300">
              CI/CD Pipeline
            </a>
          </li>
          <li>
            <a href="#adrs" className="hover:text-indigo-300">
              Architecture Decision Records
            </a>
          </li>
          <li>
            <a href="#conventions" className="hover:text-indigo-300">
              Conventions
            </a>
          </li>
        </ul>
      </nav>

      {/* Tech Stack */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="tech-stack">
          Technology Stack
        </h2>
        <MermaidDiagram
          chart={techStackDiagram}
          caption="Technology stack overview"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Frontend</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1">
              <li>
                <strong>Next.js 14</strong> — App Router, React Server
                Components
              </li>
              <li>
                <strong>Tailwind CSS</strong> — Utility-first styling with
                custom layer colours
              </li>
              <li>
                <strong>react-force-graph-2d</strong> — Force-directed graph
                visualisation
              </li>
              <li>
                <strong>Mermaid.js</strong> — Architecture diagrams
              </li>
              <li>
                <strong>Lucide React</strong> — Icon library
              </li>
            </ul>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Backend</h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1">
              <li>
                <strong>Neo4j 5</strong> — Graph database with APOC + n10s
                plugins
              </li>
              <li>
                <strong>Neo4j Proxy</strong> — Node.js proxy service (:3001)
              </li>
              <li>
                <strong>NextAuth.js</strong> — Authentication with Keycloak OIDC
              </li>
              <li>
                <strong>EDC-V</strong> — Eclipse Dataspace Connector (Control +
                Data Plane)
              </li>
              <li>
                <strong>DCore / CFM</strong> — Data plane and credential
                framework
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="quick-start">
          Quick Start
        </h2>
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-green-400">
              1. Prerequisites
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`# Required
Node.js 20+, Docker & Docker Compose, Git

# Optional
Java 17+ (for EDC-V connector build)
Python 3.11+ (for Synthea data loading)`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-green-400">
              2. Start Neo4j
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`docker compose up -d

# Initialize schema
cat neo4j/init-schema.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-green-400">
              3. Load Synthetic Data
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`# Insert synthetic FHIR + OMOP data
cat neo4j/insert-synthetic-schema-data.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace

# Or load Synthea FHIR bundles (127 patients)
pip install -r scripts/requirements.txt
python scripts/load_fhir_neo4j.py`}</pre>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-green-400">
              4. Start the UI
            </h4>
            <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">{`cd ui
npm install
npm run dev        # → http://localhost:3000

npm run test       # Run 1490 unit tests
npm run lint       # ESLint checks`}</pre>
          </div>
        </div>
      </section>

      {/* Project Structure */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="project-structure">
          Project Structure
        </h2>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <pre className="text-xs text-[var(--text-primary)] overflow-x-auto whitespace-pre">{`├── .github/workflows/     # CI/CD (pages.yml for GitHub Pages)
├── connector/             # EDC-V connector (Gradle multi-module)
│   ├── controlplane/      # DSP + Management API
│   ├── dataplane/         # FHIR + OMOP data planes
│   └── identityhub/       # DCP Identity Hub
├── docs/                  # Documentation & ADRs
│   ├── planning-health-dataspace-v2.md
│   └── health-dataspace-graph-schema.md
├── jad/                   # JAD infrastructure configs
│   ├── edcv-assets/       # Contract definitions & policies
│   └── openapi/           # OpenAPI specifications
├── neo4j/                 # Cypher scripts & data
│   ├── init-schema.cypher # Constraints & indexes
│   ├── insert-synthetic-schema-data.cypher
│   ├── fhir-to-omop-transform.cypher
│   └── import/fhir/       # FHIR bundle imports
├── scripts/               # Automation scripts
├── services/neo4j-proxy/  # Node.js Neo4j proxy
├── ui/                    # Next.js 14 application
│   ├── src/app/           # App Router pages
│   ├── src/components/    # Shared components
│   ├── src/lib/           # Utilities & API client
│   └── src/__tests__/     # Vitest unit tests
└── docker-compose.yml     # Local dev stack`}</pre>
        </div>
      </section>

      {/* Graph Schema */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="graph-schema">
          Neo4j Graph Schema
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The 5-layer knowledge graph uses these core node labels and
          relationships:
        </p>
        <MermaidDiagram
          chart={graphSchemaDiagram}
          caption="Core entity-relationship diagram (FHIR ↔ OMOP mapping)"
        />
        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Key Conventions</h4>
          <ul className="text-[var(--text-secondary)] text-xs space-y-1 list-disc ml-4">
            <li>
              Node labels: <code className="text-indigo-400">PascalCase</code>{" "}
              (Patient, ConditionOccurrence)
            </li>
            <li>
              Relationship types:{" "}
              <code className="text-indigo-400">UPPER_SNAKE_CASE</code>{" "}
              (HAS_ENCOUNTER, MAPS_TO)
            </li>
            <li>
              Properties: <code className="text-indigo-400">camelCase</code>{" "}
              (birthDate, conceptId)
            </li>
            <li>
              Schema defined in{" "}
              <code className="text-[var(--text-primary)]">
                neo4j/init-schema.cypher
              </code>
            </li>
            <li>
              Transformations in{" "}
              <code className="text-[var(--text-primary)]">
                neo4j/fhir-to-omop-transform.cypher
              </code>
            </li>
          </ul>
        </div>
      </section>

      {/* API Reference */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="api-reference">
          API Reference
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-4">
          The Next.js API routes (disabled in static export) proxy to Neo4j and
          EDC-V services:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-4 py-2 text-left text-[var(--text-primary)]">
                  Route
                </th>
                <th className="px-4 py-2 text-left text-[var(--text-primary)]">
                  Method
                </th>
                <th className="px-4 py-2 text-left text-[var(--text-primary)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/graph</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">
                  Fetch graph nodes & relationships for visualisation
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/catalog</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">
                  HealthDCAT-AP dataset catalog search
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/patients</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">
                  Patient list with FHIR demographics
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">
                  /api/patients/[id]
                </td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">
                  Patient journey timeline (FHIR + OMOP)
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/analytics</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">OMOP cohort analytics aggregates</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/compliance</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">EHDS compliance chain status</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/eehrxf</td>
                <td className="px-4 py-2">GET</td>
                <td className="px-4 py-2">EEHRxF profile alignment data</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/negotiate</td>
                <td className="px-4 py-2">POST</td>
                <td className="px-4 py-2">Initiate DSP contract negotiation</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-xs">/api/query</td>
                <td className="px-4 py-2">POST</td>
                <td className="px-4 py-2">
                  Natural language / Cypher query execution
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[var(--text-secondary)] text-xs mt-2">
          Note: API routes are only available when running locally (npm run
          dev). The GitHub Pages static export uses mock data from{" "}
          <code>ui/public/mock/</code>.
        </p>
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
                <strong>1,490 tests</strong> across 78 files
              </li>
              <li>
                <strong>94% statement coverage</strong> / 95% lines
              </li>
              <li>MSW for API mocking</li>
              <li>Testing Library for component tests</li>
              <li>
                <a
                  href={`https://ma3u.github.io${PAGES_BASE}/test-reports/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  View Test Report →
                </a>
                <span className="text-gray-600 text-[10px] ml-1">
                  (CI only)
                </span>
              </li>
            </ul>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`npm run test           # Run once
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage`}</pre>
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              E2E Tests (Playwright)
            </h4>
            <ul className="text-[var(--text-secondary)] text-xs space-y-1">
              <li>
                <strong>166 tests</strong> across 18 spec files
              </li>
              <li>Screenshots captured for every test</li>
              <li>Traces &amp; video on retries</li>
              <li>
                <a
                  href={`${basePath}/e2e-report/`}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  Playwright Report →
                </a>
              </li>
              <li>
                <a
                  href={`${basePath}/e2e-report/ehds-journey.html`}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  EHDS Journey Report →
                </a>
              </li>
            </ul>
            <pre className="text-xs text-[var(--text-secondary)] mt-2 bg-[var(--surface)] p-2 rounded">{`npm run test:e2e       # Headless
npm run test:e2e:ui    # Interactive UI`}</pre>
          </div>
        </div>
        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2" id="user-journey">
            EHDS User Journey
          </h4>
          <p className="text-[var(--text-secondary)] text-xs mb-2">
            The full 8-step EHDS secondary-use journey is documented with
            sequence diagrams, persona mappings, and E2E test coverage:
          </p>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/FULL_USER_JOURNEY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 text-xs underline"
          >
            View Full User Journey →
          </a>
        </div>
      </section>

      {/* CI/CD */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="cicd">
          CI/CD Pipeline
        </h2>
        <MermaidDiagram
          chart={cicdDiagram}
          caption="CI/CD workflow from local dev to deployment"
        />
        <div className="mt-4 border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            GitHub Pages Deployment
          </h4>
          <p className="text-[var(--text-secondary)] text-xs mb-2">
            On push to main, the{" "}
            <code className="text-indigo-400">.github/workflows/pages.yml</code>{" "}
            workflow:
          </p>
          <ol className="text-[var(--text-secondary)] text-xs space-y-1 list-decimal ml-4">
            <li>Checks out code and sets up Node 20</li>
            <li>
              Disables API routes (<code>mv src/app/api src/api_disabled</code>)
            </li>
            <li>
              Builds with <code>NEXT_PUBLIC_STATIC_EXPORT=true</code> and{" "}
              <code>output: &quot;export&quot;</code>
            </li>
            <li>
              Uploads <code>./ui/out</code> as Pages artifact
            </li>
            <li>
              Deploys to GitHub Pages at{" "}
              <code>/MinimumViableHealthDataspacev2</code>
            </li>
          </ol>
        </div>
      </section>

      {/* ADRs */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-3" id="adrs">
          Architecture Decision Records
        </h2>
        <div className="space-y-3">
          {[
            {
              id: "ADR-1",
              title: "PostgreSQL vs Neo4j Split",
              desc: "EDC runtime metadata in PostgreSQL, health data in Neo4j knowledge graph.",
            },
            {
              id: "ADR-2",
              title: "Dual EDC Data Planes",
              desc: "Separate FHIR R4 and OMOP CDM data planes for type-safe access.",
            },
            {
              id: "ADR-3",
              title: "HealthDCAT-AP Alignment",
              desc: "Graph nodes aligned with HealthDCAT-AP 3.0 profile for catalog interoperability.",
            },
            {
              id: "ADR-4",
              title: "Next.js App Router",
              desc: "Client-side SPA with API routes proxying to Neo4j and EDC-V backends.",
            },
            {
              id: "ADR-5",
              title: "Vitest + MSW Testing",
              desc: "Unit tests with Vitest, API mocking with MSW, coverage tracking.",
            },
            {
              id: "ADR-6",
              title: "Tailwind + Lucide Icons",
              desc: "Utility-first CSS with custom layer colour palette and Lucide icons.",
            },
            {
              id: "ADR-7",
              title: "GitHub Pages Static Export",
              desc: "Conditional next export with mock data for demo deployment.",
            },
          ].map((adr) => (
            <div
              key={adr.id}
              className="border border-[var(--border)] rounded-lg px-4 py-3 flex items-start gap-3"
            >
              <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded">
                {adr.id}
              </span>
              <div>
                <span className="font-semibold text-sm">{adr.title}</span>
                <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                  {adr.desc}
                </p>
              </div>
            </div>
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
              <strong>Branch strategy:</strong> Direct push to main (demo
              project)
            </li>
            <li>
              <strong>Pre-commit hooks:</strong> Prettier (md, yaml, json),
              ESLint, type-check
            </li>
            <li>
              <strong>Cypher:</strong> UPPER_SNAKE_CASE relationships,
              PascalCase labels, camelCase properties
            </li>
            <li>
              <strong>TypeScript:</strong> Strict mode, no any (where possible),
              interfaces over types
            </li>
            <li>
              <strong>Markdown:</strong> ~80 char line wrap, fenced code blocks,
              clean tables
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
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            User Guide
          </Link>
          <Link
            href="/docs/architecture"
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            Architecture Diagrams
          </Link>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/FULL_USER_JOURNEY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            EHDS User Journey
          </a>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            GitHub Repository
          </a>
        </div>
      </section>
    </div>
  );
}
