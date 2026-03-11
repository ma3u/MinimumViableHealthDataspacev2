# Test Report — Health Dataspace v2

> Auto-generated test summary. Run `scripts/generate-test-report.sh` to regenerate.

## Unit & API Tests (Vitest)

| Metric       | Value                              |
| ------------ | ---------------------------------- |
| Test files   | 35                                 |
| Tests passed | 212                                |
| Tests failed | 0                                  |
| Framework    | Vitest 3.x + React Testing Library |

### Coverage (v8)

| Metric         | Percentage |
| -------------- | ---------- |
| **Statements** | **66.31%** |
| Branches       | 43.18%     |
| Functions      | 58.39%     |
| Lines          | 66.53%     |

> Baseline was 32.7% statements. Coverage doubled with the addition of 84 page-level unit tests.

## E2E Tests (Playwright)

| Metric       | Value               |
| ------------ | ------------------- |
| Spec files   | 4                   |
| Tests passed | 31                  |
| Tests failed | 0                   |
| Browser      | Chromium (headless) |

### E2E Test Coverage

- **Navigation**: 5 dropdown clusters verified (Explore, Governance, Exchange, Portal, Docs)
- **Public pages**: All 9 public page headings verified (Graph, Catalog, Patient, Analytics, EEHRxF, Docs ×4)
- **Auth protection**: 7 protected routes verified to redirect to sign-in
- **Documentation**: Content sections, Mermaid diagrams, sub-page links
- **Responsive**: Mobile viewport rendering, page title
- **Smoke tests**: Home page, graph, catalog, patient, navigation flow

## Test Inventory

### Unit & API Tests

| File                                                | Type |
| --------------------------------------------------- | ---- |
| `__tests__/api/admin-tenants.test.ts`               | api  |
| `__tests__/api/analytics.test.ts`                   | api  |
| `__tests__/api/assets.test.ts`                      | api  |
| `__tests__/api/catalog.test.ts`                     | api  |
| `__tests__/api/compliance.test.ts`                  | api  |
| `__tests__/api/credentials.test.ts`                 | api  |
| `__tests__/api/graph.test.ts`                       | api  |
| `__tests__/api/negotiate.test.ts`                   | api  |
| `__tests__/api/onboarding.test.ts`                  | api  |
| `__tests__/api/participants.test.ts`                | api  |
| `__tests__/api/patient.test.ts`                     | api  |
| `__tests__/api/query.test.ts`                       | api  |
| `__tests__/api/tck.test.ts`                         | api  |
| `__tests__/api/transfers-id.test.ts`                | api  |
| `__tests__/api/transfers.test.ts`                   | api  |
| `__tests__/unit/components/MermaidDiagram.test.tsx` | unit |
| `__tests__/unit/components/Navigation.test.tsx`     | unit |
| `__tests__/unit/components/UserMenu.test.tsx`       | unit |
| `__tests__/unit/lib/auth.test.ts`                   | unit |
| `__tests__/unit/lib/edc-index.test.ts`              | unit |
| `__tests__/unit/lib/neo4j.test.ts`                  | unit |
| `__tests__/unit/pages/auth-query-pages.test.tsx`    | unit |
| `__tests__/unit/pages/docs-pages.test.tsx`          | unit |
| `__tests__/unit/pages/exchange-pages.test.tsx`      | unit |
| `__tests__/unit/pages/explore-pages.test.tsx`       | unit |
| `__tests__/unit/pages/governance-pages.test.tsx`    | unit |
| `__tests__/unit/pages/home.test.tsx`                | unit |
| `__tests__/unit/pages/portal-pages.test.tsx`        | unit |

### E2E Tests

| File                               | Tests                 |
| ---------------------------------- | --------------------- |
| `__tests__/e2e/smoke.spec.ts`      | 5 smoke tests         |
| `__tests__/e2e/navigation.spec.ts` | 5 dropdown tests      |
| `__tests__/e2e/pages.spec.ts`      | 16 page routing tests |
| `__tests__/e2e/docs.spec.ts`       | 5 documentation tests |

## Running Tests Locally

```bash
# Unit + API tests
cd ui && npx vitest run

# Unit tests with coverage
cd ui && npx vitest run --coverage

# E2E tests (requires dev server or Docker stack)
cd ui && npx playwright test

# Generate this report
./scripts/generate-test-report.sh
```

---

_Generated: 2025-03-11_
