# E2E Test Report — Health Dataspace v2 (JAD Stack)

**Date:** 2026-04-11
**Framework:** Playwright 1.x + @axe-core/playwright
**Target:** JAD Stack (19 services, `http://localhost:3003`)
**Browser:** Chromium
**Auth:** Keycloak OIDC (realm `edcv`, 7 personas)

---

## Summary

| Metric          | Value  |
| --------------- | ------ |
| **Spec files**  | 29     |
| **Total tests** | 778    |
| **Passed**      | 581    |
| **Skipped**     | 197    |
| **Failed**      | 0      |
| **Duration**    | ~6 min |

> Skipped tests are intentional: they require services not running in this config
> (e.g., Vault secrets, NATS events) or test static-export-only features.

---

## Test Suites by Journey

| #   | Spec File                                | Journey Range | Domain                    | Tests |
| --- | ---------------------------------------- | ------------- | ------------------------- | ----- |
| 01  | `01-identity-onboarding.spec.ts`         | J001–J010     | DSP Identity & Onboarding | ~10   |
| 02  | `02-dataset-metadata.spec.ts`            | J011–J020     | HealthDCAT-AP Metadata    | ~10   |
| 03  | `03-policy-catalog.spec.ts`              | J021–J030     | ODRL Policy & Catalog     | ~10   |
| 04  | `04-discovery-search.spec.ts`            | J031–J040     | Dataset Discovery         | ~10   |
| 05  | `05-contract-negotiation.spec.ts`        | J041–J050     | DSP Contract Negotiation  | ~10   |
| 06  | `06-data-transfer.spec.ts`               | J051–J060     | DSP Data Transfer         | ~10   |
| 07  | `07-cross-border-federated.spec.ts`      | J061–J070     | Cross-Border Federated    | ~10   |
| 08  | `08-credential-catalog-policy.spec.ts`   | J071–J100     | DCP Credentials           | ~30   |
| 09  | `09-analytics-patient-content.spec.ts`   | J101–J110     | Analytics & Patient       | ~10   |
| 10  | `10-eehrxf-compliance-content.spec.ts`   | J111–J120     | eEHRxF & Compliance       | ~10   |
| 11  | `11-catalog-search-detail.spec.ts`       | J121–J130     | Catalog Search Detail     | ~10   |
| 12  | `12-negotiate-transfer-workflow.spec.ts` | J131–J140     | Negotiate-Transfer Flow   | ~10   |
| 13  | `13-live-data-validation.spec.ts`        | J141–J160     | Live Data Validation      | ~20   |
| 14  | `14-trust-center.spec.ts`                | J161–J170     | Trust Center              | ~10   |
| 15  | `15-persona-graphs.spec.ts`              | J171–J180     | Persona Graph Views       | ~10   |
| 17  | `17-patient-portal.spec.ts`              | J181–J200     | Patient Portal            | ~20   |
| 18  | `18-user-login-roles.spec.ts`            | J201–J210     | Keycloak Login & Roles    | ~10   |
| 19  | `19-static-github-pages.spec.ts`         | J221–J260     | Static GitHub Pages       | ~40   |
| 20a | `20-graph-ux-improvements.spec.ts`       | J261–J270     | Graph UX                  | ~10   |
| 20b | `20-theme-toggle.spec.ts`                | J271–J280     | Theme Toggle              | ~10   |
| 21  | `21-patient-data-isolation.spec.ts`      | J281–J290     | Patient Data Isolation    | ~10   |
| 22  | `22-mobile-wcag-startpage.spec.ts`       | J291–J300     | Mobile & WCAG Start       | ~10   |
| 23  | `23-tab-isolated-sessions.spec.ts`       | J301–J310     | Tab Session Isolation     | ~10   |
| 24  | `24-query-odrl-graphrag.spec.ts`         | J311–J420     | ODRL + GraphRAG + NLQ     | ~110  |
| 25  | `25-persona-user-journeys.spec.ts`       | J421–J500     | Persona User Journeys     | ~80   |
| 26  | `26-authenticated-role-menus.spec.ts`    | J501–J600     | Auth Role Menus           | ~100  |
| 27  | `27-wcag-accessibility.spec.ts`          | J501–J599     | WCAG 2.2 AA (public)      | ~26   |
| 28  | `28-security-pentest.spec.ts`            | J601–J699     | Security Penetration      | ~50   |
| 29  | `29-authenticated-wcag.spec.ts`          | J700–J799     | WCAG 2.2 AA (auth)        | ~67   |

---

## WCAG 2.2 AA Compliance Results

### Unauthenticated Pages (Spec 27)

| Page                                | Dark Mode | Light Mode |
| ----------------------------------- | --------- | ---------- |
| Landing (`/`)                       | PASS      | PASS       |
| Sign In (`/auth/signin`)            | PASS      | PASS       |
| Docs (`/docs`)                      | PASS      | PASS       |
| User Guide (`/docs/user-guide`)     | PASS      | PASS       |
| Developer Guide (`/docs/developer`) | PASS      | PASS       |
| Demo (`/demo`)                      | PASS      | PASS       |
| Onboarding (`/onboarding`)          | PASS      | PASS       |
| Catalog (`/catalog`)                | PASS      | PASS       |
| Graph (`/graph`)                    | PASS      | PASS       |
| Settings (`/settings`)              | PASS      | PASS       |
| Compliance (`/compliance`)          | PASS      | PASS       |
| TCK (`/compliance/tck`)             | PASS      | PASS       |

**Result: 26/26 passed — zero contrast violations**

### Authenticated Pages (Spec 29)

All pages tested with Keycloak login per role, in both dark and light mode.

| Role           | Username   | Pages Tested                                                                | Dark | Light |
| -------------- | ---------- | --------------------------------------------------------------------------- | ---- | ----- |
| EDC_ADMIN      | edcadmin   | Admin Portal, Compliance, Credentials, Settings, Onboarding, Graph, Catalog | PASS | PASS  |
| DATA_HOLDER    | clinicuser | Graph, Catalog, Share Data                                                  | PASS | PASS  |
| DATA_USER      | researcher | Graph, Catalog, Discover, Negotiate, Transfer, Tasks                        | PASS | PASS  |
| HDAB_AUTHORITY | regulator  | Graph, Compliance, Credentials                                              | PASS | PASS  |
| PATIENT        | patient1   | Patient Profile, Insights, Research, Graph                                  | PASS | PASS  |
| PATIENT        | patient2   | Patient Profile, Insights                                                   | PASS | PASS  |
| DATA_HOLDER    | lmcuser    | Graph, Catalog, Share Data                                                  | PASS | PASS  |

**Result: 67/67 passed — zero contrast violations across all roles**

### WCAG Fix Summary

Over 25 page files were updated to achieve zero WCAG contrast violations:

- **Dark-only backgrounds** (`bg-COLOR-900/XX`) replaced with light/dark pairs (`bg-COLOR-100 dark:bg-COLOR-900/XX`)
- **CSS variable text colors** (`text-[var(--warning-text)]`) replaced with explicit Tailwind pairs (`text-yellow-800 dark:text-yellow-300`)
- **`text-layerN`** custom colors replaced across 18 files with WCAG-safe Tailwind alternatives
- **`opacity-XX`** on parent containers removed (reduces all child text contrast)
- **Missing `aria-label`** attributes added to expand/collapse buttons
- **`text-gray-600`** on dark backgrounds replaced with `text-gray-500 dark:text-gray-400` or `text-gray-700 dark:text-gray-400`

---

## Security Penetration Test Results (Spec 28)

| Category                 | Tests | Status |
| ------------------------ | ----- | ------ |
| XSS injection prevention | ~10   | PASS   |
| CSRF protection          | ~5    | PASS   |
| Auth bypass attempts     | ~10   | PASS   |
| SQL/Cypher injection     | ~10   | PASS   |
| Path traversal           | ~5    | PASS   |
| Rate limiting            | ~5    | PASS   |
| Session management       | ~5    | PASS   |

---

## Authenticated Role Menu Tests (Spec 26)

All 7 Keycloak personas verified for correct navigation group visibility:

| Role                  | Expected Nav Groups          | Status |
| --------------------- | ---------------------------- | ------ |
| EDC_ADMIN             | Manage, Exchange, Governance | PASS   |
| DATA_HOLDER           | Exchange                     | PASS   |
| DATA_USER             | My Researches                | PASS   |
| HDAB_AUTHORITY        | Governance                   | PASS   |
| TRUST_CENTER_OPERATOR | Governance                   | PASS   |
| PATIENT               | My Health                    | PASS   |
| EDC_USER_PARTICIPANT  | Exchange                     | PASS   |

---

## How to Run

### Against JAD Stack (full services)

```bash
cd ui
PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test --project=chromium
```

### Against Local Dev Server

```bash
cd ui
npm run dev &
npx playwright test --project=chromium
```

### Single Spec File

```bash
npx playwright test __tests__/e2e/journeys/29-authenticated-wcag.spec.ts --project=chromium
```

### Interactive UI

```bash
npm run test:e2e:ui
```

---

## Environment Requirements

| Service        | Required For                   |
| -------------- | ------------------------------ |
| Neo4j 5        | All graph/data tests           |
| Keycloak       | Specs 18, 26, 29 (auth tests)  |
| neo4j-proxy    | Live data validation (spec 13) |
| Full JAD stack | Complete test coverage         |

> **Note:** GitHub Pages static export runs a subset of these tests (spec 19).
> Auth-dependent tests are skipped in CI since Keycloak is not available.
