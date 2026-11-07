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
  /** Where the name comes from: a release tag or the compose definition. */
  href: string;
}

const services: ServiceInfo[] = [
  {
    name: "Traefik v3.7",
    href: "https://github.com/traefik/traefik/releases/tag/v3.7.0",
    port: ":80 / :8090",
    depends: "--",
    purpose: "API gateway, reverse proxy, *.localhost routing",
    layer: "Infrastructure",
  },
  {
    name: "PostgreSQL 17.7",
    href: "https://www.postgresql.org/docs/17/release-17-7.html",
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
    name: "HashiCorp Vault 2.0",
    href: "https://github.com/hashicorp/vault/releases/tag/v2.0.0",
    port: ":8200",
    depends: "--",
    purpose:
      "Secrets store with file storage, so a restart keeps every key (since 2026-09-26; on Azure it stores in the Flexible Server, <adr46>ADR-046</adr46>)",
    layer: "Infrastructure",
  },
  {
    name: "NATS JetStream 2.14.3",
    href: "https://github.com/nats-io/nats-server/releases/tag/v2.14.3",
    port: ":4222 / :8222",
    depends: "--",
    purpose: "Async event mesh for <dsp>DSP</dsp> protocol events",
    layer: "Infrastructure",
  },
  {
    name: "Keycloak 26.8.0",
    href: "https://github.com/keycloak/keycloak/releases/tag/26.8.0",
    port: ":8080 / :9000",
    depends: "PostgreSQL",
    purpose:
      "<oidc>OIDC</oidc> SSO provider, realm edcv: <realm>8 demo users and a service account</realm>, holding 6 of the realm's 10 roles",
    layer: "Infrastructure",
  },
  {
    name: "vault-bootstrap",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L251",
    port: "--",
    depends: "Vault, Keycloak",
    purpose: "Init sidecar: seeds Vault secrets and Keycloak config",
    layer: "Infrastructure",
  },
  {
    name: "vault-unseal",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L138",
    port: "--",
    depends: "Vault",
    purpose:
      "Sidecar: initialises Vault once, then unseals it after every restart",
    layer: "Infrastructure",
  },
  {
    name: "siglet 0.1.6",
    href: "https://github.com/eclipse-dataplane-core/dsdk-facet-rs/releases/tag/siglet-v0.1.6",
    port: "--",
    depends: "Vault",
    purpose:
      "The data plane on EDC 1.0: answers the control plane's Data Plane Signaling and issues the access token; the Neo4j proxy serves the data (<adr78>ADR-078</adr78>)",
    layer: "EDC",
  },
  {
    name: "Control Plane",
    href: "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5",
    port: ":11003",
    depends: "PostgreSQL, Vault, NATS, Keycloak",
    purpose:
      "EDC 1.0 control plane built from <src>runtimes/edc</src>: <dsp>DSP</dsp> negotiation, management API, policy engine (<adr78>ADR-078</adr78>)",
    layer: "EDC",
  },
  {
    name: "Data Plane FHIR",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L437",
    port: ":11002",
    depends: "PostgreSQL, Vault, Control Plane",
    purpose:
      "Only with the edc018 profile: the EDC 0.18 data plane for <fhir>FHIR R4</fhir> transfers, retired with <issue927>#927</issue927>",
    layer: "EDC",
  },
  {
    name: "Data Plane OMOP",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L516",
    port: ":11012",
    depends: "PostgreSQL, Vault, Control Plane",
    purpose:
      "Only with the edc018 profile: the EDC 0.18 data plane for <omop>OMOP CDM</omop> transfers, retired with <issue927>#927</issue927>",
    layer: "EDC",
  },
  {
    name: "Identity Hub",
    href: "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5",
    port: ":11005",
    depends: "PostgreSQL, Vault, Keycloak",
    purpose: "<dcp>DCP</dcp>: DID resolution, Verifiable Credential storage",
    layer: "Identity",
  },
  {
    name: "Issuer Service",
    href: "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5",
    port: ":10013",
    depends: "PostgreSQL, Vault, Keycloak",
    purpose:
      "VC issuance: EHDS membership, <permit>data permits</permit>, org credentials",
    layer: "Identity",
  },
  {
    name: "Tenant Manager",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L853",
    port: ":11006",
    depends: "PostgreSQL, Keycloak",
    purpose:
      "Only with the edc018 profile: <cfm>CFM</cfm> multi-tenant participant management, retired with <issue927>#927</issue927>",
    layer: "CFM",
  },
  {
    name: "Provision Manager",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L895",
    port: ":11007",
    depends: "PostgreSQL, Keycloak, Control Plane",
    purpose:
      "Only with the edc018 profile: <cfm>CFM</cfm> resource provisioning, retired with <issue927>#927</issue927>",
    layer: "CFM",
  },
  {
    name: "cfm-cp-shim",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L934",
    port: "--",
    depends: "Control Plane",
    purpose:
      "Only with the edc018 profile: nginx shim, the 2026-03 CFM agents call Management API v5alpha, EDC 0.18 serves v5beta (<issue181>#181</issue181>)",
    layer: "CFM",
  },
  {
    name: "cfm-keycloak-agent",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L963",
    port: "--",
    depends: "Keycloak",
    purpose:
      "Only with the edc018 profile: syncs the Keycloak realm configuration",
    layer: "CFM",
  },
  {
    name: "cfm-edcv-agent",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L992",
    port: "--",
    depends: "Control Plane",
    purpose:
      "Only with the edc018 profile: manages the EDC 0.18 connector lifecycle",
    layer: "CFM",
  },
  {
    name: "cfm-registration-agent",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L1021",
    port: "--",
    depends: "Identity Hub",
    purpose: "Only with the edc018 profile: registers participant DIDs",
    layer: "CFM",
  },
  {
    name: "cfm-onboarding-agent",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L1052",
    port: "--",
    depends: "Tenant Manager",
    purpose: "Only with the edc018 profile: automates tenant onboarding",
    layer: "CFM",
  },
  {
    name: "Neo4j 5.26.28",
    href: "https://github.com/neo4j/neo4j/releases/tag/5.26.28",
    port: ":7474 / :7687",
    depends: "--",
    purpose:
      "Knowledge graph: 5-layer model, with the <apoc>APOC</apoc>, <apocx>APOC Extended</apocx>, <gds>Graph Data Science</gds> and <n10s>n10s</n10s> plugins",
    layer: "Application",
  },
  {
    name: "Neo4j SPE2",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.yml#L29",
    port: ":7475 / :7688",
    depends: "--",
    purpose: "Secondary graph instance (federated profile)",
    layer: "Application",
  },
  {
    name: "Neo4j Proxy",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L596",
    port: ":9090",
    depends: "Neo4j, Control Plane",
    purpose:
      "<express>Express</express> bridge: <fhir>FHIR</fhir>/<omop>OMOP</omop> REST endpoints over Neo4j",
    layer: "Application",
  },
  {
    name: "Next.js UI",
    href: "https://github.com/vercel/next.js/releases/tag/v15.5.28",
    port: ":3000 / :3003",
    depends: "Neo4j Proxy",
    purpose:
      "Persona overviews, catalog, governance and exchange: {pages} pages, {routes} API routes",
    vars: { pages: facts.uiPages.length, routes: facts.apiRoutes.length },
    layer: "Application",
  },
  {
    name: "jad-seed",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L1092",
    port: "--",
    depends: "All services",
    purpose:
      "Only with the seed and edc018 profiles: one-shot seeding through CFM; on EDC 1.0, <seed>seed-identity-layer.sh</seed> creates the participants",
    layer: "Seed",
  },
  {
    name: "GitHub Pages",
    href: "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.github/workflows/pages.yml",
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
  EDC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
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

/** Links inside the service table's purpose texts, by tag name. */
const SERVICE_TAGS = {
  adr46: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md",
  ),
  dsp: ext(
    "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
  ),
  dcp: ext(
    "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
  ),
  permit: ext("https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68"),
  express: ext("https://github.com/expressjs/express/releases/tag/v5.3.0"),
  fhir: ext("https://hl7.org/fhir/R4/"),
  omop: ext("https://ohdsi.github.io/CommonDataModel/cdm54.html"),
  oidc: ext("https://openid.net/specs/openid-connect-core-1_0.html"),
  realm: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/jad/keycloak-realm.json#L541-L670",
  ),
  adr78: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md",
  ),
  src: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/tree/main/runtimes/edc",
  ),
  issue927: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/927",
  ),
  cfm: ext("https://github.com/Metaform/connector-fabric-manager"),
  issue181: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/181",
  ),
  apoc: ext("https://neo4j.com/docs/apoc/5/"),
  apocx: ext("https://github.com/neo4j-contrib/neo4j-apoc-procedures"),
  gds: ext("https://neo4j.com/docs/graph-data-science/current/"),
  n10s: ext("https://neo4j.com/labs/neosemantics/"),
  seed: ext(
    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/seed-identity-layer.sh",
  ),
};

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
          <T
            area="docsArchitecture"
            tags={{
              archimate: ext(
                "https://pubs.opengroup.org/architecture/archimate32-doc/",
              ),
            }}
          >
            {
              "The Health Dataspace v2 architecture in <archimate>ArchiMate 3.2</archimate> views, with a sequence diagram wherever an order of messages matters: the five-layer graph model, the data flow, the deployment topology, the service dependencies, the permit and negotiation procedure, and the identity and trust framework. Click a diagram to open it full screen and zoom."
            }
          </T>
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
            <T
              area="docsArchitecture"
              tags={{
                neo: ext("https://github.com/neo4j/neo4j/releases/tag/5.26.28"),
                dsp: ext(
                  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
                ),
                hdcat: ext(
                  "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
                ),
                fhir: ext("https://hl7.org/fhir/R4/"),
                omop: ext("https://ohdsi.github.io/CommonDataModel/cdm54.html"),
              }}
            >
              {
                "The <neo>Neo4j</neo> knowledge graph organises health data across five architectural layers: <dsp>DSP</dsp> Marketplace (connector discovery), <hdcat>HealthDCAT-AP</hdcat> (dataset metadata), <fhir>FHIR R4</fhir> (clinical data), <omop>OMOP CDM</omop> (research analytics), and Ontology (terminology alignment)."
              }
            </T>
          </p>
          <DocFigure
            file="knowledge-graph-layers.svg"
            alt={t(
              "The five-layer knowledge graph as an ArchiMate information structure view: one band per layer, the node labels as data objects and the Neo4j relationship types as labelled associations",
            )}
            caption=<T
              area="docsArchitecture"
              tags={{
                fhir: ext("https://hl7.org/fhir/R4/"),
                omop: ext("https://ohdsi.github.io/CommonDataModel/cdm54.html"),
                icd: ext(
                  "https://www.nlm.nih.gov/research/umls/sourcereleasedocs/current/ICD10CM/index.html",
                ),
              }}
            >
              {
                "Fig 1. Five-layer knowledge graph, with the labels and relationships the seeds create. The <fhir>FHIR</fhir> nodes carry the same CODED_BY links as their <omop>OMOP</omop> counterparts; <icd>ICD-10</icd> codes exist on Condition only."
              }
            </T>
          />
        </section>

        {/* Data Flow */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="data-flow">
            {t("2. Data Flow Pipeline")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsArchitecture"
              tags={{
                synthea: ext(
                  "https://github.com/synthetichealth/synthea/releases/tag/v3.3.0",
                ),
                fhir: ext("https://hl7.org/fhir/R4/"),
                omop: ext("https://ohdsi.github.io/CommonDataModel/cdm54.html"),
              }}
            >
              {
                "Synthetic patient data flows from <synthea>Synthea</synthea> generation through <fhir>FHIR R4</fhir> resource loading into Neo4j, then transforms to <omop>OMOP CDM</omop> for research analytics. Each stage preserves full provenance through graph relationships."
              }
            </T>
          </p>
          <DocFigure
            file="data-flow-sequence.svg"
            alt={t(
              "The same data flow as a sequence diagram: Synthea generates the bundles, the loader writes the FHIR nodes, the Cypher transform maps them to OMOP and copies the codings, the dashboard queries the cohorts",
            )}
            caption=<T
              area="docsArchitecture"
              tags={{
                synthea: ext(
                  "https://github.com/synthetichealth/synthea/releases/tag/v3.3.0",
                ),
              }}
            >
              {
                "Fig 2. End-to-end data flow from <synthea>Synthea</synthea> to analytics"
              }
            </T>
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
                jad: ext(
                  "https://github.com/Metaform/jad/blob/4a7e5bd096c58814748e956cc9329586ad309698/README.md#L3",
                ),
                siglet: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L1124-L1132",
                ),
                adr78: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md",
                ),
                a: ext(STATIC_SITE),
                edc018: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml#L437-L441",
                ),
                aca: ext(
                  "https://learn.microsoft.com/en-us/azure/container-apps/overview",
                ),
                code: <code />,
                adr: ext(
                  `${GITHUB_REPO}/blob/main/docs/ADRs/ADR-012-azure-container-apps.md`,
                ),
                apps: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/azure/offhours.sh#L68-L76",
                ),
              }}
            >
              {
                "The stack grew out of <jad>JAD</jad> and runs {count} Docker Compose services, profiles included: infrastructure (Traefik, PostgreSQL, Vault, NATS, Keycloak), EDC 1.0 (the control plane, with <siglet>siglet</siglet> as its data plane, <adr78>ADR-078</adr78>), identity (Identity Hub, Issuer Service), application (Neo4j, proxy, UI) and a <a>static GitHub Pages export</a>. The CFM services and the EDC 0.18 data planes start only with the <edc018>edc018 profile</edc018>. The same topology runs on <aca>Azure Container Apps</aca> at <code>{host}</code> (<adr>ADR-012</adr>); the apps there are the ones the <apps>off-hours script</apps> stops and starts. Arrows show runtime dependencies."
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
                  adr58: ext(
                    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md#L29-L31",
                  ),
                  api: ext(
                    "https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/stop",
                  ),
                }}
              >
                {
                  "The Azure deployment runs Monday to Friday, 05:17 to 18:13 UTC, and is stopped outside those hours (<a>ADR-053</a>); two Container Apps jobs trigger the stop and the start (<adr58>ADR-058</adr58>). Stopping is a real stop through the <api>Container Apps API</api>, not scale-to-zero, because nearly every service is called by another one and would never reach zero replicas. The UI is the exception: it sleeps at zero replicas, wakes for a visitor and serves an offline notice that links the static export."
                }
              </T>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-(--text-secondary)">
                    <th className="py-1 pr-3 font-semibold">{t("Step")}</th>
                    <th className="py-1 pr-3 font-semibold">
                      <T area="docsArchitecture" tags={{}}>
                        {"Evening stop (18:13 UTC)"}
                      </T>
                    </th>
                    <th className="py-1 font-semibold">
                      <T area="docsArchitecture" tags={{}}>
                        {"Morning start (05:17 UTC, Mon to Fri)"}
                      </T>
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
                      <T
                        area="docsArchitecture"
                        tags={{
                          pg: ext(
                            "https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-stop-start-server-portal",
                          ),
                        }}
                      >
                        {
                          "<pg>PostgreSQL Flexible Server</pg>, wait until Ready"
                        }
                      </T>
                    </td>
                  </tr>
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">2</td>
                    <td className="py-1 pr-3">
                      <T
                        area="docsArchitecture"
                        tags={{
                          apps: ext(
                            "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/azure/offhours.sh#L68-L76",
                          ),
                        }}
                      >
                        {
                          "<apps>21 Container Apps</apps> stopped, consumers first"
                        }
                      </T>
                    </td>
                    <td className="py-1">
                      <T
                        area="docsArchitecture"
                        tags={{
                          core: ext(
                            "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/azure/offhours.sh#L77-L78",
                          ),
                        }}
                      >
                        {
                          "<core>Vault, Keycloak, Neo4j, NATS, proxy, enricher, federation, observability</core>"
                        }
                      </T>
                    </td>
                  </tr>
                  <tr className="border-t border-(--border)">
                    <td className="py-1 pr-3">3</td>
                    <td className="py-1 pr-3">
                      <T
                        area="docsArchitecture"
                        tags={{
                          pg: ext(
                            "https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-stop-start-server-portal",
                          ),
                        }}
                      >
                        {"<pg>PostgreSQL Flexible Server</pg> stopped"}
                      </T>
                    </td>
                    <td className="py-1">
                      <T
                        area="docsArchitecture"
                        tags={{
                          edcapps: ext(
                            "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/azure/offhours.sh#L79-L81",
                          ),
                        }}
                      >
                        {
                          "<edcapps>EDC control plane, data planes, identity, CFM</edcapps>"
                        }
                      </T>
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
                  hol: ext(
                    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/azure/offhours.sh#L172",
                  ),
                  crawl: ext(
                    "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-053-everything-stops-off-hours.md#L51",
                  ),
                  code: <code />,
                  a: ext(
                    `${GITHUB_REPO}/blob/main/docs/knowledge/runbooks/live-demo-off-hours.md`,
                  ),
                }}
              >
                {
                  "<hol>Berlin public holidays</hol> skip the start. The catalog crawler runs in <crawl>office hours only</crawl>. A night or weekend session holds the stack with the repository variable <code>LIVE_DEMO_HOLD_UNTIL</code>; see the <a>off-hours runbook</a>."
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
            <T
              area="docsArchitecture"
              tags={{
                c1: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.yml",
                ),
                c2: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docker-compose.jad.yml",
                ),
              }}
            >
              {
                "Complete inventory of all services in the <c1>docker-compose.yml</c1> and <c2>docker-compose.jad.yml</c2> stacks, their exposed ports, upstream dependencies, and purpose."
              }
            </T>
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
                      <a
                        href={svc.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted hover:text-(--accent)"
                      >
                        {svc.name}
                      </a>
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
                      <T
                        area="docsArchitecture"
                        vars={svc.vars}
                        tags={SERVICE_TAGS}
                      >
                        {svc.purpose}
                      </T>
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
            <T
              area="docsArchitecture"
              tags={{
                dsp: ext(
                  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
                ),
                hdab: ext(
                  "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_55",
                ),
                permit: ext(
                  "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68",
                ),
              }}
            >
              {
                "The <dsp>Dataspace Protocol</dsp> (DSP) governs how data holders and data users negotiate access to health datasets. The EHDS regulation adds <hdab>HDAB approval</hdab> as a pre-requisite for <permit>data permit</permit> issuance before contract negotiation can proceed."
              }
            </T>
          </p>
          <DocFigure
            file="dsp-negotiation-sequence.svg"
            alt={t(
              "DSP contract negotiation as a sequence diagram: the user queries the catalogue, applies to the access body and receives the permit as a credential, then negotiates the contract with the holder, who verifies the permit and evaluates the policy before agreeing and transferring the data",
            )}
            caption=<T
              area="docsArchitecture"
              tags={{
                dsp: ext(
                  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
                ),
                permit: ext(
                  "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68",
                ),
              }}
            >
              {
                "Fig 4. <dsp>DSP</dsp> contract negotiation with the <permit>EHDS data permit</permit>"
              }
            </T>
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
            <T
              area="docsArchitecture"
              tags={{
                dcp: ext(
                  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
                ),
                ih: ext(
                  "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5",
                ),
                kc: ext(
                  "https://github.com/keycloak/keycloak/releases/tag/26.8.0",
                ),
                oidc: ext(
                  "https://openid.net/specs/openid-connect-core-1_0.html",
                ),
              }}
            >
              {
                "The <dcp>Decentralized Claims Protocol</dcp> (DCP) manages identity, credentials, and trust. <ih>Identity Hub</ih> stores DIDs and Verifiable Credentials, the Issuer Service mints EHDS-specific credentials, and <kc>Keycloak</kc> provides SSO/<oidc>OIDC</oidc> authentication."
              }
            </T>
          </p>
          <DocFigure
            file="identity-trust.svg"
            alt={t(
              "Identity and trust as an ArchiMate application cooperation view: the trust anchors, the DCP identity layer with Identity Hub, Issuer Service and the Secure Token Service, the five credentials the issuer defines, and the interfaces the tokens protect",
            )}
            caption=<T
              area="docsArchitecture"
              tags={{
                dcp: ext(
                  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
                ),
              }}
            >
              {"Fig 6. <dcp>DCP</dcp> identity and trust architecture"}
            </T>
          />
        </section>

        {/* SIMPL-Open & Compliance */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-3" id="simpl-compliance">
            {t("7. SIMPL-Open & Compliance")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsArchitecture"
              tags={{
                adr: ext(
                  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-064-simpl-open-through-the-outside-agent-dcp-path.md",
                ),
                art71: ext(
                  "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_71",
                ),
              }}
            >
              {
                "The hub and the EU's Simpl-Open middleware stand on the same foundation: both run Eclipse EDC connectors, speak the Dataspace Protocol and admit participants with credentials from an authority they trust. The hub joins a Simpl data space as an EDC connector outside the Simpl-Open agent (<adr>ADR-064</adr>) and brings what health adds on top: FHIR and OMOP semantics, data permits, the right to opt out (<art71>Art. 71</art71>), fees and the gate in front of the secure processing environments."
              }
            </T>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("What the hub and Simpl-Open share")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1.5 list-disc ml-4">
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      edc: ext("https://github.com/eclipse-edc/Connector"),
                      simpl: ext(
                        "https://code.europa.eu/simpl/simpl-open/development/gaia-x-edc/simpl-edc/-/blob/v1.0.26/pom.xml#L16",
                      ),
                      dsp: ext(
                        "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
                      ),
                    }}
                  >
                    {
                      "<b>One connector:</b> both run <edc>Eclipse EDC</edc>, Simpl in its <simpl>simpl-edc</simpl> connector, and speak the <dsp>Dataspace Protocol</dsp> for catalogue, negotiation and transfer"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      dcp: ext(
                        "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
                      ),
                      trust: ext(
                        "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/710",
                      ),
                    }}
                  >
                    {
                      "<b>Trust from an authority:</b> a Simpl data space's Governance Authority can be a trusted issuer in the hub's IdentityHub, over <dcp>DCP v1.0</dcp>; checked on compose with a stand-in authority (<trust>#710</trust>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      qa: ext(
                        "https://simpl-programme.ec.europa.eu/landing-page/code-and-impact-qa",
                      ),
                    }}
                  >
                    {
                      "<b>Bilateral agreements:</b> a provider and a consumer agree, and the provider's connector enforces the policy (<qa>Simpl Q&A</qa>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      dcatap: ext(
                        "https://semiceu.github.io/DCAT-AP/releases/3.0.0/",
                      ),
                      roadmap: ext(
                        "https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q4",
                      ),
                      hdcat: ext(
                        "https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-8/",
                      ),
                      adr63: ext(
                        "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md",
                      ),
                    }}
                  >
                    {
                      "<b>DCAT-AP catalogues:</b> Simpl adopts <dcatap>DCAT-AP</dcatap> in <roadmap>Innsbruck</roadmap>, and the hub's <hdcat>HealthDCAT-AP Release 8</hdcat> is its health profile (<adr63>ADR-063</adr63>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      arch: ext(
                        "https://simpl-programme.ec.europa.eu/documentation/architecture",
                      ),
                    }}
                  >
                    {
                      "<b>Data stays with its holder:</b> both federate, and neither copies data into a central store (<arch>Simpl architecture</arch>)"
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
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      art3: ext(
                        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_3",
                      ),
                    }}
                  >
                    {
                      "<b>EHDS, primary use:</b> rights of natural persons (<art3>Art. 3 to 10</art3>): access, insertion, rectification, portability, restriction, information on access, opt-out"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      art53: ext(
                        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_53",
                      ),
                      art55: ext(
                        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_55",
                      ),
                      art67: ext(
                        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_67",
                      ),
                      art68: ext(
                        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68",
                      ),
                    }}
                  >
                    {
                      "<b>EHDS, secondary use:</b> permitted purposes (<art53>Art. 53</art53>), health data access bodies (<art55>Art. 55</art55>), applications and data permits (<art67>Art. 67</art67>, <art68>68</art68>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      gdpr: ext(
                        "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_15",
                      ),
                    }}
                  >
                    {
                      "<b>GDPR:</b> rights of the data subject (<gdpr>Art. 15 to 22</gdpr>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      cra13: ext(
                        "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng#art_13",
                      ),
                      anx: ext(
                        "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng#anx_I",
                      ),
                      cra14: ext(
                        "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng#art_14",
                      ),
                    }}
                  >
                    {
                      "<b>Cyber Resilience Act:</b> a software bill of materials and a coordinated vulnerability disclosure policy (<cra13>Art. 13</cra13>, <anx>Annex I Part II</anx>); reporting under <cra14>Art. 14</cra14>"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsArchitecture"
                    tags={{
                      b: <strong />,
                      c5: ext(
                        "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf",
                      ),
                      gap: (
                        <Link
                          href="/docs/security/bsi-c5-gap-analysis"
                          className="text-(--accent) underline hover:opacity-80"
                        />
                      ),
                    }}
                  >
                    {
                      "<b>BSI C5:</b> the cloud security criteria of <c5>C5:2020</c5>, domains DEV and OPS (<gap>the hub against C5</gap>)"
                    }
                  </T>
                </li>
              </ul>
            </div>
          </div>
          <div className="border border-(--border) rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-sm mb-2">
              {t("Next steps toward interoperability")}
            </h4>
            <ol className="text-(--text-secondary) text-xs space-y-1.5 list-decimal ml-4 mb-3">
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    issuer: ext(
                      "https://code.europa.eu/simpl/simpl-open/security/credential-management/vc-issuance-verification/issuer-service/issuer-service-be/-/blob/v1.6.0/README.md#L29-32",
                    ),
                    ih: ext("https://github.com/eclipse-edc/IdentityHub"),
                  }}
                >
                  {
                    "<b>Now:</b> a credential from Simpl's own <issuer>issuer service</issuer> in the hub's <ih>IdentityHub</ih>: Simpl signs JSON-LD credentials with Ed25519, and the test is whether the hub verifies one and a negotiation completes on it"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    tck: ext("https://github.com/eclipse-dataspacetck/dsp-tck"),
                    pom: ext(
                      "https://code.europa.eu/simpl/simpl-open/development/gaia-x-edc/simpl-edc/-/blob/v1.0.26/pom.xml#L16",
                    ),
                    dsp: ext(
                      "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/",
                    ),
                    branch: ext(
                      "https://code.europa.eu/simpl/simpl-open/development/gaia-x-edc/simpl-edc/-/blob/feature/SIMPL-24762_update_edc_to_0_16_0/pom.xml#L16",
                    ),
                  }}
                >
                  {
                    "<b>Now:</b> the <tck>DSP compatibility kit</tck> against Simpl's published connector: <pom>release 1.0.26 builds on EDC 0.10.1</pom>, older than <dsp>DSP 2025-1</dsp>, and the <branch>upgrade to EDC 0.17.0</branch> is not merged; the gaps go to the Simpl programme"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    ak: ext(
                      "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/ui/src/lib/journey-config.ts#L36-L41",
                    ),
                    trust: ext(
                      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/710",
                    ),
                  }}
                >
                  {
                    "<b>Now:</b> a second data space on compose, whose Governance Authority admits a fictional insurer, <ak>AlphaKasse DE</ak>, on the trust built in <trust>#710</trust>"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    plan: ext(
                      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934",
                    ),
                  }}
                >
                  {
                    "<b>Now:</b> a use case across both sectors: AlphaKasse rewards an active year with a bonus and receives only a yes or no, never the data behind it (<plan>#934</plan>)"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    roadmap: ext(
                      "https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q4",
                    ),
                    edc1: ext(
                      "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5",
                    ),
                    dcp: ext(
                      "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/",
                    ),
                    ihr: ext(
                      "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5",
                    ),
                  }}
                >
                  {
                    "<b>With Simpl's move to DCP</b> (<roadmap>SSI Tier 2, Innsbruck</roadmap>): <edc1>EDC 1.0</edc1> in the same step, since <dcp>DCP v1.0</dcp>, the IdentityHub and the IssuerService <ihr>ship with it</ihr>"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsArchitecture"
                  tags={{
                    b: <strong />,
                    dcatap: ext(
                      "https://semiceu.github.io/DCAT-AP/releases/3.0.0/",
                    ),
                    roadmap: ext(
                      "https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q4",
                    ),
                  }}
                >
                  {
                    "<b>With Innsbruck:</b> the hub's catalogue as the health profile of Simpl's <dcatap>DCAT-AP</dcatap> model (<roadmap>roadmap</roadmap>), and search across both data spaces"
                  }
                </T>
              </li>
            </ol>
            <p className="text-(--text-secondary) text-xs">
              <T
                area="docsArchitecture"
                tags={{
                  a: ext(
                    "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934",
                  ),
                  art54: ext(
                    "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_54",
                  ),
                }}
              >
                {
                  "The plan, the use case and its legal guardrails are in <a>issue #934</a>. <art54>EHDS Art. 54</art54> keeps the bonus on the person's side: no premium or exclusion is ever decided from secondary-use data."
                }
              </T>
            </p>
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
            <T
              area="docsArchitecture"
              tags={{
                archimate: ext(
                  "https://pubs.opengroup.org/architecture/archimate32-doc/",
                ),
              }}
            >
              {"Diagram legend (<archimate>ArchiMate 3.2</archimate>)"}
            </T>
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
                  rel: ext(
                    "https://pubs.opengroup.org/architecture/archimate32-doc/chap05.html",
                  ),
                  a: ext(`${GITHUB_REPO}/tree/main/docs/architecture/diagrams`),
                }}
              >
                {
                  "<rel>Open arrow</rel>: serving. Hollow dotted head: realization. Filled head: triggering. Dashed: flow. Dotted without head: access. Dot: assignment. Each diagram repeats its legend; the sources are in <a>docs/architecture/diagrams</a>."
                }
              </T>
            </div>
          </div>
        </section>
      </div>
    </DocFigureViewer>
  );
}
