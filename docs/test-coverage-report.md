# Test Coverage Report — Health Dataspace v2

**Date:** 2026-03-11
**Framework:** Vitest 4.0.18 + @vitest/coverage-v8
**Test Runner:** Node.js 22, jsdom environment

---

## Summary

| Component       | Test Files | Tests   | Stmts % | Branch % | Funcs % | Lines % |
| --------------- | ---------- | ------- | ------- | -------- | ------- | ------- |
| **UI**          | 19         | 94      | 24.64   | 13.64    | 14.46   | 24.28   |
| **Neo4j Proxy** | 1          | 10      | 27.95   | 26.63    | 16.66   | 28.84   |
| **Total**       | **20**     | **104** | —       | —        | —       | —       |

### Baseline → Current (UI)

| Metric   | Before (40 tests) | After (94 tests) | Improvement |
| -------- | ----------------- | ---------------- | ----------- |
| Stmts %  | 10.50             | 24.64            | **+134%**   |
| Branch % | 6.55              | 13.64            | **+108%**   |
| Funcs %  | 7.10              | 14.46            | **+104%**   |
| Lines %  | 10.23             | 24.28            | **+137%**   |
| Tests    | 40                | 94               | **+135%**   |
| Files    | 8                 | 19               | **+138%**   |

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

| Route                       | Stmts | Branch | Test File                             |
| --------------------------- | ----- | ------ | ------------------------------------- |
| `api/catalog/route.ts`      | 100%  | 100%   | `__tests__/api/catalog.test.ts`       |
| `api/compliance/route.ts`   | 100%  | 100%   | `__tests__/api/compliance.test.ts`    |
| `api/credentials/route.ts`  | 100%  | 100%   | `__tests__/api/credentials.test.ts`   |
| `api/graph/route.ts`        | 100%  | 50%    | `__tests__/api/graph.test.ts`         |
| `api/negotiations/route.ts` | 100%  | 100%   | `__tests__/api/negotiations.test.ts`  |
| `api/patient/route.ts`      | 100%  | 100%   | `__tests__/api/patient.test.ts`       |
| `api/transfers/route.ts`    | 100%  | 100%   | `__tests__/api/transfers.test.ts`     |
| `api/federated/route.ts`    | 100%  | 75%    | `__tests__/api/federated-nlq.test.ts` |
| `api/eehrxf/route.ts`       | 100%  | 62.5%  | `__tests__/api/eehrxf.test.ts`        |
| `api/analytics/route.ts`    | 100%  | —      | `__tests__/api/analytics.test.ts`     |

### API Routes — Partially Covered

| Route                         | Stmts  | Branch | Notes                               |
| ----------------------------- | ------ | ------ | ----------------------------------- |
| `api/assets/route.ts`         | 96.15% | 73.33% | Missing one branch on line 51       |
| `api/nlq/route.ts`            | 92.3%  | 50%    | Untested branch on line 31          |
| `api/participants/route.ts`   | 57.69% | 50%    | POST success path partially covered |
| `api/admin/policies/route.ts` | —      | —      | Tested via EDC mock                 |
| `api/admin/tenants/route.ts`  | —      | —      | Tested via EDC mock                 |

### API Routes — Not Yet Covered (0%)

| Route                              | Lines | Priority          |
| ---------------------------------- | ----- | ----------------- |
| `api/auth/[...nextauth]/route.ts`  | 4–12  | Low (auth config) |
| `api/compliance/tck/route.ts`      | 4–297 | Medium            |
| `api/credentials/request/route.ts` | 4–64  | Medium            |
| `api/negotiations/[id]/route.ts`   | 4–30  | Low               |
| `api/transfers/[id]/route.ts`      | 4–30  | Low               |
| `api/participants/me/route.ts`     | 4–40  | Low               |

### Libraries

| File                | Stmts  | Branch | Funcs | Notes                          |
| ------------------- | ------ | ------ | ----- | ------------------------------ |
| `lib/neo4j.ts`      | 100%   | 100%   | 100%  | Fully covered                  |
| `lib/api.ts`        | 70.83% | 68.18% | 100%  | Static export routes covered   |
| `lib/edc/client.ts` | 84.61% | 87.23% | 37.5% | Token caching + failure paths  |
| `lib/auth.ts`       | 0%     | 0%     | 0%    | NextAuth config — complex mock |
| `lib/edc/index.ts`  | 0%     | 0%     | 0%    | Re-export file                 |

### Components

| File               | Stmts  | Branch | Funcs  | Notes                     |
| ------------------ | ------ | ------ | ------ | ------------------------- |
| `Navigation.tsx`   | 70.73% | 26.92% | 52.38% | Main nav + dropdown logic |
| `UserMenu.tsx`     | 75%    | 44%    | 77.77% | Auth states + dropdown    |
| `AuthProvider.tsx` | 0%     | 100%   | 0%     | Simple wrapper            |

### Page Components (all 0% — client-side rendering)

Not covered by unit tests. These are complex React components with `useState`/`useEffect` hooks
that fetch data from API routes. They are covered by E2E tests (Playwright) instead.

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

| File                                  | Tests | Description                                 |
| ------------------------------------- | ----- | ------------------------------------------- |
| `unit/lib/neo4j.test.ts`              | 6     | Driver creation, query execution, caching   |
| `unit/lib/edc-client.test.ts`         | 7     | EDC management API, token caching, failures |
| `unit/lib/api.test.ts`                | 9     | `fetchApi` normal + static export routing   |
| `unit/components/Navigation.test.tsx` | 7     | Nav links, active highlighting, dropdown    |
| `unit/components/UserMenu.test.tsx`   | 7     | Auth states, dropdown toggle, role badges   |

### API Integration Tests (`__tests__/api/`)

| File                         | Tests | Description                         |
| ---------------------------- | ----- | ----------------------------------- |
| `api/graph.test.ts`          | 4     | Graph nodes/links, deduplication    |
| `api/catalog.test.ts`        | 3     | Dataset listing from Neo4j          |
| `api/patient.test.ts`        | 4     | List + timeline modes               |
| `api/credentials.test.ts`    | 3     | Credential list + quality metrics   |
| `api/analytics.test.ts`      | 2     | OMOP summary + empty defaults       |
| `api/compliance.test.ts`     | 4     | Consumer/dataset list + chain check |
| `api/eehrxf.test.ts`         | 2     | Category profiles                   |
| `api/negotiations.test.ts`   | 6     | List + initiate + error handling    |
| `api/transfers.test.ts`      | 7     | List + initiate + default types     |
| `api/participants.test.ts`   | 5     | List + create + validation          |
| `api/assets.test.ts`         | 6     | List + create + aggregate           |
| `api/admin-tenants.test.ts`  | 2     | Tenant listing + EDC enrichment     |
| `api/admin-policies.test.ts` | 5     | Policy CRUD + aggregate             |
| `api/federated-nlq.test.ts`  | 5     | Federated proxy + NLQ GET/POST      |

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
  - `ui-tests` — Runs all 94 UI tests with coverage
  - `proxy-tests` — Runs all 10 proxy tests with coverage
  - `lint` — ESLint check on UI code
- **Artifacts:** Coverage HTML reports uploaded for 30 days
- **Summary:** Coverage tables written to GitHub job summary

---

## Remaining Coverage Gaps

| Area                      | Priority | Effort | Notes                                     |
| ------------------------- | -------- | ------ | ----------------------------------------- |
| Page components (13)      | Low      | High   | Complex client-side; E2E covers these     |
| `compliance/tck/route.ts` | Medium   | Medium | 297-line route with external calls        |
| `credentials/request`     | Medium   | Low    | 64 lines, EDC + Neo4j mock needed         |
| `auth.ts` (NextAuth)      | Low      | Medium | Complex OAuth config, best tested via E2E |
| `participants/me`         | Low      | Low    | Session-based route                       |
| `negotiations/[id]`       | Low      | Low    | Simple proxy to EDC                       |
| `transfers/[id]`          | Low      | Low    | Simple proxy to EDC                       |
