"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  FlaskConical,
  Lock,
  Gauge,
  FileCheck,
  Scale,
  Boxes,
  Accessibility,
  Server,
  RefreshCw,
} from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";
import { DocsLastUpdated } from "@/components/docs/DocsLastUpdated";
import facts from "@/app/docs/docs-facts.json";
import { localizedChart } from "@/lib/i18n/diagrams";
import { useLanguage } from "@/lib/use-language";

/* ------------------------------------------------------------------ */
/*  Sources                                                            */
/* ------------------------------------------------------------------ */

const CI_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml";
const COMPLIANCE_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/compliance.yml";
const PAGES_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/pages.yml";

const REPO_BLOB =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/";
const ISSUES = "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/";

/** A file in this repository, at a line or a range (`L12-L20`). */
const repo = (path: string, lines?: string) =>
  `${REPO_BLOB}${path}${lines ? `#${lines}` : ""}`;

/** BSI C5:2020, the English catalogue; a criterion links to its PDF page. */
const C5_URL =
  "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=3";
const C5_PAGES = {
  "AM-01": 48, // Asset Inventory
  "OPS-22": 72, // Testing and Documentation of known Vulnerabilities
  "OPS-23": 73, // Managing Vulnerabilities ... System Hardening
  "CRY-04": 83, // Secure key management
  "DEV-01": 91, // Policies for the development/procurement of information systems
  "DEV-06": 94, // Testing changes
  "DEV-09": 95, // Approvals for provision in the production environment
  "PSS-02": 114, // Identification of Vulnerabilities of the Cloud Service
} as const;
type C5Id = keyof typeof C5_PAGES;

/** Cyber Resilience Act, Regulation (EU) 2024/2847. */
const CRA_URL = "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng";
/** EHDS, Regulation (EU) 2025/327, as adopted. */
const EHDS_URL = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";

/** OWASP Top 10, the 2021 edition: its numbering is the one used here. */
const OWASP_TOP10_2021 = "https://top10.owasp.org/2021/";
const OWASP_2021 = {
  A01: "https://top10.owasp.org/2021/A01_2021-Broken_Access_Control/",
  A05: "https://top10.owasp.org/2021/A05_2021-Security_Misconfiguration/",
  A06: "https://top10.owasp.org/2021/A06_2021-Vulnerable_and_Outdated_Components/",
  A07: "https://top10.owasp.org/2021/A07_2021-Identification_and_Authentication_Failures/",
} as const;
type OwaspId = keyof typeof OWASP_2021;

const WCAG22_URL = "https://www.w3.org/TR/WCAG22/";
const EN_301_549_URL =
  "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf";
const WAD_URL = "https://eur-lex.europa.eu/eli/dir/2016/2102/oj/eng";
const NSA_K8S_URL =
  "https://www.cisa.gov/news-events/alerts/2022/03/15/updated-kubernetes-hardening-guide";
const CIS_K8S_URL = "https://www.cisecurity.org/benchmark/kubernetes";
const CORE_WEB_VITALS_URL = "https://web.dev/articles/vitals";
const NTIA_SBOM_URL =
  "https://www.ntia.gov/sites/default/files/publications/sbom_minimum_elements_report_0.pdf";
const CYCLONEDX_15_URL = "https://cyclonedx.org/docs/1.5/json/";
const CYCLONEDX_17_URL = "https://cyclonedx.org/docs/1.7/json/";
const DSP_URL =
  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/";
const DCP_URL =
  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/";
const DSP_TCK_URL =
  "https://github.com/eclipse-dataspacetck/dsp-tck/releases/tag/v1.0.2";
const DCP_TCK_URL = "https://github.com/eclipse-dataspacetck/dcp-tck/releases";
const ODRL_MODEL_URL =
  "https://www.w3.org/TR/odrl-model/#x2-odrl-information-model";
const OPENAPI_URL = `https://spec.openapis.org/oas/v${facts.openapi.version}.html`;
const JAD_URL =
  "https://github.com/Metaform/jad/tree/4a7e5bd096c58814748e956cc9329586ad309698";
const ADR_074_URL = repo(
  "docs/ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md",
);
const ADR_078_URL = repo(
  "docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md",
);

const release = (repoPath: string, tag: string) =>
  `https://github.com/${repoPath}/releases/tag/${tag}`;

/* ------------------------------------------------------------------ */
/*  Link helpers                                                       */
/* ------------------------------------------------------------------ */

function Src({
  href,
  children,
  mono = false,
}: {
  href: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-(--accent) hover:underline${mono ? " font-mono" : ""}`}
    >
      {children}
    </a>
  );
}

/** A repository file, shown by name, linked at its line. */
function RepoFile({
  path,
  lines,
  children,
}: {
  path: string;
  lines?: string;
  children?: ReactNode;
}) {
  return (
    <Src href={repo(path, lines)} mono>
      {children ?? path}
    </Src>
  );
}

function C5({ id }: { id: C5Id }) {
  return <Src href={`${C5_URL}#page=${C5_PAGES[id]}`}>C5 {id}</Src>;
}

function Owasp({ id }: { id: OwaspId }) {
  return <Src href={OWASP_2021[id]}>OWASP {id}:2021</Src>;
}

function Cra({ anchor, children }: { anchor: string; children: ReactNode }) {
  return <Src href={`${CRA_URL}#${anchor}`}>{children}</Src>;
}

function Ehds({ art }: { art: number }) {
  return <Src href={`${EHDS_URL}#art_${art}`}>EHDS Art. {art}</Src>;
}

/** Elements joined with ", " in a table cell. */
function List({ items }: { items: ReactNode[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {item}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface CiGate {
  job: string;
  tests: string;
  tool: ReactNode;
  blocking: boolean;
  standard: ReactNode;
}

const ciGates: CiGate[] = [
  {
    job: "PR Gate",
    tests: "—",
    tool: (
      <>
        <RepoFile path=".github/workflows/pr-gate.yml" lines="L29-L123">
          pr-gate.yml
        </RepoFile>
        : pre-commit on the diff, API spec drift, Bruno coverage, knip, gitleaks
        over the pull request&apos;s commits
      </>
    ),
    blocking: true,
    standard: <C5 id="DEV-09" />,
  },
  {
    job: "CodeQL",
    tests: "—",
    tool: (
      <>
        <RepoFile path=".github/workflows/codeql.yml" lines="L44-L56">
          codeql.yml
        </RepoFile>{" "}
        (JS/TS, Python, Actions) on every PR;{" "}
        <RepoFile path=".github/workflows/codeql-swift.yml" lines="L36-L38">
          codeql-swift.yml
        </RepoFile>{" "}
        when clients/ios changes, or locally with{" "}
        <RepoFile path="clients/ios/Scripts/codeql-swift.sh">
          Scripts/codeql-swift.sh
        </RepoFile>
      </>
    ),
    blocking: false,
    standard: (
      <List
        items={[
          <C5 key="c5" id="PSS-02" />,
          <Src key="owasp" href={OWASP_TOP10_2021}>
            OWASP Top 10 (2021)
          </Src>,
        ]}
      />
    ),
  },
  {
    job: "Security scan",
    tests: "—",
    tool: (
      <>
        Source SBOM, image and deployed-image CVEs (
        <RepoFile path=".github/workflows/security-scan.yml" lines="L50-L90">
          security-scan.yml
        </RepoFile>
        ). CVEs fail a run only when a manual run asks for it (
        <RepoFile path=".github/workflows/security-scan.yml" lines="L317-L329">
          severity gate
        </RepoFile>
        )
      </>
    ),
    blocking: false,
    standard: (
      <List
        items={[
          <C5 key="c5" id="OPS-22" />,
          <Cra key="cra" anchor="anx_I">
            CRA Annex I, Part II (1)
          </Cra>,
        ]}
      />
    ),
  },
  {
    job: "UI Tests (Vitest)",
    tests: "—",
    tool: (
      <>
        <Src
          href={release("vitest-dev/vitest", `v${facts.toolVersions.vitest}`)}
        >
          Vitest {facts.toolVersions.vitest}
        </Src>{" "}
        + v8 coverage (
        <RepoFile path=".github/workflows/test.yml" lines="L112-L155">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: <C5 id="DEV-06" />,
  },
  {
    job: "Neo4j Proxy Tests",
    tests: "—",
    tool: (
      <>
        Vitest (
        <RepoFile path=".github/workflows/test.yml" lines="L156-L201">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: <C5 id="DEV-06" />,
  },
  {
    job: "Lint",
    tests: "—",
    tool: (
      <>
        Next.js ESLint, a pre-commit hook the PR Gate runs (
        <RepoFile path=".pre-commit-config.yaml" lines="L75-L79">
          .pre-commit-config.yaml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: <C5 id="DEV-06" />,
  },
  {
    job: "Secret Scan",
    tests: "—",
    tool: (
      <>
        <Src
          href={release("gitleaks/gitleaks", `v${facts.toolVersions.gitleaks}`)}
        >
          Gitleaks v{facts.toolVersions.gitleaks}
        </Src>{" "}
        over the whole history each night (
        <RepoFile path=".github/workflows/nightly.yml" lines="L330-L354">
          nightly.yml
        </RepoFile>
        ); the PR Gate scans the pull request&apos;s commits
      </>
    ),
    blocking: true,
    standard: (
      <List items={[<C5 key="c5" id="CRY-04" />, <Owasp key="o" id="A07" />]} />
    ),
  },
  {
    job: "Dependency Audit",
    tests: "—",
    tool: (
      <>
        npm audit, HIGH+ (
        <RepoFile path=".github/workflows/test.yml" lines="L478-L486">
          test.yml
        </RepoFile>
        , through{" "}
        <RepoFile path="scripts/check-npm-audit.py">
          check-npm-audit.py
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: (
      <List items={[<C5 key="c5" id="PSS-02" />, <Owasp key="o" id="A06" />]} />
    ),
  },
  {
    job: "Trivy Scan",
    tests: "—",
    tool: (
      <>
        <Src
          href={release("aquasecurity/trivy", `v${facts.toolVersions.trivy}`)}
        >
          Trivy v{facts.toolVersions.trivy}
        </Src>{" "}
        (
        <RepoFile path=".github/workflows/test.yml" lines="L345-L398">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: false,
    standard: (
      <List items={[<C5 key="c5" id="OPS-22" />, <Owasp key="o" id="A06" />]} />
    ),
  },
  {
    job: "K8s Posture",
    tests: "—",
    tool: (
      <>
        Kubescape, NSA and CIS frameworks, critical findings (
        <RepoFile path=".github/workflows/test.yml" lines="L399-L445">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: (
      <List
        items={[
          <C5 key="c5" id="OPS-23" />,
          <Src key="nsa" href={NSA_K8S_URL}>
            NSA/CISA Kubernetes Hardening Guide
          </Src>,
          <Src key="cis" href={CIS_K8S_URL}>
            CIS Kubernetes Benchmark
          </Src>,
        ]}
      />
    ),
  },
  {
    job: "E2E Tests",
    tests: "—",
    tool: (
      <>
        <Src
          href={release(
            "microsoft/playwright",
            `v${facts.toolVersions.playwright}`,
          )}
        >
          Playwright v{facts.toolVersions.playwright}
        </Src>
        , nightly (
        <RepoFile path=".github/workflows/nightly.yml" lines="L177-L185">
          nightly.yml
        </RepoFile>
        )
      </>
    ),
    blocking: false,
    standard: "—",
  },
  {
    job: "WCAG 2.2 AA Audit",
    tests: "—",
    tool: (
      <>
        axe-core/playwright, nightly (
        <RepoFile path=".github/workflows/nightly.yml" lines="L197-L199">
          nightly.yml
        </RepoFile>
        , continue-on-error)
      </>
    ),
    blocking: false,
    standard: (
      <List
        items={[
          <Src key="wcag" href={WCAG22_URL}>
            WCAG 2.2 AA
          </Src>,
          <Src key="en" href={EN_301_549_URL}>
            EN 301 549
          </Src>,
        ]}
      />
    ),
  },
  {
    job: "Security Pentest",
    tests: "—",
    tool: (
      <>
        OWASP/BSI patterns,{" "}
        <RepoFile path="ui/__tests__/e2e/journeys/28-security-pentest.spec.ts">
          28-security-pentest.spec.ts
        </RepoFile>
        , nightly (
        <RepoFile path=".github/workflows/nightly.yml" lines="L208-L210">
          nightly.yml
        </RepoFile>
        )
      </>
    ),
    blocking: false,
    standard: (
      <List
        items={[
          <C5 key="c5" id="PSS-02" />,
          <Src key="owasp" href={OWASP_TOP10_2021}>
            OWASP Top 10 (2021)
          </Src>,
        ]}
      />
    ),
  },
  {
    job: "SBOM Generation",
    tests: "2",
    tool: (
      <>
        CycloneDX npm, <Src href={CYCLONEDX_15_URL}>CycloneDX 1.5</Src> (
        <RepoFile path=".github/workflows/test.yml" lines="L512-L531">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: (
      <List
        items={[
          <Cra key="cra" anchor="anx_I">
            CRA Annex I, Part II (1)
          </Cra>,
          <C5 key="c5" id="AM-01" />,
        ]}
      />
    ),
  },
  {
    job: "Licence Compliance",
    tests: "—",
    tool: (
      <>
        license-checker-rseidelsohn 4.4.2 with an allowlist (
        <RepoFile path=".github/workflows/test.yml" lines="L559-L565">
          test.yml
        </RepoFile>
        )
      </>
    ),
    blocking: true,
    standard: "No C5 criterion or CRA article requires it",
  },
  {
    job: "Lighthouse CI",
    tests: "12",
    tool: (
      <>
        Lighthouse CI (4 pages × 3 runs), nightly (
        <RepoFile path=".github/workflows/nightly.yml" lines="L254-L310">
          nightly.yml
        </RepoFile>
        )
      </>
    ),
    blocking: false,
    standard: <Src href={CORE_WEB_VITALS_URL}>Core Web Vitals</Src>,
  },
];

const coverageData = Object.entries(facts.coverageThresholds).map(
  ([metric, value]) => ({
    metric: metric[0].toUpperCase() + metric.slice(1),
    value: `≥ ${value}%`,
  }),
);

const DSP_CHECKS: ReactNode = (
  <>
    <Src href={DSP_URL}>Dataspace Protocol</Src>: the hub&apos;s own checks (
    <RepoFile path="scripts/run-ehds-dataspace-checks.sh" lines="L5-L9">
      run-ehds-dataspace-checks.sh
    </RepoFile>
    ), not the <Src href={DSP_TCK_URL}>Eclipse DSP TCK</Src>
  </>
);
const DCP_CHECKS: ReactNode = (
  <>
    <Src href={DCP_URL}>Decentralised Claims</Src>: the hub&apos;s own checks (
    <RepoFile path="scripts/run-ehds-identity-checks.sh" lines="L5-L9">
      run-ehds-identity-checks.sh
    </RepoFile>
    ), not the <Src href={DCP_TCK_URL}>Eclipse DCP TCK</Src>
  </>
);
const EHDS_CHECKS: ReactNode = (
  <>
    <Ehds art={53} /> purposes, <Ehds art={71} /> opt-out, HealthDCAT-AP,
    EEHRxF, OMOP (
    <RepoFile path="scripts/run-ehds-tests.sh">run-ehds-tests.sh</RepoFile>)
  </>
);

const SUITE_NAMES: Record<string, [string, ReactNode]> = {
  "dsp-tck-results": ["DSP 2025-1 checks", DSP_CHECKS],
  "dcp-compliance-results": ["DCP v1.0 checks", DCP_CHECKS],
  "ehds-compliance-results": ["EHDS Domain", EHDS_CHECKS],
  "bruno-api-results": ["API collection (CI)", "Bruno, persona folders"],
  "bruno-api-azure-results": ["API collection (Azure)", "Bruno, ehds.mabu.red"],
  "dsp-azure-results": ["DSP 2025-1 checks (Azure)", DSP_CHECKS],
  "dcp-azure-results": ["DCP v1.0 checks (Azure)", DCP_CHECKS],
  "ehds-azure-results": ["EHDS Domain (Azure)", EHDS_CHECKS],
};

const complianceSuites = Object.entries(facts.complianceFloors).map(
  ([key, floor]) => ({
    suite: SUITE_NAMES[key]?.[0] ?? key,
    protocol: SUITE_NAMES[key]?.[1] ?? "",
    minPassed: floor.min_passed,
    maxFailed: floor.max_failed,
  }),
);

interface FutureGate {
  priority: number;
  title: string;
  icon: React.ElementType;
  description: ReactNode;
  standard: ReactNode;
  rationale: ReactNode;
  effort: string;
}

const futureGates: FutureGate[] = [
  {
    priority: 1,
    title: "Enforce Coverage Thresholds",
    icon: FlaskConical,
    description: (
      <>
        Minimum coverage thresholds in{" "}
        <RepoFile path="ui/vitest.config.ts" lines="L36-L41">
          vitest.config.ts
        </RepoFile>
        : {facts.coverageThresholds.statements}% statements,{" "}
        {facts.coverageThresholds.branches}% branches,{" "}
        {facts.coverageThresholds.functions}% functions,{" "}
        {facts.coverageThresholds.lines}% lines. Vitest fails if coverage drops
        below.
      </>
    ),
    standard: <C5 id="DEV-06" />,
    rationale:
      "Enforcement prevents silent regression; raise a floor whenever coverage rises.",
    effort: "Done: vitest.config.ts",
  },
  {
    priority: 2,
    title: "Mutation Testing",
    icon: FlaskConical,
    description: (
      <>
        Add <Src href="https://stryker-mutator.io/">Stryker Mutator</Src> to
        measure test effectiveness. Target mutation score &gt; 60%.
      </>
    ),
    standard: <C5 id="DEV-06" />,
    rationale:
      "Line coverage does not guarantee tests catch bugs. Mutation testing verifies tests detect real defects.",
    effort: "Medium: new tool + CI job",
  },
  {
    priority: 3,
    title: "Licence Compliance Scanning",
    icon: Scale,
    description: (
      <>
        license-checker-rseidelsohn in CI with an allowlist (
        <RepoFile path=".github/workflows/test.yml" lines="L559-L565">
          test.yml
        </RepoFile>
        ): MIT, Apache-2.0, ISC, BSD-2/3-Clause, 0BSD, CC0-1.0, CC-BY-4.0,
        Unlicense, Python-2.0, BlueOak-1.0.0, LGPL-3.0-or-later. The job fails
        on any production dependency under another licence.
      </>
    ),
    standard: "No C5 criterion or CRA article requires it",
    rationale:
      "Neither the CRA nor BSI C5 asks for a licence check. It keeps the dependencies compatible with the hub's Apache-2.0 licence.",
    effort: "Done: implemented in test.yml",
  },
  {
    priority: 4,
    title: "API Contract Testing",
    icon: FileCheck,
    description: (
      <>
        <RepoFile path="scripts/check-api-spec-drift.py" /> already blocks any
        new route missing from openapi.yaml ({facts.openapi.operations}{" "}
        operations documented). Next: validate response shapes against the spec
        with swagger-parser or Prism.
      </>
    ),
    standard: <Src href={OPENAPI_URL}>OpenAPI {facts.openapi.version}</Src>,
    rationale:
      "No formal schema enforces response shapes. Contract tests prevent frontend/backend drift.",
    effort: "Partly done: spec drift ratchet in the PR Gate",
  },
  {
    priority: 5,
    title: "SBOM Generation",
    icon: Boxes,
    description: (
      <>
        <Src href={CYCLONEDX_15_URL}>CycloneDX 1.5</Src> SBOM generated on every
        CI run for UI and Neo4j Proxy, uploaded as a 90-day artifact (
        <RepoFile path=".github/workflows/test.yml" lines="L512-L531">
          test.yml
        </RepoFile>
        ). The bills committed in{" "}
        <RepoFile path="docs/sbom/README.md">docs/sbom</RepoFile> are{" "}
        <Src href={CYCLONEDX_17_URL}>CycloneDX 1.7</Src>, made by syft (
        <RepoFile path="scripts/security/generate-sbom.sh" lines="L68">
          generate-sbom.sh
        </RepoFile>
        ); the iPhone app&apos;s is 1.5. The CRA asks for a software bill of
        materials in a commonly used, machine-readable format (
        <Cra anchor="anx_I">Annex I, Part II (1)</Cra>); the Commission may fix
        its format by implementing act (<Cra anchor="013.024">Art. 13(24)</Cra>
        ).
      </>
    ),
    standard: (
      <List
        items={[
          <Cra key="cra" anchor="anx_I">
            CRA Annex I, Part II (1)
          </Cra>,
          <Src key="ntia" href={NTIA_SBOM_URL}>
            NTIA SBOM minimum elements
          </Src>,
          <C5 key="c5" id="AM-01" />,
        ]}
      />
    ),
    rationale: (
      <>
        Supply chain attacks (XZ Utils,{" "}
        <Src href="https://www.cve.org/CVERecord?id=CVE-2024-3094">
          CVE-2024-3094
        </Src>
        ; the Trivy compromise,{" "}
        <Src href="https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23">
          GHSA-69fq-xp46-6x23
        </Src>
        ) make SBOMs non-negotiable. The CRA&apos;s Annex I applies from 11
        December 2027 (<Cra anchor="071.002">Art. 71(2)</Cra>).
      </>
    ),
    effort: "Done: implemented in test.yml",
  },
  {
    priority: 6,
    title: "Performance Regression Testing",
    icon: Gauge,
    description: (
      <>
        Lighthouse CI with Core Web Vitals budgets: LCP &lt; 4s (error), CLS
        &lt; 0.1 (error), TBT &lt; 300ms (warn), script size &lt; 500 KB (warn)
        (
        <RepoFile path=".github/workflows/nightly.yml" lines="L306-L310">
          nightly.yml
        </RepoFile>
        ). Runs on 4 key pages.
      </>
    ),
    standard: <Src href={CORE_WEB_VITALS_URL}>Core Web Vitals</Src>,
    rationale: (
      <>
        Healthcare professionals use the platform under time pressure. A budget
        error turns the nightly run red, which opens an issue; it does not block
        a merge (<Src href={ADR_074_URL}>ADR-074</Src>).
      </>
    ),
    effort: "Done: Lighthouse CI in nightly.yml",
  },
  {
    priority: 7,
    title: "Runtime ODRL Policy Enforcement",
    icon: Lock,
    description:
      "Implement ODRL engine: validate API responses respect the caller's permitted datasets and temporal limits.",
    standard: (
      <List
        items={[
          <Ehds key="ehds" art={66} />,
          <Src key="odrl" href={ODRL_MODEL_URL}>
            ODRL 2.2 §2
          </Src>,
        ]}
      />
    ),
    rationale:
      "Currently ODRL policies are decorative. Any authenticated user can query any dataset. This is the largest EHDS compliance gap.",
    effort: "High: new engine + tests",
  },
  {
    priority: 8,
    title: "WCAG Blocking Gate",
    icon: Accessibility,
    description: (
      <>
        WCAG 2.2 AA audit with a zero-violation budget. Since it moved to the
        nightly run (<Src href={ADR_074_URL}>ADR-074</Src>) it runs with
        continue-on-error (
        <RepoFile path=".github/workflows/nightly.yml" lines="L197-L199">
          nightly.yml
        </RepoFile>
        ), so a violation shows in the report but fails nothing.
      </>
    ),
    standard: (
      <List
        items={[
          <Src key="en" href={EN_301_549_URL}>
            EN 301 549
          </Src>,
          <Src key="wad" href={WAD_URL}>
            Directive (EU) 2016/2102
          </Src>,
        ]}
      />
    ),
    rationale:
      "The audit found zero violations when it last blocked. To block again it needs a step that fails the nightly job.",
    effort: "Partly done: runs nightly, does not block",
  },
  {
    priority: 9,
    title: "IaC Policy Enforcement",
    icon: Server,
    description: (
      <>
        Kubescape blocks on critical findings (--severity-threshold critical)
        under the NSA and CIS frameworks (
        <RepoFile path=".github/workflows/test.yml" lines="L419-L445">
          test.yml
        </RepoFile>
        ).
      </>
    ),
    standard: (
      <List
        items={[
          <C5 key="c5" id="OPS-23" />,
          <Src key="nsa" href={NSA_K8S_URL}>
            NSA/CISA Kubernetes Hardening Guide
          </Src>,
        ]}
      />
    ),
    rationale:
      "K8s manifests define production topology. Critical security findings now block the build.",
    effort: "Done: blocking in test.yml",
  },
  {
    priority: 10,
    title: "Dependency Freshness",
    icon: RefreshCw,
    description: (
      <>
        Renovate Bot configured (
        <RepoFile path="renovate.json" lines="L5-L42">
          renovate.json
        </RepoFile>
        ): auto-merge patches, weekly PRs for minor, manual review for major.
        Security updates bypass schedule.
      </>
    ),
    standard: (
      <List
        items={[
          <Owasp key="o" id="A06" />,
          <C5 key="c5" id="OPS-22" />,
          <Cra key="cra" anchor="anx_I">
            CRA Annex I, Part II (2)
          </Cra>,
        ]}
      />
    ),
    rationale: (
      <>
        Automated dependency updates prevent CVE accumulation. The CRA asks
        manufacturers to remediate vulnerabilities without delay, including by
        security updates (<Cra anchor="anx_I">Annex I, Part II (2)</Cra>).
      </>
    ),
    effort: "Done: renovate.json",
  },
];

/** The compliance mapping: each cell names the criterion and links it. */
const DASH = "—";
const complianceMatrix: {
  gate: string;
  c5: ReactNode;
  owasp: ReactNode;
  cra: ReactNode;
  ehds: ReactNode;
  wcag: ReactNode;
}[] = [
  {
    gate: "TypeScript strict",
    c5: <C5 id="DEV-01" />,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "ESLint",
    c5: <C5 id="DEV-06" />,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Unit tests + coverage thresholds",
    c5: <C5 id="DEV-06" />,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Secret scan (Gitleaks)",
    c5: <C5 id="CRY-04" />,
    owasp: <Owasp id="A07" />,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Dependency audit",
    c5: <C5 id="PSS-02" />,
    owasp: <Owasp id="A06" />,
    cra: <Cra anchor="anx_I">Annex I, Part II (1)</Cra>,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Trivy vuln scan",
    c5: <C5 id="OPS-22" />,
    owasp: <Owasp id="A06" />,
    cra: <Cra anchor="anx_I">Annex I, Part II (1)</Cra>,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Security headers",
    c5: <C5 id="OPS-23" />,
    owasp: <Owasp id="A05" />,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "WCAG 2.2 AA (nightly, reports)",
    c5: DASH,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: <Src href={WCAG22_URL}>2.2 AA</Src>,
  },
  {
    gate: "DSP 2025-1 checks (own, not the TCK)",
    c5: DASH,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "DCP v1.0 checks (own, not the TCK)",
    c5: DASH,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "EHDS domain tests",
    c5: DASH,
    owasp: DASH,
    cra: DASH,
    ehds: (
      <List items={[<Ehds key="53" art={53} />, <Ehds key="71" art={71} />]} />
    ),
    wcag: DASH,
  },
  {
    gate: "SBOM (CycloneDX 1.5 in CI)",
    c5: <C5 id="AM-01" />,
    owasp: <Owasp id="A06" />,
    cra: <Cra anchor="anx_I">Annex I, Part II (1)</Cra>,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Licence compliance",
    c5: "No C5 criterion",
    owasp: DASH,
    cra: "No CRA article",
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Lighthouse perf budget",
    c5: DASH,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Kubescape (blocking)",
    c5: <C5 id="OPS-23" />,
    owasp: DASH,
    cra: DASH,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "Renovate freshness",
    c5: <C5 id="OPS-22" />,
    owasp: <Owasp id="A06" />,
    cra: <Cra anchor="anx_I">Annex I, Part II (2)</Cra>,
    ehds: DASH,
    wcag: DASH,
  },
  {
    gate: "ODRL enforcement (planned)",
    c5: DASH,
    owasp: <Owasp id="A01" />,
    cra: DASH,
    ehds: <Ehds art={66} />,
    wcag: DASH,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Badge({ blocking }: { blocking: boolean }) {
  return blocking ? (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
      Blocks
    </span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
      Reports
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  const color = effort.startsWith("Done")
    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
    : effort.startsWith("Low")
      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
      : effort.startsWith("High")
        ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
        : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300";
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm ${color}`}
    >
      {effort}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function QualityGatesPage() {
  const lang = useLanguage();
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <Link
        href="/docs/developer"
        className="inline-flex items-center gap-1 text-sm text-(--text-secondary) hover:text-(--text-primary) mb-6"
      >
        <ArrowLeft size={14} /> Back to Developer Guide
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={28} className="text-(--accent)" />
        <h1 className="text-3xl font-bold">Quality Gates</h1>
      </div>
      <DocsLastUpdated page="/docs/developer/quality-gates" />
      <p className="text-(--text-secondary) mb-8">
        Every check enforced from developer workstation to production
        deployment, mapped to <Src href={C5_URL}>BSI C5:2020</Src>, the{" "}
        <Src href={OWASP_TOP10_2021}>OWASP Top 10 (2021)</Src>, the{" "}
        <Src href={CRA_URL}>Cyber Resilience Act</Src>, the{" "}
        <Src href={EHDS_URL}>EHDS regulation</Src> and{" "}
        <Src href={WCAG22_URL}>WCAG 2.2 AA</Src> where a criterion fits, and
        left unmapped where none does.
      </p>

      {/* TOC */}
      <nav className="border border-(--border) rounded-xl p-5 mb-10">
        <h2 className="font-semibold mb-3">Contents</h2>
        <ul className="text-sm space-y-1.5 text-(--accent)">
          {[
            ["#pipeline", "Pipeline Overview"],
            ["#pre-commit", "Stage 1 — Pre-commit Hooks"],
            ["#pre-push", "Stage 2 — Pre-push Gates"],
            ["#ci", "Stage 3 — CI Pipeline"],
            ["#compliance", "Stage 4 — Protocol Compliance"],
            ["#coverage", "Current Coverage"],
            ["#future", "Future Quality Gates"],
            ["#matrix", "Compliance Mapping"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Pipeline Overview */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="pipeline">
          Pipeline Overview
        </h2>
        <MermaidDiagram
          chart={localizedChart("quality-gates-pipeline", lang)}
          caption="Four-stage quality pipeline from commit to compliance"
        />
      </section>

      {/* Pre-commit */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="pre-commit">
          Stage 1 — Pre-commit Hooks
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          The {facts.preCommitHooks.length} hooks configured in{" "}
          <RepoFile path=".pre-commit-config.yaml" />, in the order they run.
          They run before every <code>git commit</code>, and the PR Gate runs
          them again on the pull request&apos;s diff. Hooks that rewrite a file
          (Prettier, end-of-file) fail the commit; stage the file again and
          commit.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-(--border) rounded-lg">
            <thead className="bg-(--surface-2)">
              <tr>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Hook
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Source
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Stage
                </th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              {facts.preCommitHooks.map((h) => (
                <tr key={h.id} className="border-t border-(--border)">
                  <td className="px-3 py-2 text-xs">{h.name}</td>
                  <td className="px-3 py-2 text-xs font-mono">{h.source}</td>
                  <td className="px-3 py-2 text-xs">{h.stage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pre-push */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="pre-push">
          Stage 2 — Pre-push Gates
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          Run before <code>git push</code>. These catch issues that are too slow
          for pre-commit.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Unit Tests</h4>
            <p className="text-xs text-(--text-secondary) mb-2">
              <code>vitest run --bail 1</code>: stops on first failure (
              <RepoFile path=".pre-commit-config.yaml" lines="L86-L92">
                .pre-commit-config.yaml
              </RepoFile>
              )
            </p>
            <Badge blocking={true} />
          </div>
          <div className="border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Dependency Audit</h4>
            <p className="text-xs text-(--text-secondary) mb-2">
              <code>scripts/check-npm-audit.py ui --omit=dev</code>: npm audit,
              HIGH and CRITICAL fail unless excepted with an expiry (
              <RepoFile path=".pre-commit-config.yaml" lines="L287-L292">
                .pre-commit-config.yaml
              </RepoFile>
              )
            </p>
            <Badge blocking={true} />
          </div>
        </div>
      </section>

      {/* CI Pipeline */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="ci">
          Stage 3 — CI Pipeline
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          GitHub Actions workflow{" "}
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline font-mono"
          >
            .github/workflows/test.yml
          </a>{" "}
          runs {facts.workflowJobs["test.yml"].length} jobs on every push. The
          other rows run in the PR Gate, CodeQL, the security scan and the
          nightly run (<Src href={ADR_074_URL}>ADR-074</Src>); each row links
          the lines that run it. C5 criteria link to their page in the BSI
          C5:2020 catalogue; OWASP numbers are the 2021 edition.{" "}
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline text-xs"
          >
            View latest run &rarr;
          </a>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-(--border) rounded-lg">
            <thead className="bg-(--surface-2)">
              <tr>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Job
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Tests
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Tool
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Standard
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Gate
                </th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              {ciGates.map((g) => (
                <tr key={g.job} className="border-t border-(--border)">
                  <td className="px-3 py-2 text-xs font-semibold">{g.job}</td>
                  <td className="px-3 py-2 text-xs font-mono">{g.tests}</td>
                  <td className="px-3 py-2 text-xs">{g.tool}</td>
                  <td className="px-3 py-2 text-xs">{g.standard}</td>
                  <td className="px-3 py-2">
                    <Badge blocking={g.blocking} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-(--surface-2) border border-(--border) rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Supply-Chain Hardening</h4>
          <ul className="text-xs text-(--text-secondary) space-y-1 list-disc ml-4">
            <li>
              Trivy (
              <RepoFile path=".github/workflows/test.yml" lines="L345-L354">
                test.yml
              </RepoFile>
              ) and the nightly gitleaks (
              <RepoFile path=".github/workflows/nightly.yml" lines="L341-L351">
                nightly.yml
              </RepoFile>
              ) are pinned to exact versions and checked against their SHA-256
              checksums; the PR Gate pins its gitleaks version without a
              checksum check (
              <RepoFile path=".github/workflows/pr-gate.yml" lines="L53-L58">
                pr-gate.yml
              </RepoFile>
              )
            </li>
            <li>
              <Src href={release("aquasecurity/trivy", "v0.69.3")}>
                Trivy v0.69.3
              </Src>{" "}
              used explicitly: versions 0.69.4 to 0.69.6 were compromised (
              <Src href="https://www.cve.org/CVERecord?id=CVE-2026-33634">
                CVE-2026-33634
              </Src>
              ,{" "}
              <Src href="https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23">
                GHSA-69fq-xp46-6x23
              </Src>
              )
            </li>
            <li>
              Ten fingerprints allowlisted in{" "}
              <RepoFile path=".gitleaksignore" />, each with the reason: local
              dev-stack credentials, false positives, and one dead session token
              kept in history
            </li>
          </ul>
        </div>

        <div className="mt-4 bg-(--surface-2) border border-(--border) rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            Security Headers (Runtime)
          </h4>
          <p className="text-xs text-(--text-secondary) mb-2">
            Set in{" "}
            <RepoFile path="ui/next.config.js" lines="L76-L123">
              next.config.js
            </RepoFile>
            ; the Content-Security-Policy is built per request, with a nonce, in{" "}
            <RepoFile path="ui/src/middleware.ts" lines="L92-L98">
              middleware.ts
            </RepoFile>
            . Not set in the static GitHub Pages build, which has no server (
            <C5 id="OPS-23" /> system hardening, <Owasp id="A05" /> Security
            Misconfiguration):
          </p>
          <div className="font-mono text-xs text-(--text-secondary) space-y-0.5">
            <div>X-Frame-Options: DENY</div>
            <div>X-Content-Type-Options: nosniff</div>
            <div>Referrer-Policy: strict-origin-when-cross-origin</div>
            <div>
              Permissions-Policy: camera=(), microphone=(), geolocation=(),
              interest-cohort=()
            </div>
            <div>
              Strict-Transport-Security: max-age=63072000; includeSubDomains;
              preload
            </div>
            <div>
              Content-Security-Policy: default-src &apos;self&apos;; script-src
              &apos;self&apos; with a per-request nonce
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="compliance">
          Stage 4 — Protocol Compliance
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          Once a night, when main has changed (
          <RepoFile path=".github/workflows/nightly.yml" lines="L376-L385">
            nightly.yml
          </RepoFile>
          , <Src href={ADR_074_URL}>ADR-074</Src>), and on manual dispatch. Each
          suite must stay at or above the floor recorded in{" "}
          <RepoFile path="scripts/compliance-baseline.json" lines="L16-L59">
            scripts/compliance-baseline.json
          </RepoFile>
          ; a floor is raised when a suite improves and never lowered without a
          reason. The DSP and DCP suites are the hub&apos;s own checks of its
          reading of the specifications, not the Eclipse TCKs; neither TCK has
          run against the hub yet (<Src href={`${ISSUES}338`}>#338</Src>).
          Workflow:{" "}
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline font-mono"
          >
            .github/workflows/compliance.yml
          </a>{" "}
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) hover:underline text-xs"
          >
            View latest run &rarr;
          </a>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {complianceSuites.map((s) => (
            <div
              key={s.suite}
              className="border border-(--border) rounded-lg p-4"
            >
              <h4 className="font-semibold text-sm mb-1">{s.suite}</h4>
              <p className="text-xs text-(--text-secondary) mb-2">
                {s.protocol}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-(--text-primary)">
                  ≥ {s.minPassed}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  passed, at most {s.maxFailed} failed
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-(--surface-2) border border-(--border) rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            Infrastructure Requirements
          </h4>
          <p className="text-xs text-(--text-secondary) mb-2">
            Protocol compliance tests require the full{" "}
            <Src href={JAD_URL}>JAD</Src> stack (
            <RepoFile path="docker-compose.jad.yml">
              {facts.composeServices["docker-compose.jad.yml"].length} services
            </RepoFile>
            , 8 GB RAM), on EDC 1.0 (<Src href={ADR_078_URL}>ADR-078</Src>). In
            CI, the workflow starts JAD infrastructure with graceful fallback:
            tests produce results only when the controlplane is healthy.
          </p>
          <p className="text-xs text-(--text-secondary)">
            Local execution:{" "}
            <RepoFile path="scripts/run-ehds-dataspace-checks.sh">
              ./scripts/run-ehds-dataspace-checks.sh
            </RepoFile>
            ,{" "}
            <RepoFile path="scripts/run-ehds-identity-checks.sh">
              ./scripts/run-ehds-identity-checks.sh
            </RepoFile>
            ,{" "}
            <RepoFile path="scripts/run-ehds-tests.sh">
              ./scripts/run-ehds-tests.sh
            </RepoFile>
            . The old names{" "}
            <RepoFile path="scripts/run-dsp-tck.sh" lines="L2-L5">
              run-dsp-tck.sh
            </RepoFile>{" "}
            and{" "}
            <RepoFile path="scripts/run-dcp-tests.sh" lines="L2-L5">
              run-dcp-tests.sh
            </RepoFile>{" "}
            are shims for the first two; despite the name, neither is a TCK.
          </p>
        </div>
      </section>

      {/* Coverage */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="coverage">
          Coverage Floors
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          Enforced by <RepoFile path="ui/vitest.config.ts" lines="L36-L41" />:
          the UI suite fails when coverage drops below these. The measured
          numbers are in the published test report.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {coverageData.map((c) => (
            <div
              key={c.metric}
              className="border border-(--border) rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-bold text-(--text-primary)">
                {c.value}
              </div>
              <div className="text-xs text-(--text-secondary)">{c.metric}</div>
            </div>
          ))}
        </div>
        <div className="bg-(--surface-2) border border-(--border) rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Test Inventory</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-(--text-primary)">
                Vitest
              </div>
              <div className="text-xs text-(--text-secondary)">
                Unit tests, UI and Neo4j proxy
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-(--text-primary)">
                Playwright
              </div>
              <div className="text-xs text-(--text-secondary)">
                E2E journeys, incl. WCAG 2.2 AA
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-(--text-primary)">
                {Object.keys(facts.complianceFloors).length}
              </div>
              <div className="text-xs text-(--text-secondary)">
                Compliance suites with a floor
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Future Gates */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="future">
          Future Quality Gates
        </h2>
        <p className="text-sm text-(--text-secondary) mb-6">
          Recommended improvements prioritised by impact and regulatory
          alignment.
        </p>
        <div className="space-y-4">
          {futureGates.map((g) => {
            const Icon = g.icon;
            return (
              <div
                key={g.priority}
                className="border border-(--border) rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-(--accent)/10 flex items-center justify-center text-xs font-bold text-(--accent)">
                    {g.priority}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Icon size={16} className="text-(--accent)" />
                      <h4 className="font-semibold text-sm">{g.title}</h4>
                      <EffortBadge effort={g.effort} />
                    </div>
                    <p className="text-xs text-(--text-secondary) mb-2">
                      {g.description}
                    </p>
                    <p className="text-xs text-(--text-secondary) italic mb-1">
                      {g.rationale}
                    </p>
                    <span className="text-[10px] font-mono text-(--text-secondary) bg-(--surface) px-2 py-0.5 rounded-sm">
                      {g.standard}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Compliance Matrix */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="matrix">
          Compliance Mapping
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-(--border) rounded-lg">
            <thead className="bg-(--surface-2)">
              <tr>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  Quality Gate
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  BSI C5:2020
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  OWASP 2021
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  CRA
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  EHDS
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  WCAG
                </th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary) text-xs">
              {complianceMatrix.map((row) => (
                <tr key={row.gate} className="border-t border-(--border)">
                  <td className="px-3 py-2 font-semibold">{row.gate}</td>
                  <td className="px-3 py-2">{row.c5}</td>
                  <td className="px-3 py-2">{row.owasp}</td>
                  <td className="px-3 py-2">{row.cra}</td>
                  <td className="px-3 py-2">{row.ehds}</td>
                  <td className="px-3 py-2">{row.wcag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Related */}
      <section className="bg-(--surface-2) border border-(--border) rounded-xl p-6">
        <h2 className="font-semibold mb-2">Related Documentation</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/developer"
            className="text-sm text-(--accent) hover:underline"
          >
            Developer Guide
          </Link>
          <Link
            href="/docs/architecture"
            className="text-sm text-(--accent) hover:underline"
          >
            Architecture
          </Link>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/quality-gates.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--accent) hover:underline"
          >
            Full Markdown (GitHub)
          </a>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/test-coverage-report.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--accent) hover:underline"
          >
            Coverage Report
          </a>
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--accent) hover:underline"
          >
            CI Pipeline (latest)
          </a>
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--accent) hover:underline"
          >
            Compliance Tests (latest)
          </a>
          <a
            href={PAGES_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-(--accent) hover:underline"
          >
            Pages Deploy (latest)
          </a>
        </div>
      </section>
    </div>
  );
}
