---
description: Testing standards, frameworks, and commands for this project
globs:
  - "ui/__tests__/**"
  - "services/**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
---

# Testing Standards

## Frameworks

| Scope            | Framework  | Config                      |
| ---------------- | ---------- | --------------------------- |
| Unit / component | Vitest 4   | `ui/vitest.config.ts`       |
| E2E browser      | Playwright | `ui/playwright.config.ts`   |
| Protocol (DSP)   | Custom TCK | `scripts/run-dsp-tck.sh`    |
| Protocol (DCP)   | Custom     | `scripts/run-dcp-tests.sh`  |
| EHDS domain      | Custom     | `scripts/run-ehds-tests.sh` |

## Unit Tests (Vitest)

### Location

- Unit tests: `ui/__tests__/unit/` mirroring `ui/src/` structure.
- Service tests: `services/neo4j-proxy/__tests__/`.

### Commands

```bash
cd ui
npm test                          # run once
npm run test:watch                # watch mode
npm run test:coverage             # v8 coverage report
npx vitest run __tests__/unit/components/Navigation.test.tsx  # single file
```

### Setup

- Global setup in `ui/__tests__/setup.ts` — initialises MSW (Mock Service Worker).
- API calls in unit tests are intercepted by MSW handlers; do not mock `fetch` directly.
- Coverage provider: v8. Minimum thresholds not yet enforced; aim for critical-path coverage.

### Pre-push gate

- `pre-push` hook runs full Vitest suite with `--bail` (stops on first failure).
- Fix failing unit tests before pushing; they block the push.

## E2E Tests (Playwright)

### Location

- `ui/__tests__/e2e/journeys/` — journey test files named `NN-description.spec.ts`.
- Current journey range: J001–J260 across 19 spec files.
- Screenshot captures in `ui/__tests__/e2e/capture-screenshots.spec.ts`.

### Commands

```bash
cd ui
npm run test:e2e                  # all specs, needs UI + Neo4j running
npm run test:e2e:ui               # Playwright interactive UI
npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts

# Against JAD live stack (port 3003)
PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e

# Single project
npx playwright test --project=chromium
npx playwright test --project=live   # requires JAD stack
```

### Projects

- `chromium` — default, runs against `localhost:3000`.
- `live` — set `PLAYWRIGHT_BASE_URL=http://localhost:3003` for full JAD stack.

### Patterns in this codebase

- Helper `setPersona(page, username)`: injects `localStorage.setItem("demo-persona", username)` then reloads — used in static GitHub Pages tests.
- E2E journey tests are numbered sequentially; new tests get the next available `J` number range.
- Tests assert on visible text, aria-labels, and `data-testid` attributes — not on CSS class names.
- Broken image check: `page.evaluate(() => [...document.images].filter(img => !img.complete || img.naturalWidth === 0))`.

### CI behaviour

- CI runs Playwright with `--project=chromium` only.
- E2E tests in `pages.yml` have `continue-on-error: true` so a test failure does not block the GitHub Pages deploy.

## Static GitHub Pages Tests

The spec `19-static-github-pages.spec.ts` (J221–J260) tests the static export:

- Uses `setPersona()` helper to inject localStorage before navigation.
- Tests each of 7 demo personas: correct nav groups visible, persona-specific data displayed.
- Broken image audit across 10 pages.
- Broken link audit (excludes anchors).
- Data completeness checks (patient profile, insights, research programmes).

## Test ID Conventions

| Prefix | Scope                     |
| ------ | ------------------------- |
| J001–  | Graph Explorer journeys   |
| J100–  | Catalog / DCAT journeys   |
| J140–  | Compliance / Trust Center |
| J160–  | Role navigation           |
| J180–  | Keycloak login / roles    |
| J221–  | Static GitHub Pages       |

## What Not to Mock

- Do not mock Neo4j driver internals in integration-style tests; use the mock JSON fixtures under `ui/public/mock/`.
- Do not mock `next-auth/react` session in E2E tests; use the `setPersona` localStorage helper instead.
- MSW is for unit tests only; Playwright tests hit the actual running server.
