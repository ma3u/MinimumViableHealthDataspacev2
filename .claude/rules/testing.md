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

| Scope            | Framework       | Config                                 |
| ---------------- | --------------- | -------------------------------------- |
| Unit / component | Vitest 5        | `ui/vitest.config.ts`                  |
| E2E browser      | Playwright      | `ui/playwright.config.ts`              |
| iOS unit         | Swift Testing   | `cd clients/ios && swift test`         |
| iOS on screen    | XCUITest        | `clients/ios/Scripts/run-ui-tests.sh`  |
| DSP conformance  | Eclipse DSP TCK | `scripts/run-eclipse-dsp-tck.sh`       |
| EHDS dataspace   | Our own checks  | `scripts/run-ehds-dataspace-checks.sh` |
| EHDS identity    | Our own checks  | `scripts/run-ehds-identity-checks.sh`  |
| EHDS API by role | Bruno           | `scripts/run-api-tests.sh <env>`       |
| EHDS domain      | Custom          | `scripts/run-ehds-tests.sh`            |

## API Collection (Bruno)

`bruno/MVHDv2/` is organised by EHDS persona, one folder per role in Regulation
(EU) 2025/327, plus two folders for the two-sided procedures of Chapter IV, one
for the role boundaries, and three for the protocol and platform surfaces
(ADR-032). It is what a partner uses to rehearse against the hub.

```bash
./scripts/run-api-tests.sh Local        # the compose stack, all thirteen folders
./scripts/run-api-tests.sh Static-mock  # the GitHub Pages fixtures, GET only
./scripts/run-api-tests.sh Azure-Dev    # the live demo, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"
```

Rules a new request must follow:

- It goes in the folder of the persona that sends it; a request two personas
  send belongs in a journey folder and names the acting persona.
- It asserts the status it expects **and** at least one property of the body.
  `res.status: lt 500` as the only assertion is what ADR-031 is about, and it is
  what the collection used to be.
- A request whose subject cannot exist on this stack skips loudly with the
  reason. It never passes silently.
- No session cookie in a `.bru` file. The runner forges one per persona;
  gitleaks does not scan `.bru`, so `scripts/check-bruno-coverage.py` does.

`scripts/check-bruno-coverage.py` runs in pre-commit and the PR Gate: a new route
with no request, a request whose route is gone, a request that cannot fail, or a
credential in a `.bru` file all fail the build.

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

- Global setup in `ui/__tests__/setup.ts`: jest-dom matchers and the module mocks every test
  shares (`next-auth`, `@/lib/auth-guard` open, `next/navigation`).
- There is no MSW (removed in #404, nothing ever started it). A test that needs a network
  answer stubs `fetch` itself, `vi.stubGlobal("fetch", ...)` or `vi.spyOn(globalThis, "fetch")`,
  and restores it in `afterEach`. Neo4j is mocked at `@/lib/neo4j` (`runQuery`), never deeper.
- Hooks that reset a mock use braces, `beforeEach(() => { m.mockReset(); })`: `mockReset()`
  returns the mock and Vitest (4 and later) runs a function returned from a hook as the test's teardown
  (see `docs/gotchas.md`, 2026-09-18).
- Coverage provider: v8. Minimum thresholds not yet enforced; aim for critical-path coverage.

### Pre-push gate

- `pre-push` hook runs full Vitest suite with `--bail` (stops on first failure).
- Fix failing unit tests before pushing; they block the push.

## E2E Tests (Playwright)

### Location

- `ui/__tests__/e2e/journeys/` — journey test files named `NN-description.spec.ts`.
- Current journey range: J001–J260 across 19 spec files.
- Screenshot captures in `ui/__tests__/e2e/capture-screenshots.spec.ts`, run on purpose with
  `--project=live`; the `chromium` project ignores it.

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

- Helper `setPersona(page, username)` in `ui/__tests__/e2e/journeys/helpers.ts`, the one shared
  copy: writes `demo-persona` to sessionStorage (what `useDemoPersona()`, the navigation and the
  patient pages read) and localStorage (what `lib/api.ts` reads to pick a patient's own mock),
  then reloads. Used in static GitHub Pages tests; import it from there.
- A page or API that needs a session (ADR-044) gets a real sign-in first: `loginAs()` from the
  same helpers, never `setPersona()`.
- E2E journey tests are numbered sequentially; new tests get the next available `J` number range.
- Tests assert on visible text, aria-labels, and `data-testid` attributes — not on CSS class names.
- Broken image check: `page.evaluate(() => [...document.images].filter(img => !img.complete || img.naturalWidth === 0))`.

### CI behaviour

- CI runs Playwright with `--project=chromium` only, against a Neo4j seeded
  by `neo4j/seed.sh` and the neo4j-proxy, with no EDC connector, no Postgres
  task store and no Keycloak: `E2E_FORGED_SESSIONS=1` makes `loginAs()`
  forge the realm user's session. A spec that tests the Keycloak pages
  themselves calls `skipIfKeycloakDown({ realKeycloak: true })` (ADR-079).
- A pull request that touches `ui/` runs the specs it can break (`e2e.yml`,
  `scripts/select-e2e-specs.sh`); shared code runs every spec on three shards.
- The nightly (`nightly.yml`) runs every spec and spec 19 against GitHub Pages.
  No Playwright step has `continue-on-error`: a failure is red and opens the
  "Nightly suites failed" issue. Its report is the site's `/e2e-report/`;
  `pages.yml` redeploys when a nightly run finishes.
- Before pushing a UI change: `scripts/run-e2e-local.sh --changed`, the same
  run on your machine.

## Static GitHub Pages Tests

The spec `19-static-github-pages.spec.ts` (J221–J260) tests the static export:

- Uses the shared `setPersona()` helper (sessionStorage and localStorage, then a reload).
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
- Do not mock `next-auth/react` session in E2E tests; sign in with `loginAs()`, or pick a static persona with `setPersona()`.
- Playwright tests hit the actual running server; nothing in them is stubbed.

## iOS UI Tests (XCUITest)

`clients/ios/Tests/UITests/`, run with `Scripts/run-ui-tests.sh`. One class per
screen, plus `AppDriver` for launching and waiting.

Every test launches with `-MBDemoSeed`: two fictional reports held in memory,
never the store, so no real report is involved and the numbers are the same on
any machine. `-MBShot <screen>` opens a screen directly rather than tapping
through a menu, so a test breaks when what it checks changes and not when a
button moves.

Three things learned the hard way, all in `docs/gotchas.md`:

- An `accessibilityIdentifier` on a container renames everything inside it.
  Put `.accessibilityElement(children: .contain)` before it.
- A `Button` whose label is `Color.clear` is not in the accessibility tree at
  all. Give it something to draw, at 0.001 opacity.
- Swift Charts' `chartXSelection` answers a finger and not a synthesised tap,
  so a UI test cannot reach it and neither can VoiceOver. Put real buttons
  over the marks.

Assert on what a person can see: labels, values, and the frames of elements
when the question is whether something is clipped. Never on view hierarchy
shape.
