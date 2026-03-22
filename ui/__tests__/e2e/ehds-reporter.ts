/**
 * EHDS Journey Reporter — custom Playwright reporter that generates an HTML
 * dashboard mapping E2E tests to EHDS regulation steps, DSP/DCP protocol
 * references, and tested endpoints.
 *
 * Usage in playwright.config.ts:
 *   reporter: [["html", { open: "never" }], ["./__tests__/e2e/ehds-reporter.ts"]]
 */
import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

/* ── EHDS Journey Step Metadata ──────────────────────────────── */

interface JourneyStep {
  id: number;
  title: string;
  ehdsArticle: string;
  ehdsLink: string;
  protocolRef: string;
  protocolLink: string;
  endpoints: string[];
  uiPages: string[];
  actor: string;
  /** Test ID prefix patterns that belong to this step */
  testPatterns: RegExp[];
}

const EHDS_BASE = "https://health.ec.europa.eu/ehealth-digital-health-and-care";
const DSP_BASE =
  "https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1-err1";
const DCP_BASE =
  "https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0.1";

const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: 0,
    title: "Participant Onboarding",
    ehdsArticle: "Art. 33 — Health Data Access Body",
    ehdsLink: `${EHDS_BASE}/certification-ehr-systems_en`,
    protocolRef: "DCP §4 — Participant Registration",
    protocolLink: `${DCP_BASE}/#participant-agents`,
    endpoints: ["/api/participants", "/api/credentials"],
    uiPages: ["/onboarding", "/credentials"],
    actor: "Portal Admin (edcadmin)",
    testPatterns: [/^A ·/, /J0[1-5]\b/],
  },
  {
    id: 1,
    title: "Data Provider Creates Metadata",
    ehdsArticle: "Art. 45 — Dataset Description",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "HealthDCAT-AP 3.0",
    protocolLink: `${DSP_BASE}/#catalog-protocol`,
    endpoints: ["/api/assets", "/api/catalog"],
    uiPages: ["/data/share", "/catalog"],
    actor: "Data Holder (clinicuser)",
    testPatterns: [/^B ·/, /J(0[6-9]|1[0-5])\b/],
  },
  {
    id: 2,
    title: "Publish with Access & Usage Policies",
    ehdsArticle: "Art. 46 — Data Permit Conditions",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "ODRL 2.2",
    protocolLink: `${DSP_BASE}/#contract-negotiation-protocol`,
    endpoints: ["/api/admin/policies", "/api/catalog"],
    uiPages: ["/admin/policies", "/catalog"],
    actor: "Data Holder (clinicuser)",
    testPatterns: [/^C ·/, /J(1[6-9]|2[0-2])\b/],
  },
  {
    id: 3,
    title: "Consumer Discovers Assets",
    ehdsArticle: "Art. 47 — Data Access Application",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "DSP §5 — Catalog Protocol",
    protocolLink: `${DSP_BASE}/#catalog-protocol`,
    endpoints: ["/api/catalog", "/api/graph", "/api/patient", "/api/analytics"],
    uiPages: ["/catalog", "/graph", "/patient", "/analytics"],
    actor: "Data User (researcher)",
    testPatterns: [/^D ·/, /J(2[3-9]|30)\b/, /^K ·/, /J8[2-9]\b/, /J9[01]\b/],
  },
  {
    id: 4,
    title: "Request Access to Datasets",
    ehdsArticle: "Art. 48 — Data Permit",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "DSP §7.1 — Contract Negotiation",
    protocolLink: `${DSP_BASE}/#contract-negotiation-protocol`,
    endpoints: ["/api/negotiations", "/api/tasks", "/api/assets"],
    uiPages: ["/negotiate"],
    actor: "Data User (researcher)",
    testPatterns: [/^E ·/, /J(3[1-9]|40)\b/, /J9[2569]\b/],
  },
  {
    id: 5,
    title: "Contract Negotiation & Approval",
    ehdsArticle: "Art. 49 — HDAB Decision",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "DSP §7.1 — Negotiation Lifecycle",
    protocolLink: `${DSP_BASE}/#contract-negotiation-protocol`,
    endpoints: ["/api/negotiations", "/api/tasks"],
    uiPages: ["/negotiate", "/compliance"],
    actor: "Data User + HDAB (regulator)",
    testPatterns: [/^G ·/, /J(49|50)\b/],
  },
  {
    id: 6,
    title: "Data Transfer & Access",
    ehdsArticle: "Art. 50 — Secure Processing Environment",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "DSP §8 — Transfer Process Protocol",
    protocolLink: `${DSP_BASE}/#transfer-process-protocol`,
    endpoints: ["/api/transfers", "/api/tasks", "/api/admin/audit"],
    uiPages: ["/data/transfer", "/data/share", "/graph"],
    actor: "Data User (researcher)",
    testPatterns: [
      /^F ·/,
      /J4[1-8]\b/,
      /^L ·/,
      /J9[3478]\b/,
      /J100\b/,
      /J101\b/,
    ],
  },
  {
    id: 7,
    title: "Analytics & Compliance",
    ehdsArticle: "Art. 52–53 — Fees & Secondary-Use Categories",
    ehdsLink: `${EHDS_BASE}/reuse-health-data_en`,
    protocolRef: "EEHRxF — HL7 Europe FHIR IG",
    protocolLink: `${EHDS_BASE}/certification-ehr-systems_en`,
    endpoints: [
      "/api/analytics",
      "/api/patient",
      "/api/compliance",
      "/api/eehrxf",
    ],
    uiPages: ["/analytics", "/patient", "/compliance", "/eehrxf"],
    actor: "Data User (researcher) + HDAB (regulator)",
    testPatterns: [
      /^H ·/,
      /J5[6-9]\b/,
      /J6[0-9]\b/,
      /J7[0-9]\b/,
      /J8[0-1]\b/,
      /^I ·/,
      /^J ·/,
      /J8[4-8]\b/,
    ],
  },
];

/** Infrastructure / cross-cutting tests that don't map to a single step */
const INFRA_CATEGORY = {
  title: "Infrastructure & Browser Health",
  endpoints: ["All public + protected routes", "API routes"],
  testPatterns: [
    /Public Pages/,
    /Protected Pages/,
    /Public API/,
    /Authenticated API/,
    /Static Asset/,
    /browser-errors/,
    /smoke/,
    /pages\.spec/,
    /navigation/,
    /auth\.spec/,
    /docs\.spec/,
  ],
};

/* ── Reporter implementation ─────────────────────────────────── */

interface TestEntry {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  duration: number;
  file: string;
  error?: string;
}

function classifyTest(
  testTitle: string,
  suiteTitles: string[],
  file: string,
): number | "infra" {
  const combined = [...suiteTitles, testTitle].join(" ");

  // Check infrastructure patterns first
  for (const p of INFRA_CATEGORY.testPatterns) {
    if (p.test(combined) || p.test(file)) return "infra";
  }

  // Check journey steps
  for (const step of JOURNEY_STEPS) {
    for (const p of step.testPatterns) {
      if (p.test(combined)) return step.id;
    }
  }

  return "infra"; // default
}

class EhdsReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime = 0;

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const suiteTitles: string[] = [];
    let parent: Suite | undefined = test.parent;
    while (parent) {
      if (parent.title) suiteTitles.unshift(parent.title);
      parent = parent.parent;
    }

    this.tests.push({
      id: test.title.match(/^(J\d+|H\d+)/)?.[1] || test.title.slice(0, 20),
      title: test.title,
      status:
        result.status === "passed"
          ? "passed"
          : result.status === "skipped"
            ? "skipped"
            : result.status === "timedOut"
              ? "timedOut"
              : "failed",
      duration: result.duration,
      file: test.location.file,
      error: result.errors?.[0]?.message?.slice(0, 200),
    });
  }

  onEnd(result: FullResult) {
    const duration = Date.now() - this.startTime;

    // Classify tests into steps
    const stepTests = new Map<number | "infra", TestEntry[]>();
    for (const t of this.tests) {
      const suiteTitles: string[] = [];
      const file = path.basename(t.file);
      const step = classifyTest(t.title, suiteTitles, file);
      if (!stepTests.has(step)) stepTests.set(step, []);
      stepTests.get(step)!.push(t);
    }

    const html = this.renderHtml(stepTests, result, duration);
    const outDir = path.join(process.cwd(), "playwright-report");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "ehds-journey.html"), html);
  }

  private renderHtml(
    stepTests: Map<number | "infra", TestEntry[]>,
    result: FullResult,
    duration: number,
  ): string {
    const total = this.tests.length;
    const passed = this.tests.filter((t) => t.status === "passed").length;
    const failed = this.tests.filter((t) => t.status === "failed").length;
    const skipped = this.tests.filter((t) => t.status === "skipped").length;

    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

    // Build step rows
    const stepRows = JOURNEY_STEPS.map((step) => {
      const tests = stepTests.get(step.id) || [];
      const stepPassed = tests.filter((t) => t.status === "passed").length;
      const stepFailed = tests.filter((t) => t.status === "failed").length;
      const stepSkipped = tests.filter((t) => t.status === "skipped").length;
      const stepTotal = tests.length;
      const allPassed = stepFailed === 0 && stepPassed > 0;
      const hasFailures = stepFailed > 0;
      const allSkipped = stepTotal > 0 && stepSkipped === stepTotal;

      const statusIcon = hasFailures
        ? "&#x274C;"
        : allSkipped
          ? "&#x23ED;"
          : allPassed
            ? "&#x2705;"
            : stepTotal === 0
              ? "&#x2796;"
              : "&#x2705;";
      const statusClass = hasFailures ? "fail" : allSkipped ? "skip" : "pass";

      const testListHtml = tests
        .map((t) => {
          const icon =
            t.status === "passed"
              ? '<span class="pass">&#x2705;</span>'
              : t.status === "skipped"
                ? '<span class="skip">&#x23ED;</span>'
                : '<span class="fail">&#x274C;</span>';
          const errorHtml =
            t.error && t.status === "failed"
              ? `<br/><code class="error-detail">${escapeHtml(t.error)}</code>`
              : "";
          return `<li>${icon} ${escapeHtml(t.title)} <span class="duration">${
            t.duration
          }ms</span>${errorHtml}</li>`;
        })
        .join("\n");

      return `
      <div id="step-${step.id}" class="step-card ${statusClass}-card">
        <div class="step-header">
          <div class="step-status">${statusIcon}</div>
          <div class="step-info">
            <h3>Step ${step.id} — ${escapeHtml(step.title)}</h3>
            <div class="step-meta">
              <span class="actor">${escapeHtml(step.actor)}</span>
              <span class="counts">${stepPassed} passed, ${stepFailed} failed, ${stepSkipped} skipped</span>
            </div>
          </div>
        </div>

        <div class="step-refs">
          <div class="ref-group">
            <span class="ref-label">EHDS:</span>
            <a href="${
              step.ehdsLink
            }" target="_blank" rel="noopener">${escapeHtml(
              step.ehdsArticle,
            )} &#x2197;</a>
          </div>
          <div class="ref-group">
            <span class="ref-label">Protocol:</span>
            <a href="${
              step.protocolLink
            }" target="_blank" rel="noopener">${escapeHtml(
              step.protocolRef,
            )} &#x2197;</a>
          </div>
        </div>

        <div class="step-endpoints">
          <span class="ref-label">Endpoints:</span>
          ${step.endpoints
            .map(
              (e) =>
                `<code><a href="${baseUrl}${e}" target="_blank">${e}</a></code>`,
            )
            .join(" ")}
        </div>

        <div class="step-pages">
          <span class="ref-label">UI Pages:</span>
          ${step.uiPages
            .map(
              (p) =>
                `<code><a href="${baseUrl}${p}" target="_blank">${p}</a></code>`,
            )
            .join(" ")}
        </div>

        <details class="test-list">
          <summary>${stepTotal} tests</summary>
          <ul>${testListHtml}</ul>
        </details>
      </div>`;
    }).join("\n");

    // Infrastructure section
    const infraTests = stepTests.get("infra") || [];
    const infraPassed = infraTests.filter((t) => t.status === "passed").length;
    const infraFailed = infraTests.filter((t) => t.status === "failed").length;
    const infraSkipped = infraTests.filter(
      (t) => t.status === "skipped",
    ).length;
    const infraStatus =
      infraFailed > 0 ? "&#x274C;" : infraPassed > 0 ? "&#x2705;" : "&#x23ED;";
    const infraClass = infraFailed > 0 ? "fail" : "pass";

    const infraTestHtml = infraTests
      .map((t) => {
        const icon =
          t.status === "passed"
            ? '<span class="pass">&#x2705;</span>'
            : t.status === "skipped"
              ? '<span class="skip">&#x23ED;</span>'
              : '<span class="fail">&#x274C;</span>';
        const errorHtml =
          t.error && t.status === "failed"
            ? `<br/><code class="error-detail">${escapeHtml(t.error)}</code>`
            : "";
        return `<li>${icon} ${escapeHtml(t.title)} <span class="duration">${
          t.duration
        }ms</span>${errorHtml}</li>`;
      })
      .join("\n");

    const overallStatus = result.status === "passed" ? "PASSED" : "FAILED";
    const overallClass = result.status === "passed" ? "pass" : "fail";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EHDS E2E Journey Report — Health Dataspace v2</title>
<style>
  :root { --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #e2e8f0;
          --muted: #94a3b8; --pass: #4ade80; --fail: #f87171; --skip: #fbbf24;
          --accent: #818cf8; --link: #60a5fa; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg);
         color: var(--text); max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
  h1 { color: var(--accent); margin-bottom: 0.25rem; font-size: 1.5rem; }
  h2 { color: var(--accent); margin-top: 2rem; margin-bottom: 1rem; font-size: 1.15rem; }
  h3 { font-size: 1rem; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #0f172a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; color: var(--muted); }
  .subtitle { color: var(--muted); margin-bottom: 1.5rem; font-size: 0.9rem; }

  /* Summary bar */
  .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 2rem;
             padding: 1rem 1.25rem; background: var(--card); border-radius: 12px;
             border: 1px solid var(--border); align-items: center; }
  .summary-item { text-align: center; }
  .summary-item .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
                          color: var(--muted); }
  .summary-item .value { font-size: 1.5rem; font-weight: 700; }
  .summary-item .value.pass { color: var(--pass); }
  .summary-item .value.fail { color: var(--fail); }
  .summary-item .value.skip { color: var(--skip); }
  .overall { font-size: 1rem; font-weight: 700; padding: 0.35rem 1rem;
             border-radius: 9999px; }
  .overall.pass { background: #064e3b; color: var(--pass); }
  .overall.fail { background: #450a0a; color: var(--fail); }

  /* Tested against */
  .tested-against { background: var(--card); padding: 0.75rem 1.25rem; border-radius: 8px;
                     border: 1px solid var(--border); margin-bottom: 2rem;
                     font-size: 0.85rem; color: var(--muted); }
  .tested-against strong { color: var(--text); }

  /* Step cards */
  .step-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px;
               padding: 1rem 1.25rem; margin-bottom: 1rem; }
  .step-card.fail-card { border-left: 4px solid var(--fail); }
  .step-card.pass-card { border-left: 4px solid var(--pass); }
  .step-card.skip-card { border-left: 4px solid var(--skip); }
  .step-header { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; }
  .step-status { font-size: 1.25rem; }
  .step-meta { display: flex; gap: 1rem; margin-top: 0.25rem; font-size: 0.8rem; color: var(--muted); }
  .actor { font-style: italic; }

  .step-refs, .step-endpoints, .step-pages { font-size: 0.8rem; margin-bottom: 0.4rem;
                                              display: flex; flex-wrap: wrap; gap: 0.4rem;
                                              align-items: center; }
  .ref-label { color: var(--muted); font-weight: 600; min-width: 5rem; }
  .ref-group { display: flex; gap: 0.3rem; align-items: center; }

  .test-list { margin-top: 0.75rem; }
  .test-list summary { cursor: pointer; color: var(--muted); font-size: 0.8rem;
                        padding: 0.25rem 0; }
  .test-list ul { list-style: none; padding-left: 0.5rem; margin-top: 0.4rem; }
  .test-list li { font-size: 0.8rem; padding: 0.2rem 0; border-bottom: 1px solid #1e293b; }
  .duration { color: #475569; font-size: 0.7rem; margin-left: 0.5rem; }
  .error-detail { display: block; margin-top: 0.25rem; font-size: 0.7rem;
                   color: var(--fail); background: #1c1917; padding: 0.3rem 0.5rem;
                   border-radius: 4px; white-space: pre-wrap; word-break: break-all; }

  /* Spec overview */
  .spec-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
  .spec-table th, .spec-table td { border: 1px solid var(--border); padding: 0.4rem 0.75rem;
                                    text-align: left; }
  .spec-table th { background: var(--card); color: var(--muted); }

  /* Quick-nav pills */
  .nav-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.5rem; }
  .nav-pill { font-size: 0.75rem; padding: 0.25rem 0.75rem; border-radius: 9999px;
              border: 1px solid var(--border); color: var(--muted); cursor: pointer;
              background: transparent; transition: all 0.15s; text-decoration: none; }
  .nav-pill:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }
  .nav-pill.pass-pill { border-color: #065f46; color: var(--pass); }
  .nav-pill.fail-pill { border-color: #7f1d1d; color: var(--fail); }
  .nav-pill.skip-pill { border-color: #78350f; color: var(--skip); }

  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border);
            font-size: 0.75rem; color: var(--muted); }
  .footer a { color: var(--link); }
</style>
</head>
<body>

<h1>EHDS E2E Journey Report</h1>
<p class="subtitle">Health Dataspace v2 — European Health Data Space Compliance Testing</p>

<div class="tested-against">
  <strong>Tested against:</strong> <code>${escapeHtml(baseUrl)}</code>
  &nbsp;|&nbsp; ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
  &nbsp;|&nbsp; Duration: ${(duration / 1000).toFixed(1)}s
</div>

<div class="summary">
  <div class="overall ${overallClass}">${overallStatus}</div>
  <div class="summary-item"><div class="label">Total</div><div class="value">${total}</div></div>
  <div class="summary-item"><div class="label">Passed</div><div class="value pass">${passed}</div></div>
  <div class="summary-item"><div class="label">Failed</div><div class="value fail">${failed}</div></div>
  <div class="summary-item"><div class="label">Skipped</div><div class="value skip">${skipped}</div></div>
</div>

<h2>Quick Navigation</h2>
<div class="nav-pills">
${JOURNEY_STEPS.map((step) => {
  const tests = stepTests.get(step.id) || [];
  const f = tests.filter((t) => t.status === "failed").length;
  const s = tests.filter((t) => t.status === "skipped").length;
  const cls =
    f > 0
      ? "fail-pill"
      : s === tests.length && tests.length > 0
        ? "skip-pill"
        : "pass-pill";
  return `  <a href="#step-${step.id}" class="nav-pill ${cls}">Step ${
    step.id
  }: ${escapeHtml(step.title)}</a>`;
}).join("\n")}
  <a href="#infra" class="nav-pill ${
    infraClass === "fail" ? "fail-pill" : "pass-pill"
  }">Infrastructure</a>
  <a href="index.html" class="nav-pill">Playwright HTML Report &rarr;</a>
</div>

<h2>EHDS Journey Steps</h2>

${stepRows}

<div id="infra">
<h2>Infrastructure & Browser Health</h2>
<div class="step-card ${infraClass}-card">
  <div class="step-header">
    <div class="step-status">${infraStatus}</div>
    <div class="step-info">
      <h3>${INFRA_CATEGORY.title}</h3>
      <div class="step-meta">
        <span class="counts">${infraPassed} passed, ${infraFailed} failed, ${infraSkipped} skipped</span>
      </div>
    </div>
  </div>

  <div class="step-endpoints">
    <span class="ref-label">Scope:</span>
    <span>${INFRA_CATEGORY.endpoints.join(", ")}</span>
  </div>

  <details class="test-list">
    <summary>${infraTests.length} tests</summary>
    <ul>${infraTestHtml}</ul>
  </details>
</div>
</div>

<h2>Specification & Regulation References</h2>
<table class="spec-table">
<tr><th>Step</th><th>EHDS Article</th><th>Protocol</th><th>Tested Endpoints</th><th>Status</th></tr>
${JOURNEY_STEPS.map((step) => {
  const tests = stepTests.get(step.id) || [];
  const f = tests.filter((t) => t.status === "failed").length;
  const p = tests.filter((t) => t.status === "passed").length;
  const s = tests.filter((t) => t.status === "skipped").length;
  const icon =
    f > 0 ? "&#x274C;" : p > 0 ? "&#x2705;" : s > 0 ? "&#x23ED;" : "&#x2796;";
  return `<tr>
  <td>${step.id}. ${escapeHtml(step.title)}</td>
  <td><a href="${step.ehdsLink}" target="_blank">${escapeHtml(
    step.ehdsArticle,
  )}</a></td>
  <td><a href="${step.protocolLink}" target="_blank">${escapeHtml(
    step.protocolRef,
  )}</a></td>
  <td><code>${step.endpoints.join("</code> <code>")}</code></td>
  <td>${icon} ${p}/${tests.length}</td>
</tr>`;
}).join("\n")}
</table>

<div class="footer">
  <p>
    <a href="index.html">Playwright HTML Report</a> |
    <a href="${EHDS_BASE}/reuse-health-data_en" target="_blank">EHDS Regulation (Reuse)</a> |
    <a href="${EHDS_BASE}/certification-ehr-systems_en" target="_blank">EHDS Certification</a> |
    <a href="${DSP_BASE}/" target="_blank">Dataspace Protocol 2025-1</a> |
    <a href="${DCP_BASE}/" target="_blank">DCP v1.0.1</a>
  </p>
  <p>Generated by EHDS Journey Reporter &mdash; ${new Date().toISOString()}</p>
</div>

</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default EhdsReporter;
