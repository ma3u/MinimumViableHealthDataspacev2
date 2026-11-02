"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocFigure } from "@/components/docs/DocFigure";
import { DocFigureViewer } from "@/components/docs/DocFigureViewer";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import {
  API_GROUP_DESCRIPTIONS,
  groupApiRoutes,
} from "@/components/docs/api-groups";
import facts from "@/app/docs/docs-facts.json";
import { INSURER_REPORT_PAGE, securityDocs } from "@/lib/docs/security-docs";
import { translationOf } from "@/lib/docs/published-docs-i18n";
import { T, useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";

const implementedOperations = facts.apiRoutes.reduce(
  (n, r) => n + r.methods.length,
  0,
);
const COMPOSE_SERVICES = Object.values(facts.composeServices).flat().length;
const PRE_COMMIT_HOOKS = facts.preCommitHooks.length;

const PAGES_BASE = "/MinimumViableHealthDataspacev2";
// A placeholder in the text, so no dictionary holds the host name (FR and
// ES write EEDS for the Regulation, and the host is not the Regulation).
const LIVE_HOST = "ehds.mabu.red";
const GITHUB_REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const basePath =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? PAGES_BASE : "";

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
  const t = useT("docsDeveloper");
  const lang = useLanguage();
  // Markup the translated texts wrap their marked parts in (<T tags>).
  const b = <strong />;
  const c = <code />;
  const chip = (
    <code className="text-xs bg-(--surface-2) px-1 py-0.5 rounded-sm" />
  );
  const flowCode = <code className="bg-(--surface-2) px-1 py-0.5 rounded-sm" />;
  const accent = <code className="text-indigo-700 dark:text-indigo-400" />;
  const small = <code className="text-xs" />;
  const offHoursLink = <a href="#off-hours" className="underline" />;
  const runbookLink = (
    <a
      href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/knowledge/runbooks/live-demo-off-hours.md"
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-700 dark:text-indigo-400 underline"
    />
  );
  const securityLink = <Link href="/docs/security" className="underline" />;
  const klarbefundLink = <Link href="/docs/klarbefund" className="underline" />;
  const qualityGatesLink = (
    <Link href="/docs/developer/quality-gates" className="underline" />
  );
  const referenceLink = (
    <Link
      href="/docs/developer/reference"
      className="text-indigo-700 dark:text-indigo-300 underline"
    />
  );
  const warn = <strong className="text-amber-700 dark:text-amber-400" />;
  return (
    <DocFigureViewer>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
        >
          <ArrowLeft size={14} /> {t("Back to Docs")}
        </Link>
        <h1 className="text-3xl font-bold mb-2">{t("Developer Guide")}</h1>
        <DocsLastUpdated page="/docs/developer" />
        <p className="text-(--text-secondary) mb-6">
          {t(
            "Technical documentation for developing, testing, and deploying the Health Dataspace v2 platform, an EHDS regulation reference implementation built on Eclipse Dataspace Components.",
          )}
        </p>

        {/* Resources */}
        <div className="flex flex-wrap gap-3 mb-8">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-sm text-(--text-primary)"
          >
            {t("GitHub Repository")} <ExternalLink size={12} />
          </a>
          <Link
            href="/docs/developer/api"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-sm text-(--text-primary)"
          >
            Swagger UI →
          </Link>
          <a
            href={`${GITHUB_REPO}/tree/main/bruno/MVHDv2`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-sm text-(--text-primary)"
          >
            {t("Bruno Collection")} <ExternalLink size={12} />
          </a>
        </div>

        {/* TOC */}
        <nav className="border border-(--border) rounded-xl p-5 mb-10">
          <h2 className="font-semibold mb-3">{t("Contents")}</h2>
          <ul className="text-sm space-y-1.5 text-indigo-700 dark:text-indigo-400 columns-1 md:columns-2">
            <TocLink href="#onboarding">{t("Onboarding")}</TocLink>
            <TocLink href="#jad-architecture">
              {t("JAD Stack Architecture")}
            </TocLink>
            <TocLink href="#prerequisites">{t("Prerequisites")}</TocLink>
            <TocLink href="#quick-start">{t("Quick Start (Minimal)")}</TocLink>
            <TocLink href="#jad-quick-start">
              {t("Quick Start (Full JAD)")}
            </TocLink>
            <TocLink href="#seeding">{t("Data Seeding Pipeline")}</TocLink>
            <TocLink href="#project-structure">
              {t("Project Structure")}
            </TocLink>
            <TocLink href="#graph-schema">{t("Neo4j Graph Schema")}</TocLink>
            <TocLink href="#postgres-schema">{t("PostgreSQL Schema")}</TocLink>
            <TocLink href="#integration-flows">
              {t("Integration Flows")}
            </TocLink>
            <TocLink href="#api-reference">{t("API Reference")}</TocLink>
            <TocLink href="#testing">{t("Testing")}</TocLink>
            <TocLink href="#quality-gates">{t("Quality Gates")}</TocLink>
            <TocLink href="#cicd">{t("CI/CD Pipeline")}</TocLink>
            <TocLink href="#off-hours">{t("Live Stack Off Hours")}</TocLink>
            <TocLink href="#reports">{t("Latest Reports")}</TocLink>
            <TocLink href="#security">
              {t("Security and Data Protection")}
            </TocLink>
            <TocLink href="#documentation">
              {t("Writing the Documentation")}
            </TocLink>
            <TocLink href="#releases">{t("Release Notes")}</TocLink>
            <TocLink href="#project-links">{t("Planning & Issues")}</TocLink>
            <TocLink href="#conventions">{t("Conventions")}</TocLink>
          </ul>
        </nav>

        {/* Onboarding */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="onboarding">
            {t("Onboarding")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "New to the project? Follow this quick-start path to get productive within your first day.",
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("1. Get Running")}
              </h4>
              <ol className="text-(--text-secondary) text-xs space-y-1 list-decimal ml-4">
                <li>{t("Clone the repository")}</li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {"<c>docker compose up -d</c> (Neo4j)"}
                  </T>
                </li>
                <li>{t("Seed schema & data (cypher-shell)")}</li>
                <li>
                  <code>
                    cd ui &amp;&amp; npm install &amp;&amp; npm run dev
                  </code>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {"Open <c>http://localhost:3000</c>"}
                  </T>
                </li>
              </ol>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
                {t("2. Explore the Platform")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>{t("Switch personas via the User Menu")}</li>
                <li>{t("Explore the Graph Explorer (center node)")}</li>
                <li>{t("Browse the Data Catalog")}</li>
                <li>{t("Check Patient Portal (PATIENT role)")}</li>
                <li>{t("Review ODRL policies (HDAB role)")}</li>
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-400">
                {t("3. Key Concepts")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>DSP:</b> Dataspace Protocol, sovereign data exchange"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>DCP:</b> Decentralised Claims, DID + VC identity"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>FHIR R4:</b> Clinical data standard (EHR)"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>OMOP CDM:</b> Analytics layer for research"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>EHDS:</b> EU regulation for health data sharing"}
                  </T>
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
            {t("Full Onboarding Guide →")} <ExternalLink size={12} />
          </a>
        </section>

        {/* JAD Architecture */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="jad-architecture">
            {t("JAD Stack Architecture")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsDeveloper"
              tags={{ c: chip }}
              vars={{ n: COMPOSE_SERVICES }}
            >
              {
                "The full JAD (Java Application Deployment) stack runs {n} Docker Compose services orchestrated via <c>docker-compose.yml</c> + <c>docker-compose.jad.yml</c>. Services are grouped into five layers:"
              }
            </T>
          </p>
          <DocFigure
            file="deployment.svg"
            alt={t(
              "The JAD stack as an ArchiMate technology view: the edge, the application, the EDC-V and identity services and the infrastructure as bands, with the run-time dependencies between them",
            )}
            caption={t(
              "JAD stack: {n} compose services and their dependencies (ArchiMate 3.2, technology view)",
              { n: COMPOSE_SERVICES },
            )}
          />

          {/* Service table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs border border-(--border) rounded-lg">
              <thead className="bg-(--surface-2)">
                <tr>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Service")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Port")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    Traefik
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Purpose")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Depends On")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-(--text-secondary)">
                {[
                  [
                    "Traefik",
                    ":80 / :8090",
                    "traefik.localhost",
                    t("API gateway & reverse proxy"),
                    "—",
                  ],
                  [
                    "PostgreSQL 17",
                    ":5432",
                    "—",
                    t("Runtime store ({n} databases)", {
                      n: facts.postgresDbs.length,
                    }),
                    "—",
                  ],
                  [
                    "Vault",
                    ":8200",
                    "vault.localhost",
                    t(
                      "Secrets, file storage; vault-unseal unseals it after a restart",
                    ),
                    "—",
                  ],
                  [
                    "Keycloak",
                    ":8080",
                    "keycloak.localhost",
                    t("OIDC SSO (realm: edcv, 7 users)"),
                    "PostgreSQL",
                  ],
                  [
                    "NATS",
                    ":4222 / :8222",
                    "—",
                    t("Async event mesh (JetStream)"),
                    "—",
                  ],
                  [
                    "Control Plane",
                    ":11003",
                    "cp.localhost",
                    t("DSP protocol + management API"),
                    "PG, Vault, NATS, KC",
                  ],
                  [
                    "Data Plane FHIR",
                    ":11002",
                    "dp-fhir.localhost",
                    t("FHIR PUSH transfer type"),
                    "PG, Vault, CP",
                  ],
                  [
                    "Data Plane OMOP",
                    ":11012",
                    "dp-omop.localhost",
                    t("OMOP PULL transfer type"),
                    "PG, Vault, CP",
                  ],
                  [
                    "Identity Hub",
                    ":11005",
                    "ih.localhost",
                    t("DCP v1.0: DID + VC store"),
                    "PG, Vault, KC",
                  ],
                  [
                    "Issuer Service",
                    ":10013",
                    "issuer.localhost",
                    t("VC issuance + DID:web"),
                    "PG, Vault, KC",
                  ],
                  [
                    "Tenant Manager",
                    ":11006",
                    "tm.localhost",
                    t("CFM tenant lifecycle"),
                    "PG, KC",
                  ],
                  [
                    "Provision Manager",
                    ":11007",
                    "pm.localhost",
                    t("CFM resource provisioning"),
                    "PG, KC, CP",
                  ],
                  [
                    "Neo4j 5",
                    ":7474 / :7687",
                    "—",
                    t("Knowledge graph (APOC + n10s)"),
                    "—",
                  ],
                  [
                    "Neo4j Proxy",
                    ":9090",
                    "proxy.localhost",
                    t("Express bridge: UI ↔ Neo4j"),
                    "CP",
                  ],
                  [
                    "Next.js UI",
                    ":3000 / :3003",
                    "—",
                    t("Application frontend"),
                    "Neo4j",
                  ],
                ].map(([service, port, traefik, purpose, deps]) => (
                  <tr key={service} className="border-t border-(--border)">
                    <td className="px-3 py-1.5 font-medium text-(--text-primary)">
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
          <p className="text-(--text-secondary) text-xs mt-2">
            {t(
              "Plus 4 background CFM agents (keycloak, edcv, registration, onboarding) and 1 one-shot seed container. Vault-bootstrap runs as a sidecar.",
            )}
          </p>
        </section>

        {/* Prerequisites */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="prerequisites">
            {t("Prerequisites")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("Required")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>Node.js 20+</b>: runtime for UI and proxy"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>Docker Desktop</b>: with Docker Compose V2"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>8 GB Docker RAM</b>: required for full JAD stack"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>Git</b>: with pre-commit hooks enabled"}
                  </T>
                </li>
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
                {t("Optional")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {"<b>Python 3.11+</b>: for Synthea FHIR data loading"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c }}>
                    {
                      "<b>gitleaks</b>: local secret scanning (<c>brew install gitleaks</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c }}>
                    {
                      "<b>lychee</b>: broken link checker (<c>brew install lychee</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c }}>
                    {
                      "<b>Playwright browsers</b>: for E2E tests (<c>npx playwright install</c>)"
                    }
                  </T>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-4 border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              {t("Port Requirements")}
            </h4>
            <p className="text-(--text-secondary) text-xs">
              {t("The JAD stack requires these ports to be free:")}{" "}
              <code className="text-(--text-primary)">
                80, 3000, 3003, 4222, 5432, 7474, 7687, 8080, 8090, 8200, 8222,
                9090, 10013, 11002, 11003, 11005, 11006, 11007, 11012
              </code>
            </p>
          </div>
        </section>

        {/* Quick Start Minimal */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="quick-start">
            {t("Quick Start: Minimal Stack")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "Run Neo4j + Next.js UI with synthetic data. No JAD services needed.",
            )}
          </p>
          <div className="space-y-4">
            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("1. Start Neo4j & load schema")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`docker compose up -d

# Initialize schema (idempotent — safe to re-run)
cat neo4j/init-schema.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace

# Load synthetic data (127 patients, 5300+ nodes)
cat neo4j/insert-synthetic-schema-data.cypher | \\
  docker exec -i health-dataspace-neo4j \\
  cypher-shell -u neo4j -p healthdataspace`}</pre>
            </div>

            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("2. Start the UI")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`cd ui
npm install
npm run dev          # → http://localhost:3000

npm test             # Run the Vitest unit suite
npm run lint         # ESLint (max 55 warnings)`}</pre>
            </div>
          </div>
        </section>

        {/* Quick Start JAD */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="jad-quick-start">
            {t("Quick Start: Full JAD Stack")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The bootstrap script starts all {n} services with health checks, initializes Vault secrets, imports the Keycloak realm, and runs the 7-phase seed pipeline.",
              { n: COMPOSE_SERVICES },
            )}
          </p>
          <div className="space-y-4">
            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("1. Bootstrap everything")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# Full stack — takes ~3-5 min on first run
./scripts/bootstrap-jad.sh

# Check status & endpoints
./scripts/bootstrap-jad.sh --status`}</pre>
            </div>

            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("2. Seed the dataspace")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# Run all 7 seed phases (sequential, strict order)
./jad/seed-all.sh

# Resume from a specific phase
./jad/seed-all.sh --from 3

# Run only one phase
./jad/seed-all.sh --only 5`}</pre>
            </div>

            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("3. Access the platform")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# Live UI (production build)
open http://localhost:3003

# Keycloak Admin Console
open http://keycloak.localhost  # admin / admin

# Neo4j Browser
open http://localhost:7474      # neo4j / healthdataspace

# Traefik Dashboard
open http://traefik.localhost`}</pre>
            </div>

            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
                {t("Common operations")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`./scripts/bootstrap-jad.sh --ui-only   # Rebuild UI only (fast)
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
            {t("Data Seeding Pipeline")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The 7-phase seed pipeline populates the dataspace with tenants, credentials, policies, assets, and contracts. Phases must run in strict order; each depends on the previous.",
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-(--border) rounded-lg">
              <thead className="bg-(--surface-2)">
                <tr>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Phase")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Script")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Target Service")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("What It Does")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-(--text-secondary)">
                {[
                  [
                    "1",
                    "seed-health-tenants.sh",
                    "Tenant Manager",
                    t("Create 5 participant tenants via CFM"),
                  ],
                  [
                    "2",
                    "seed-ehds-credentials.sh",
                    "Issuer Service",
                    t("Register EHDS credential types"),
                  ],
                  [
                    "3",
                    "seed-ehds-policies.sh",
                    "Control Plane",
                    t("Create ODRL policies for all participants"),
                  ],
                  [
                    "4",
                    "seed-data-assets.sh",
                    "Control Plane",
                    t("Register data assets + contracts"),
                  ],
                  [
                    "5",
                    "seed-contract-negotiation.sh",
                    "Control Plane",
                    t("PharmaCo ↔ AlphaKlinik negotiations + data planes"),
                  ],
                  [
                    "6",
                    "seed-federated-catalog.sh",
                    "Control Plane",
                    t("MedReg ↔ LMC federated catalog negotiation"),
                  ],
                  [
                    "7",
                    "seed-data-transfer.sh",
                    "Data Plane",
                    t("Verify EDR tokens and data plane transfers"),
                  ],
                ].map(([phase, script, target, desc]) => (
                  <tr key={phase} className="border-t border-(--border)">
                    <td className="px-3 py-1.5 font-mono font-bold text-(--text-primary)">
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
            <p className="text-(--text-secondary) text-xs">
              <T area="docsDeveloper" tags={{ b: warn, c: small }}>
                {
                  "<b>Important:</b> Vault keeps its secrets on disk (volumes <c>vault_data</c> and <c>vault_keys</c>; the <c>vault-unseal</c> sidecar unseals it on every start), so a restart or a <c>docker compose down</c> keeps every secret. Only removing the volumes (<c>docker compose down -v</c> or <c>./scripts/bootstrap-jad.sh --reset</c>) deletes them; bootstrap and seed the stack again after that. If IdentityHub logs <c>Private key ... not found</c>, check that <c>health-dataspace-vault-unseal</c> reported <c>ready</c>."
                }
              </T>
            </p>
          </div>
        </section>

        {/* Project Structure */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="project-structure">
            {t("Project Structure")}
          </h2>
          <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
            <pre className="text-xs text-(--text-primary) overflow-x-auto whitespace-pre">{`├── .github/workflows/         # CI/CD (pr-gate, test, compliance, security-scan, deploy-azure, pages, ...)
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
├── ui/                        # Next.js ${
              facts.toolVersions.next.split(".")[0]
            } application
│   ├── src/app/               # ${facts.uiPages.length} pages, ${
              facts.apiRoutes.length
            } API routes
│   ├── src/components/        # Shared React components
│   ├── src/lib/               # auth.ts, api.ts, graph-constants.ts
│   ├── __tests__/unit/        # Vitest unit tests
│   ├── __tests__/e2e/         # Playwright specs (journeys/)
│   └── public/mock/           # 38 JSON fixtures for static export
├── docker-compose.yml         # Minimal stack (Neo4j + UI)
└── docker-compose.jad.yml     # Full JAD stack (${
              facts.composeServices["docker-compose.jad.yml"].length
            } services)`}</pre>
          </div>
        </section>

        {/* Graph Schema */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="graph-schema">
            {t("Neo4j Graph Schema")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T area="docsDeveloper" tags={{ c: chip }}>
              {
                "The 5-layer knowledge graph spans 27 node labels with 70+ indexes and 3 vector indexes for GraphRAG. Schema defined in <c>neo4j/init-schema.cypher</c> (idempotent, safe to re-run)."
              }
            </T>
          </p>
          <DocFigure
            file="graph-schema.svg"
            alt={t(
              "The core graph schema as a UML entity relationship diagram: the dataset, the FHIR record of a patient, the OMOP counterpart of each resource, and the SNOMED, ICD-10, LOINC and RxNorm codes both are coded by",
            )}
            caption={t(
              "Core entity relationships: the FHIR record, its OMOP mapping and the codes (UML)",
            )}
          />

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("5 Semantic Layers")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1.5">
                <li>
                  <span className="text-[#2471A3] dark:text-[#85C1E9] font-medium">
                    {t("L1 Marketplace:")}
                  </span>{" "}
                  Participant, DataProduct, Contract, HDABApproval, OdrlPolicy
                </li>
                <li>
                  <span className="text-[#0F766E] dark:text-[#76D7C4] font-medium">
                    L2 HealthDCAT-AP:
                  </span>{" "}
                  Catalogue, HealthDataset, Distribution, DataService
                </li>
                <li>
                  <span className="text-[#157A3C] dark:text-[#82E0AA] font-medium">
                    L3 FHIR R4:
                  </span>{" "}
                  Patient, Encounter, Condition, Observation, MedicationRequest
                </li>
                <li>
                  <span className="text-[#9A5512] dark:text-[#F5B041] font-medium">
                    L4 OMOP CDM:
                  </span>{" "}
                  OMOPPerson, ConditionOccurrence, DrugExposure, Measurement
                </li>
                <li>
                  <span className="text-[#7D3C98] dark:text-[#C39BD3] font-medium">
                    {t("L5 Ontology:")}
                  </span>{" "}
                  SnomedConcept, ICD10Code, RxNormConcept, LoincCode
                </li>
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Key Conventions")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ c: accent }}>
                    {"Labels: <c>PascalCase</c>"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c: accent }}>
                    {"Relationships: <c>UPPER_SNAKE_CASE</c>"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c: accent }}>
                    {"Properties: <c>camelCase</c>"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {"Always <c>MERGE</c>, never <c>CREATE</c>"}
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {"Constraints use <c>IF NOT EXISTS</c>"}
                  </T>
                </li>
                <li>
                  {t("3 fulltext indexes (clinical, catalog, ontology search)")}
                </li>
                <li>{t("3 vector indexes (384-dim, cosine, for GraphRAG)")}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* PostgreSQL Schema */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="postgres-schema">
            {t("PostgreSQL Schema")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T area="docsDeveloper" tags={{ b }}>
              {
                "PostgreSQL serves as the runtime store for all JAD services: EDC-V state machines, Keycloak identity, and CFM tenant metadata. Neo4j holds the health knowledge graph. This split follows <b>ADR-1</b>."
              }
            </T>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-(--border) rounded-lg">
              <thead className="bg-(--surface-2)">
                <tr>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Database")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Service")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Contents")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-(--text-secondary)">
                {[
                  [
                    "controlplane",
                    "EDC-V Control Plane",
                    t(
                      "Contract negotiations, transfer processes, asset definitions, policy store",
                    ),
                  ],
                  [
                    "dataplane",
                    "DCore FHIR",
                    t("FHIR data plane state, EDR tokens, transfer tracking"),
                  ],
                  [
                    "dataplane_omop",
                    "DCore OMOP",
                    t("OMOP data plane state, EDR tokens, transfer tracking"),
                  ],
                  [
                    "identityhub",
                    "Identity Hub",
                    t("DID documents, verifiable credential store, key pairs"),
                  ],
                  [
                    "issuerservice",
                    "Issuer Service",
                    t(
                      "Credential definitions, attestation records, issued VCs",
                    ),
                  ],
                  [
                    "keycloak",
                    "Keycloak",
                    t("Users, roles, realm config, sessions, client scopes"),
                  ],
                  [
                    "cfm",
                    "Tenant Manager, Provision Manager, CFM agents",
                    t(
                      "Tenant records, VPAs (Virtual Participant Agents), provisioning tasks",
                    ),
                  ],
                  [
                    "redlinedb",
                    "—",
                    t(
                      "Created by jad/init-postgres.sql; no service in either compose stack uses it today",
                    ),
                  ],
                  [
                    "taskdb",
                    "Neo4j proxy",
                    t(
                      "Persistent task list behind the proxy's /tasks endpoints (phase 13d)",
                    ),
                  ],
                ].map(([db, service, contents]) => (
                  <tr key={db} className="border-t border-(--border)">
                    <td className="px-3 py-1.5 font-mono font-medium text-(--text-primary)">
                      {db}
                    </td>
                    <td className="px-3 py-1.5">{service}</td>
                    <td className="px-3 py-1.5">{contents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">
              {t("Neo4j vs PostgreSQL Split")}
            </h4>
            <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Neo4j:</b> Health knowledge graph (FHIR, OMOP, ontologies), graph traversal queries, semantic search, GraphRAG vectors"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>PostgreSQL:</b> EDC-V runtime state machines, OIDC sessions, tenant metadata, credential storage; transactional ACID workloads"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Rationale:</b> Graph queries for clinical relationships are orders of magnitude faster in Neo4j; EDC-V requires PostgreSQL for its state machine persistence"
                  }
                </T>
              </li>
            </ul>
          </div>
        </section>

        {/* Integration Flows */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="integration-flows">
            {t("Integration Flows")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T area="docsDeveloper" tags={{ a: referenceLink }}>
              {
                "Two canonical flows cover 90% of real-world EHDS integrations. Pick the one that matches your role, then use the <a>Scalar API Reference</a> to try each endpoint from the browser."
              }
            </T>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data Consumer */}
            <div className="border border-(--border) rounded-lg p-5 bg-(--surface-1)">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="font-semibold text-base text-(--text-primary)">
                  {t("Data Consumer flow")}
                </h3>
              </div>
              <p className="text-xs text-(--text-secondary) mb-3">
                {t(
                  "Researcher / pharma / HTA body discovers and requests cross-border health data.",
                )}
              </p>
              <ol className="text-xs text-(--text-secondary) space-y-2 list-decimal ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Discover</b> → <c>GET /api/catalog</c> returns HealthDCAT-AP datasets"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Inspect</b> → <c>GET /api/assets</c> for access policies (ODRL)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Negotiate</b> → <c>POST /api/negotiations</c> opens a DSP 2025-1 contract"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Attest</b> → <c>POST /api/credentials/present</c> proves role via DCP VC"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Transfer</b> → <c>GET /api/transfers/:id</c> monitors the data plane"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Analyse</b> → <c>GET /api/analytics</c> or <c>POST /api/nlq</c>"
                    }
                  </T>
                </li>
              </ol>
              <div className="mt-4 pt-3 border-t border-(--border) text-xs text-(--text-secondary)">
                <T area="docsDeveloper" tags={{ c: flowCode }}>
                  {
                    "Role: <c>DATA_USER</c> · Persona: Dr. Petra Lang (PharmaCo Research)"
                  }
                </T>
              </div>
            </div>

            {/* Data Provider */}
            <div className="border border-(--border) rounded-lg p-5 bg-(--surface-1)">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="font-semibold text-base text-(--text-primary)">
                  {t("Data Provider flow")}
                </h3>
              </div>
              <p className="text-xs text-(--text-secondary) mb-3">
                {t(
                  "Hospital / clinic / registry publishes datasets for secondary use.",
                )}
              </p>
              <ol className="text-xs text-(--text-secondary) space-y-2 list-decimal ml-4">
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Register</b> → <c>POST /api/participants</c> creates a did:web identity"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Publish</b> → <c>POST /api/catalog</c> adds a HealthDCAT-AP dataset"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Policy</b> → <c>POST /api/admin/policies</c> creates an ODRL policy (EDC_ADMIN)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>HDAB approval</b> → <c>GET /api/compliance</c> tracks approval state"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Accept</b> → <c>GET /api/negotiations</c> shows incoming contract offers"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b }}>
                    {
                      "<b>Deliver</b> → data plane pushes FHIR/OMOP bundles to the consumer"
                    }
                  </T>
                </li>
              </ol>
              <div className="mt-4 pt-3 border-t border-(--border) text-xs text-(--text-secondary)">
                <T area="docsDeveloper" tags={{ c: flowCode }}>
                  {
                    "Role: <c>DATA_HOLDER</c> · Persona: Dr. Klaus Weber (AlphaKlinik Berlin)"
                  }
                </T>
              </div>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="api-reference">
            {t("API Reference")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsDeveloper"
              tags={{ c, k: chip }}
              vars={{
                routes: facts.apiRoutes.length,
                ops: implementedOperations,
              }}
            >
              {
                "{routes} Next.js API routes ({ops} operations) proxy to Neo4j and the EDC-V services; the table is generated from <c>ui/src/app/api/</c>. Every route needs a session (ADR-044) except the sign-in flows, the Keycloak address for the sign-in banner, the health probe, and the Klarbefund app's account creation, which answers only a verified Apple App Attest attestation (ADR-054). Routes are disabled in the static export; mock data is served from <k>ui/public/mock/*.json</k>."
              }
            </T>
          </p>
          <div className="flex flex-wrap gap-3 mb-4 text-sm">
            <Link
              href="/docs/developer/reference"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-indigo-500 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-medium"
            >
              {t("Scalar API Reference →")}
            </Link>
            <Link
              href="/docs/developer/api"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-(--text-primary)"
            >
              Swagger UI →
            </Link>
            <a
              href="/openapi.yaml"
              download="ehds-integration-hub-openapi.yaml"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-(--text-primary)"
            >
              {t("Download openapi.yaml")}
            </a>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/bruno/MVHDv2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-(--border) bg-(--surface-2) hover:bg-(--surface-3) transition-colors text-(--text-primary)"
            >
              {t("Bruno collection ↗")}
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-(--border) rounded-lg">
              <thead className="bg-(--surface-2)">
                <tr>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Area")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("Routes and methods")}
                  </th>
                  <th className="px-3 py-2 text-left text-(--text-primary)">
                    {t("What it is for")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-(--text-secondary)">
                {groupApiRoutes(facts.apiRoutes).map(([group, routes]) => (
                  <tr
                    key={group}
                    className="border-t border-(--border) align-top"
                  >
                    <td className="px-3 py-2 font-mono text-(--text-primary) whitespace-nowrap">
                      /api/{group}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {routes.map((r) => (
                        <div key={r.path}>
                          {r.path.slice(`/api/${group}`.length) || "/"}{" "}
                          <span className="text-(--text-secondary)">
                            {r.methods.join(" ")}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      {API_GROUP_DESCRIPTIONS[group]
                        ? t(API_GROUP_DESCRIPTIONS[group])
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Testing */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="testing">
            {t("Testing")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Unit Tests (Vitest)")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1">
                <li>
                  <T area="docsDeveloper" tags={{ b, c }}>
                    {
                      "<b>UI and Neo4j proxy</b> suites, the UI's mirroring <c>ui/src/</c> under <c>ui/__tests__/unit/</c>"
                    }
                  </T>
                </li>
                <li>{t("v8 coverage, published with the test report")}</li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "Testing Library for components; a test that needs the network stubs <c>fetch</c> itself, and Neo4j is mocked at <c>@/lib/neo4j</c> (MSW was removed in #404)"
                    }
                  </T>
                </li>
                <li>
                  <a
                    href={`https://ma3u.github.io${PAGES_BASE}/test-reports/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                  >
                    {t("View Test Report")} <ExternalLink size={10} />
                  </a>
                </li>
              </ul>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`npm test               # Run once
npm run test:watch     # Watch mode
npm run test:coverage  # With v8 coverage`}</pre>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("E2E Tests (Playwright)")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1">
                <li>
                  <T area="docsDeveloper" tags={{ b, c }}>
                    {
                      "<b>Journey specs</b> in <c>ui/__tests__/e2e/journeys/</c> (IDs J001 onward)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "WCAG 2.2 AA accessibility audit (<c>27-wcag-accessibility</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "OWASP/BSI security & pentest (<c>28-security-pentest</c>)"
                    }
                  </T>
                </li>
                <li>
                  <a
                    href={`${basePath}/e2e-report/`}
                    className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                  >
                    {t("Playwright Report")} <ExternalLink size={10} />
                  </a>
                </li>
              </ul>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`npm run test:e2e       # Headless (chromium)
npm run test:e2e:ui    # Interactive UI

# Against JAD stack
PLAYWRIGHT_BASE_URL=http://localhost:3003 \\
  npm run test:e2e`}</pre>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">DSP 2025-1 TCK</h4>
              <p className="text-(--text-secondary) text-xs">
                {t(
                  "Validates EDC connector implements Dataspace Protocol correctly: catalog queries, contract negotiations, transfer processes.",
                )}
              </p>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`./scripts/run-dsp-tck.sh`}</pre>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">DCP v1.0</h4>
              <p className="text-(--text-secondary) text-xs">
                {t(
                  "Verifies Decentralized Claims Protocol: DID resolution, credential presentation, trust framework.",
                )}
              </p>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`./scripts/run-dcp-tests.sh`}</pre>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">{t("EHDS Domain")}</h4>
              <p className="text-(--text-secondary) text-xs">
                {t(
                  "Health domain compliance: FHIR R4 bundles, OMOP transformation, HDAB approval chains, patient rights.",
                )}
              </p>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`./scripts/run-ehds-tests.sh`}</pre>
            </div>
          </div>

          <div className="mt-4 border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2" id="user-journey">
              {t("EHDS User Journey")}
            </h4>
            <p className="text-(--text-secondary) text-xs mb-2">
              {t(
                "The full 8-step EHDS secondary-use journey with sequence diagrams, persona mappings, and E2E test coverage:",
              )}
            </p>
            <a
              href={`${GITHUB_REPO}/blob/main/docs/FULL_USER_JOURNEY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 text-xs underline inline-flex items-center gap-1"
            >
              {t("View Full User Journey")} <ExternalLink size={10} />
            </a>
          </div>
        </section>

        {/* Quality Gates */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="quality-gates">
            {t("Quality Gates")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "Four-stage quality pipeline aligned with BSI C5, OWASP Top 10, EHDS regulation, and WCAG 2.2 AA.",
            )}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ["15", t("Pre-commit hooks")],
              ["2", t("Pre-push gates")],
              ["13", t("CI jobs")],
              ["3", t("Compliance suites")],
            ].map(([count, label]) => (
              <div
                key={label}
                className="border border-(--border) rounded-lg p-3 text-center"
              >
                <div className="text-xl font-bold text-(--text-primary)">
                  {count}
                </div>
                <div className="text-[10px] text-(--text-secondary)">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/docs/developer/quality-gates"
            className="inline-flex items-center gap-1 text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
          >
            {t("View full Quality Gates documentation →")}
          </Link>
        </section>

        {/* CI/CD */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="cicd">
            {t("CI/CD Pipeline")}
          </h2>
          <DocFigure
            file="cicd-pipeline.svg"
            alt={t(
              "CI/CD as an ArchiMate technology process view: the workstation hooks, the five pull request checks, and the deploy, the static export and the smoke test that run on main",
            )}
            caption={t(
              "CI/CD: the {n} pre-commit hooks and the pre-push suite on the workstation, the pull request checks, and what runs on main (ArchiMate 3.2)",
              { n: PRE_COMMIT_HOOKS },
            )}
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("test.yml: {n} jobs on every push", {
                  n: facts.workflowJobs["test.yml"].length,
                })}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                {facts.workflowJobs["test.yml"].map((job) => (
                  <li key={job}>{job}</li>
                ))}
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("pages.yml: Deploy to GitHub Pages")}
              </h4>
              <ol className="text-(--text-secondary) text-xs space-y-1 list-decimal ml-4">
                <li>
                  {t(
                    "Seed Neo4j and refresh the mock fixtures from the live API",
                  )}
                </li>
                <li>{t("Run full Vitest suite with coverage")}</li>
                <li>{t("Build Next.js for E2E, run Playwright")}</li>
                <li>{t("Run WCAG 2.2 AA accessibility audit")}</li>
                <li>{t("Run OWASP/BSI security tests")}</li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "Disable API routes (<c>mv src/app/api /tmp/api_disabled</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "Build static export (<c>NEXT_PUBLIC_STATIC_EXPORT=true</c>)"
                    }
                  </T>
                </li>
                <li>{t("Copy test reports to output")}</li>
                <li>{t("Deploy to GitHub Pages")}</li>
              </ol>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("compliance.yml: Weekly + Push to Main")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{ c }}
                  vars={{
                    jobs: facts.workflowJobs["compliance.yml"].join(", "),
                  }}
                >
                  {
                    "Runs on the full JAD stack: {jobs}. Each suite is held to the floor in <c>scripts/compliance-baseline.json</c>. Scheduled Monday 06:00 UTC, and on pushes to main that touch the scripts, seeds, API routes or the API collection."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("deploy-azure.yml: Azure Deployment")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                {t(
                  "Deploys the 21 Container Apps and their jobs to Azure via OIDC federation. Includes E2E smoke tests against the live Azure environment.",
                )}
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("reset-demo.yml: Demo Reset (manual)")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                {t(
                  "Restarts stateful services, re-bootstraps Vault and Keycloak, reseeds data and runs smoke tests. Manual dispatch only since 2026-09-13: the Keycloak realm now holds the Klarbefund client and real accounts, which a scheduled reset would delete.",
                )}
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("aca-schedule.yml: Off-Hours Stop and Start")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T area="docsDeveloper" tags={{ a: offHoursLink }}>
                  {
                    "Stops every Container App except the UI, then the PostgreSQL Flexible Server, daily at 18:00 UTC; starts them in dependency order Monday to Friday at 05:00 UTC, skipping Berlin public holidays (ADR-053). See <a>Live Stack Off Hours</a>."
                  }
                </T>
              </p>
            </div>
          </div>
        </section>

        {/* Live stack off hours (ADR-053) */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="off-hours">
            {t("Live Stack Off Hours")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T area="docsDeveloper" tags={{ c }} vars={{ host: LIVE_HOST }}>
              {
                "Outside office hours the Azure stack is stopped, database included, and <c>{host}</c> answers every page with an offline notice and every data route with <c>503</c>. Local development is not affected: <c>docker compose</c> and <c>npm run dev</c> know nothing of the schedule. To see the notice locally, start the UI with <c>LIVE_DEMO_OFFLINE=true</c>."
              }
            </T>
          </p>
          <div className="space-y-4">
            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("Working on the live stack at night or at the weekend")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# 1. Hold it: no scheduled stop before this instant (UTC)
gh variable set LIVE_DEMO_HOLD_UNTIL --body "2026-10-10T22:00Z"

# 2. Start it (any day, about ten minutes, green only if a login works)
gh workflow run aca-schedule.yml -f action=start

# 3. Optional: one catalog crawl, it runs in office hours only
az containerapp job start --name mvhd-catalog-crawler --resource-group rg-mvhd-dev

# 4. Done: release the hold and stop it again
gh variable delete LIVE_DEMO_HOLD_UNTIL
gh workflow run aca-schedule.yml -f action=stop`}</pre>
            </div>
            <ul className="text-(--text-secondary) text-sm space-y-1 list-disc ml-5">
              <li>
                {t(
                  "Start the stack before merging at night; a deploy expects the apps to be running.",
                )}
              </li>
              <li>
                {t(
                  "A forgotten hold ends by itself: the first scheduled stop after it expires stops the stack.",
                )}
              </li>
              <li>
                <T area="docsDeveloper" tags={{ a: runbookLink }}>
                  {
                    "Troubleshooting, the state check and the full procedure are in the <a>off-hours runbook</a>."
                  }
                </T>
              </li>
            </ul>
          </div>
        </section>

        {/* Latest Reports */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="reports">
            {t("Latest Reports")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: t("Test Coverage Report"),
                href: `https://ma3u.github.io${PAGES_BASE}/test-reports/`,
                desc: t("Vitest coverage report with per-file breakdown"),
                external: true,
              },
              {
                title: t("Playwright E2E Report"),
                href: `${basePath}/e2e-report/`,
                desc: t("E2E test results with screenshots and traces"),
                external: false,
              },
              {
                title: t("CI Workflow Runs"),
                href: `${GITHUB_REPO}/actions/workflows/test.yml`,
                desc: t("GitHub Actions test suite history"),
                external: true,
              },
              {
                title: t("Compliance Runs"),
                href: `${GITHUB_REPO}/actions/workflows/compliance.yml`,
                desc: t("DSP TCK, DCP, EHDS compliance results"),
                external: true,
              },
              {
                title: t("Security Advisories"),
                href: `${GITHUB_REPO}/security`,
                desc: t("Trivy SARIF findings and dependency alerts"),
                external: true,
              },
              {
                title: t("GitHub Pages Deploy"),
                href: `${GITHUB_REPO}/actions/workflows/pages.yml`,
                desc: t("Static export build and deployment history"),
                external: true,
              },
            ].map((r) => (
              <a
                key={r.title}
                href={r.href}
                target={r.external ? "_blank" : undefined}
                rel={r.external ? "noopener noreferrer" : undefined}
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
              >
                <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                  {r.title}
                  {r.external && <ExternalLink size={12} />}
                </h4>
                <p className="text-(--text-secondary) text-xs">{r.desc}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Security and data protection */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="security">
            {t("Security and Data Protection")}
          </h2>
          <p className="text-(--text-secondary) mb-4">
            <T area="docsDeveloper" tags={{ a: securityLink }}>
              {
                "Tested by the project itself with tools anyone can run on the repository; every finding is fixed or named as open. The test of 2026-10-15 found ten findings, F1 to F10: after the fixes nine are closed and one is reviewed and accepted (F3, the published development default key of the local compose stack). None of this is an independent penetration test or a certification. The reports are published under <a>/docs/security</a>."
              }
            </T>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {securityDocs.map((d) => (
              <Link
                key={d.slug}
                href={`/docs/security/${d.slug}`}
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
              >
                <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400">
                  {translationOf("security", d.slug, lang)?.title ?? d.title}
                </h4>
                <p className="text-(--text-secondary) text-xs">
                  {translationOf("security", d.slug, lang)?.summary ??
                    d.summary}
                </p>
              </Link>
            ))}
            {[
              {
                title: t("Report for health insurers, on one page"),
                href: INSURER_REPORT_PAGE,
                desc: t(
                  "The same report as one page for a steering meeting, served by the hub",
                ),
              },
              {
                title: t("Security scans in CI"),
                href: `${GITHUB_REPO}/actions/workflows/security-scan.yml`,
                desc: t(
                  "grype over the bills and trivy over the images on every push; CodeQL for TypeScript and Swift in their own workflows",
                ),
              },
            ].map((r) => (
              <a
                key={r.title}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
              >
                <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                  {r.title}
                  <ExternalLink size={12} />
                </h4>
                <p className="text-(--text-secondary) text-xs">{r.desc}</p>
              </a>
            ))}
          </div>
          <p className="text-(--text-secondary) text-sm mt-4">
            <T area="docsDeveloper" tags={{ c }}>
              {
                "Run it again: <c>scripts/security/generate-sbom.sh --check</c>, <c>scripts/security/scan-repo.sh</c>, <c>scripts/security/check-hub-blackbox.sh</c> and <c>swift test --filter SecurityPostureTests</c> in <c>clients/ios</c>. Decisions: ADR-011 (testing strategy) and ADR-060 (the app lock; why pinning and jailbreak detection were declined)."
              }
            </T>
          </p>
        </section>

        {/* Documentation */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="documentation">
            {t("Writing the Documentation")}
          </h2>
          <p className="text-(--text-secondary) mb-4">
            <T area="docsDeveloper" tags={{ c }}>
              {
                "The documentation is part of the repository and the hub publishes it from there. Every page under <c>/docs</c> gets an index of its headings at the right (a disclosure at the top on a phone), and every diagram or screenshot opens full screen with zoom on click."
              }
            </T>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Published documents")}
              </h4>
              <p className="text-(--text-secondary) text-xs mb-2">
                <T area="docsDeveloper" tags={{ c }}>
                  {
                    "A Markdown file under <c>docs/</c> becomes a page when it is listed in <c>scripts/gen-docs-content.py</c> with a section (<c>security</c> or <c>klarbefund</c>), a slug and a one-line summary. The script writes <c>ui/src/content/published-docs.json</c>, rewrites relative links to the published route or to GitHub, copies every embedded image to <c>ui/public/published-docs/</c>, and its <c>--check</c> runs in pre-commit so the copy never drifts from the source. Headings are numbered when rendered unless the document numbers its own; anchors stay GitHub's."
                  }
                </T>
              </p>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{ a: securityLink, k: klarbefundLink }}
                >
                  {
                    "<a>/docs/security</a> holds the reports, <k>/docs/klarbefund</k> the app's user and developer guides."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Diagrams in ArchiMate and UML")}
              </h4>
              <p className="text-(--text-secondary) text-xs mb-2">
                <T area="docsDeveloper" tags={{ c }}>
                  {
                    "Architecture figures are PlantUML sources under <c>docs/<section>/diagrams/*.puml</c>, ArchiMate 3.2 for structure (business, application and technology as horizontal bands) and sequence diagrams where the order of messages matters. <c>scripts/render-plantuml.sh</c> renders them to the sibling <c>img/</c> folder (needs <c>brew install plantuml</c>); the content generator copies the SVGs to the hub. A hand-written page embeds one with <c>DocFigure</c> inside a <c>DocFigureViewer</c>."
                  }
                </T>
              </p>
              <p className="text-(--text-secondary) text-xs">
                <T area="docsDeveloper" tags={{ c }}>
                  {
                    "Two things the ArchiMate library rejects: a <c>;line:</c> colour suffix on a band, and relations that point downward across layers, which flips the band order. Use the <c>_Up</c>, <c>_Right</c> and <c>_Left</c> variants of each relation."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">{t("Screenshots")}</h4>
              <p className="text-(--text-secondary) text-xs">
                <T area="docsDeveloper" tags={{ c }}>
                  {
                    "Klarbefund's screenshots come from a simulator through <c>clients/ios/Scripts/capture-screenshots.sh</c>, which launches each screen by argument with the fictional dev dataset (<c>-MBDevData -MBShot <screen></c>); a demo launch never shows the app lock. They are stored at half the simulator's resolution under <c>docs/klarbefund/img/</c>. No real report, value or organisation may ever appear in one."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Facts and dates")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T area="docsDeveloper" tags={{ c }}>
                  {
                    "Numbers on these pages (routes, services, hooks, versions) come from <c>ui/src/app/docs/docs-facts.json</c>, written by <c>scripts/gen-docs-facts.py</c> from the repository; the same script keeps each page's last-updated date, and its check fails a commit whose page changed without it. Run <c>python3 scripts/gen-docs-facts.py</c> after editing a docs page."
                  }
                </T>
              </p>
            </div>
          </div>
        </section>

        {/* Data Flow */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="data-flow">
            {t("Data Flow")}
          </h2>
          <DocFigure
            file="developer-data-flow.svg"
            alt={t(
              "The data pipeline as a sequence diagram: Synthea loads 127 patients into Neo4j, the Cypher transform maps them to OMOP and copies the codes, then the UI asks the proxy, which runs parameterised Cypher and answers JSON",
            )}
            caption={t(
              "Data pipeline: Synthea to Neo4j, then the proxy to the UI (sequence)",
            )}
          />
        </section>

        {/* Release Notes */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="releases">
            {t("Release Notes")}
          </h2>
          <div className="space-y-3">
            {[
              {
                version: "v1.2.0",
                date: "2026-04-12",
                highlights: t(
                  "Azure Container Apps deployment, SIMPL-Open gap analysis, nightly demo reset, 14 ADRs, quality gates documentation",
                ),
              },
              {
                version: "v1.1.0",
                date: "2026-04-10",
                highlights: t(
                  "WCAG 2.2 AA zero violations, ODRL policy enforcement, OWASP/BSI security pentest, 778 Playwright assertions",
                ),
              },
              {
                version: "v1.0.0",
                date: "2026-04-08",
                highlights: t(
                  "Initial release: 5-layer Neo4j knowledge graph, 127 synthetic patients, DSP 2025-1 + DCP v1.0, 7 personas, GitHub Pages demo",
                ),
              },
            ].map((r) => (
              <a
                key={r.version}
                href={`${GITHUB_REPO}/releases/tag/${r.version}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-(--border) rounded-lg px-4 py-3 flex items-start gap-3 hover:border-indigo-500/50 transition-colors block"
              >
                <span className="text-xs font-mono text-(--success-text) bg-(--success-text)/10 px-2 py-0.5 rounded-sm shrink-0">
                  {r.version}
                </span>
                <div>
                  <span className="text-(--text-secondary) text-xs">
                    {r.date}
                  </span>
                  <p className="text-(--text-secondary) text-xs mt-0.5">
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
            {t("All releases")} <ExternalLink size={12} />
          </a>
        </section>

        {/* Planning & Issues */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="project-links">
            {t("Planning & Issues")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: t("Planning Document"),
                href: `${GITHUB_REPO}/blob/main/docs/planning-health-dataspace-v2.md`,
                desc: t(
                  "Project roadmap, phase tracking, cross-cutting concerns, and ADR index",
                ),
              },
              {
                title: "GitHub Issues",
                href: `${GITHUB_REPO}/issues`,
                desc: t("Feature requests, bug reports, and task tracking"),
              },
              {
                title: "CI/CD Workflows",
                href: `${GITHUB_REPO}/actions`,
                desc: "test.yml, pages.yml, compliance.yml, deploy-azure.yml, reset-demo.yml",
              },
              {
                title: t("SIMPL-Open Gap Analysis"),
                href: `${GITHUB_REPO}/blob/main/docs/simpl-ehds-gap-analysis.md`,
                desc: t(
                  "Simpl-Open, the adopted EHDS and the hub compared: identity, catalogue, permits, fees, opt-out, DOME",
                ),
              },
              {
                title: t("Onboarding Guide"),
                href: `${GITHUB_REPO}/blob/main/docs/onboarding-guide.md`,
                desc: t(
                  "New developer onboarding: first day checklist, key concepts, common tasks",
                ),
              },
            ].map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors block"
              >
                <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                  {link.title}
                  <ExternalLink size={12} />
                </h4>
                <p className="text-(--text-secondary) text-xs">{link.desc}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Conventions */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="conventions">
            {t("Conventions")}
          </h2>
          <div className="border border-(--border) rounded-lg p-4">
            <ul className="text-(--text-secondary) text-sm space-y-2">
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Commit messages:</b> Conventional Commits format (feat:, fix:, docs:, chore:)"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {"<b>Branch strategy:</b> Feature branches → PR to main"}
                </T>
              </li>
              <li>
                <T
                  area="docsDeveloper"
                  tags={{ b, a: qualityGatesLink }}
                  vars={{ n: PRE_COMMIT_HOOKS }}
                >
                  {
                    "<b>Pre-commit:</b> {n} hooks, listed on the <a>quality gates page</a>: Prettier, ESLint, TypeScript, Semgrep, gitleaks, the API collection check and more"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Pre-push:</b> Full Vitest suite (--bail), npm audit (HIGH+)"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Cypher:</b> UPPER_SNAKE_CASE relationships, PascalCase labels, camelCase properties, always MERGE"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>TypeScript:</b> Strict mode, no any, @/* path alias → ui/src/*"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b }}>
                  {
                    "<b>Fictional orgs only:</b> AlphaKlinik Berlin, PharmaCo Research AG, MedReg DE, Limburg Medical Centre, Institut de Recherche Santé"
                  }
                </T>
              </li>
            </ul>
          </div>
        </section>

        {/* Related */}
        <section className="bg-(--surface-2)/50 border border-(--border) rounded-xl p-6">
          <h2 className="font-semibold mb-2">{t("Related Documentation")}</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/user-guide"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
            >
              {t("User Guide")}
            </Link>
            <Link
              href="/docs/architecture"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline"
            >
              {t("Architecture Diagrams")}
            </Link>
            <a
              href={`${GITHUB_REPO}/blob/main/docs/FULL_USER_JOURNEY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
            >
              {t("EHDS User Journey")} <ExternalLink size={12} />
            </a>
            <a
              href={`${GITHUB_REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
            >
              {t("Releases")} <ExternalLink size={12} />
            </a>
            <a
              href={`https://ma3u.github.io${PAGES_BASE}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
            >
              {t("Static docs (GitHub Pages)")} <ExternalLink size={12} />
            </a>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 underline inline-flex items-center gap-1"
            >
              {t("GitHub Repository")} <ExternalLink size={12} />
            </a>
          </div>
        </section>
      </div>
    </DocFigureViewer>
  );
}
