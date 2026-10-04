"use client";

import Link from "next/link";
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

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const pipelineDiagram = `graph LR
  subgraph "Stage 1 — Pre-commit (${facts.preCommitHooks.length} hooks)"
    PC1["Prettier<br/>Auto-format"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>max 55 warnings"]
    PC4["Semgrep<br/>Cypher injection rule"]
    PC5["ShellCheck + Hadolint"]
    PC6["Gitleaks<br/>Secret scan"]
  end

  subgraph "Stage 2 — Pre-push"
    PP1["Vitest<br/>--bail"]
    PP2["npm audit<br/>HIGH+ with time-boxed exceptions"]
  end

  subgraph "Stage 3 — Pull request"
    PR1["PR Gate<br/>hooks on the diff, API spec drift,<br/>Bruno coverage, knip"]
    CI1["Unit tests<br/>Vitest, UI + proxy"]
    CI5["Trivy + Kubescape"]
    CI6["CodeQL + security-scan<br/>source and image CVEs"]
    CI7["E2E<br/>Playwright journeys"]
    CI8["WCAG 2.2 AA<br/>axe-core"]
  end

  subgraph "Stage 4 — Compliance (floors)"
    CO1["DSP 2025-1 TCK<br/>≥ ${facts.complianceFloors["dsp-tck-results"].min_passed} passed"]
    CO2["DCP v1.0<br/>≥ ${facts.complianceFloors["dcp-compliance-results"].min_passed} passed"]
    CO3["EHDS domain<br/>≥ ${facts.complianceFloors["ehds-compliance-results"].min_passed} passed"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> PR1 & CI1 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`;

const CI_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml";
const COMPLIANCE_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/compliance.yml";
const PAGES_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/pages.yml";

const ciGates = [
  {
    job: "PR Gate",
    tests: "—",
    tool: "pre-commit on the diff, API spec drift, Bruno coverage, knip, gitleaks",
    blocking: true,
    standard: "BSI C5 DEV-02",
  },
  {
    job: "CodeQL",
    tests: "—",
    tool: "codeql.yml (JS/TS, Python, Actions) on every PR; codeql-swift.yml when clients/ios changes, or locally with Scripts/codeql-swift.sh",
    blocking: false,
    standard: "OWASP Top 10",
  },
  {
    job: "Security scan",
    tests: "—",
    tool: "Source SBOM, image and deployed-image CVEs (security-scan.yml)",
    blocking: true,
    standard: "EU CRA Art. 13",
  },
  {
    job: "UI Tests (Vitest)",
    tests: "—",
    tool: `Vitest ${facts.toolVersions.vitest} + v8 coverage`,
    blocking: true,
    standard: "BSI C5 DEV-03",
  },
  {
    job: "Neo4j Proxy Tests",
    tests: "—",
    tool: "Vitest",
    blocking: true,
    standard: "BSI C5 DEV-03",
  },
  {
    job: "Lint",
    tests: "—",
    tool: "Next.js ESLint",
    blocking: true,
    standard: "BSI C5 DEV-02",
  },
  {
    job: "Secret Scan",
    tests: "—",
    tool: `Gitleaks v${facts.toolVersions.gitleaks}`,
    blocking: true,
    standard: "BSI C5 DEV-08",
  },
  {
    job: "Dependency Audit",
    tests: "—",
    tool: "npm audit (HIGH+)",
    blocking: true,
    standard: "OWASP A06",
  },
  {
    job: "Trivy Scan",
    tests: "—",
    tool: `Trivy v${facts.toolVersions.trivy}`,
    blocking: false,
    standard: "OWASP A06",
  },
  {
    job: "K8s Posture",
    tests: "—",
    tool: "Kubescape (NSA + CIS)",
    blocking: true,
    standard: "NSA K8s Guide",
  },
  {
    job: "E2E Tests",
    tests: "—",
    tool: `Playwright v${facts.toolVersions.playwright}`,
    blocking: false,
    standard: "—",
  },
  {
    job: "WCAG 2.2 AA Audit",
    tests: "—",
    tool: "axe-core/playwright",
    blocking: true,
    standard: "EN 301 549",
  },
  {
    job: "Security Pentest",
    tests: "—",
    tool: "OWASP/BSI patterns",
    blocking: false,
    standard: "OWASP Top 10",
  },
  {
    job: "SBOM Generation",
    tests: "2",
    tool: "CycloneDX npm",
    blocking: true,
    standard: "EU CRA Art. 13",
  },
  {
    job: "Licence Compliance",
    tests: "—",
    tool: "license-checker",
    blocking: true,
    standard: "BSI C5 OPS-04",
  },
  {
    job: "Lighthouse CI",
    tests: "12",
    tool: "Lighthouse CI (4 pages × 3 runs)",
    blocking: false,
    standard: "Core Web Vitals",
  },
];

const coverageData = Object.entries(facts.coverageThresholds).map(
  ([metric, value]) => ({
    metric: metric[0].toUpperCase() + metric.slice(1),
    value: `≥ ${value}%`,
  }),
);

const SUITE_NAMES: Record<string, [string, string]> = {
  "dsp-tck-results": ["DSP 2025-1 TCK", "Dataspace Protocol"],
  "dcp-compliance-results": ["DCP v1.0", "Decentralised Claims"],
  "ehds-compliance-results": ["EHDS Domain", "EHDS Art. 3–51"],
  "bruno-api-results": ["API collection (CI)", "Bruno, persona folders"],
  "bruno-api-azure-results": ["API collection (Azure)", "Bruno, ehds.mabu.red"],
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
  description: string;
  standard: string;
  rationale: string;
  effort: string;
}

const futureGates: FutureGate[] = [
  {
    priority: 1,
    title: "Enforce Coverage Thresholds",
    icon: FlaskConical,
    description: `Minimum coverage thresholds in vitest.config.ts: ${facts.coverageThresholds.statements}% statements, ${facts.coverageThresholds.branches}% branches, ${facts.coverageThresholds.functions}% functions, ${facts.coverageThresholds.lines}% lines. Vitest fails if coverage drops below.`,
    standard: "BSI C5 DEV-03",
    rationale:
      "Enforcement prevents silent regression; raise a floor whenever coverage rises.",
    effort: "Done — vitest.config.ts",
  },
  {
    priority: 2,
    title: "Mutation Testing",
    icon: FlaskConical,
    description:
      "Add Stryker Mutator to measure test effectiveness. Target mutation score > 60%.",
    standard: "OWASP Testing Guide v4.2",
    rationale:
      "Line coverage does not guarantee tests catch bugs. Mutation testing verifies tests detect real defects.",
    effort: "Medium — new tool + CI job",
  },
  {
    priority: 3,
    title: "Licence Compliance Scanning",
    icon: Scale,
    description:
      "license-checker in CI with allowlist: MIT, Apache-2.0, ISC, BSD-2/3-Clause, 0BSD, CC0-1.0, CC-BY-4.0. Blocks build on copyleft violations.",
    standard: "EU CRA Art. 13, BSI C5 OPS-04, SIMPL-Open",
    rationale:
      "EU CRA and SIMPL-Open require licence transparency. EUPL compatibility must be verified for all transitive dependencies.",
    effort: "Done — implemented in test.yml",
  },
  {
    priority: 4,
    title: "API Contract Testing",
    icon: FileCheck,
    description: `scripts/check-api-spec-drift.py already blocks any new route missing from openapi.yaml (${facts.openapi.operations} operations documented). Next: validate response shapes against the spec with swagger-parser or Prism.`,
    standard: "DSP 2025-1 §4.2",
    rationale:
      "No formal schema enforces response shapes. Contract tests prevent frontend/backend drift.",
    effort: "Partly done — spec drift ratchet in the PR Gate",
  },
  {
    priority: 5,
    title: "SBOM Generation",
    icon: Boxes,
    description:
      "CycloneDX 1.5 SBOM generated on every CI run for UI and Neo4j Proxy. Uploaded as 90-day artifact. Required by EU CRA Art. 13(5) and critical for SIMPL-Open supply chain transparency.",
    standard: "EU CRA Art. 13, NTIA SBOM, SIMPL-Open",
    rationale:
      "Supply chain attacks (XZ Utils, Trivy compromise) make SBOMs non-negotiable. SIMPL-Open must provide SBOMs for downstream consumers. EU CRA mandates machine-readable SBOMs by 2027.",
    effort: "Done — implemented in test.yml",
  },
  {
    priority: 6,
    title: "Performance Regression Testing",
    icon: Gauge,
    description:
      "Lighthouse CI with Core Web Vitals budgets: LCP < 4s (error), CLS < 0.1 (error), TBT < 300ms (warn), bundle < 500 KB (warn). Runs on 4 key pages.",
    standard: "WCAG 2.2 SC 2.2.1, Core Web Vitals",
    rationale:
      "Healthcare professionals use the platform under time pressure. Performance regressions now blocked in CI.",
    effort: "Done — Lighthouse CI in test.yml",
  },
  {
    priority: 7,
    title: "Runtime ODRL Policy Enforcement",
    icon: Lock,
    description:
      "Implement ODRL engine — validate API responses respect the caller's permitted datasets and temporal limits.",
    standard: "EHDS Art. 44, ODRL 2.2 §3",
    rationale:
      "Currently ODRL policies are decorative. Any authenticated user can query any dataset. This is the largest EHDS compliance gap.",
    effort: "High — new engine + tests",
  },
  {
    priority: 8,
    title: "WCAG Blocking Gate",
    icon: Accessibility,
    description:
      "WCAG 2.2 AA audit promoted to blocking gate — zero-violation budget enforced. Build fails on accessibility regressions.",
    standard: "EN 301 549, EU Directive 2016/2102",
    rationale:
      "Current state is zero violations. Now enforced — any new component that introduces violations will block the build.",
    effort: "Done — removed continue-on-error",
  },
  {
    priority: 9,
    title: "IaC Policy Enforcement",
    icon: Server,
    description:
      "Kubescape promoted to blocking on critical findings (--severity-threshold critical). NSA and CIS frameworks enforced.",
    standard: "BSI C5 OPS-01, NSA K8s Guide",
    rationale:
      "K8s manifests define production topology. Critical security findings now block the build.",
    effort: "Done — blocking in test.yml",
  },
  {
    priority: 10,
    title: "Dependency Freshness",
    icon: RefreshCw,
    description:
      "Renovate Bot configured: auto-merge patches, weekly PRs for minor, manual review for major. Security updates bypass schedule.",
    standard: "OWASP A06, EU CRA Art. 14",
    rationale:
      "Automated dependency updates prevent CVE accumulation. Supply chain freshness is critical for CRA compliance.",
    effort: "Done — renovate.json",
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
        Every check enforced from developer workstation to production deployment
        — aligned with BSI C5, OWASP Top 10, EHDS regulation, and WCAG 2.2 AA.
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
          chart={pipelineDiagram}
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
          <code className="text-(--accent)">.pre-commit-config.yaml</code>, in
          the order they run. They run before every <code>git commit</code>, and
          the PR Gate runs them again on the pull request&apos;s diff. Hooks
          that rewrite a file (Prettier, end-of-file) fail the commit; stage the
          file again and commit.
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
              <code>vitest run --bail 1</code> — stops on first failure
            </p>
            <Badge blocking={true} />
          </div>
          <div className="border border-(--border) rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Dependency Audit</h4>
            <p className="text-xs text-(--text-secondary) mb-2">
              <code>npm audit --audit-level=high</code> — HIGH + CRITICAL CVEs
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
          — {facts.workflowJobs["test.yml"].length} jobs on every push.{" "}
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
              Gitleaks and Trivy binaries pinned to exact versions with SHA-256
              checksum verification
            </li>
            <li>
              Trivy v0.69.3 used explicitly — versions 0.69.4–0.69.6 were
              compromised (CVE-2026-33634)
            </li>
            <li>
              Two dev-only secrets allowlisted in <code>.gitleaksignore</code>{" "}
              (JAD stack in-memory credentials)
            </li>
          </ul>
        </div>

        <div className="mt-4 bg-(--surface-2) border border-(--border) rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            Security Headers (Runtime)
          </h4>
          <p className="text-xs text-(--text-secondary) mb-2">
            Configured in <code>next.config.js</code> (BSI C5 DEV-07 / OWASP
            A05):
          </p>
          <div className="font-mono text-xs text-(--text-secondary) space-y-0.5">
            <div>X-Frame-Options: DENY</div>
            <div>X-Content-Type-Options: nosniff</div>
            <div>Referrer-Policy: strict-origin-when-cross-origin</div>
            <div>
              Permissions-Policy: camera=(), microphone=(), geolocation=()
            </div>
            <div>
              Content-Security-Policy: default-src &apos;self&apos; + scoped
              allowlist
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
          Weekly and on pushes to main. Each suite must stay at or above the
          floor recorded in <code>scripts/compliance-baseline.json</code>; a
          floor is raised when a suite improves and never lowered without a
          reason. Workflow:{" "}
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
            Protocol compliance tests require the full JAD stack (
            {facts.composeServices["docker-compose.jad.yml"].length} services, 8
            GB RAM). In CI, the workflow starts JAD infrastructure with graceful
            fallback — tests produce results only when the controlplane is
            healthy.
          </p>
          <p className="text-xs text-(--text-secondary)">
            Local execution:{" "}
            <code className="text-(--accent)">./scripts/run-dsp-tck.sh</code>,{" "}
            <code className="text-(--accent)">./scripts/run-dcp-tests.sh</code>,{" "}
            <code className="text-(--accent)">./scripts/run-ehds-tests.sh</code>
          </p>
        </div>
      </section>

      {/* Coverage */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="coverage">
          Coverage Floors
        </h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          Enforced by <code>ui/vitest.config.ts</code>: the UI suite fails when
          coverage drops below these. The measured numbers are in the published
          test report.
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
                  BSI C5
                </th>
                <th className="px-3 py-2 text-left text-(--text-primary)">
                  OWASP
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
              {[
                ["TypeScript strict", "DEV-01", "—", "—", "—"],
                ["ESLint", "DEV-02", "A03", "—", "—"],
                ["Unit tests + coverage thresholds", "DEV-03", "—", "—", "—"],
                ["Secret scan (Gitleaks)", "DEV-08", "A07", "—", "—"],
                ["Dependency audit", "DEV-05", "A06", "—", "—"],
                ["Trivy vuln scan", "DEV-05", "A06", "—", "—"],
                ["Security headers", "DEV-07", "A05", "—", "—"],
                ["WCAG 2.2 AA (blocking)", "—", "—", "—", "2.2 AA"],
                ["DSP 2025-1 TCK", "—", "—", "Art. 50", "—"],
                ["DCP v1.0 compliance", "—", "—", "Art. 50", "—"],
                ["EHDS domain tests", "—", "—", "Art. 3–51", "—"],
                ["SBOM (CycloneDX 1.5)", "OPS-04", "A06", "Art. 50", "—"],
                ["Licence compliance", "OPS-04", "—", "Art. 50", "—"],
                ["Lighthouse perf budget", "—", "—", "—", "2.2 SC2.2.1"],
                ["Kubescape (blocking)", "OPS-01", "—", "—", "—"],
                ["Renovate freshness", "DEV-05", "A06", "—", "—"],
                ["ODRL enforcement (planned)", "—", "A01", "Art. 44", "—"],
              ].map(([gate, bsi, owasp, ehds, wcag]) => (
                <tr key={gate} className="border-t border-(--border)">
                  <td className="px-3 py-2 font-semibold">{gate}</td>
                  <td className="px-3 py-2">{bsi}</td>
                  <td className="px-3 py-2">{owasp}</td>
                  <td className="px-3 py-2">{ehds}</td>
                  <td className="px-3 py-2">{wcag}</td>
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
