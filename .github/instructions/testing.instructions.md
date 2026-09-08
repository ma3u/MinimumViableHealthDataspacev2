---
applyTo: "ui/__tests__/**,services/**/__tests__/**,ui/playwright.config.ts,ui/vitest.config.ts,.pre-commit-config.yaml,.github/workflows/**"
description: Test frameworks, commands, journey numbering, and the quality gates this repo actually enforces.
---

# Testing

Mirror of `.claude/rules/testing.md` — change both together.

## Frameworks

| Scope            | Framework  | Config                      |
| ---------------- | ---------- | --------------------------- |
| Unit / component | Vitest 4   | `ui/vitest.config.ts`       |
| E2E browser      | Playwright | `ui/playwright.config.ts`   |
| Protocol (DSP)   | Custom TCK | `scripts/run-dsp-tck.sh`    |
| Protocol (DCP)   | Custom     | `scripts/run-dcp-tests.sh`  |
| EHDS domain      | Custom     | `scripts/run-ehds-tests.sh` |

## Unit tests (Vitest)

Live in `ui/__tests__/unit/`, mirroring the `ui/src/` structure; service tests in
`services/neo4j-proxy/__tests__/`.

```bash
cd ui
npm test                          # run once
npm run test:watch                # watch mode
npm run test:coverage             # v8 coverage
npx vitest run __tests__/unit/components/Navigation.test.tsx   # single file
```

- Global setup is `ui/__tests__/setup.ts`, which initialises MSW. API calls are
  intercepted by MSW handlers — **do not mock `fetch` directly**.
- MSW is for unit tests only. Playwright hits the real running server.
- Do not mock Neo4j driver internals in integration-style tests; use the fixtures
  under `ui/public/mock/`.

## E2E tests (Playwright)

Specs live in `ui/__tests__/e2e/journeys/`, named `NN-description.spec.ts`.
Current range J001–J260 across 19 spec files.

```bash
cd ui
npm run test:e2e                  # all specs; needs UI + Neo4j running
npm run test:e2e:ui               # interactive
PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e   # against the JAD stack
npx playwright test --project=chromium
```

| Prefix | Scope                     |
| ------ | ------------------------- |
| J001–  | Graph Explorer            |
| J100–  | Catalog / DCAT            |
| J140–  | Compliance / Trust Center |
| J160–  | Role navigation           |
| J180–  | Keycloak login / roles    |
| J221–  | Static GitHub Pages       |

- Assert on visible text, aria-labels, and `data-testid` — never on CSS classes.
- Use the `setPersona(page, username)` helper (writes `demo-persona` to
  localStorage, then reloads) rather than mocking `next-auth/react`.
- New specs take the next free number in their `J` range.
- CI runs `--project=chromium` only. In `pages.yml`, E2E has
  `continue-on-error: true`, so a failure does **not** block the Pages deploy —
  read the logs, don't trust a green badge alone.

## Quality gates

Configured in `.pre-commit-config.yaml`. Install once:
`pre-commit install && pre-commit install --hook-type pre-push`.

**Pre-commit stage:**

| Hook                                                                   | Purpose                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| trailing-whitespace / end-of-file-fixer                                | Whitespace hygiene                               |
| check-yaml / check-json                                                | Syntax validation                                |
| check-added-large-files                                                | Block files > 5 MB                               |
| check-merge-conflict                                                   | Unresolved conflict markers                      |
| detect-private-key / gitleaks                                          | Block committed secrets                          |
| check-case-conflict / check-symlinks                                   | Filesystem portability                           |
| check-executables-have-shebangs / check-shebang-scripts-are-executable | Script hygiene                                   |
| shellcheck                                                             | Shell lint at error severity                     |
| hadolint-docker                                                        | Dockerfile lint                                  |
| prettier                                                               | Format MD, YAML, JSON, TS, TSX                   |
| tsc-ui                                                                 | `npx tsc --noEmit --project tsconfig.build.json` |
| eslint-ui                                                              | `npx next lint --max-warnings 55`                |
| check-broken-links-md                                                  | lychee or markdown-link-check, offline           |
| check-no-screenshot-imports                                            | Doc pages must not reference screenshot images   |

**Pre-push stage:**

| Hook         | Purpose                                            |
| ------------ | -------------------------------------------------- |
| vitest-ui    | `npx vitest run --bail 1` — stops on first failure |
| npm-audit-ui | `npm audit --audit-level=high --omit=dev`          |

Notes:

- `tsc-ui` uses `tsconfig.build.json` (test files excluded) to avoid false
  positives from Vitest type patterns.
- Skip a hook only deliberately: `SKIP=hook-id git commit -m "msg"`.
- Coverage thresholds are not enforced yet — aim for critical-path coverage.
