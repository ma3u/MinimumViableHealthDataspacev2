# Test Coverage Report — Health Dataspace v2

**Date:** 2026-03-21
**Framework:** Vitest 4.x + @vitest/coverage-v8
**Test Runner:** Node.js 20, jsdom environment

---

## Summary

| Component       | Test Files | Tests     | Stmts % | Branch % | Funcs % | Lines % |
| --------------- | ---------- | --------- | ------- | -------- | ------- | ------- |
| **UI**          | 78         | 1,490     | 93.78   | 81.65    | 89.57   | 94.73   |
| **Neo4j Proxy** | 1          | 10        | 27.95   | 26.63    | 16.66   | 28.84   |
| **E2E**         | 29         | 778       | —       | —        | —       | —       |
| **Total**       | **108**    | **2,278** | —       | —        | —       | —       |

> E2E results from JAD stack run (2026-04-11): 581 passed, 197 skipped, 0 failed.
> See [E2E Test Report](e2e-test-report.md) for full breakdown.

### Coverage Progression (UI)

| Metric   | Baseline (40) | Phase 8 (94) | Phase 9 (128) | Phase 12 (247) | Current (1,391) | Total Improvement |
| -------- | ------------- | ------------ | ------------- | -------------- | --------------- | ----------------- |
| Stmts %  | 10.50         | 24.64        | 34.05         | 71.76          | **93.78**       | **+793%**         |
| Branch % | 6.55          | 13.64        | 18.87         | 51.15          | **81.65**       | **+1147%**        |
| Funcs %  | 7.10          | 14.46        | 20.75         | 67.16          | **89.57**       | **+1162%**        |
| Lines %  | 10.23         | 24.28        | 33.84         | 72.10          | **94.73**       | **+826%**         |
| Tests    | 40            | 94           | 128           | 247            | **1,490**       | **+3625%**        |
| Files    | 8             | 19           | 27            | 35             | **78**          | **+875%**         |

---

## Commands

### Run all UI tests

```bash
cd ui
npm test                          # quick run
npx vitest run --reporter=verbose # verbose output
```

### Run UI tests with coverage

```bash
cd ui
npm run test:coverage
# or
npx vitest run --coverage
```

### Run neo4j-proxy tests with coverage

```bash
cd services/neo4j-proxy
npm run test:coverage
# or
npx vitest run --coverage
```

### Run E2E tests (requires Docker services)

```bash
cd ui
npm run test:e2e
# or with UI debugger
npm run test:e2e:ui
```

### View HTML coverage report

```bash
cd ui && open coverage/index.html
cd services/neo4j-proxy && open coverage/index.html
```

---

## Coverage by File (UI)

### API Routes — Fully Covered (100%)

| Route                              | Stmts | Branch | Test File                                   |
| ---------------------------------- | ----- | ------ | ------------------------------------------- |
| `api/catalog/route.ts`             | 100%  | 100%   | `__tests__/api/catalog.test.ts`             |
| `api/compliance/route.ts`          | 100%  | 100%   | `__tests__/api/compliance.test.ts`          |
| `api/compliance/tck/route.ts`      | 100%  | 89.7%  | `__tests__/api/compliance-tck.test.ts`      |
| `api/credentials/route.ts`         | 100%  | 100%   | `__tests__/api/credentials.test.ts`         |
| `api/credentials/request/route.ts` | 100%  | 78.6%  | `__tests__/api/credentials-request.test.ts` |
| `api/graph/route.ts`               | 100%  | 50%    | `__tests__/api/graph.test.ts`               |
| `api/negotiations/route.ts`        | 100%  | 100%   | `__tests__/api/negotiations.test.ts`        |
| `api/negotiations/[id]/route.ts`   | 100%  | 100%   | `__tests__/api/negotiations-id.test.ts`     |
| `api/participants/route.ts`        | 100%  | 87.5%  | `__tests__/api/participants.test.ts`        |
| `api/participants/me/route.ts`     | 100%  | 100%   | `__tests__/api/participants-me.test.ts`     |
| `api/patient/route.ts`             | 100%  | 100%   | `__tests__/api/patient.test.ts`             |
| `api/transfers/route.ts`           | 100%  | 100%   | `__tests__/api/transfers.test.ts`           |
| `api/transfers/[id]/route.ts`      | 100%  | 100%   | `__tests__/api/transfers-id.test.ts`        |
| `api/federated/route.ts`           | 100%  | 75%    | `__tests__/api/federated-nlq.test.ts`       |
| `api/eehrxf/route.ts`              | 100%  | 62.5%  | `__tests__/api/eehrxf.test.ts`              |
| `api/analytics/route.ts`           | 100%  | —      | `__tests__/api/analytics.test.ts`           |

### API Routes — Partially Covered

| Route                         | Stmts  | Branch | Notes                         |
| ----------------------------- | ------ | ------ | ----------------------------- |
| `api/assets/route.ts`         | 96.15% | 73.33% | Missing one branch on line 51 |
| `api/nlq/route.ts`            | 92.3%  | 50%    | Untested branch on line 31    |
| `api/admin/policies/route.ts` | 87.5%  | 100%   | Tested via EDC mock           |
| `api/admin/tenants/route.ts`  | 100%   | 75%    | Tested via EDC mock           |

### API Routes — Not Yet Covered (0%)

| Route                             | Lines | Priority          |
| --------------------------------- | ----- | ----------------- |
| `api/auth/[...nextauth]/route.ts` | 4–12  | Low (auth config) |
| `api/admin/audit/route.ts`        | 3–136 | Low               |

### Libraries

| File                | Stmts  | Branch | Funcs | Notes                         |
| ------------------- | ------ | ------ | ----- | ----------------------------- |
| `lib/neo4j.ts`      | 100%   | 100%   | 100%  | Fully covered                 |
| `lib/api.ts`        | 70.83% | 68.18% | 100%  | Static export routes covered  |
| `lib/edc/client.ts` | 84.61% | 87.23% | 37.5% | Token caching + failure paths |
| `lib/edc/index.ts`  | 100%   | 100%   | 100%  | Re-export barrel (tested)     |
| `lib/auth.ts`       | 73.8%  | 62.1%  | 63.6% | hasRole + Roles + authOptions |

### Components

| File               | Stmts  | Branch | Funcs  | Notes                            |
| ------------------ | ------ | ------ | ------ | -------------------------------- |
| `Navigation.tsx`   | 70.73% | 26.92% | 52.38% | Main nav + dropdown logic        |
| `UserMenu.tsx`     | 75%    | 44%    | 77.77% | Auth states + dropdown           |
| `AuthProvider.tsx` | 100%   | 100%   | 100%   | SessionProvider wrapper (tested) |

### Page Components

All 6 major page components now have dedicated unit test suites with >85% coverage (except Graph at ~29% due to canvas rendering):

| Page        | Stmts  | Branch | Tests | Notes                                        |
| ----------- | ------ | ------ | ----- | -------------------------------------------- |
| `catalog`   | 90.9%  | —      | 4     | Filter, expand, legal basis, error           |
| `patient`   | 96.55% | —      | 4     | Stats, selector, timeline, error             |
| `negotiate` | 89.83% | —      | 8     | Participants, form, states, submit, error    |
| `query`     | 91.66% | —      | 8     | Federated, templates, SPE, toggle, submit    |
| `settings`  | 87.5%  | —      | 7     | Empty state, profiles, save, multi-tenant    |
| `graph`     | 28.94% | —      | 5     | Canvas-based ForceGraph limits jsdom testing |

---

## Neo4j Proxy Coverage

| File       | Stmts  | Branch | Funcs  | Lines  |
| ---------- | ------ | ------ | ------ | ------ |
| `index.ts` | 27.95% | 26.63% | 16.66% | 28.84% |

10 tests covering: health check, FHIR patient list, FHIR patient everything, FHIR bundle
ingest, OMOP cohort, OMOP timeline, catalog datasets, catalog by ID, federated stats, NLQ
templates.

---

## Test File Inventory

### Unit Tests (`__tests__/unit/`)

| File                                    | Tests | Description                                 |
| --------------------------------------- | ----- | ------------------------------------------- |
| `unit/lib/neo4j.test.ts`                | 6     | Driver creation, query execution, caching   |
| `unit/lib/edc-client.test.ts`           | 7     | EDC management API, token caching, failures |
| `unit/lib/api.test.ts`                  | 9     | `fetchApi` normal + static export routing   |
| `unit/lib/auth.test.ts`                 | 9     | hasRole, Roles constant, authOptions config |
| `unit/lib/edc-index.test.ts`            | 2     | Barrel re-exports verification              |
| `unit/components/Navigation.test.tsx`   | 7     | Nav links, active highlighting, dropdown    |
| `unit/components/UserMenu.test.tsx`     | 7     | Auth states, dropdown toggle, role badges   |
| `unit/components/AuthProvider.test.tsx` | 1     | SessionProvider wrapper rendering           |

### API Integration Tests (`__tests__/api/`)

| File                              | Tests | Description                         |
| --------------------------------- | ----- | ----------------------------------- |
| `api/graph.test.ts`               | 4     | Graph nodes/links, deduplication    |
| `api/catalog.test.ts`             | 3     | Dataset listing from Neo4j          |
| `api/patient.test.ts`             | 4     | List + timeline modes               |
| `api/credentials.test.ts`         | 3     | Credential list + quality metrics   |
| `api/analytics.test.ts`           | 2     | OMOP summary + empty defaults       |
| `api/compliance.test.ts`          | 4     | Consumer/dataset list + chain check |
| `api/eehrxf.test.ts`              | 2     | Category profiles                   |
| `api/negotiations.test.ts`        | 6     | List + initiate + error handling    |
| `api/transfers.test.ts`           | 7     | List + initiate + default types     |
| `api/participants.test.ts`        | 9     | List + create + validation + 201    |
| `api/assets.test.ts`              | 6     | List + create + aggregate           |
| `api/admin-tenants.test.ts`       | 2     | Tenant listing + EDC enrichment     |
| `api/admin-policies.test.ts`      | 5     | Policy CRUD + aggregate             |
| `api/federated-nlq.test.ts`       | 5     | Federated proxy + NLQ GET/POST      |
| `api/compliance-tck.test.ts`      | 5     | DSP/DCP/EHDS compliance scorecards  |
| `api/credentials-request.test.ts` | 5     | Credential issuance request flow    |
| `api/negotiations-id.test.ts`     | 3     | Per-negotiation detail by ID        |
| `api/transfers-id.test.ts`        | 3     | Per-transfer detail by ID           |
| `api/participants-me.test.ts`     | 3     | Current user participant profile    |

### E2E Tests (`__tests__/e2e/`)

| File                | Tests | Description                    |
| ------------------- | ----- | ------------------------------ |
| `e2e/smoke.spec.ts` | 5     | Page loads, navigation, graphs |

### Neo4j Proxy Tests

| File                                           | Tests | Description        |
| ---------------------------------------------- | ----- | ------------------ |
| `services/neo4j-proxy/__tests__/proxy.test.ts` | 10    | All REST endpoints |

---

## CI/CD Integration

Test runs are automated via GitHub Actions (`.github/workflows/test.yml`):

- **Trigger:** Every push to any branch, every PR to main
- **Jobs:**
  - `ui-tests` — Runs all 1,490 UI tests with coverage
  - `proxy-tests` — Runs all 10 proxy tests with coverage
  - `e2e-tests` — Runs 102 Playwright E2E tests (main branch + manual)
  - `lint` — ESLint check on UI code
- **Artifacts:** Coverage HTML reports uploaded for 30 days
- **Summary:** Coverage tables written to GitHub job summary
- **GitHub Pages:** Test reports published at
  [`/test-reports/`](https://ma3u.github.io/MinimumViableHealthDataspacev2/test-reports/)

---

## Remaining Coverage Gaps

All source files are at or above 80% statement coverage. The remaining
improvement areas are branch coverage:

| Area                   | Stmts | Branch | Notes                                  |
| ---------------------- | ----- | ------ | -------------------------------------- |
| `auth/[...nextauth]`   | —     | —      | 8-line NextAuth handler re-export      |
| Neo4j Proxy `index.ts` | 28%   | 27%    | Needs live Neo4j for integration paths |

---

## Related Reports

- [Test Report (GitHub Pages)](https://ma3u.github.io/MinimumViableHealthDataspacev2/test-reports/) — live test results and coverage
- [Test Report](test-report.md) — integration, unit/API and E2E test results
- [Planning & Roadmap](planning-health-dataspace-v2.md) — 5-phase implementation roadmap
- [Graph Schema](health-dataspace-graph-schema.md) — 5-layer Neo4j graph schema
