#!/usr/bin/env node
/**
 * Generate the GitHub Pages test-reports/index.html dashboard.
 *
 * Reads:
 *   - test-results.json   (Vitest JSON output)
 *   - coverage/coverage-summary.json  (v8 coverage)
 *
 * Writes:
 *   - out/test-reports/index.html
 *
 * Called from .github/workflows/pages.yml after tests run.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ── Inputs ──────────────────────────────────────────────────────────────────
const cwd = process.argv[2] || process.cwd();
const outDir = process.argv[3] || path.join(cwd, "out", "test-reports");

function tryJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, file), "utf8"));
  } catch {
    return null;
  }
}

const results = tryJSON("test-results.json");
const covSummary = tryJSON("coverage/coverage-summary.json");

if (!results) {
  console.error("test-results.json not found — skipping report generation");
  process.exit(0);
}

// ── Aggregate numbers ───────────────────────────────────────────────────────
const passed = results.numPassedTests || 0;
const failed = results.numFailedTests || 0;
const total = passed + failed;
const suites = results.numTotalTestSuites || 0;

const cov = covSummary?.total || {};
const stmts = cov.statements?.pct ?? null;
const branches = cov.branches?.pct ?? null;
const funcs = cov.functions?.pct ?? null;
const lines = cov.lines?.pct ?? null;

// ── Categorise unit tests ───────────────────────────────────────────────────
const categories = {};
for (const suite of results.testResults || []) {
  const raw = suite.name || "";
  const rel = raw.includes("__tests__/") ? raw.split("__tests__/").pop() : raw;

  let cat;
  if (rel.startsWith("api/")) cat = "API Route Integration Tests";
  else if (rel.startsWith("unit/api/")) cat = "API Route Unit Tests";
  else if (rel.startsWith("unit/pages/") || rel.startsWith("unit/app/"))
    cat = "Page & Layout Tests";
  else if (rel.startsWith("unit/components/")) cat = "Component Tests";
  else if (rel.startsWith("unit/lib/")) cat = "Library & Config Tests";
  else cat = "Other Unit Tests";

  if (!categories[cat]) categories[cat] = { pass: 0, fail: 0, files: 0 };
  categories[cat].files++;
  for (const a of suite.assertionResults || []) {
    if (a.status === "passed") categories[cat].pass++;
    else if (a.status === "failed") categories[cat].fail++;
  }
}

// ── Category descriptions ───────────────────────────────────────────────────
const catDescriptions = {
  "Page & Layout Tests":
    "Rendering, navigation, role-based access, and content verification for all 19 Next.js pages.",
  "API Route Integration Tests":
    "Full HTTP request/response testing of all API endpoints including error handling and mock fallbacks.",
  "API Route Unit Tests":
    "Unit-level testing of API route handlers — request parsing, query construction, and response formatting.",
  "Component Tests":
    "React component rendering, user interaction, accessibility, and state management.",
  "Library & Config Tests":
    "Neo4j driver, EDC client, Keycloak realm config, auth helpers, and shared utilities.",
  "Other Unit Tests": "Additional unit tests for misc modules.",
};

// ── Category order ──────────────────────────────────────────────────────────
const catOrder = [
  "Page & Layout Tests",
  "API Route Integration Tests",
  "API Route Unit Tests",
  "Component Tests",
  "Library & Config Tests",
  "Other Unit Tests",
];

// ── Tested areas descriptions ───────────────────────────────────────────────
const testedAreas = [
  {
    area: "19 Next.js Pages",
    desc: "Graph Explorer, Dataset Catalog, Patient Journey, OMOP Analytics, EEHRxF Profiles, Compliance Chain, NL Query, Docs (4 pages), Portal (Onboarding, Credentials, Discover, Negotiate, Transfer, Share, Admin, Settings), Home",
  },
  {
    area: "16 API Routes",
    desc: "/api/catalog, /api/compliance, /api/analytics, /api/patient, /api/eehrxf, /api/graph, /api/nlquery, /api/participants, /api/tasks, /api/assets, /api/negotiations, /api/transfers, /api/admin/policies, /api/admin/tenants, /api/admin/audit, /api/health",
  },
  {
    area: "8 UI Components",
    desc: "LoginMenu, Navbar, DatasetCard, ComplianceChain, StatCard, PatientTimeline, AnalyticsChart, MermaidDiagram",
  },
  {
    area: "5 Core Libraries",
    desc: "Neo4j driver (connection pooling, query execution), EDC-V client (management API, QuerySpec), Keycloak realm (4 users, PKCE, role mappings), Auth helpers (session, RBAC middleware), Component info catalog (18 service descriptions)",
  },
  {
    area: "EHDS Compliance",
    desc: "Article 33 EHR certification, Article 45–53 secondary use flow, HealthDCAT-AP W3C metadata, EEHRxF priority category coverage, ODRL policy structure, Verifiable Credential lifecycle",
  },
  {
    area: "Dataspace Protocols",
    desc: "DSP 2025-1 catalog queries, contract negotiation state machine (6 states), transfer process lifecycle (4 states), DCP v1.0 participant identity, HttpData-PULL/PUSH transfer types",
  },
];

// ── Helper: coverage badge colour ───────────────────────────────────────────
function covClass(pct) {
  if (pct === null) return "dim";
  if (pct >= 90) return "pass";
  if (pct >= 70) return "warn";
  return "fail";
}

function covBar(pct) {
  if (pct === null) return "";
  const w = Math.min(100, Math.max(0, pct));
  const cls = covClass(pct);
  return `<div class="bar"><div class="bar-fill ${cls}" style="width:${w}%"></div></div>`;
}

function catIcon(cat) {
  if (cat.fail > 0) return "❌";
  return "✅";
}

// ── ISO date ────────────────────────────────────────────────────────────────
const now = new Date().toISOString().split("T")[0];

// ── Build HTML ──────────────────────────────────────────────────────────────
const catRows = catOrder
  .filter((k) => categories[k])
  .map((k) => {
    const v = categories[k];
    const icon = catIcon(v);
    const desc = catDescriptions[k] || "";
    return `<tr>
      <td>${icon} ${k}</td>
      <td>${v.files}</td>
      <td class="pass">${v.pass}</td>
      <td class="${v.fail > 0 ? "fail" : "pass"}">${v.fail}</td>
      <td class="dim">${desc}</td>
    </tr>`;
  })
  .join("\n");

const areaRows = testedAreas
  .map(
    (a) => `<tr>
      <td><strong>${a.area}</strong></td>
      <td>${a.desc}</td>
    </tr>`,
  )
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Test Report — Health Dataspace v2</title>
<style>
:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#e2e8f0;--dim:#64748b;
  --pass:#4ade80;--fail:#f87171;--warn:#fbbf24;--accent:#818cf8;--accent2:#a5b4fc}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  max-width:1100px;margin:0 auto;padding:2rem 1rem;color:var(--text);background:var(--bg)}
h1{color:var(--accent);font-size:1.8rem;margin-bottom:.25rem}
h2{color:var(--accent2);margin-top:2.5rem;margin-bottom:1rem;font-size:1.3rem;
  border-bottom:1px solid var(--border);padding-bottom:.5rem}
p{line-height:1.6;margin-bottom:.5rem}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.subtitle{color:var(--dim);font-size:.9rem;margin-bottom:1.5rem}

/* Summary cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin:1.5rem 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem;text-align:center}
.card-value{font-size:2rem;font-weight:700;line-height:1.2}
.card-label{font-size:.8rem;color:var(--dim);margin-top:.25rem}
.pass{color:var(--pass)}.fail{color:var(--fail)}.warn{color:var(--warn)}.dim{color:var(--dim)}

/* Coverage bars */
.cov-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:1rem 0}
.cov-item{background:var(--surface);border:1px solid var(--border);border-radius:.5rem;padding:1rem}
.cov-item .label{display:flex;justify-content:space-between;margin-bottom:.5rem;font-size:.9rem}
.bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;transition:width .3s}
.bar-fill.pass{background:var(--pass)}.bar-fill.warn{background:var(--warn)}.bar-fill.fail{background:var(--fail)}

/* Tables */
table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.9rem}
th,td{border:1px solid var(--border);padding:.6rem .8rem;text-align:left}
th{background:var(--surface);color:var(--dim);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px}
tr:hover{background:rgba(255,255,255,.02)}

/* Links section */
.links{display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0}
.links a{display:inline-block;padding:.5rem 1rem;background:var(--surface);border:1px solid var(--border);
  border-radius:.5rem;font-size:.875rem;transition:border-color .2s}
.links a:hover{border-color:var(--accent);text-decoration:none}

footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--dim);font-size:.8rem;text-align:center}
</style>
</head>
<body>
<h1>Test Report — Health Dataspace v2</h1>
<p class="subtitle">Generated ${now} · <a href="https://github.com/ma3u/MinimumViableHealthDataspacev2">GitHub</a></p>

<!-- ── Summary Cards ─────────────────────────────────────────── -->
<div class="cards">
  <div class="card"><div class="card-value">${suites}</div><div class="card-label">Test Files</div></div>
  <div class="card"><div class="card-value pass">${passed}</div><div class="card-label">Tests Passed</div></div>
  <div class="card"><div class="card-value ${
    failed > 0 ? "fail" : "pass"
  }">${failed}</div><div class="card-label">Tests Failed</div></div>
  <div class="card"><div class="card-value ${covClass(stmts)}">${
    stmts !== null ? stmts + "%" : "—"
  }</div><div class="card-label">Statement Coverage</div></div>
  <div class="card"><div class="card-value ${covClass(lines)}">${
    lines !== null ? lines + "%" : "—"
  }</div><div class="card-label">Line Coverage</div></div>
</div>

<!-- ── Code Coverage ─────────────────────────────────────────── -->
<h2>Code Coverage (v8)</h2>
<div class="cov-grid">
  <div class="cov-item">
    <div class="label"><span>Statements</span><span class="${covClass(
      stmts,
    )}">${stmts !== null ? stmts + "%" : "—"}</span></div>
    ${covBar(stmts)}
  </div>
  <div class="cov-item">
    <div class="label"><span>Branches</span><span class="${covClass(
      branches,
    )}">${branches !== null ? branches + "%" : "—"}</span></div>
    ${covBar(branches)}
  </div>
  <div class="cov-item">
    <div class="label"><span>Functions</span><span class="${covClass(funcs)}">${
      funcs !== null ? funcs + "%" : "—"
    }</span></div>
    ${covBar(funcs)}
  </div>
  <div class="cov-item">
    <div class="label"><span>Lines</span><span class="${covClass(lines)}">${
      lines !== null ? lines + "%" : "—"
    }</span></div>
    ${covBar(lines)}
  </div>
</div>

<!-- ── Test Breakdown by Category ────────────────────────────── -->
<h2>Test Breakdown by Category</h2>
<p>Unit and integration tests are grouped by what they verify.
   Each category tests a different layer of the application.</p>
<table>
  <thead><tr><th>Category</th><th>Files</th><th>Passed</th><th>Failed</th><th>What is Tested</th></tr></thead>
  <tbody>
    ${catRows}
    <tr style="font-weight:600;background:var(--surface)">
      <td>Total (Unit + Integration)</td>
      <td>${suites}</td>
      <td class="pass">${passed}</td>
      <td class="${failed > 0 ? "fail" : "pass"}">${failed}</td>
      <td></td>
    </tr>
  </tbody>
</table>

<!-- ── What is Tested ────────────────────────────────────────── -->
<h2>What is Tested</h2>
<p>The test suite covers the full application stack — from individual React
   components and API route handlers up to end-to-end browser workflows
   that simulate real EHDS dataspace operations.</p>
<table>
  <thead><tr><th style="width:180px">Area</th><th>Details</th></tr></thead>
  <tbody>
    ${areaRows}
  </tbody>
</table>

<!-- ── E2E Tests ──────────────────────────────────────────────── -->
<h2>End-to-End Tests (Playwright)</h2>
<p>166 browser-based tests simulate real user journeys through the EHDS
   dataspace — from participant onboarding to contract negotiation and data
   transfer. Tests run headless Chromium against the full Next.js application.</p>
<table>
  <thead><tr><th>EHDS Step</th><th>Journey</th><th>What is Verified</th></tr></thead>
  <tbody>
    <tr><td>Step 0</td><td>Identity &amp; Participant Management</td><td>Keycloak SSO, 5 participants registered, DID identities, role-based access</td></tr>
    <tr><td>Step 1</td><td>Dataset Upload &amp; Metadata</td><td>9 datasets in HealthDCAT-AP catalog, FHIR/OMOP/ClinicalTrial types, Article 53 legal basis</td></tr>
    <tr><td>Step 2</td><td>Policy &amp; Catalog Offering</td><td>ODRL policies per participant, catalog page rendering, dataset type classification</td></tr>
    <tr><td>Step 3</td><td>Discovery &amp; Federated Search</td><td>Catalog filtering, NL Query page, Patient Journey, OMOP Analytics rendering</td></tr>
    <tr><td>Step 4</td><td>Contract Negotiation</td><td>DSP state machine (6 states), FINALIZED agreements, cross-border DIDs</td></tr>
    <tr><td>Step 5</td><td>Data Transfer &amp; Viewing</td><td>Transfer lifecycle (4 states), HttpData-PULL type, contractId linking</td></tr>
    <tr><td>Step 6</td><td>Audit &amp; Provenance</td><td>Audit logging, provenance chains, admin dashboard</td></tr>
    <tr><td>Step 7</td><td>EEHRxF &amp; Compliance</td><td>6 EHDS priority categories, HL7 Europe profile alignment, coverage scoring</td></tr>
    <tr><td>Infra</td><td>Browser Errors &amp; Smoke</td><td>Zero console errors on all pages, static asset integrity, navigation dropdowns</td></tr>
  </tbody>
</table>

<!-- ── Reports ────────────────────────────────────────────────── -->
<h2>Reports</h2>
<div class="links">
  <a href="coverage/index.html">📊 Detailed Coverage Report</a>
  <a href="../e2e-report/">🎭 Playwright E2E Report</a>
  <a href="../e2e-report/ehds-journey.html">🏥 EHDS Journey Report</a>
  <a href="https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/workflows/test.yml">⚙️ CI Test Suite</a>
  <a href="../docs/developer">📖 Developer Guide</a>
</div>

<!-- ── Technology Stack ───────────────────────────────────────── -->
<h2>Technology Stack</h2>
<table>
  <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
  <tbody>
    <tr><td>Vitest 4 + React Testing Library</td><td>Unit tests, API route tests, component tests — jsdom environment</td></tr>
    <tr><td>@vitest/coverage-v8</td><td>Code coverage via V8 engine instrumentation</td></tr>
    <tr><td>Playwright</td><td>End-to-end browser testing — headless Chromium, screenshots, traces</td></tr>
    <tr><td>MSW (Mock Service Worker)</td><td>API mocking for deterministic offline testing</td></tr>
    <tr><td>GitHub Actions</td><td>CI pipeline — lint, type-check, unit tests, E2E tests on every push</td></tr>
  </tbody>
</table>

<footer>
  <a href="https://ma3u.github.io/MinimumViableHealthDataspacev2/">Home</a> ·
  <a href="https://github.com/ma3u/MinimumViableHealthDataspacev2">GitHub</a> ·
  <a href="https://github.com/ma3u/MinimumViableHealthDataspacev2/actions">CI</a> ·
  Apache 2.0 © 2026
</footer>
</body>
</html>`;

// ── Write ───────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);

console.log(
  `Test report: ${passed} passed, ${failed} failed, ${suites} files` +
    (stmts !== null
      ? ` | Coverage: ${stmts}% stmts, ${branches}% branches, ${funcs}% funcs, ${lines}% lines`
      : " | Coverage: not available"),
);
