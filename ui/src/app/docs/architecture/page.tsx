"use client";

import { DocFigure } from "@/components/docs/DocFigure";
import { DocFigureViewer } from "@/components/docs/DocFigureViewer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExternalA } from "@/components/docs/ExternalA";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import facts from "@/app/docs/docs-facts.json";
import { T, useT } from "@/lib/i18n/translate";

/** Services in docker-compose.yml + docker-compose.jad.yml, profiles included. */
const COMPOSE_SERVICES = Object.values(facts.composeServices).flat().length;

const GITHUB_REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const STATIC_SITE = "https://ma3u.github.io/MinimumViableHealthDataspacev2";

/** A service of the compose stacks. Name, port and the services it depends
 *  on are names and stay as they are; `purpose`, the layer and the two
 *  descriptive `depends` texts are keys of the docsArchitecture dictionary,
 *  with `vars` for their placeholders (ADR-071). */
interface ServiceInfo {
  name: string;
  port: string;
  depends: string;
  purpose: string;
  vars?: Record<string, string | number>;
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
    purpose: "Shared database ({count} DBs: {names})",
    vars: {
      count: facts.postgresDbs.length,
      names: facts.postgresDbs.join(", "),
    },
    layer: "Infrastructure",
  },
  {
    name: "HashiCorp Vault",
    port: ":8200",
    depends: "--",
    purpose:
      "Secrets store with file storage, so a restart keeps every key (since 2026-09-26; on Azure it stores in the Flexible Server, ADR-046)",
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
    purpose: "OIDC SSO provider, realm edcv, 8 demo users across 5 roles",
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
    name: "vault-unseal",
    port: "--",
    depends: "Vault",
    purpose:
      "Sidecar: initialises Vault once, then unseals it after every restart",
    layer: "Infrastructure",
  },
  {
    name: "siglet",
    port: "--",
    depends: "Vault",
    purpose:
      "Token signing and certificate exchange for the EDC 0.18 data planes (#97)",
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
    name: "cfm-cp-shim",
    port: "--",
    depends: "Control Plane",
    purpose:
      "nginx shim: the CFM agents call Management API v5alpha, EDC 0.18 serves v5beta (#181)",
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
    purpose:
      "Persona overviews, catalog, governance and exchange: {pages} pages, {routes} API routes",
    vars: { pages: facts.uiPages.length, routes: facts.apiRoutes.length },
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
  // Light mode uses dark text on a light tint (WCAG AA ≥ 4.5:1); dark mode
  // keeps the original light-on-dark badge styling.
  Infrastructure:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "EDC-V / DCore":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Identity:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  CFM: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Application:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  Seed: "bg-gray-200 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
  Static: "bg-gray-200 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

/** Labels are keys of the docsArchitecture dictionary. */
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

/** An external link inside a translated sentence; <T> fills in the words. */
const ext = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-(--accent) underline hover:opacity-80"
  />
);

export default function ArchitecturePage() {
  const t = useT("docsArchitecture");
  const tc = useT("docsCommon");
  return (
    <DocFigureViewer>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
        >
          <ArrowLeft size={14} /> {tc("Back to Docs")}
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          <T area="nav">{"Architecture"}</T>
        </h1>
        <DocsLastUpdated page="/docs/architecture" />
        <p className="text-(--text-secondary) mb-8">
          {t(
            "The Health Dataspace v2 architecture in ArchiMate 3.2 views, with a sequence diagram wherever an order of messages matters: the five-layer graph model, the data flow, the deployment topology, the service dependencies, the permit and negotiation procedure, and the identity and trust framework. Click a diagram to open it full screen and zoom.",
          )}
        </p>

        {/* Table of Contents */}
        <nav className="border border-(--border) rounded-xl p-5 mb-12 bg-(--surface)">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary) mb-3">
            {t("Contents")}
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {tocItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                >
                  {t(item.label)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 5-Layer Architecture */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="five-layer-model">
            {t("1. Five-Layer Knowledge Graph")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The Neo4j knowledge graph organises health data across five architectural layers: DSP Marketplace (connector discovery), HealthDCAT-AP (dataset metadata), FHIR R4 (clinical data), OMOP CDM (research analytics), and Ontology (terminology alignment).",
            )}
          </p>
          <DocFigure
            file="knowledge-graph-layers.svg"
            alt={t(
              "The five-layer knowledge graph as an ArchiMate information structure view: one band per layer, the node labels as data objects and the Neo4j relationship types as labelled associations",
            )}
            caption={t(
              "Fig 1. Five-layer knowledge graph, with the labels and relationships the seeds create. The FHIR nodes carry the same CODED_BY links as their OMOP counterparts; ICD-10 codes exist on Condition only.",
            )}
          />
        </section>

        {/* Data Flow */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="data-flow">
            {t("2. Data Flow Pipeline")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "Synthetic patient data flows from Synthea generation through FHIR R4 resource loading into Neo4j, then transforms to OMOP CDM for research analytics. Each stage preserves full provenance through graph relationships.",
            )}
          </p>
          <DocFigure
            file="data-flow-sequence.svg"
            alt={t(
              "The same data flow as a sequence diagram: Synthea generates the bundles, the loader writes the FHIR nodes, the Cypher transform maps them to OMOP and copies the codings, the dashboard queries the cohorts",
            )}
            caption={t("Fig 2. End-to-end data flow from Synthea to analytics")}
          />
        </section>

        {/* Deployment */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="deployment">
            {t("3. Deployment Topology")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsArchitecture"
              vars={{ count: COMPOSE_SERVICES, host: "ehds.mabu.red" }}
              tags={{
                a: ext(STATIC_SITE),
                code: <code />,
                adr: ext(
                  `${GITHUB_REPO}/blob/main/docs/ADRs/ADR-012-azure-container-apps.md`,
                ),
              }}
            >
              {
                "The full JAD stack runs {count} Docker Compose services (profiles included) across six layers: infrastructure (Traefik, PostgreSQL, Vault, NATS, Keycloak), EDC-V / DCore (Control Plane, dual Data Planes), Identity (Identity Hub, Issuer Service), CFM (Tenant/Provision Managers, 4 background agents), Application (Neo4j, Proxy, UI), and a <a>static GitHub Pages export</a>. The same topology is deployed to Azure Container Apps at <code>{host}</code> (21 Container Apps and 9 Container Apps jobs on 2026-10-04, see <adr>ADR-012</adr>). Arrows show runtime dependencies."
              }
            </T>
          </p>
          <DocFigure
            file="deployment.svg"
            alt={t(
              "The deployment topology as an ArchiMate technology view: the edge, the application, the EDC-V and identity services and the infrastructure as bands, with the run-time dependencies between them",
            )}
            caption={t(
              "Fig 3. Full deployment topology, {count} services with their dependencies",
              { count: COMPOSE_SERVICES },
            )}
          />
          <div
            className="mt-6 border border-(--border) rounded-lg p-4"
            id="operating-hours"
          >
            <h3 className="font-semibold mb-2">
              {t("Operating hours on Azure")}
            </h3>
            <p className="text-(--text-secondary) text-sm mb-3">
              <T
                area="docsArchitecture"
                tags={{
                  a: ext(
                    `${GITHUB_REPO}/blob/main/docs/ADRs/ADR-053-everything-stops-off-hours.md`,
                  ),
                }}
              >
                {
                  "The Azure deployment runs Monday to Friday, 05:00 to 18:00 UTC, and is stopped outside those hours (<a>ADR-053</a>). Stopping is a real stop through the Container Apps API, not scale-to-zero, because nearly every service is called by another one and would never reach zero replicas. The UI is the exception: it sleeps at zero replicas, wakes for a visitor and serves an offline notice that links the static export."
                }
              </T>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-(--text-secondary)">
                    <th className="py-1 pr-3 font-semibold">{t("Step")}</th>
                    <th className="py-1 pr-3 font-semibold">
                      {t("Evening stop (18:00 UTC)")}
                    </th>
                    <th className="py-1 font-semibold">
                      {t("Morning start (05:00 UTC, Mon to Fri)")}
                    </th>
                  </tr>
                </thead>
                <tbody className="text-(--text-secondary)">
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">1</td>
                    <td className="py-1 pr-3">
                      {t("UI to offline mode, min 0")}
                    </td>
                    <td className="py-1">
                      {t("PostgreSQL Flexible Server, wait until Ready")}
                    </td>
                  </tr>
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">2</td>
                    <td className="py-1 pr-3">
                      {t("20 Container Apps stopped, consumers first")}
                    </td>
                    <td className="py-1">
                      {t("Vault, Keycloak, Neo4j, NATS, proxy, enricher")}
                    </td>
                  </tr>
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">3</td>
                    <td className="py-1 pr-3">
                      {t("PostgreSQL Flexible Server stopped")}
                    </td>
                    <td className="py-1">
                      {t("EDC control plane, data planes, identity, CFM")}
                    </td>
                  </tr>
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">4</td>
                    <td className="py-1 pr-3"></td>
                    <td className="py-1">
                      {t("UI back online, then the Keycloak login check")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-(--text-secondary) text-xs mt-3">
              <T
                area="docsArchitecture"
                tags={{
                  code: <code />,
                  a: ext(
                    `${GITHUB_REPO}/blob/main/docs/knowledge/runbooks/live-demo-off-hours.md`,
                  ),
                }}
              >
                {
                  "Berlin public holidays skip the start. The catalog crawler runs in office hours only. A night or weekend session holds the stack with the repository variable <code>LIVE_DEMO_HOLD_UNTIL</code>; see the <a>off-hours runbook</a>."
                }
              </T>
            </p>
          </div>
        </section>

        {/* Service Dependencies Table */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="service-dependencies">
            {t("4. Service Dependencies")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "Complete inventory of all services in the docker-compose.yml and docker-compose.jad.yml stacks, their exposed ports, upstream dependencies, and purpose.",
            )}
          </p>
          <div className="overflow-x-auto border border-(--border) rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border) bg-(--surface)">
                  <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                    {t("Service")}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                    {t("Layer")}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                    {t("Port(s)")}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                    {t("Depends On")}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-(--text-primary)">
                    {t("Purpose")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc, i) => (
                  <tr
                    key={svc.name}
                    className={`border-b border-(--border) ${
                      i % 2 === 0 ? "" : "bg-(--surface)/30"
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-(--text-primary) whitespace-nowrap">
                      {svc.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          layerColors[svc.layer] || ""
                        }`}
                      >
                        {t(svc.layer)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-(--text-secondary) font-mono text-xs whitespace-nowrap">
                      {svc.port}
                    </td>
                    <td className="px-4 py-2.5 text-(--text-secondary) text-xs">
                      {t(svc.depends)}
                    </td>
                    <td className="px-4 py-2.5 text-(--text-secondary) text-xs">
                      {t(svc.purpose, svc.vars)}
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
            {t("5. DSP Contract Negotiation")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The Dataspace Protocol (DSP) governs how data holders and data users negotiate access to health datasets. The EHDS regulation adds HDAB approval as a pre-requisite for data permit issuance before contract negotiation can proceed.",
            )}
          </p>
          <DocFigure
            file="dsp-negotiation-sequence.svg"
            alt={t(
              "DSP contract negotiation as a sequence diagram: the user queries the catalogue, applies to the access body and receives the permit as a credential, then negotiates the contract with the holder, who verifies the permit and evaluates the policy before agreeing and transferring the data",
            )}
            caption={t(
              "Fig 4. DSP contract negotiation with the EHDS data permit",
            )}
          />
          <DocFigure
            file="dsp-negotiation.svg"
            alt={t(
              "Data permit and contract negotiation as an ArchiMate business process cooperation view: the access body assesses and issues the permit, the user queries, applies, negotiates and requests the transfer, the holder verifies, evaluates, agrees and transfers, over the application services",
            )}
            caption={t(
              "Fig 5. The same procedure as an ArchiMate business process view: three phases, the roles and the services",
            )}
          />
        </section>

        {/* Identity & Trust */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="identity-trust">
            {t("6. Identity & Trust Framework")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The Decentralized Claims Protocol (DCP) manages identity, credentials, and trust. Identity Hub stores DIDs and Verifiable Credentials, the Issuer Service mints EHDS-specific credentials, and Keycloak provides SSO/OIDC authentication.",
            )}
          </p>
          <DocFigure
            file="identity-trust.svg"
            alt={t(
              "Identity and trust as an ArchiMate application cooperation view: the trust anchors, the DCP identity layer with Identity Hub, Issuer Service and the Secure Token Service, the five credentials the issuer defines, and the interfaces the tokens protect",
            )}
            caption={t("Fig 6. DCP identity and trust architecture")}
          />
        </section>

        {/* SIMPL-Open & Compliance */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="simpl-compliance">
            {t("7. SIMPL-Open & Compliance")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "The hub connects to the EU's Simpl-Open middleware as an EDC connector outside the Simpl-Open agent, over DSP and DCP, and trusts a Simpl data space's Governance Authority as an issuer (ADR-064). It claims no alignment: a capability counts only with a published Simpl source and a check in the hub that exercises it.",
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("How the hub connects to Simpl-Open")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1.5 list-disc ml-4">
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>Connector outside the agent:</b> DSP 2025-1 for catalogue, negotiation and transfer; no x509 or mTLS trust inside a Simpl-Open agent"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>Credentials over DCP v1.0:</b> a Governance Authority is a trusted issuer in the IdentityHub for its own credential types; the hub's IssuerService keeps issuing the hub's credentials"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>EHDS rules stay in the hub:</b> data permits, the right to opt out (Art. 71), fees and the gate in front of the secure processing environments"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>Catalogue:</b> HealthDCAT-AP Release 8 (ADR-063), offered as a profile of the DCAT-AP model Simpl adopts in Innsbruck"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>Still to prove:</b> the DSP compatibility kit against a Simpl connector, and a negotiation with a Governance Authority credential, once the Hamburg 4.1 code is public"
                    }
                  </T>
                </li>
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Regulatory Compliance")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1.5 list-disc ml-4">
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>EHDS Art. 3-12:</b> Patient rights (access, rectification, portability)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>EHDS Art. 50-51:</b> Secondary use, HDAB approval, data permits"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {"<b>GDPR Art. 15-22:</b> Data subject rights enforcement"}
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>EU CRA Art. 13:</b> SBOM mandate, vulnerability disclosure"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsArchitecture" tags={{ b: <strong /> }}>
                    {
                      "<b>BSI C5:</b> Cloud security baseline (DEV, OPS controls)"
                    }
                  </T>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/simpl-ehds-gap-analysis.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-(--accent) hover:underline inline-flex items-center gap-1"
            >
              {t("SIMPL-Open Gap Analysis")} &rarr;
            </a>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-(--accent) hover:underline inline-flex items-center gap-1"
            >
              {t("ADR-064: Simpl-Open interoperability")} &rarr;
            </a>
            <Link
              href="/docs/developer/quality-gates"
              className="text-sm text-(--accent) hover:underline inline-flex items-center gap-1"
            >
              {t("Quality Gates")} &rarr;
            </Link>
            <a
              href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ehds-data-planes.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-(--accent) hover:underline inline-flex items-center gap-1"
            >
              {t("EHDS Data Planes (20 future planes)")} &rarr;
            </a>
          </div>
        </section>

        {/* ADRs */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="adrs">
            {t("8. Architecture Decision Records")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsArchitecture"
              vars={{ count: facts.adrs.length }}
              tags={{
                a: (
                  <ExternalA
                    href={`${GITHUB_REPO}/tree/main/docs/ADRs`}
                    className="text-indigo-700 dark:text-indigo-400 underline inline-flex items-center gap-1"
                    iconSize={10}
                  />
                ),
              }}
            >
              {
                "All {count} ADRs are maintained as standalone Markdown files in <a>docs/ADRs/</a>."
              }
            </T>
          </p>
          <div className="space-y-3">
            {facts.adrs.map((adr) => (
              <a
                key={adr.id}
                href={`${GITHUB_REPO}/blob/main/docs/ADRs/${adr.file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-(--border) rounded-lg px-4 py-3 flex items-start gap-3 hover:border-indigo-500/50 transition-colors"
              >
                <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/50 px-2 py-0.5 rounded-sm shrink-0">
                  {adr.id}
                </span>
                <div>
                  <span className="font-semibold text-sm">{adr.title}</span>
                  <p className="text-(--text-secondary) text-xs mt-0.5">
                    {t(adr.status)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Legend */}
        <section className="border border-(--border) rounded-xl p-6">
          <h3 className="font-semibold mb-3">
            {t("Diagram legend (ArchiMate 3.2)")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-(--text-secondary)">
            <div>
              <span className="inline-block w-3 h-3 rounded-sm bg-[#FFFFB5] border border-(--border) mr-1 align-middle" />{" "}
              {t(
                "Yellow: business layer, the roles and the processes they perform",
              )}
            </div>
            <div>
              <span className="inline-block w-3 h-3 rounded-sm bg-[#B5FFFF] border border-(--border) mr-1 align-middle" />{" "}
              {t(
                "Blue: application layer, services, components and data objects",
              )}
            </div>
            <div>
              <span className="inline-block w-3 h-3 rounded-sm bg-[#C9E7B7] border border-(--border) mr-1 align-middle" />{" "}
              {t("Green: technology layer, nodes, system software and devices")}
            </div>
            <div>
              <T
                area="docsArchitecture"
                tags={{
                  a: ext(`${GITHUB_REPO}/tree/main/docs/architecture/diagrams`),
                }}
              >
                {
                  "Open arrow: serving. Hollow dotted head: realization. Filled head: triggering. Dashed: flow. Dotted without head: access. Dot: assignment. Each diagram repeats its legend; the sources are in <a>docs/architecture/diagrams</a>."
                }
              </T>
            </div>
          </div>
        </section>
      </div>
    </DocFigureViewer>
  );
}
