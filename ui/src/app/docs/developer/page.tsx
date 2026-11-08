"use client";
import { BASE_PATH } from "@/lib/static-export";

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
// What `docker compose up` starts: the services in no profile. The edc018,
// trust-check and federated profiles hold the rest.
const inDefaultProfile = (s: { profiles: string[] }) => s.profiles.length === 0;
const STACK_SERVICES = Object.values(facts.composeServices)
  .flat()
  .filter(inDefaultProfile);
const JAD_SERVICES = facts.composeServices["docker-compose.jad.yml"];
// The host side of each published port, "7474:7474" -> 7474.
const STACK_PORTS = [
  ...new Set(
    STACK_SERVICES.flatMap((s) =>
      s.ports.map((p) => Number(p.split(":").slice(-2)[0])),
    ),
  ),
]
  .sort((a, b) => a - b)
  .join(", ");
const hooksAt = (stage: string) =>
  facts.preCommitHooks.filter((h) => h.stage === stage).length;
const PRE_COMMIT_HOOKS = hooksAt("pre-commit");

const PAGES_BASE = "/MinimumViableHealthDataspacev2";
// A placeholder in the text, so no dictionary holds the host name (FR and
// ES write EEDS for the Regulation, and the host is not the Regulation).
const LIVE_HOST = "ehds.mabu.red";
const GITHUB_REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const REPO_BLOB = `${GITHUB_REPO}/blob/main`;

// The sources the text names, as deep links: the article, the spec section,
// the release tag, the file and line.
const EHDS = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
const DSP =
  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/";
const DCP =
  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/";
const FHIR = "https://hl7.org/fhir/R4/";
const OMOP = "https://ohdsi.github.io/CommonDataModel/cdm54.html";
const HEALTHDCAT =
  "https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-8/";
const ODRL = "https://www.w3.org/TR/odrl-model/#policy";
const DID_WEB = "https://w3c-ccg.github.io/did-method-web/";
const ARCHIMATE = "https://pubs.opengroup.org/architecture/archimate32-doc/";
const WCAG = "https://www.w3.org/TR/WCAG22/";
const OWASP = "https://owasp.org/Top10/2021/";
const BSI_C5 =
  "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf";
const EDC_RELEASE =
  "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5";
const IDENTITYHUB_RELEASE =
  "https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5";
const JAD_README =
  "https://github.com/Metaform/jad/blob/4a7e5bd096c58814748e956cc9329586ad309698/README.md#L3";
const CFM = "https://github.com/Metaform/connector-fabric-manager";
const SYNTHEA =
  "https://github.com/synthetichealth/synthea/releases/tag/v3.3.0";
const PLAYWRIGHT = `https://github.com/microsoft/playwright/releases/tag/v${facts.toolVersions.playwright}`;

/** An external link inside a translated sentence; <T> fills in the words. */
const ext = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-(--accent) underline hover:opacity-80"
  />
);
/** The same, for a bold term that is itself the source's name. */
const extBold = (href: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-semibold text-(--accent) underline hover:opacity-80"
  />
);
/** A file of this repository on GitHub, `path` with its `#L` anchor. */
const src = (path: string) => ext(`${REPO_BLOB}/${path}`);
/** The same, shown as code: a file or command the text names. */
const srcCode = (path: string) => (
  <a
    href={`${REPO_BLOB}/${path}`}
    target="_blank"
    rel="noopener noreferrer"
    className="font-mono text-[0.9em] text-(--accent) underline hover:opacity-80"
  />
);
const issue = (n: number) => ext(`${GITHUB_REPO}/issues/${n}`);
const adr = (file: string) => src(`docs/ADRs/${file}`);
const ADR_001 = "ADR-001-postgresql-neo4j-split.md";
const ADR_053 = "ADR-053-everything-stops-off-hours.md";
/** An onboarding step that leads to where it is explained or done. */
const STEP_LINK =
  "underline decoration-dotted underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300";

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
  // Links of the "Writing the Documentation" examples: a file on GitHub, a
  // route of the hub, or an outside reference.
  const repoFile = (path: string, kind: "blob" | "tree" = "blob") => (
    <a
      href={`${GITHUB_REPO}/${kind}/main/${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    />
  );
  const route = (href: string) => <Link href={href} className="underline" />;
  const cicdLink = <a href="#cicd" className="underline" />;
  const externalLink = (href: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    />
  );
  const securityLink = <Link href="/docs/security" className="underline" />;
  const klarbefundLink = <Link href="/docs/klarbefund" className="underline" />;
  const qualityGatesLink = (
    <Link href="/docs/developer/quality-gates" className="underline" />
  );
  const releasesLink = (
    <Link
      href="/docs/developer/sdlc#8-releases-and-versions"
      className="underline"
    />
  );
  const referenceLink = (
    <Link
      href="/docs/developer/reference"
      className="text-indigo-700 dark:text-indigo-300 underline"
    />
  );
  const warn = <strong className="text-amber-700 dark:text-amber-400" />;
  // A key concept's term links to where the manual explains it.
  const concept = (href: string) => (
    <Link
      href={href}
      className="font-semibold underline decoration-dotted underline-offset-2"
    />
  );
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
          <T area="docsDeveloper" tags={{ e: ext(EHDS), d: ext(EDC_RELEASE) }}>
            {
              "Technical documentation for developing, testing, and deploying the Health Dataspace v2 platform, an <e>EHDS regulation</e> reference implementation built on <d>Eclipse Dataspace Components</d>."
            }
          </T>
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
          {/* Numbered in the order of the sections, which DocsToc numbers
              the same way on the headings and in the index at the right. */}
          <ol className="text-sm space-y-1.5 text-indigo-700 dark:text-indigo-400 columns-1 md:columns-2 list-decimal list-inside">
            <TocLink href="#onboarding">{t("Onboarding")}</TocLink>
            <TocLink href="#working-on-the-project">
              {t("Working on the Project")}
            </TocLink>
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
            <TocLink href="#data-flow">{t("Data Flow")}</TocLink>
            <TocLink href="#releases">{t("Release Notes")}</TocLink>
            <TocLink href="#project-links">{t("Planning & Issues")}</TocLink>
            <TocLink href="#conventions">{t("Conventions")}</TocLink>
          </ol>
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
                <li>
                  <a
                    href={GITHUB_REPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={STEP_LINK}
                  >
                    {t("Clone the repository")}
                  </a>
                </li>
                <li>
                  <a href="#quick-start" className={STEP_LINK}>
                    <T area="docsDeveloper" tags={{ c }}>
                      {"<c>docker compose up -d</c> (Neo4j)"}
                    </T>
                  </a>
                </li>
                <li>
                  <Link
                    href="/docs/developer/stack-and-environment#two-ways-to-run-it"
                    className={STEP_LINK}
                  >
                    {t("Seed schema & data (cypher-shell)")}
                  </Link>
                </li>
                <li>
                  <a href="#quick-start" className={STEP_LINK}>
                    <code>
                      cd ui &amp;&amp; npm install &amp;&amp; npm run dev
                    </code>
                  </a>
                </li>
                <li>
                  <a
                    href="http://localhost:3000"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={STEP_LINK}
                  >
                    <T area="docsDeveloper" tags={{ c }}>
                      {"Open <c>http://localhost:3000</c>"}
                    </T>
                  </a>
                </li>
              </ol>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-amber-700 dark:text-amber-400">
                {t("2. Explore the Platform")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                {[
                  {
                    href: "/docs/user-guide#personas",
                    text: t("Switch personas via the User Menu"),
                  },
                  {
                    href: "/graph",
                    text: t("Explore the Graph Explorer (center node)"),
                  },
                  { href: "/catalog", text: t("Browse the Data Catalog") },
                  {
                    href: "/patient/profile",
                    text: t("Check Patient Portal (PATIENT role)"),
                  },
                  {
                    href: "/admin/policies",
                    text: t("Review ODRL policies (HDAB role)"),
                    spec: { name: "ODRL 2.2", href: ODRL },
                  },
                ].map(
                  (step: {
                    href: string;
                    text: string;
                    spec?: { name: string; href: string };
                  }) => (
                    <li key={step.href}>
                      <Link href={step.href} className={STEP_LINK}>
                        {step.text}
                      </Link>
                      {step.spec && (
                        <>
                          {" ("}
                          <a
                            href={step.spec.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-(--accent) underline hover:opacity-80"
                          >
                            {step.spec.name}
                          </a>
                          {")"}
                        </>
                      )}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-400">
                {t("3. Key Concepts")}
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: concept(
                        "/docs/developer/stack-and-environment#protocols",
                      ),
                      s: ext(DSP),
                    }}
                  >
                    {
                      "<b>DSP:</b> <s>Dataspace Protocol 2025-1</s>, sovereign data exchange"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: concept(
                        "/docs/developer/stack-and-environment#protocols",
                      ),
                      s: ext(DCP),
                    }}
                  >
                    {
                      "<b>DCP:</b> <s>Decentralised Claims Protocol v1.0</s>, DID + VC identity"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b: concept("#graph-schema"), s: ext(FHIR) }}
                  >
                    {"<b>FHIR R4:</b> <s>Clinical data standard</s> (EHR)"}
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b: concept("#graph-schema"), s: ext(OMOP) }}
                  >
                    {
                      "<b>OMOP CDM:</b> <s>Common Data Model 5.4</s>, the analytics layer for research"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b: concept("/docs/ehds"), s: ext(EHDS) }}
                  >
                    {
                      "<b>EHDS:</b> <s>Regulation (EU) 2025/327</s> for health data sharing"
                    }
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

        {/* Working on the project: the pages published from docs/ */}
        <section className="mb-10">
          <h2
            className="text-2xl font-semibold mb-3"
            id="working-on-the-project"
          >
            {t("Working on the Project")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            {t(
              "How a change reaches the live hub, how it is tested through the APIs, and what each part of the stack is. Each page is published from the docs folder of the repository.",
            )}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                href: "/docs/developer/sdlc",
                title: t("Development life cycle"),
                desc: t(
                  "Discussions and issues, branches and pull requests, every hook with its fix, the PR Gate and the other workflows, the deploys and the releases.",
                ),
              },
              {
                href: "/docs/developer/api-integration-tests",
                title: t("Integration tests through the APIs"),
                desc: t(
                  "The Bruno collection and the dataspace and identity checks: how to run them, and how current they are.",
                ),
              },
              {
                href: "/docs/developer/stack-and-environment",
                title: t("The stack and the development environment"),
                // A card holds links to its sources, so only its title is
                // the link to the page (a link cannot hold another).
                desc: (
                  <T
                    area="docsDeveloper"
                    tags={{
                      e: ext(EDC_RELEASE),
                      j: ext(JAD_README),
                      f: ext(CFM),
                      p: ext(DSP),
                      d: ext(DCP),
                    }}
                  >
                    {
                      "<e>EDC-V</e>, <j>JAD</j>, <f>CFM</f>, <p>DSP</p>, <d>DCP</d> and the hub's own services in one glossary; the local stacks, the seed phases, the ports and the iPhone app."
                    }
                  </T>
                ),
              },
              {
                href: "/docs/developer/secure-processing-environment",
                title: t("The secure processing environment"),
                desc: (
                  <T
                    area="docsDeveloper"
                    tags={{
                      c: ext(
                        "https://learn.microsoft.com/en-us/azure/container-instances/container-instances-confidential-overview",
                      ),
                      a: ext("https://www.amd.com/en/developer/sev.html"),
                      k: ext(
                        "https://github.com/confidential-containers/trustee",
                      ),
                    }}
                  >
                    {
                      "<c>Confidential containers</c> with <a>AMD SEV-SNP</a>, the <k>Trustee</k> that releases a workspace's key only to the workload its permit names, and what a federated query goes through."
                    }
                  </T>
                ),
              },
            ].map((card) => (
              <div
                key={card.href}
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors"
              >
                <h3 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400">
                  <Link href={card.href} className="hover:underline">
                    {card.title}
                  </Link>
                </h3>
                <p className="text-(--text-secondary) text-xs">{card.desc}</p>
              </div>
            ))}
            <div className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors">
              <h3 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400">
                <a
                  href={`${GITHUB_REPO}/blob/main/.github/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {t("Contributing")}
                  <ExternalLink size={12} />
                </a>
              </h3>
              <p className="text-(--text-secondary) text-xs">
                <T area="docsDeveloper" tags={{ l: src("LICENSE") }}>
                  {
                    "Fork, branch, pull request: the short guide for outside contributors, under the <l>Apache License 2.0</l>, with fictional organisations only."
                  }
                </T>
              </p>
            </div>
          </div>
        </section>

        {/* JAD Architecture */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="jad-architecture">
            {t("JAD Stack Architecture")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsDeveloper"
              tags={{
                c: chip,
                a: repoFile(
                  "docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md",
                ),
              }}
              vars={{ n: STACK_SERVICES.length }}
            >
              {
                "The JAD (Joint Architecture Demo) stack runs {n} Docker Compose services from <c>docker-compose.yml</c> + <c>docker-compose.jad.yml</c>, on EDC 1.0.0-RC5 with siglet as the data plane and no CFM, as Azure does (<a>ADR-078</a>). Compose builds the three EDC launchers from <c>runtimes/edc</c> on the first run."
              }
            </T>
          </p>
          <DocFigure
            file="deployment.svg"
            alt={t(
              "The JAD stack as an ArchiMate technology view: the edge, the application, EDC 1.0, the identity services and the infrastructure as bands with the run-time dependencies between them, and the three compose profiles in a band of their own",
            )}
            caption={t(
              "JAD stack: the {n} services of the default profile, their dependencies and the three profiles (ArchiMate 3.2, technology view)",
              { n: STACK_SERVICES.length },
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
                {(
                  [
                    {
                      service: "Traefik",
                      href: "https://github.com/traefik/traefik/releases/tag/v3.7.0",
                      port: ":80 / :8090",
                      traefik: "traefik.localhost",
                      purpose: t("API gateway & reverse proxy"),
                      deps: t("none"),
                    },
                    {
                      service: "PostgreSQL 17",
                      href: "https://www.postgresql.org/docs/17/release-17-7.html",
                      port: ":5432",
                      traefik: t("none"),
                      purpose: t("Runtime store ({n} databases)", {
                        n: facts.postgresDbs.length,
                      }),
                      deps: t("none"),
                    },
                    {
                      service: "Vault",
                      href: "https://github.com/hashicorp/vault/releases/tag/v2.0.0",
                      port: ":8200",
                      traefik: "vault.localhost",
                      purpose: t(
                        "Secrets, file storage; vault-unseal unseals it after a restart",
                      ),
                      deps: t("none"),
                    },
                    {
                      service: "Keycloak",
                      href: "https://github.com/keycloak/keycloak/releases/tag/26.8.0",
                      port: ":8080 / :9000",
                      traefik: "keycloak.localhost",
                      purpose: t("OIDC SSO (realm: edcv, 8 demo users)"),
                      deps: "PostgreSQL",
                    },
                    {
                      service: "NATS",
                      href: "https://github.com/nats-io/nats-server/releases/tag/v2.14.3",
                      port: ":4222 / :8222",
                      traefik: "nats.localhost",
                      purpose: t("Async event mesh (JetStream)"),
                      deps: t("none"),
                    },
                    {
                      service: "Control Plane",
                      href: EDC_RELEASE,
                      port: ":11003",
                      traefik: "cp.localhost",
                      purpose: t("DSP 2025-1 + Management API v5"),
                      deps: "PG, Vault, NATS, KC",
                    },
                    {
                      service: "siglet",
                      href: "https://github.com/eclipse-dataplane-core/dsdk-facet-rs/releases/tag/siglet-v0.1.6",
                      port: t("internal"),
                      traefik: t("none"),
                      purpose: t(
                        "Data plane: signalling, and the access tokens of pull transfers",
                      ),
                      deps: "Vault",
                    },
                    {
                      service: "Identity Hub",
                      href: IDENTITYHUB_RELEASE,
                      port: ":11005",
                      traefik: "ih.localhost",
                      purpose: t("DCP v1.0: DID + VC store (Identity API v1)"),
                      deps: "PG, Vault, KC",
                    },
                    {
                      service: "Issuer Service",
                      href: IDENTITYHUB_RELEASE,
                      port: ":10013",
                      traefik: "issuer.localhost",
                      purpose: t("VC issuance + DID:web"),
                      deps: "PG, Vault, KC",
                    },
                    {
                      service: "Simpl GA issuer",
                      href: IDENTITYHUB_RELEASE,
                      port: ":10023",
                      traefik: t("none"),
                      purpose: t(
                        "The fictional Simpl Governance Authority's issuer (ADR-064)",
                      ),
                      deps: "PG, Vault, KC",
                    },
                    {
                      service: "Neo4j 5",
                      href: "https://github.com/neo4j/neo4j/releases/tag/5.26.28",
                      port: ":7474 / :7687",
                      traefik: t("none"),
                      purpose: t("Knowledge graph (APOC + n10s)"),
                      deps: t("none"),
                    },
                    {
                      service: "Neo4j Proxy",
                      href: `${GITHUB_REPO}/tree/main/services/neo4j-proxy`,
                      port: ":9090",
                      traefik: "proxy.localhost",
                      purpose: t(
                        "Express bridge: UI ↔ Neo4j; serves pulls at /dataspace/data",
                      ),
                      deps: "CP",
                    },
                    {
                      service: "Next.js UI",
                      href: `https://github.com/vercel/next.js/releases/tag/v${facts.toolVersions.next}`,
                      port: ":3000 / :3003",
                      traefik: t("none"),
                      purpose: t("Application frontend"),
                      deps: "Neo4j",
                    },
                  ] as {
                    service: string;
                    href: string;
                    port: string;
                    traefik: string;
                    purpose: React.ReactNode;
                    deps: string;
                  }[]
                ).map(({ service, href, port, traefik, purpose, deps }) => (
                  <tr key={service} className="border-t border-(--border)">
                    <td className="px-3 py-1.5 font-medium text-(--text-primary)">
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                      >
                        {service}
                      </a>
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
            <T area="docsDeveloper" tags={{ c: small }}>
              {
                "Plus two Vault sidecars: <c>vault-unseal</c> initialises and unseals Vault, <c>vault-bootstrap</c> writes the secrets the services read."
              }
            </T>
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2" id="pull-path">
            {t("The pull path")}
          </h3>
          <p className="text-(--text-secondary) text-sm">
            <T
              area="docsDeveloper"
              tags={{ c: chip }}
              vars={{
                tokens: "GET /tokens/{participantContextId}/{transferId}",
              }}
            >
              {
                "A pull transfer runs like this: the consumer's control plane negotiates, siglet issues the access token, and the consumer reads the token from its siglet (<c>{tokens}</c>) and sends it to the provider's Neo4j Proxy at <c>/dataspace/data</c>, which serves the dataset the token names (<c>jad/siglet-edc1.toml</c>). siglet keeps its tokens in memory on this stack, so a restart of siglet loses every issued token; start the transfer again."
              }
            </T>
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2" id="compose-profiles">
            {t("Compose profiles")}
          </h3>
          <p className="text-(--text-secondary) text-sm mb-2">
            {t(
              "Three compose profiles hold the {n} services the default stack leaves out:",
              {
                n:
                  Object.values(facts.composeServices).flat().length -
                  STACK_SERVICES.length,
              },
            )}
          </p>
          <ul className="text-(--text-secondary) text-sm space-y-1 list-disc ml-5">
            <li>
              <T
                area="docsDeveloper"
                tags={{ c: chip, a: externalLink(`${GITHUB_REPO}/issues/927`) }}
              >
                {
                  "<c>edc018</c>: what only EDC 0.18 used, the two DCore data planes (FHIR :11002, OMOP :11012), CFM's Tenant Manager (:11006) and Provision Manager (:11007), its four agents and the shim, and the one-shot <c>jad-seed</c>. They stay until <a>#927</a> retires them; nothing in CI starts them."
                }
              </T>
            </li>
            <li>
              <T area="docsDeveloper" tags={{ c: chip }}>
                {
                  "<c>trust-check</c>: <c>rogue-issuer</c> (:10033), the untrusted issuer the identity checks must refuse."
                }
              </T>
            </li>
            <li>
              <T area="docsDeveloper" tags={{ c: chip }}>
                {
                  "<c>federated</c>: <c>neo4j-spe2</c> (:7475 / :7688), the second SPE."
                }
              </T>
            </li>
          </ul>
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
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: extBold("https://nodejs.org/en/blog/release/v22.0.0"),
                      a: src("services/neo4j-proxy/package.json#L46-L48"),
                    }}
                  >
                    {
                      "<b>Node.js 22+</b>: runtime for UI and proxy; <a>the proxy requires it</a>"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: extBold("https://docs.docker.com/desktop/"),
                      a: ext(
                        "https://docs.docker.com/compose/releases/migrate/",
                      ),
                    }}
                  >
                    {"<b>Docker Desktop</b>: with <a>Docker Compose V2</a>"}
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b, a: src("scripts/bootstrap-jad.sh#L245-L251") }}
                  >
                    {
                      "<b>8 GB Docker RAM</b>: required for full JAD stack (<a>the bootstrap checks it</a>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b, a: src(".pre-commit-config.yaml") }}
                  >
                    {"<b>Git</b>: with <a>pre-commit hooks</a> enabled"}
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
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: extBold(
                        "https://docs.python.org/3/whatsnew/3.11.html",
                      ),
                      l: src("scripts/load_fhir_neo4j.py#L1-L14"),
                      s: ext(SYNTHEA),
                      j: src("scripts/generate-synthea.sh#L26-L35"),
                    }}
                  >
                    {
                      "<b>Python 3.11+</b>: for <l>load_fhir_neo4j.py</l>, which loads the FHIR bundles <s>Synthea</s> generates; Synthea itself needs <j>Java 21+</j>"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: extBold(
                        `https://github.com/gitleaks/gitleaks/releases/tag/v${facts.toolVersions.gitleaks}`,
                      ),
                      c,
                      a: src(".pre-commit-config.yaml#L127-L139"),
                    }}
                  >
                    {
                      "<b>gitleaks</b>: local secret scanning in <a>the pre-commit hook</a> (<c>brew install gitleaks</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b: extBold("https://github.com/lycheeverse/lychee"),
                      c,
                      a: src(".pre-commit-config.yaml#L163-L176"),
                    }}
                  >
                    {
                      "<b>lychee</b>: broken link checker for <a>the Markdown hook</a> (<c>brew install lychee</c>)"
                    }
                  </T>
                </li>
                <li>
                  <T area="docsDeveloper" tags={{ b: extBold(PLAYWRIGHT), c }}>
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
              <code className="text-(--text-primary)">{STACK_PORTS}</code>
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

# Initialize schema (idempotent, safe to re-run)
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
              "The bootstrap script starts the {n} services in dependency order with health checks, waits for vault-bootstrap to write the secrets, loads the graph when Neo4j is empty, runs the 7-phase seed pipeline and then seeds the Simpl test Governance Authority.",
              { n: STACK_SERVICES.length },
            )}
          </p>
          <div className="space-y-4">
            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("1. Bootstrap everything")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# Full stack; the first run also builds the three EDC launchers
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
              "The 7-phase seed pipeline populates the dataspace with participants, credentials, policies, assets, contracts and transfers. Phases must run in strict order; each depends on the previous.",
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
                {(
                  [
                    [
                      "1",
                      "scripts/seed-identity-layer.sh",
                      "Identity Hub, Issuer, CP",
                      t(
                        "The 5 participants: contexts, DIDs, keys, a DCP MembershipCredential each (ADR-078)",
                      ),
                    ],
                    [
                      "2",
                      "jad/seed-ehds-credentials.sh",
                      "Issuer Service",
                      t("Register EHDS credential types"),
                    ],
                    [
                      "3",
                      "jad/seed-ehds-policies.sh",
                      "Control Plane",
                      t("Create ODRL policies for all participants"),
                    ],
                    [
                      "4",
                      "jad/seed-data-assets.sh",
                      "Control Plane",
                      t("Register data assets + contracts"),
                    ],
                    [
                      "5",
                      "jad/seed-contract-negotiation.sh",
                      "Control Plane",
                      t(
                        "PharmaCo ↔ AlphaKlinik negotiations, transfers to STARTED",
                      ),
                    ],
                    [
                      "6",
                      "jad/seed-federated-catalog.sh",
                      "Control Plane",
                      t("MedReg ↔ LMC federated catalog negotiation"),
                    ],
                    [
                      "7",
                      "jad/seed-data-transfer.sh",
                      "siglet, Neo4j Proxy",
                      t(
                        "Pull patients and the catalogue with siglet's tokens; record the TransferEvents",
                      ),
                    ],
                  ] as [string, string, string, React.ReactNode][]
                ).map(([phase, script, target, desc]) => (
                  <tr key={phase} className="border-t border-(--border)">
                    <td className="px-3 py-1.5 font-mono font-bold text-(--text-primary)">
                      {phase}
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      <a
                        href={`${REPO_BLOB}/${script}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                      >
                        {script.split("/").pop()}
                      </a>
                    </td>
                    <td className="px-3 py-1.5">{target}</td>
                    <td className="px-3 py-1.5">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-(--text-secondary) text-xs mt-3">
            <T
              area="docsDeveloper"
              tags={{
                c: small,
                a: externalLink(`${GITHUB_REPO}/issues/881`),
              }}
              vars={{
                participant: "ehds-participant",
                quality: "ehds-quality",
              }}
            >
              {
                "<c>bootstrap-jad.sh</c> loads the graph (<c>init-schema.cypher</c> and the files CI loads) only when Neo4j holds no patients, so a graph you filled yourself stays as it is. Phase 7 rewrites three tracked fixtures, <c>ui/public/mock/{fhir_bundles,negotiations,transfers}.json</c>; restore them with <c>git checkout --</c> when you did not mean to refresh them. Phase 1 reports <c>HTTP 400</c> for the attestation types <c>{participant}</c> and <c>{quality}</c>, which no issuer launcher registers, and for the credential types defined on them (finding 7 in <a>#881</a>); phase 2 registers the EHDS credential types anyway."
              }
            </T>
          </p>
          <div className="mt-3 border border-amber-500/20 bg-amber-500/5 rounded-lg p-3">
            <p className="text-(--text-secondary) text-xs">
              <T
                area="docsDeveloper"
                tags={{
                  b: warn,
                  c: small,
                  a: src("docker-compose.jad.yml#L100-L155"),
                }}
              >
                {
                  "<b>Important:</b> Vault keeps its secrets on disk (<a>volumes</a> <c>vault_data</c> and <c>vault_keys</c>; the <c>vault-unseal</c> sidecar unseals it on every start), so a restart or a <c>docker compose down</c> keeps every secret. Only removing the volumes (<c>docker compose down -v</c> or <c>./scripts/bootstrap-jad.sh --reset</c>) deletes them; bootstrap and seed the stack again after that. If IdentityHub logs <c>Private key ... not found</c>, check that <c>health-dataspace-vault-unseal</c> reported <c>ready</c>."
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
            {/* Each entry links to its folder or file on GitHub. */}
            <pre className="text-xs text-(--text-primary) overflow-x-auto whitespace-pre">
              {(
                [
                  [
                    "├── ",
                    ".github/workflows/",
                    "tree",
                    "# CI/CD (pr-gate, test, nightly, compliance, security-scan, deploy-azure, pages, ...)",
                  ],
                  [
                    "├── ",
                    "docs/",
                    "tree",
                    "# Architecture docs, journeys, ADRs, reports",
                  ],
                  ["├── ", "jad/", "tree", "# JAD infrastructure configs"],
                  [
                    "│   ├── ",
                    "keycloak-realm.json",
                    "blob",
                    "# Keycloak realm (edcv, 8 demo users, 10 roles)",
                    "jad/keycloak-realm.json",
                  ],
                  [
                    "│   ├── ",
                    "edcv-assets/",
                    "tree",
                    "# Contract definitions & ODRL policies",
                    "jad/edcv-assets",
                  ],
                  [
                    "│   ├── ",
                    "init-postgres-edc1.sql",
                    "blob",
                    "# The databases: EDC 0.18, then the _v1 ones of EDC 1.0",
                    "jad/init-postgres-edc1.sql",
                  ],
                  [
                    "│   ├── ",
                    "siglet-edc1.toml",
                    "blob",
                    "# siglet, the data plane",
                    "jad/siglet-edc1.toml",
                  ],
                  [
                    "│   ├── ",
                    "seed-all.sh",
                    "blob",
                    "# The 7-phase seed, calling seed-*.sh",
                    "jad/seed-all.sh",
                  ],
                  [
                    "│   └── ",
                    "openapi/",
                    "tree",
                    "# OpenAPI specifications",
                    "jad/openapi",
                  ],
                  ["├── ", "k8s/", "tree", "# Kubernetes / OrbStack manifests"],
                  ["├── ", "neo4j/", "tree", "# Cypher scripts & data"],
                  [
                    "│   ├── ",
                    "init-schema.cypher",
                    "blob",
                    "# Constraints, indexes, vector indexes",
                    "neo4j/init-schema.cypher",
                  ],
                  [
                    "│   ├── ",
                    "insert-synthetic-schema-data.cypher",
                    "blob",
                    "",
                    "neo4j/insert-synthetic-schema-data.cypher",
                  ],
                  [
                    "│   └── ",
                    "fhir-to-omop-transform.cypher",
                    "blob",
                    "",
                    "neo4j/fhir-to-omop-transform.cypher",
                  ],
                  [
                    "├── ",
                    "runtimes/edc/",
                    "tree",
                    "# EDC 1.0 launchers (ADR-076)",
                  ],
                  [
                    "│   ├── ",
                    "controlplane/",
                    "tree",
                    "# DSP + Management API",
                    "runtimes/edc/controlplane",
                  ],
                  [
                    "│   ├── ",
                    "identity-hub/",
                    "tree",
                    "# DCP Identity Hub",
                    "runtimes/edc/identity-hub",
                  ],
                  [
                    "│   └── ",
                    "issuerservice/",
                    "tree",
                    "# VC issuance",
                    "runtimes/edc/issuerservice",
                  ],
                  [
                    "├── ",
                    "scripts/",
                    "tree",
                    "# Automation (bootstrap, synthea, compliance)",
                  ],
                  [
                    "├── ",
                    "services/neo4j-proxy/",
                    "tree",
                    "# Express bridge (Neo4j ↔ UI)",
                  ],
                  [
                    "├── ",
                    "ui/",
                    "tree",
                    `# Next.js ${
                      facts.toolVersions.next.split(".")[0]
                    } application`,
                  ],
                  [
                    "│   ├── ",
                    "src/app/",
                    "tree",
                    `# ${facts.uiPages.length} pages, ${facts.apiRoutes.length} API routes`,
                    "ui/src/app",
                  ],
                  [
                    "│   ├── ",
                    "src/components/",
                    "tree",
                    "# Shared React components",
                    "ui/src/components",
                  ],
                  [
                    "│   ├── ",
                    "src/lib/",
                    "tree",
                    "# auth.ts, api.ts, graph-constants.ts",
                    "ui/src/lib",
                  ],
                  [
                    "│   ├── ",
                    "__tests__/unit/",
                    "tree",
                    "# Vitest unit tests",
                    "ui/__tests__/unit",
                  ],
                  [
                    "│   ├── ",
                    "__tests__/e2e/",
                    "tree",
                    "# Playwright specs (journeys/)",
                    "ui/__tests__/e2e",
                  ],
                  [
                    "│   └── ",
                    "public/mock/",
                    "tree",
                    "# JSON fixtures for static export",
                    "ui/public/mock",
                  ],
                  [
                    "├── ",
                    "docker-compose.yml",
                    "blob",
                    "# Minimal stack (Neo4j + UI)",
                  ],
                  [
                    "└── ",
                    "docker-compose.jad.yml",
                    "blob",
                    `# JAD stack: ${
                      JAD_SERVICES.filter(inDefaultProfile).length
                    } services, ${
                      JAD_SERVICES.filter((s) => !inDefaultProfile(s)).length
                    } more in profiles`,
                  ],
                ] as [string, string, "tree" | "blob", string, string?][]
              ).map(([branch, name, kind, comment, path]) => (
                <span key={path ?? name}>
                  {branch}
                  <a
                    href={`${GITHUB_REPO}/${kind}/main/${(path ?? name).replace(
                      /\/$/,
                      "",
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    {name}
                  </a>
                  {comment
                    ? " ".repeat(
                        Math.max(1, 31 - branch.length - name.length),
                      ) + comment
                    : ""}
                  {"\n"}
                </span>
              ))}
            </pre>
          </div>
        </section>

        {/* Graph Schema */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="graph-schema">
            {t("Neo4j Graph Schema")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsDeveloper"
              tags={{ c: chip, a: src("neo4j/init-schema.cypher#L8-L238") }}
            >
              {
                "The 5-layer knowledge graph has <a>constraints or indexes on 63 node labels</a>, 3 fulltext and 3 vector indexes for GraphRAG. Schema defined in <c>neo4j/init-schema.cypher</c> (idempotent, safe to re-run)."
              }
            </T>
          </p>
          <DocFigure
            file="graph-schema.svg"
            alt={t(
              "The core graph schema as a UML entity relationship diagram: the dataset, the FHIR record of a patient, the OMOP counterpart of each resource, and the SNOMED, ICD-10, LOINC and RxNorm codes both are coded by",
            )}
            caption={
              <T
                area="docsDeveloper"
                tags={{ a: ext("https://www.omg.org/spec/UML/2.5.1") }}
              >
                {
                  "Core entity relationships: the FHIR record, its OMOP mapping and the codes (<a>UML</a>)"
                }
              </T>
            }
          />

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("5 Semantic Layers")}
              </h4>
              {/* Each layer and each label links to the standard it follows. */}
              <ul className="text-(--text-secondary) text-xs space-y-1.5">
                {(
                  [
                    {
                      label: t("L1 Marketplace:"),
                      color: "text-[#2471A3] dark:text-[#85C1E9]",
                      labels: [
                        ["Participant", `${DSP}#catalog-protocol-0`],
                        ["DataProduct", `${DSP}#catalog-protocol-0`],
                        ["Contract", `${DSP}#contract-negotiation-protocol`],
                        ["HDABApproval", `${EHDS}#art_68`],
                        ["OdrlPolicy", ODRL],
                      ],
                    },
                    {
                      label: "L2 HealthDCAT-AP:",
                      href: HEALTHDCAT,
                      color: "text-[#0F766E] dark:text-[#76D7C4]",
                      labels: [
                        ["Catalogue"],
                        ["HealthDataset"],
                        ["Distribution"],
                        ["DataService"],
                      ],
                    },
                    {
                      label: "L3 FHIR R4:",
                      href: FHIR,
                      color: "text-[#157A3C] dark:text-[#82E0AA]",
                      labels: [
                        ["Patient", `${FHIR}patient.html`],
                        ["Encounter", `${FHIR}encounter.html`],
                        ["Condition", `${FHIR}condition.html`],
                        ["Observation", `${FHIR}observation.html`],
                        ["MedicationRequest", `${FHIR}medicationrequest.html`],
                      ],
                    },
                    {
                      label: "L4 OMOP CDM:",
                      href: OMOP,
                      color: "text-[#9A5512] dark:text-[#F5B041]",
                      labels: [
                        ["OMOPPerson", `${OMOP}#person`],
                        [
                          "OMOPConditionOccurrence",
                          `${OMOP}#condition_occurrence`,
                        ],
                        ["OMOPDrugExposure", `${OMOP}#drug_exposure`],
                        ["OMOPMeasurement", `${OMOP}#measurement`],
                      ],
                    },
                    {
                      label: t("L5 Ontology:"),
                      color: "text-[#7D3C98] dark:text-[#C39BD3]",
                      labels: [
                        [
                          "SnomedConcept",
                          "https://www.snomed.org/what-is-snomed-ct",
                        ],
                        [
                          "ICD10Code",
                          "https://www.nlm.nih.gov/research/umls/sourcereleasedocs/current/ICD10CM/index.html",
                        ],
                        [
                          "RxNormConcept",
                          "https://www.nlm.nih.gov/research/umls/rxnorm/docs/index.html",
                        ],
                        [
                          "LoincCode",
                          "https://www.nlm.nih.gov/research/umls/sourcereleasedocs/current/LNC/index.html",
                        ],
                      ],
                    },
                  ] as {
                    label: string;
                    href?: string;
                    color: string;
                    labels: [string, string?][];
                  }[]
                ).map((layer) => (
                  <li key={layer.label}>
                    <span className={`${layer.color} font-medium`}>
                      {layer.href ? (
                        <a
                          href={layer.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:opacity-80"
                        >
                          {layer.label}
                        </a>
                      ) : (
                        layer.label
                      )}
                    </span>{" "}
                    {layer.labels.map(([name, href], i) => (
                      <span key={name}>
                        {i > 0 && ", "}
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                          >
                            {name}
                          </a>
                        ) : (
                          name
                        )}
                      </span>
                    ))}
                  </li>
                ))}
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
                  <T
                    area="docsDeveloper"
                    tags={{ a: src("neo4j/init-schema.cypher#L240-L251") }}
                  >
                    {
                      "<a>3 fulltext indexes</a> (clinical, catalog, ontology search)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ a: src("neo4j/init-schema.cypher#L253-L266") }}
                  >
                    {"<a>3 vector indexes</a> (384-dim, cosine, for GraphRAG)"}
                  </T>
                </li>
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
                "PostgreSQL serves as the runtime store for all JAD services: EDC state machines, Keycloak identity and the proxy's task store. Neo4j holds the health knowledge graph. This split follows <b>ADR-1</b>."
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
                    "controlplane_v1",
                    "Control Plane",
                    t(
                      "Contract negotiations, transfer processes, asset definitions, policy store",
                    ),
                  ],
                  [
                    "identityhub_v1",
                    "Identity Hub",
                    t("DID documents, verifiable credential store, key pairs"),
                  ],
                  [
                    "issuerservice_v1",
                    "Issuer Service",
                    t(
                      "Credential definitions, attestation records, issued VCs",
                    ),
                  ],
                  [
                    "simplga_v1",
                    "Simpl GA issuer",
                    t("The Simpl Governance Authority's credentials"),
                  ],
                  [
                    "rogueissuer_v1",
                    "rogue-issuer",
                    t("The untrusted issuer of the identity checks"),
                  ],
                  [
                    "keycloak",
                    "Keycloak",
                    t("Users, roles, realm config, sessions, client scopes"),
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
          <p className="text-(--text-secondary) text-xs mt-3">
            <T
              area="docsDeveloper"
              tags={{ c: small }}
              vars={{ n: facts.postgresDbs.length }}
            >
              {
                "A fresh <c>postgres_data</c> volume holds {n} databases. The image creates <c>controlplane</c> (<c>POSTGRES_DB</c>); <c>jad/init-postgres.sql</c> creates the users, <c>keycloak</c>, <c>taskdb</c> and the other EDC 0.18 databases (<c>identityhub</c>, <c>issuerservice</c>, <c>dataplane</c>, <c>dataplane_omop</c>, <c>cfm</c>, <c>redlinedb</c>, ...), which the 1.0 services no longer use. <c>jad/init-postgres-edc1.sql</c> creates the <c>_v1</c> databases after it, on a fresh volume only; on an existing volume, run that file once with <c>psql</c> as <c>cp</c> (see <c>docs/gotchas.md</c>)."
              }
            </T>
          </p>
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
                    "<b>PostgreSQL:</b> EDC runtime state machines, OIDC sessions, credential storage, the task store; transactional ACID workloads"
                  }
                </T>
              </li>
              <li>
                <T area="docsDeveloper" tags={{ b, a: adr(ADR_001) }}>
                  {
                    "<b>Rationale:</b> Graph queries for clinical relationships are orders of magnitude faster in Neo4j; EDC-V requires PostgreSQL for its state machine persistence (<a>ADR-001</a>)"
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
                  <T
                    area="docsDeveloper"
                    tags={{ b, c: flowCode, a: ext(HEALTHDCAT) }}
                  >
                    {
                      "<b>Discover</b> → <c>GET /api/catalog</c> returns <a>HealthDCAT-AP</a> datasets"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b, c: flowCode, a: ext(ODRL) }}
                  >
                    {
                      "<b>Inspect</b> → <c>GET /api/assets</c> for access policies (<a>ODRL</a>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b,
                      c: flowCode,
                      a: ext(`${DSP}#contract-negotiation-protocol`),
                    }}
                  >
                    {
                      "<b>Negotiate</b> → <c>POST /api/negotiations</c> opens a <a>DSP 2025-1</a> contract"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b,
                      c: flowCode,
                      a: ext(`${DCP}#verifiable-presentation-protocol`),
                    }}
                  >
                    {
                      "<b>Attest</b> → <c>POST /api/credentials/present</c> proves role via <a>DCP</a> VC"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b,
                      c: flowCode,
                      a: ext(`${DSP}#transfer-process-protocol`),
                    }}
                  >
                    {
                      "<b>Transfer</b> → <c>GET /api/transfers/:id</c> monitors the data plane (<a>DSP transfer process</a>)"
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
                  <T
                    area="docsDeveloper"
                    tags={{ b, c: flowCode, a: ext(DID_WEB) }}
                  >
                    {
                      "<b>Register</b> → <c>POST /api/participants</c> creates a <a>did:web</a> identity"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b, c: flowCode, a: ext(HEALTHDCAT) }}
                  >
                    {
                      "<b>Publish</b> → <c>POST /api/catalog</c> adds a <a>HealthDCAT-AP</a> dataset"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{ b, c: flowCode, a: ext(ODRL) }}
                  >
                    {
                      "<b>Policy</b> → <c>POST /api/admin/policies</c> creates an <a>ODRL</a> policy (EDC_ADMIN)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      b,
                      c: flowCode,
                      h: ext(`${EHDS}#art_55`),
                      p: ext(`${EHDS}#art_68`),
                    }}
                  >
                    {
                      "<b>HDAB approval</b> → <c>GET /api/compliance</c> tracks approval state (<h>Art. 55</h>, <p>Art. 68</p>)"
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
                  <T area="docsDeveloper" tags={{ b, c: flowCode }}>
                    {
                      "<b>Deliver</b> → the consumer pulls with siglet's token from <c>/dataspace/data</c> on the provider's Neo4j Proxy"
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
              tags={{
                c,
                k: chip,
                n: ext(
                  `https://github.com/vercel/next.js/releases/tag/v${facts.toolVersions.next}`,
                ),
                s: adr("ADR-044-every-api-route-needs-a-session.md"),
                p: ext(
                  "https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity",
                ),
                a: adr(
                  "ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md",
                ),
              }}
              vars={{
                routes: facts.apiRoutes.length,
                ops: implementedOperations,
              }}
            >
              {
                "{routes} <n>Next.js</n> API routes ({ops} operations) proxy to Neo4j and the EDC-V services; the table is generated from <c>ui/src/app/api/</c>. Every route needs a session (<s>ADR-044</s>) except the sign-in flows, the Keycloak address for the sign-in banner, the health probe, and the Klarbefund app's account creation, which answers only a verified <p>Apple App Attest</p> attestation (<a>ADR-054</a>). Routes are disabled in the static export; mock data is served from <k>ui/public/mock/*.json</k>."
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
              href={`${BASE_PATH}/openapi.yaml`}
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
                  <T
                    area="docsDeveloper"
                    tags={{
                      b,
                      c,
                      v: ext(
                        `https://github.com/vitest-dev/vitest/releases/tag/v${facts.toolVersions.vitest}`,
                      ),
                    }}
                  >
                    {
                      "<b>UI and Neo4j proxy</b> suites in <v>Vitest</v>, the UI's mirroring <c>ui/src/</c> under <c>ui/__tests__/unit/</c>"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      a: ext("https://vitest.dev/guide/coverage"),
                      f: src("ui/vitest.config.ts"),
                    }}
                  >
                    {
                      "<a>v8 coverage</a> with the thresholds in <f>vitest.config.ts</f>, published with the test report"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      c,
                      l: ext(
                        "https://github.com/testing-library/react-testing-library/releases/tag/v16.3.3",
                      ),
                      i: issue(404),
                    }}
                  >
                    {
                      "<l>Testing Library</l> for components; a test that needs the network stubs <c>fetch</c> itself, and Neo4j is mocked at <c>@/lib/neo4j</c> (MSW was removed in <i>#404</i>)"
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
                  <T area="docsDeveloper" tags={{ b, c, p: ext(PLAYWRIGHT) }}>
                    {
                      "<b>Journey specs</b> for <p>Playwright</p> in <c>ui/__tests__/e2e/journeys/</c> (IDs J001 onward)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      w: ext(WCAG),
                      a: srcCode(
                        "ui/__tests__/e2e/journeys/27-wcag-accessibility.spec.ts",
                      ),
                    }}
                  >
                    {
                      "<w>WCAG 2.2 AA</w> accessibility audit (<a>27-wcag-accessibility</a>)"
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      o: ext(OWASP),
                      b: ext(BSI_C5),
                      a: srcCode(
                        "ui/__tests__/e2e/journeys/28-security-pentest.spec.ts",
                      ),
                    }}
                  >
                    {
                      "<o>OWASP</o>/<b>BSI</b> security & pentest (<a>28-security-pentest</a>)"
                    }
                  </T>
                </li>
                <li>
                  <a
                    href={`https://ma3u.github.io${PAGES_BASE}/e2e-report/`}
                    target="_blank"
                    rel="noopener noreferrer"
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
              <h4 className="font-semibold text-sm mb-2">
                {t("EHDS dataspace checks (DSP 2025-1)")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    h: src("scripts/run-ehds-dataspace-checks.sh#L5-L9"),
                    d: ext(DSP),
                    k: ext("https://github.com/eclipse-dataspacetck/dsp-tck"),
                    i: issue(338),
                  }}
                >
                  {
                    "Our own checks, not a conformance kit, as <h>the script's header</h> says: they drive the EDC Management API with <c>curl</c> and never act as a <d>DSP 2025-1</d> peer, covering catalog, contract negotiation and transfer process. The Eclipse <k>DSP TCK</k> is not run yet (<i>#338</i>)."
                  }
                </T>
              </p>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`./scripts/run-ehds-dataspace-checks.sh`}</pre>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("EHDS identity checks (DCP v1.0)")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    h: src("scripts/run-ehds-identity-checks.sh#L5-L9"),
                    d: ext(DCP),
                    k: ext("https://github.com/eclipse-dataspacetck/dcp-tck"),
                    i: issue(338),
                  }}
                >
                  {
                    "Our own checks, not a conformance kit, as <h>the script's header</h> says: they drive the IdentityHub and IssuerService admin APIs with <c>curl</c> and never act as a <d>DCP v1.0</d> peer, covering did:web resolution, credential presentation and issuance. The Eclipse <k>DCP TCK</k> is not run yet (<i>#338</i>)."
                  }
                </T>
              </p>
              <pre className="text-xs text-(--text-secondary) mt-2 bg-(--surface) p-2 rounded-sm">{`./scripts/run-ehds-identity-checks.sh`}</pre>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">{t("EHDS Domain")}</h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    p: ext(`${EHDS}#art_53`),
                    h: ext(HEALTHDCAT),
                    f: ext(FHIR),
                    o: ext(OMOP),
                    x: ext(`${EHDS}#art_71`),
                    a: src("scripts/run-ehds-tests.sh#L195-L835"),
                  }}
                >
                  {
                    "Our own health-domain checks against the graph: the <p>Art. 53</p> purposes on the approvals, <h>HealthDCAT-AP</h>, the EEHRxF profiles, the <f>FHIR</f> to <o>OMOP</o> mapping and the <x>Art. 71</x> opt-out (<a>the six categories</a>)."
                  }
                </T>
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
            <T
              area="docsDeveloper"
              tags={{
                c5: ext(BSI_C5),
                o: ext(OWASP),
                e: ext(EHDS),
                w: ext(WCAG),
              }}
            >
              {
                "Four-stage quality pipeline aligned with <c5>BSI C5</c5>, <o>OWASP Top 10</o>, <e>EHDS regulation</e>, and <w>WCAG 2.2 AA</w>."
              }
            </T>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              [String(hooksAt("pre-commit")), t("Pre-commit hooks")],
              [String(hooksAt("pre-push")), t("Pre-push gates")],
              [String(facts.workflowJobs["test.yml"].length), t("CI jobs")],
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
            caption={
              <T
                area="docsDeveloper"
                tags={{ a: ext(ARCHIMATE) }}
                vars={{ n: PRE_COMMIT_HOOKS }}
              >
                {
                  "CI/CD: the {n} pre-commit hooks and the pre-push suite on the workstation, the pull request checks, and what runs on main (<a>ArchiMate 3.2</a>)"
                }
              </T>
            }
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                <a
                  href={`${REPO_BLOB}/.github/workflows/test.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("test.yml: {n} jobs on every push", {
                    n: facts.workflowJobs["test.yml"].length,
                  })}
                </a>
              </h4>
              <ul className="text-(--text-secondary) text-xs space-y-1 list-disc ml-4">
                {facts.workflowJobs["test.yml"].map((job) => (
                  <li key={job}>{job}</li>
                ))}
              </ul>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                <a
                  href={`${REPO_BLOB}/.github/workflows/pages.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("pages.yml: Deploy to GitHub Pages")}
                </a>
              </h4>
              <ol className="text-(--text-secondary) text-xs space-y-1 list-decimal ml-4">
                <li>
                  {t(
                    "Seed Neo4j and refresh the mock fixtures from the live API",
                  )}
                </li>
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
                <a
                  href={`${REPO_BLOB}/.github/workflows/nightly.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("nightly.yml: once a night when main changed")}
                </a>
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    w: ext(WCAG),
                    o: ext(OWASP),
                    l: ext(
                      "https://developer.chrome.com/docs/lighthouse/overview",
                    ),
                    f: srcCode("scripts/compliance-baseline.json"),
                    a: adr(
                      "ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md",
                    ),
                  }}
                  vars={{
                    jobs: facts.workflowJobs["compliance.yml"].join(", "),
                  }}
                >
                  {
                    "Playwright E2E with the <w>WCAG 2.2 AA</w> and <o>OWASP</o>/BSI checks against a seeded Neo4j, the <l>Lighthouse</l> budget, and on the full JAD stack: {jobs}. Each compliance suite is held to the floor in <f>scripts/compliance-baseline.json</f>. Skipped when main has no commit since the last green run; a red night opens an issue (<a>ADR-074</a>)."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                <a
                  href={`${REPO_BLOB}/.github/workflows/deploy-azure.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("deploy-azure.yml: Azure Deployment")}
                </a>
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    u: src(".github/workflows/deploy-azure.yml#L118-L155"),
                    j: src(".github/workflows/deploy-azure.yml#L157-L177"),
                    o: ext(
                      "https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-azure",
                    ),
                    s: src(".github/workflows/deploy-azure.yml#L342-L374"),
                  }}
                >
                  {
                    "Builds the UI and Neo4j proxy images, <u>rolls them out to their two Container Apps</u> and <j>points the off-hours jobs at the commit</j>, signed in to Azure through <o>OIDC federation</o>; then runs <s>E2E smoke, WCAG and security tests</s> against the live Azure environment."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                <a
                  href={`${REPO_BLOB}/.github/workflows/reset-demo.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("reset-demo.yml: Demo Reset (manual)")}
                </a>
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{ a: src(".github/workflows/reset-demo.yml#L3-L15") }}
                >
                  {
                    "Restarts stateful services, re-bootstraps Vault and Keycloak, reseeds data and runs smoke tests. <a>Manual dispatch only since 2026-09-13</a>: the Keycloak realm now holds the Klarbefund client and real accounts, which a scheduled reset would delete."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                <a
                  href={`${REPO_BLOB}/.github/workflows/aca-schedule.yml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("aca-schedule.yml: Off-Hours Stop and Start")}
                </a>
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    a: offHoursLink,
                    j: adr(
                      "ADR-058-azure-triggers-the-off-hours-schedule.md?plain=1#L28-L31",
                    ),
                    p: ext(
                      "https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-stop-start-server-portal",
                    ),
                    s: adr(ADR_053),
                    w: src(".github/workflows/aca-schedule.yml#L24-L27"),
                  }}
                >
                  {
                    "<j>Two Container Apps jobs in Azure</j> stop every Container App except the UI, then the <p>PostgreSQL Flexible Server</p>, daily at 18:13 UTC, and start them in dependency order Monday to Friday at 05:17 UTC, skipping Berlin public holidays (<s>ADR-053</s>). This workflow is the manual start and stop, and <w>the fallback an hour later</w>. See <a>Live Stack Off Hours</a>."
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
            <T
              area="docsDeveloper"
              tags={{
                c,
                s: adr(ADR_053),
                a: srcCode("ui/src/lib/offline-mode.ts#L1-L18"),
              }}
              vars={{ host: LIVE_HOST }}
            >
              {
                "Outside office hours the Azure stack is stopped, database included (<s>ADR-053</s>), and <c>{host}</c> answers every page with an offline notice and every data route with <c>503</c>. Local development is not affected: <c>docker compose</c> and <c>npm run dev</c> know nothing of the schedule. To see the notice locally, start the UI with <c>LIVE_DEMO_OFFLINE=true</c> (<a>offline-mode.ts</a>)."
              }
            </T>
          </p>
          <div className="space-y-4">
            <div className="bg-(--surface) border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2 text-(--success-text)">
                {t("Working on the live stack at night or at the weekend")}
              </h4>
              <pre className="text-xs text-(--text-primary) overflow-x-auto">{`# 1. Hold it: no scheduled stop before this instant (UTC). The tag holds
#    the Azure job and the workflow; the GitHub variable LIVE_DEMO_HOLD_UNTIL
#    holds only the workflow (ADR-058)
az resource update -g rg-mvhd-dev -n mvhd-ui \\
  --resource-type Microsoft.App/containerApps \\
  --set tags.live-demo-hold-until=2026-10-10T22:00Z -o none

# 2. Start it (any day, about ten minutes, green only if a login works)
gh workflow run aca-schedule.yml -f action=start

# 3. Optional: one catalog crawl, it runs in office hours only
az containerapp job start --name mvhd-catalog-crawler --resource-group rg-mvhd-dev

# 4. Done: release the hold and stop it again
az resource update -g rg-mvhd-dev -n mvhd-ui \\
  --resource-type Microsoft.App/containerApps \\
  --remove tags.live-demo-hold-until -o none
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
                href: `https://ma3u.github.io${PAGES_BASE}/e2e-report/`,
                desc: t("E2E test results with screenshots and traces"),
                external: true,
              },
              {
                title: t("CI Workflow Runs"),
                href: `${GITHUB_REPO}/actions/workflows/test.yml`,
                desc: t("GitHub Actions test suite history"),
                external: true,
              },
              {
                title: t("Compliance Runs"),
                // compliance.yml runs inside nightly.yml (workflow_call),
                // so its runs are listed under the nightly workflow.
                href: `${GITHUB_REPO}/actions/workflows/nightly.yml`,
                desc: t(
                  "The nightly EHDS dataspace, identity and domain checks: our own, not the Eclipse TCKs",
                ),
                external: true,
              },
              {
                title: t("Security Advisories"),
                href: `${GITHUB_REPO}/security`,
                desc: t(
                  "Trivy and grype SARIF findings, CodeQL alerts and dependency alerts",
                ),
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
            <T
              area="docsDeveloper"
              tags={{
                a: securityLink,
                r: src(
                  "docs/security/security-test-report-2026-10-15.md?plain=1#L54-L65",
                ),
              }}
            >
              {
                "Tested by the project itself with tools anyone can run on the repository; every finding is fixed or named as open. <r>The test of 2026-10-15</r> found ten findings, F1 to F10: after the fixes eight are closed and two are reviewed and accepted (F3, the published development default key of the local compose stack, and F4, a public search key the guideline register publishes itself). None of this is an independent penetration test or a certification. The reports are published under <a>/docs/security</a>."
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
                // The title is the link, so the sources can be links too.
                desc: (
                  <T
                    area="docsDeveloper"
                    tags={{
                      g: ext(
                        "https://github.com/anchore/scan-action/releases/tag/v6.0.0",
                      ),
                      t: ext(
                        `https://github.com/aquasecurity/trivy/releases/tag/v${facts.toolVersions.trivy}`,
                      ),
                      w: src(".github/workflows/security-scan.yml#L15-L37"),
                      q: src(".github/workflows/codeql.yml"),
                      s: src(".github/workflows/codeql-swift.yml"),
                    }}
                  >
                    {
                      "<g>grype</g> over the bills and <t>trivy</t> over the images <w>every Monday and on a pull request that changes a dependency or an image</w>; CodeQL for <q>TypeScript</q> and <s>Swift</s> in their own workflows"
                    }
                  </T>
                ),
              },
            ].map((r) => (
              <div
                key={r.href}
                className="border border-(--border) rounded-lg p-4 hover:border-indigo-500/50 transition-colors"
              >
                <h4 className="font-semibold text-sm mb-1 text-indigo-700 dark:text-indigo-400">
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {r.title}
                    <ExternalLink size={12} />
                  </a>
                </h4>
                <p className="text-(--text-secondary) text-xs">{r.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-(--text-secondary) text-sm mt-4">
            <T
              area="docsDeveloper"
              tags={{
                c,
                g: srcCode("scripts/security/generate-sbom.sh"),
                s: srcCode("scripts/security/scan-repo.sh"),
                h: srcCode("scripts/security/check-hub-blackbox.sh"),
                p: srcCode(
                  "clients/ios/Tests/SharedTests/SecurityPostureTests.swift",
                ),
                x: adr("ADR-011-security-testing.md"),
                y: adr(
                  "ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md",
                ),
              }}
            >
              {
                "Run it again: <g>scripts/security/generate-sbom.sh</g> <c>--check</c>, <s>scripts/security/scan-repo.sh</s>, <h>scripts/security/check-hub-blackbox.sh</h> and <c>swift test --filter</c> <p>SecurityPostureTests</p> in <c>clients/ios</c>. Decisions: <x>ADR-011</x> (security testing) and <y>ADR-060</y> (the app lock; why pinning and jailbreak detection were declined)."
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
          <p className="text-(--text-secondary) text-sm mb-4">
            <T area="docsDeveloper" tags={{ c }}>
              {
                "Choose the kind of page by its reader. A report, guide or runbook read from start to end is Markdown under <c>docs/</c>, which the hub publishes; a page that shows live facts, diagrams and links into the hub is a hand-written React page. Both get numbered headings and the index at the right without further work."
              }
            </T>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Published documents")}
              </h4>
              <ol className="text-(--text-secondary) text-xs space-y-1.5 list-decimal ml-4 mb-2">
                <li>
                  <T area="docsDeveloper" tags={{ c }}>
                    {
                      "Write the Markdown under <c>docs/</c>, linking other files by relative path."
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      a: repoFile("scripts/gen-docs-content.py"),
                      e: route("/docs/ehds"),
                      o: route("/docs/operations"),
                      s: securityLink,
                      k: klarbefundLink,
                      d: route("/docs/developer"),
                    }}
                  >
                    {
                      "Add it to <a>DOCS in scripts/gen-docs-content.py</a> with a section, a slug and a one-line summary. The sections are those of the docs menu: <e>EHDS Regulation</e>, <o>Operations</o>, <s>Security and Data Protection</s>, <k>Klarbefund</k> and <d>Developer Guide</d>."
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      c,
                      p: srcCode("ui/src/content/published-docs.json"),
                      k: src(".pre-commit-config.yaml#L226-L231"),
                    }}
                  >
                    {
                      "Run <c>python3 scripts/gen-docs-content.py</c> and stage <p>ui/src/content/published-docs.json</p>; pre-commit runs <k>its --check</k>, so the copy never drifts from the source."
                    }
                  </T>
                </li>
              </ol>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile("docs/developer/api-integration-tests.md"),
                    p: route("/docs/developer/api-integration-tests"),
                    m: route(
                      "/docs/developer/sdlc#2-the-lifecycle-at-a-glance",
                    ),
                  }}
                >
                  {
                    "Example: <a>docs/developer/api-integration-tests.md</a> is the page <p>/docs/developer/api-integration-tests</p>. A link to another published document becomes its route, any other relative link a GitHub link; embedded images are copied, and a <c>mermaid</c> block is drawn, as in <m>the SDLC's lifecycle</m>."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Hand-written pages")}
              </h4>
              <p className="text-(--text-secondary) text-xs mb-2">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile("ui/src/app/docs/developer/page.tsx"),
                    m: repoFile("ui/src/messages", "tree"),
                    u: srcCode("ui/src/lib/i18n/translate.tsx"),
                    i: srcCode("ui/__tests__/unit/lib/i18n-messages.test.ts"),
                  }}
                >
                  {
                    "A page under <c>ui/src/app/docs/</c> is a React component, like this guide, <a>developer/page.tsx</a>. Its texts go through <u>useT()</u> and the dictionaries in <m>ui/src/messages/</m>, one per language; <i>i18n-messages.test.ts</i> fails on a text without an entry."
                  }
                </T>
              </p>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile("ui/src/components/docs/DocsToc.tsx"),
                  }}
                >
                  {
                    "<a>DocsToc</a> numbers every h2 and h3 and lists it in the index at the right; a heading inside a <c>nav</c> or a <c>data-toc-skip</c> block stays out, and one that shows its own number keeps it."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Diagrams in ArchiMate and UML")}
              </h4>
              <ol className="text-(--text-secondary) text-xs space-y-1.5 list-decimal ml-4 mb-2">
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      c,
                      l: externalLink(
                        "https://github.com/plantuml-stdlib/Archimate-PlantUML",
                      ),
                      v: externalLink(
                        "https://pubs.opengroup.org/architecture/archimate32-doc/",
                      ),
                      q: externalLink("https://plantuml.com/sequence-diagram"),
                      a: repoFile(
                        "docs/architecture/diagrams/cicd-pipeline.puml",
                      ),
                    }}
                  >
                    {
                      "Write the PlantUML source in <c>docs/<area>/diagrams/</c> with the <l>ArchiMate library</l> (<v>ArchiMate 3.2</v>) for structure, or as a <q>sequence diagram</q> where the order of messages matters. Example: <a>cicd-pipeline.puml</a>."
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      c,
                      a: repoFile("docs/architecture/img/cicd-pipeline.svg"),
                      b: repoFile(
                        "docs/architecture/diagrams/cicd-pipeline.labels.json",
                      ),
                      r: srcCode("scripts/render-plantuml.sh"),
                      p: srcCode("scripts/render-plantuml-i18n.py"),
                    }}
                  >
                    {
                      "Render it with <r>scripts/render-plantuml.sh</r> (needs <c>brew install plantuml</c>) to <a>img/cicd-pipeline.svg</a>; translate its labels in <b>cicd-pipeline.labels.json</b> and run <c>python3</c> <p>scripts/render-plantuml-i18n.py</p> for the German, French, Dutch and Spanish variants."
                    }
                  </T>
                </li>
                <li>
                  <T
                    area="docsDeveloper"
                    tags={{
                      a: cicdLink,
                      f: srcCode("ui/src/components/docs/DocFigure.tsx"),
                      v: srcCode("ui/src/components/docs/DocFigureViewer.tsx"),
                    }}
                  >
                    {
                      "Embed it with <f>DocFigure</f> inside a <v>DocFigureViewer</v>, as <a>the CI/CD section</a> of this page does; a click opens it full screen with zoom."
                    }
                  </T>
                </li>
              </ol>
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
              <p className="text-(--text-secondary) text-xs mb-2">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile(
                      "ui/__tests__/e2e/capture-guide-screenshots.spec.ts",
                    ),
                    g: repoFile("scripts/gen-localized-images.py"),
                    l: srcCode("ui/src/components/docs/LocalizedImage.tsx"),
                  }}
                >
                  {
                    "The user guide's previews are taken from the public demo by <a>capture-guide-screenshots.spec.ts</a> (<c>CAPTURE_GUIDE=1</c>, one WebP per page, <c>SCREENSHOT_LANG=de</c> for a language) and shown through <l>LocalizedImage</l>; <g>gen-localized-images.py</g> lists the translated variants."
                  }
                </T>
              </p>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile("clients/ios/Scripts/capture-screenshots.sh"),
                    i: repoFile("docs/klarbefund/img", "tree"),
                    k: klarbefundLink,
                  }}
                >
                  {
                    "Klarbefund's come from a simulator through <a>clients/ios/Scripts/capture-screenshots.sh</a> with the fictional dev dataset (<c>-MBDevData -MBShot <screen></c>), at half resolution under <i>docs/klarbefund/img/</i>, as in <k>the Klarbefund guides</k>. No real report, value or organisation may ever appear in one."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Facts and dates")}
              </h4>
              <p className="text-(--text-secondary) text-xs mb-2">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    j: srcCode("ui/src/app/docs/docs-facts.json"),
                    g: srcCode("scripts/gen-docs-facts.py"),
                  }}
                >
                  {
                    "Numbers on these pages (routes, services, hooks, versions) come from <j>ui/src/app/docs/docs-facts.json</j>, written by <g>scripts/gen-docs-facts.py</g> from the repository; the same script keeps each page's last-updated date, and its check fails a commit whose page changed without it. Run <c>python3 scripts/gen-docs-facts.py</c> after editing a docs page."
                  }
                </T>
              </p>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: cicdLink,
                    t: srcCode(".github/workflows/test.yml"),
                  }}
                >
                  {
                    "Example: the job list under <a>CI/CD Pipeline</a> is <c>facts.workflowJobs</c>, so a new job in <t>test.yml</t> appears there by itself."
                  }
                </T>
              </p>
            </div>
            <div className="border border-(--border) rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">
                {t("Translations")}
              </h4>
              <p className="text-(--text-secondary) text-xs">
                <T
                  area="docsDeveloper"
                  tags={{
                    c,
                    a: repoFile(
                      "docs/ADRs/ADR-071-the-documentation-follows-the-language-picker.md",
                    ),
                    e: repoFile("docs/i18n/de/ehds-article-numbering.md"),
                    s: srcCode("scripts/gen-docs-content.py#L396-L419"),
                  }}
                >
                  {
                    "Every page follows the language picker (<a>ADR-071</a>). A published document's translation is <c>docs/i18n/<lang>/<path></c>, stamped with the English file's hash by <s>gen-docs-content.py --stamp</s>, for example <e>the German article numbering</e>; <c>--report-i18n</c> lists what is missing or stale. A page's texts live in the dictionaries, a diagram's in its <c>.labels.json</c>, a screenshot's variant in a <c><lang>/</c> folder next to it."
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
            caption={
              <T area="docsDeveloper" tags={{ s: ext(SYNTHEA) }}>
                {
                  "Data pipeline: <s>Synthea</s> to Neo4j, then the proxy to the UI (sequence)"
                }
              </T>
            }
          />
        </section>

        {/* Release Notes */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-3" id="releases">
            {t("Release Notes")}
          </h2>
          <p className="text-(--text-secondary) text-sm mb-4">
            <T
              area="docsDeveloper"
              tags={{
                a: releasesLink,
                p: srcCode("ui/package.json#L3"),
                r: srcCode(".github/workflows/release.yml"),
              }}
            >
              {
                "The version is the one in <p>ui/package.json</p>; when a merge to main changes it, <r>release.yml</r> tags it and publishes the release. <a>How releases and the TestFlight builds of the iPhone app work</a>"
              }
            </T>
          </p>
          <div className="space-y-3">
            {[
              {
                version: "v2.1.0",
                date: "2026-11-04",
                highlights: t(
                  "Confidential SPE workspaces that start on demand, EUDI Wallet sign-in, the interface and documentation in five languages, Klarbefund connects to the hub",
                ),
              },
              {
                version: "v2.0.0",
                date: "2026-09-29",
                highlights: t(
                  "Klarbefund iPhone app, an overview per persona, the access body's tasks, compliance suites that can fail",
                ),
              },
              {
                version: "v1.5.0",
                date: "2026-04-18",
                highlights: t(
                  "GraphRAG for natural-language queries (GDS, FastRP, reranking), releases published automatically",
                ),
              },
              {
                version: "v1.2.0",
                date: "2026-04-12",
                highlights: t(
                  "Azure Container Apps deployment, SIMPL-Open gap analysis, nightly demo reset, 14 ADRs, quality gates documentation",
                ),
              },
              {
                version: "v1.1.0",
                date: "2026-04-11",
                highlights: t(
                  "WCAG 2.2 AA zero violations, ODRL policy enforcement, OWASP/BSI security pentest, 778 Playwright assertions",
                ),
              },
              {
                version: "v1.0.0",
                date: "2026-03-30",
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
                desc: t(
                  "pr-gate.yml, test.yml, nightly.yml with compliance.yml, security-scan.yml, codeql.yml, codeql-swift.yml, pages.yml, deploy-azure.yml, release.yml, aca-schedule.yml, reset-demo.yml, and one-off operations workflows",
                ),
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
                <T
                  area="docsDeveloper"
                  tags={{
                    b,
                    a: ext("https://www.conventionalcommits.org/en/v1.0.0/"),
                  }}
                >
                  {
                    "<b>Commit messages:</b> <a>Conventional Commits</a> format (feat:, fix:, docs:, chore:)"
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
                  tags={{
                    b,
                    a: qualityGatesLink,
                    f: srcCode(".pre-commit-config.yaml"),
                    p: ext(
                      "https://github.com/prettier/prettier/releases/tag/3.1.0",
                    ),
                    s: ext("https://semgrep.dev/docs/"),
                    g: ext(
                      `https://github.com/gitleaks/gitleaks/releases/tag/v${facts.toolVersions.gitleaks}`,
                    ),
                  }}
                  vars={{ n: PRE_COMMIT_HOOKS }}
                >
                  {
                    "<b>Pre-commit:</b> {n} hooks in <f>.pre-commit-config.yaml</f>, listed on the <a>quality gates page</a>: <p>Prettier</p>, ESLint, TypeScript, <s>Semgrep</s>, <g>gitleaks</g>, the API collection check and more"
                  }
                </T>
              </li>
              <li>
                <T
                  area="docsDeveloper"
                  tags={{
                    b,
                    v: src(".pre-commit-config.yaml#L83-L92"),
                    n: src(".pre-commit-config.yaml#L281-L292"),
                    p: src(".pre-commit-config.yaml#L94-L108"),
                    q: src(".pre-commit-config.yaml#L110-L125"),
                  }}
                >
                  {
                    "<b>Pre-push:</b> <v>Full Vitest suite (--bail)</v>, <n>npm audit (HIGH+)</n>, and, when the iPhone app changed, <p>its analyte parity check</p> and <q>CodeQL</q>"
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
                <T
                  area="docsDeveloper"
                  tags={{
                    b,
                    s: src("ui/tsconfig.json#L6"),
                    p: src("ui/tsconfig.json#L20-L22"),
                  }}
                >
                  {
                    "<b>TypeScript:</b> <s>Strict mode</s>, no any, <p>@/* path alias → ui/src/*</p>"
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
