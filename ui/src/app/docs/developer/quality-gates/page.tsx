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

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const pipelineDiagram = `graph LR
  subgraph "Stage 1 — Pre-commit"
    PC1["Prettier<br/>Auto-format"]
    PC2["TypeScript<br/>tsc --noEmit"]
    PC3["ESLint<br/>max 55 warnings"]
    PC4["Hadolint<br/>Dockerfiles"]
    PC5["ShellCheck<br/>severity=error"]
    PC6["Gitleaks<br/>Secret scan"]
  end

  subgraph "Stage 2 — Pre-push"
    PP1["Vitest<br/>--bail 1"]
    PP2["npm audit<br/>HIGH+CRITICAL"]
  end

  subgraph "Stage 3 — CI Pipeline"
    CI1["Unit Tests<br/>1,613 tests"]
    CI2["Lint Check"]
    CI3["Secret Scan<br/>gitleaks"]
    CI4["Dep Audit<br/>npm audit"]
    CI5["Trivy<br/>vuln + misconfig"]
    CI6["Kubescape<br/>NSA + CIS"]
    CI7["E2E Tests<br/>778 tests"]
    CI8["WCAG 2.2 AA<br/>93 checks"]
  end

  subgraph "Stage 4 — Compliance"
    CO1["DSP 2025-1<br/>33 tests"]
    CO2["DCP v1.0<br/>22 tests"]
    CO3["EHDS Domain<br/>25 tests"]
  end

  PC1 --> PC2 --> PC3
  PC4 --> PC5 --> PC6
  PC3 --> PP1 --> PP2
  PP2 --> CI1 & CI2 & CI3 & CI4 & CI5 & CI6
  CI1 --> CI7 --> CI8
  CI1 --> CO1 & CO2 & CO3`;

interface GateRow {
  hook: string;
  tool: string;
  severity: string;
  blocking: boolean;
}

const preCommitGates: GateRow[] = [
  {
    hook: "Trailing whitespace",
    tool: "pre-commit",
    severity: "Auto-fix",
    blocking: false,
  },
  {
    hook: "End-of-file fixer",
    tool: "pre-commit",
    severity: "Auto-fix",
    blocking: false,
  },
  {
    hook: "YAML / JSON syntax",
    tool: "pre-commit",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Large file check (> 5 MB)",
    tool: "pre-commit",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Merge conflict markers",
    tool: "pre-commit",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Private key detection",
    tool: "pre-commit",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Dockerfile linting",
    tool: "Hadolint v2.14",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Shell script linting",
    tool: "ShellCheck v0.11",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Code formatting",
    tool: "Prettier v3.1",
    severity: "Auto-fix",
    blocking: false,
  },
  {
    hook: "TypeScript type-check",
    tool: "tsc --noEmit",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "ESLint (max 55 warnings)",
    tool: "Next.js lint",
    severity: "Error",
    blocking: true,
  },
  {
    hook: "Secret scan (staged diff)",
    tool: "Gitleaks",
    severity: "Error",
    blocking: true,
  },
];

const CI_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml";
const COMPLIANCE_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/compliance.yml";
const PAGES_WORKFLOW_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/pages.yml";

const ciGates = [
  {
    job: "UI Tests (Vitest)",
    tests: "1,613",
    tool: "Vitest 4 + v8 coverage",
    blocking: true,
    standard: "BSI C5 DEV-03",
  },
  {
    job: "Neo4j Proxy Tests",
    tests: "10",
    tool: "Vitest 4",
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
    tool: "Gitleaks v8.27.2",
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
    tool: "Trivy v0.69.3",
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
    tests: "778",
    tool: "Playwright v1.58",
    blocking: false,
    standard: "—",
  },
  {
    job: "WCAG 2.2 AA Audit",
    tests: "93",
    tool: "axe-core/playwright",
    blocking: true,
    standard: "EN 301 549",
  },
  {
    job: "Security Pentest",
    tests: "40+",
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

const coverageData = [
  { metric: "Statements", value: "93.78%", trend: "+793%" },
  { metric: "Branches", value: "81.65%", trend: "+1,147%" },
  { metric: "Functions", value: "89.57%", trend: "+1,162%" },
  { metric: "Lines", value: "94.73%", trend: "+826%" },
];

const complianceSuites = [
  {
    suite: "DSP 2025-1 TCK",
    tests: 33,
    passed: 28,
    rate: "84.8%",
    protocol: "Dataspace Protocol",
  },
  {
    suite: "DCP v1.0",
    tests: 22,
    passed: 20,
    rate: "90.9%",
    protocol: "Decentralised Claims",
  },
  {
    suite: "EHDS Domain",
    tests: 25,
    passed: 16,
    rate: "64.0%",
    protocol: "EHDS Art. 3–51",
  },
];

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
    description:
      "Minimum coverage thresholds in vitest.config.ts: 85% statements, 70% branches, 80% functions, 85% lines. Vitest fails if coverage drops below.",
    standard: "BSI C5 DEV-03",
    rationale:
      "Current coverage (93%+ statements) is well above these thresholds. Enforcement prevents silent regression.",
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
      "94% line coverage does not guarantee tests catch bugs. Mutation testing verifies tests detect real defects.",
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
    description:
      "Add OpenAPI schema validation for all 36 API routes using swagger-parser or Prism.",
    standard: "DSP 2025-1 §4.2",
    rationale:
      "No formal schema enforces response shapes. Contract tests prevent frontend/backend drift.",
    effort: "Medium — schemas + validation",
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
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
      Blocks
    </span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
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
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${color}`}>
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
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6"
      >
        <ArrowLeft size={14} /> Back to Developer Guide
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={28} className="text-[var(--accent)]" />
        <h1 className="text-3xl font-bold">Quality Gates</h1>
      </div>
      <p className="text-[var(--text-secondary)] mb-8">
        Every check enforced from developer workstation to production deployment
        — aligned with BSI C5, OWASP Top 10, EHDS regulation, and WCAG 2.2 AA.
      </p>

      {/* TOC */}
      <nav className="border border-[var(--border)] rounded-xl p-5 mb-10">
        <h2 className="font-semibold mb-3">Contents</h2>
        <ul className="text-sm space-y-1.5 text-[var(--accent)]">
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
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Configured in{" "}
          <code className="text-[var(--accent)]">.pre-commit-config.yaml</code>.
          Run automatically before every <code>git commit</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Hook
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Tool
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Severity
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Gate
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {preCommitGates.map((g) => (
                <tr key={g.hook} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-xs">{g.hook}</td>
                  <td className="px-3 py-2 text-xs font-mono">{g.tool}</td>
                  <td className="px-3 py-2 text-xs">{g.severity}</td>
                  <td className="px-3 py-2">
                    <Badge blocking={g.blocking} />
                  </td>
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
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Run before <code>git push</code>. These catch issues that are too slow
          for pre-commit.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Unit Tests</h4>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              <code>vitest run --bail 1</code> — stops on first failure
            </p>
            <Badge blocking={true} />
          </div>
          <div className="border border-[var(--border)] rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-1">Dependency Audit</h4>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
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
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          GitHub Actions workflow{" "}
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline font-mono"
          >
            .github/workflows/test.yml
          </a>{" "}
          — 13 jobs on every push.{" "}
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline text-xs"
          >
            View latest run &rarr;
          </a>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Job
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Tests
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Tool
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Standard
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Gate
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              {ciGates.map((g) => (
                <tr key={g.job} className="border-t border-[var(--border)]">
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

        <div className="mt-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Supply-Chain Hardening</h4>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc ml-4">
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

        <div className="mt-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">
            Security Headers (Runtime)
          </h4>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Configured in <code>next.config.js</code> (BSI C5 DEV-07 / OWASP
            A05):
          </p>
          <div className="font-mono text-xs text-[var(--text-secondary)] space-y-0.5">
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
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Weekly + on push to main. Workflow:{" "}
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline font-mono"
          >
            .github/workflows/compliance.yml
          </a>{" "}
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline text-xs"
          >
            View latest run &rarr;
          </a>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {complianceSuites.map((s) => (
            <div
              key={s.suite}
              className="border border-[var(--border)] rounded-lg p-4"
            >
              <h4 className="font-semibold text-sm mb-1">{s.suite}</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-2">
                {s.protocol}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                  {s.rate}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {s.passed}/{s.tests} passed
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Coverage */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4" id="coverage">
          Current Coverage
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {coverageData.map((c) => (
            <div
              key={c.metric}
              className="border border-[var(--border)] rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {c.value}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {c.metric}
              </div>
              <div className="text-[10px] text-green-700 dark:text-green-400 mt-1">
                {c.trend} from baseline
              </div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">Test Inventory</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-[var(--text-primary)]">
                1,613
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Unit Tests
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text-primary)]">
                778
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                E2E Tests
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text-primary)]">
                80
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Compliance Tests
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
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Recommended improvements prioritised by impact and regulatory
          alignment.
        </p>
        <div className="space-y-4">
          {futureGates.map((g) => {
            const Icon = g.icon;
            return (
              <div
                key={g.priority}
                className="border border-[var(--border)] rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                    {g.priority}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Icon size={16} className="text-[var(--accent)]" />
                      <h4 className="font-semibold text-sm">{g.title}</h4>
                      <EffortBadge effort={g.effort} />
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">
                      {g.description}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] italic mb-1">
                      {g.rationale}
                    </p>
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--surface)] px-2 py-0.5 rounded">
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
          <table className="w-full text-sm border border-[var(--border)] rounded-lg">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  Quality Gate
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  BSI C5
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  OWASP
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  EHDS
                </th>
                <th className="px-3 py-2 text-left text-[var(--text-primary)]">
                  WCAG
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)] text-xs">
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
                <tr key={gate} className="border-t border-[var(--border)]">
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
      <section className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="font-semibold mb-2">Related Documentation</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/developer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Developer Guide
          </Link>
          <Link
            href="/docs/architecture"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Architecture
          </Link>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/quality-gates.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Full Markdown (GitHub)
          </a>
          <a
            href="https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/test-coverage-report.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Coverage Report
          </a>
          <a
            href={CI_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            CI Pipeline (latest)
          </a>
          <a
            href={COMPLIANCE_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Compliance Tests (latest)
          </a>
          <a
            href={PAGES_WORKFLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Pages Deploy (latest)
          </a>
        </div>
      </section>
    </div>
  );
}
