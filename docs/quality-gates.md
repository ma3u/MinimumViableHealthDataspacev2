# Quality Gates — Health Dataspace v2

**Last updated:** 2026-04-11
**Version:** 1.1.0

This document describes every quality gate enforced in the Health Dataspace v2
project — from local pre-commit hooks to CI/CD pipeline checks — and recommends
future improvements aligned with EHDS regulatory requirements, BSI C5 cloud
security, and OWASP application security standards.

---

## Overview

Quality is enforced at four stages, each progressively stricter:

```
Developer Workstation          CI/CD Pipeline
┌──────────────────┐           ┌───────────────────────────────────┐
│ 1. Pre-commit    │    push   │ 3. Continuous Integration         │
│    11 hooks      │ ────────► │    8 parallel jobs                │
│                  │           │                                   │
│ 2. Pre-push     │           │ 4. Compliance (weekly + on main)  │
│    2 gates       │           │    3 protocol suites              │
└──────────────────┘           └───────────────────────────────────┘
```

---

## Stage 1 — Pre-commit Hooks

Run automatically before every `git commit`. Configured in
`.pre-commit-config.yaml`.

| #   | Hook                   | Tool             | Severity   | Action                              |
| --- | ---------------------- | ---------------- | ---------- | ----------------------------------- |
| 1   | Trailing whitespace    | pre-commit       | Auto-fix   | Strips trailing spaces              |
| 2   | End-of-file fixer      | pre-commit       | Auto-fix   | Ensures trailing newline            |
| 3   | YAML syntax            | pre-commit       | Error      | Validates YAML files                |
| 4   | JSON syntax            | pre-commit       | Error      | Validates JSON files                |
| 5   | Large file check       | pre-commit       | **Blocks** | Rejects files > 5 MB                |
| 6   | Merge conflict markers | pre-commit       | **Blocks** | Detects `<<<<<<<`                   |
| 7   | Private key detection  | pre-commit       | **Blocks** | Catches accidental key commits      |
| 8   | Dockerfile linting     | Hadolint v2.14   | **Blocks** | Best-practice Dockerfile rules      |
| 9   | Shell script linting   | ShellCheck v0.11 | **Blocks** | `--severity=error`                  |
| 10  | Code formatting        | Prettier v3.1    | Auto-fix   | JS, TS, JSON, YAML, MD              |
| 11  | TypeScript type-check  | `tsc --noEmit`   | **Blocks** | Strict mode, `tsconfig.build.json`  |
| 12  | ESLint                 | Next.js lint     | **Blocks** | Max 55 warnings threshold           |
| 13  | Secret scan            | Gitleaks (local) | **Blocks** | Staged diff only (optional install) |

**Key rules:**

- `prefer-const` and `no-var` are ESLint **errors** (not warnings)
- `eqeqeq` enforces strict equality (`===`)
- `no-console` allows only `console.warn` and `console.error`
- TypeScript `strict: true` enables all strict type-checking options

---

## Stage 2 — Pre-push Hooks

Run before `git push`. Catch issues that are too slow for pre-commit.

| #   | Hook             | Tool                           | Severity        | Action                 |
| --- | ---------------- | ------------------------------ | --------------- | ---------------------- |
| 1   | Unit tests       | Vitest `--bail 1`              | **Blocks push** | Stops on first failure |
| 2   | Dependency audit | `npm audit --audit-level=high` | **Blocks push** | HIGH + CRITICAL CVEs   |

---

## Stage 3 — CI Pipeline (GitHub Actions)

Triggered on push to any branch (when `ui/**`, `services/**`, or workflow files
change) and on pull requests to main. Workflow: `.github/workflows/test.yml`.

### 3.1 Unit & Integration Tests

| Job                   | Tests | Coverage                    | Gate             |
| --------------------- | ----- | --------------------------- | ---------------- |
| **UI Tests (Vitest)** | 1,613 | 93.78% stmts / 94.73% lines | **Blocks merge** |
| **Neo4j Proxy Tests** | 10    | 27.95% stmts                | **Blocks merge** |
| **Lint**              | —     | —                           | **Blocks merge** |

Coverage reports are uploaded as artifacts (30-day retention) and summarised in
the GitHub job summary.

### 3.2 Security Scanning

| Job                  | Tool             | Standard                  | Gate                              |
| -------------------- | ---------------- | ------------------------- | --------------------------------- |
| **Secret Scan**      | Gitleaks v8.27.2 | BSI C5 DEV-08             | **Blocks merge**                  |
| **Dependency Audit** | npm audit        | OWASP A06 / BSI C5 DEV-05 | **Blocks merge** (UI)             |
| **Trivy Scan**       | Trivy v0.69.3    | CVE detection + misconfig | Reports (SARIF → GitHub Security) |
| **K8s Posture**      | Kubescape        | NSA + CIS v1.23           | Reports only                      |

**Supply-chain hardening:**

- Gitleaks and Trivy binaries are pinned to exact versions with SHA-256
  checksum verification.
- Trivy v0.69.3 is used explicitly — versions 0.69.4–0.69.6 were compromised
  (CVE-2026-33634).
- Two dev-only secrets are allowlisted in `.gitleaksignore` (JAD stack
  in-memory Vault credentials).

### 3.3 E2E Tests (Main Branch + Manual Dispatch)

| Job                   | Tests | Tool                | Gate                                 |
| --------------------- | ----- | ------------------- | ------------------------------------ |
| **Playwright E2E**    | 778   | Playwright v1.58    | `continue-on-error` (no Neo4j in CI) |
| **WCAG 2.2 AA Audit** | 93    | axe-core/playwright | `continue-on-error`                  |
| **Security Pentest**  | 40+   | OWASP/BSI patterns  | `continue-on-error`                  |

E2E tests are informational in CI because the full JAD stack (Neo4j, Keycloak,
EDC-V) is not available. Full results from the JAD stack run:

| Suite                        | Passed | Skipped | Failed |
| ---------------------------- | ------ | ------- | ------ |
| E2E (29 specs)               | 581    | 197     | 0      |
| WCAG unauthenticated         | 26     | 0       | 0      |
| WCAG authenticated (7 roles) | 67     | 0       | 0      |

### 3.4 Security Headers (Runtime)

Configured in `ui/next.config.js` (BSI C5 DEV-07 / OWASP A05):

| Header                    | Value                                      |
| ------------------------- | ------------------------------------------ |
| `X-Frame-Options`         | `DENY`                                     |
| `X-Content-Type-Options`  | `nosniff`                                  |
| `Referrer-Policy`         | `strict-origin-when-cross-origin`          |
| `Permissions-Policy`      | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'` + scoped allowlist    |

---

## Stage 4 — Compliance Testing (Weekly + Main)

Triggered on push to main (specific paths) and every Monday at 06:00 UTC.
Workflow: `.github/workflows/compliance.yml`.

| Suite              | Tests | Protocol                      | Pass Rate     |
| ------------------ | ----- | ----------------------------- | ------------- |
| **DSP 2025-1 TCK** | 33    | Dataspace Protocol            | 84.8% (28/33) |
| **DCP v1.0**       | 22    | Decentralised Claims Protocol | 90.9% (20/22) |
| **EHDS Domain**    | 25    | EHDS Art. 3–12, 50–51         | 64.0% (16/25) |

Results are aggregated into a compliance report artifact (90-day retention).

---

## Current Coverage Summary

### UI Test Coverage (v8)

| Metric     | Value  | Trend                      |
| ---------- | ------ | -------------------------- |
| Statements | 93.78% | +793% from baseline        |
| Branches   | 81.65% | +1,147% from baseline      |
| Functions  | 89.57% | +1,162% from baseline      |
| Lines      | 94.73% | +826% from baseline        |
| Test count | 1,613  | +3,933% from baseline (40) |
| Test files | 86     | +975% from baseline (8)    |

### Coverage by Component

| Component       | Stmts   | Branch  | Notes                                  |
| --------------- | ------- | ------- | -------------------------------------- |
| API routes (16) | 100%    | 50–100% | All routes have dedicated test suites  |
| Libraries (5)   | 70–100% | 62–100% | `lib/auth.ts` at 73.8%, rest > 84%     |
| Components (3)  | 70–100% | 26–100% | Navigation branch coverage is low      |
| Pages (6)       | 28–96%  | —       | Graph page limited by canvas rendering |

### Known Gaps

| Area                 | Stmts | Reason                                 |
| -------------------- | ----- | -------------------------------------- |
| `auth/[...nextauth]` | 0%    | 8-line NextAuth handler re-export      |
| `admin/audit`        | 0%    | Audit logging route                    |
| Neo4j Proxy          | 28%   | Needs live Neo4j for integration paths |
| Graph page           | 29%   | jsdom cannot test canvas (ForceGraph)  |

---

## Future Quality Gates — Recommendations

The following gates are recommended for future implementation, prioritised by
impact and regulatory alignment.

### Priority 1 — Enforce Coverage Thresholds

**What:** Add minimum coverage thresholds to `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    statements: 85,
    branches: 70,
    functions: 80,
    lines: 85,
  }
}
```

**Why:** Current coverage (93%+ statements) is well above these thresholds, but
without enforcement it can silently regress. This is a zero-effort gate that
protects existing investment.

**Standard:** BSI C5 DEV-03 (test adequacy).

### Priority 2 — Mutation Testing

**What:** Add Stryker Mutator to measure test effectiveness, not just coverage.

```bash
npx stryker run --reporters html,dashboard
```

**Why:** 94% line coverage does not guarantee that tests actually catch bugs.
Mutation testing introduces small changes (mutants) and verifies tests detect
them. A mutation score > 60% is a strong indicator of effective tests.

**Standard:** OWASP Testing Guide v4.2 — test effectiveness measurement.

### Priority 3 — Licence Compliance Scanning

**What:** Add `license-checker` or FOSSA to CI to enforce licence compatibility.

```yaml
- name: Licence compliance
  run: npx license-checker --onlyAllow "MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause;0BSD"
```

**Why:** EHDS implementations must comply with EU procurement and open-source
licence requirements. A copyleft dependency (GPL) in a proprietary deployment
would create legal risk.

**Standard:** EU Open Source Strategy 2020–2023, BSI C5 OPS-04.

### Priority 4 — API Contract Testing

**What:** Add OpenAPI schema validation for all 36 API routes using
`@apidevtools/swagger-parser` or Prism.

**Why:** API routes currently return `{ error: string }` on failure but there is
no formal schema enforcing response shapes. Contract tests prevent frontend/
backend drift and are essential for DSP interoperability.

**Standard:** DSP 2025-1 §4.2 (protocol message schemas).

### Priority 5 — SBOM Generation (Software Bill of Materials)

**What:** Generate CycloneDX or SPDX SBOM on every release.

```yaml
- name: Generate SBOM
  run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

**Why:** EHDS Art. 50 requires transparency about software components in
HealthData@EU infrastructure. EU Cyber Resilience Act (CRA) will mandate SBOMs
for software with digital elements by 2027.

**Standard:** EU CRA Art. 13, NTIA SBOM minimum elements.

### Priority 6 — Performance Regression Testing

**What:** Add Lighthouse CI or `web-vitals` budgets to the Playwright pipeline.

```typescript
// playwright performance budget
expect(metrics.LCP).toBeLessThan(2500); // Largest Contentful Paint
expect(metrics.FID).toBeLessThan(100); // First Input Delay
expect(metrics.CLS).toBeLessThan(0.1); // Cumulative Layout Shift
expect(metrics.bundleSize).toBeLessThan(500_000); // 500 KB initial JS
```

**Why:** Healthcare professionals use the platform under time pressure. A
regression from 1.2s to 4s page load directly impacts clinical workflow. No
current gate catches performance regressions.

**Standard:** WCAG 2.2 SC 2.2.1 (timing adjustable), Core Web Vitals.

### Priority 7 — Runtime ODRL Policy Enforcement

**What:** Implement the ODRL engine from the Phase 24 plan — validate that API
responses respect the caller's ODRL scope (permitted datasets, temporal limits,
re-identification prohibitions).

**Why:** Currently, ODRL policies in the Neo4j graph are decorative. Any
authenticated user can query any dataset. This is the single largest compliance
gap for EHDS secondary use (Art. 44 data permits).

**Standard:** EHDS Art. 44, ODRL 2.2 §3 (policy enforcement).

### Priority 8 — Accessibility Regression Budget

**What:** Promote the WCAG 2.2 AA audit from `continue-on-error` to a blocking
gate with a zero-violation budget.

```yaml
- name: WCAG 2.2 AA audit
  run: npx playwright test 27-wcag-accessibility.spec.ts
  # No continue-on-error — violations block the pipeline
```

**Why:** Current state is zero violations across all pages and roles, but
without enforcement any new component could introduce regressions undetected.
Healthcare platforms serve users with disabilities; accessibility is a legal
requirement (EU Web Accessibility Directive 2016/2102).

**Standard:** EN 301 549 v3.2.1, WCAG 2.2 AA, EU Directive 2016/2102.

### Priority 9 — Infrastructure-as-Code Validation

**What:** Add `kube-score` or OPA/Rego policy checks for Kubernetes manifests
beyond the current Kubescape scan.

**Why:** The `k8s/` manifests define the production deployment topology. Current
Kubescape scan is informational only. Enforcing resource limits, network
policies, and pod security standards prevents production incidents.

**Standard:** BSI C5 OPS-01 (operational security), NSA K8s Hardening Guide.

### Priority 10 — Dependency Freshness

**What:** Add Renovate Bot or Dependabot with auto-merge for patch updates and
weekly PR creation for minor/major updates.

**Why:** The project currently has no automated dependency update mechanism.
Stale dependencies accumulate CVEs and miss performance improvements. Trivy
catches known CVEs but does not proactively update.

**Standard:** OWASP A06 (vulnerable and outdated components).

---

## Quality Gate Matrix — Current vs Future

| Gate                 | Stage           | Current                   | Future Target                  |
| -------------------- | --------------- | ------------------------- | ------------------------------ |
| Type safety          | Pre-commit      | `strict: true`            | No change needed               |
| Linting              | Pre-commit      | Max 55 warnings           | Max 0 warnings                 |
| Unit tests           | Pre-push + CI   | 1,613 tests, no threshold | 85% stmts minimum              |
| Secret scan          | Pre-commit + CI | Gitleaks v8.27.2          | No change needed               |
| Dependency audit     | Pre-push + CI   | HIGH/CRITICAL             | Add licence scan               |
| Coverage             | CI              | Report only               | Enforce 85/70/80/85            |
| WCAG 2.2 AA          | CI (main)       | `continue-on-error`       | **Blocking** (zero violations) |
| Security pentest     | CI (main)       | `continue-on-error`       | Blocking (critical subset)     |
| Performance          | —               | Not measured              | Core Web Vitals budget         |
| Mutation testing     | —               | Not implemented           | 60% mutation score             |
| SBOM                 | —               | Not generated             | CycloneDX on release           |
| API contracts        | —               | No schema validation      | OpenAPI per route              |
| ODRL enforcement     | —               | Decorative                | Runtime enforcement            |
| Licence compliance   | —               | Not checked               | Allowlist enforcement          |
| IaC validation       | CI              | Kubescape (info)          | Blocking on critical           |
| Dependency freshness | —               | Manual                    | Renovate Bot                   |

---

## Compliance Mapping

| Quality Gate        | BSI C5 | OWASP | EHDS      | WCAG   |
| ------------------- | ------ | ----- | --------- | ------ |
| TypeScript strict   | DEV-01 | —     | —         | —      |
| ESLint              | DEV-02 | A03   | —         | —      |
| Unit tests          | DEV-03 | —     | —         | —      |
| Coverage thresholds | DEV-03 | —     | —         | —      |
| Secret scan         | DEV-08 | A07   | —         | —      |
| Dependency audit    | DEV-05 | A06   | —         | —      |
| Trivy scan          | DEV-05 | A06   | —         | —      |
| Security headers    | DEV-07 | A05   | —         | —      |
| WCAG audit          | —      | —     | —         | 2.2 AA |
| DSP TCK             | —      | —     | Art. 50   | —      |
| DCP compliance      | —      | —     | Art. 50   | —      |
| EHDS tests          | —      | —     | Art. 3–51 | —      |
| ODRL enforcement    | —      | A01   | Art. 44   | —      |
| SBOM                | OPS-04 | A06   | Art. 50   | —      |
| Licence compliance  | OPS-04 | —     | —         | —      |

---

## Related Documentation

- [Test Coverage Report](test-coverage-report.md) — Detailed per-file coverage
- [E2E Test Report](e2e-test-report.md) — Full JAD stack test results
- [Test Report](test-report.md) — Integration and unit test results
- [Simpl-Open Gap Analysis](simpl-ehds-gap-analysis.md) — EU middleware comparison
- [Planning & Roadmap](planning-health-dataspace-v2.md) — Implementation phases
