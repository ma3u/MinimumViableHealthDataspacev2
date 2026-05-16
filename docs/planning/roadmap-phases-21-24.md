# Roadmap — Phases 21–24

> Archived detail from the [Planning index](../planning-health-dataspace-v2.md).
> Graph UX & risk scoring, static demo personas, design-system alignment,
> ODRL policy enforcement & GraphRAG, plus the Phase 24 test plan.

---

### Phase 21: Graph UX, Risk Scoring & Persona Polish ✅

**Goal:** Fix patient-facing graph rendering, elevate health risk scores with
social determinants of health (SDOH), clarify the demo user experience,
and enforce role-based graph VIEW AS filtering.

#### 21a: Patient Graph — URL param seeds initial persona ✅

`/graph?persona=patient` now pre-selects "Patient / Citizen" and loads the
patient filter presets immediately. Previously `activePersona` was always
initialised to `"default"` regardless of the URL parameter because
`useSearchParams()` was called after the `useState` initialiser ran.

**Fix:** Moved `useSearchParams()` to the top of `GraphContent()` so
`urlPersona` is available to seed `useState<PersonaId>(urlPersona ?? "default")`.

#### 21b: Patient Graph — ring distribution & label visibility ✅

Three rendering bugs fixed:

| Bug                              | Root cause                                                                        | Fix                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Nodes crowd near one angle       | `mergeInto` passed `idx+1` as `total` to `ringPosition`; as idx grows, angle → 2π | Pre-compute `layerTotal` before placing any node                             |
| Labels invisible at default zoom | Label draw gated on `gs >= 1.2`; fit-all zoom is typically `gs < 0.5`             | Lowered threshold to `gs >= 0.1` (formula `9/gs` keeps screen size constant) |
| Graph not centred after load     | No `zoomToFit` call after data arrives                                            | `setTimeout(() => fgRef.current?.zoomToFit(400, 40), 150)`                   |

#### 21c: Patient Graph — data consumers visible for "Who is using my data?" ✅

`buildPatientGraph()` previously only returned FHIR/OMOP clinical nodes.
`Participant`, `DataProduct`, and `HDABApproval` nodes were added so the
"Who is using my data?" filter preset has named organisations to highlight.

Condition display names fixed: `coalesce(c.code, c.display, ...)` →
`coalesce(c.display, c.code, ...)` (was showing raw SNOMED codes).

`OMOPConditionOccurrence` nodes removed from patient view (concept IDs
meaningless to a citizen); `OMOPPerson` retained for OMOP graph link.

#### 21d: OMOP node names — use .name property ✅

`OMOPConditionOccurrence`, `OMOPPerson`, and `OMOPMeasurement` all carry a
`.name` property (e.g. "Sprain of ankle", "T2D Occurrence (OMOP)") that was
being ignored. Queries updated to `coalesce(oc.name, toString(oc.conditionConceptId), ...)`.

#### 21e: Health risk scoring — SNOMED + SDOH factors ✅

Previous scorer only matched ICD-9/10 codes; missed SNOMED codes and social
determinants of health entirely, producing flat 10% scores for every patient.

Updated scorer detects 11 risk signals including 5 SDOH factors:

| Signal category            | Included factors                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Clinical (ICD + SNOMED)    | Cardiovascular disease, diabetes, hypertension, atrial fibrillation, obesity, smoking                                     |
| Social determinants (SDOH) | Chronic stress (+15%), social isolation (+10%), adverse life events / abuse (+12%), unemployment (+8%), depression (+10%) |
| Multimorbidity burden      | ≥20 conditions +20%, ≥10 +15%, ≥5 +10%                                                                                    |

Patient with SNOMED conditions 73595000 (stress), 706893006 (abuse),
423315002 (social isolation), 73438004 (unemployment) now scores ~55%
cardiovascular risk (High) instead of 10% (Low).

`totalConditionCount` added as separate parallel query so "Active Conditions"
shows the true total (e.g. 232) not the capped 20 shown in the table.

#### 21f: UserMenu — "Returning users" + password-gated switching ✅

- "Switch user" section renamed to **"Returning users"**
- `login_hint` removed from `signIn()` call — Keycloak always prompts for
  password when switching personas (prevents session hijacking in demos)

#### 21g: Graph persona auto-derivation (VIEW AS removed) ✅

The manual "View as" persona selector has been removed. The graph page now
auto-derives the active persona from the user's session role via
`derivePersonaId()` from `@/lib/auth`. URL override (`?persona=X`) still works
for demos and direct links.

| Role                    | Auto-derived persona |
| ----------------------- | -------------------- |
| `EDC_ADMIN`             | edc-admin            |
| `PATIENT`               | patient              |
| `DATA_HOLDER`           | hospital             |
| `DATA_USER`             | researcher           |
| `HDAB_AUTHORITY`        | hdab                 |
| `TRUST_CENTER_OPERATOR` | trust-center         |

A read-only persona indicator badge replaces the old selector panel.

#### 21h: README demo users table updated ✅

`README.md` **Demo Users & Roles** table updated with `patient1` and
`patient2`, access-rights table updated with Patient column, Graph Explorer
persona table updated with Patient / Citizen row + patient filter presets,
node role colours table updated with `PatientConsent` (teal) and
`ResearchInsight` (mint).

---

### Phase 22: Static Demo Personas for GitHub Pages ✅

**Goal:** Generate no-login static pages for all 7 demo personas so the GitHub
Pages deployment is a fully self-contained interactive demo. Each persona sees
its own role-filtered navigation, data, and feature pages — without Keycloak or
Neo4j.

**Architecture:** A `localStorage`-backed persona store (`use-demo-persona.ts`)
replaces `useSession()` in `Navigation` and `UserMenu` when
`NEXT_PUBLIC_STATIC_EXPORT=true`. All data is served from `/mock/*.json` via
the existing `fetchApi` static routing. A single static build supports all 7
viewpoints via in-app persona switching.

#### 22a: Patient mock data ✅

Five new mock files in `ui/public/mock/`: `patient_profile_list.json` (P1 Anna
Müller + P2 Jan de Vries), `patient_profile_patient1.json` (cardiovascular
moderate / diabetes high), `patient_profile_patient2.json` (cardiovascular
high / diabetes moderate — atrial fibrillation + CAD), `patient_insights.json`
(EHDS Art. 50 SPE findings + 2 donated studies), `patient_research.json` (3
programmes + EHDS Art. 10 consent records). P1 and P2 are deliberately distinct
so E2E assertions can verify data differentiation.

#### 22b: `fetchApi` — new routes + POST bypass ✅

`api.ts`: added exact routes for `/api/patient/profile`, `/api/patient/insights`,
`/api/patient/research`; prefix routes for `?patientId=P1` / `?patientId=P2`;
non-GET bypass returns `{ ok: true, 200 }` so donate/revoke buttons work in demo.

#### 22c: `use-demo-persona.ts` hook ✅

`setDemoPersona(username)` writes localStorage + fires a module-level
`EventTarget` for same-tab reactivity. `useDemoPersona()` reads on mount,
listens for `change` / `storage` events, initialises with `edcadmin` fallback.

#### 22d: Navigation + UserMenu — dynamic demo persona ✅

`Navigation.tsx`: uses demo persona roles/auth when `IS_STATIC`. `UserMenu.tsx`:
`DEMO_SESSION` constant removed; replaced with live `useDemoPersona()`.
Persona switcher unified — static mode calls `setDemoPersona()` (no Keycloak),
live mode calls Keycloak redirect as before.

#### 22e: `/demo` persona hub page ✅

`ui/src/app/demo/page.tsx`: 7 persona cards, each `onClick` sets localStorage +
navigates to persona home (edcadmin → graph, researcher → analytics, regulator →
compliance, patient → patient/profile, hospital → catalog).

#### 22f: E2E tests for static GitHub Pages (J221–J260) ✅

`ui/__tests__/e2e/journeys/19-static-github-pages.spec.ts` — 7 test groups:
demo hub, per-persona nav groups, patient data (EHDS Art. 50/10), role pages,
UserMenu switcher, broken image / link audit (10 pages), data completeness.
Run with `PLAYWRIGHT_BASE_URL=https://ma3u.github.io/MinimumViableHealthDataspacev2`.

---

### Phase 23: Stitch Vitalis Blue — Full Design Alignment & New Features

**Branch**: `feature/newdesign`
**Reference designs**: `stitch_health_ui_redesign/` (15 HTML templates + 2 DESIGN.md specs)
**Design system**: Vitalis Blue (light) + Vitalis Blue Nocturne (dark)

#### Motivation

Phase 21 established the token foundation (CSS custom properties, dark/light mode). Phase 23 applies the full Stitch "Clinical Clarity & Ethereal Trust" philosophy across all 15 UI screens by:

1. Aligning implementation with the Stitch Vitalis Blue token set (gradient buttons, metric orbs, glass panels, no-line rule, ambient shadows)
2. Implementing new features identified from each design template but not yet in the codebase
3. Fixing all WCAG 2.2 AA contrast failures identified in the accessibility audit (200+ dark-mode colour replacements)

#### Design → Page Mapping

| Design Template                     | Current Page        | Status | Stitch Features Identified                                                         | Implementation Gaps vs. Stitch                                                               |
| ----------------------------------- | ------------------- | ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `administrative_dashboard_day`      | `/admin`            | ✅     | Gradient CTA button, EU participant data flow strip, activity log with icons       | Static activity log (not live); EU flow strip is hardcoded (no dynamic participant map)      |
| `clinical_analytics_day`            | `/analytics`        | 🔲     | HRV sparkline chart, AI clinical recommendations panel, OMOP data provenance chain | No HRV chart; no AI panel; analytics use static bar chart only                               |
| `compliance_overview_day`           | `/compliance`       | 🔲     | Audit trail timeline, regulatory article status cards (GDPR/EHDS), risk matrix     | Compliance page has basic checklist; no visual audit timeline or risk matrix                 |
| `credentials_management_day`        | `/credentials`      | 🔲     | Credential lifecycle orb (issued/active/expiring/revoked), expiry countdown badge  | VC list exists but no lifecycle orb or expiry countdown; status badges now WCAG-safe         |
| `dataset_catalog_day`               | `/catalog`          | ✅     | 2-panel layout (filter sidebar + card grid), gradient dataset cards, stats row     | Filter sidebar fully functional; "Request Access" links to /negotiate; bookmark opens modal  |
| `infrastructure_health_day`         | `/admin/components` | 🔲     | Cluster topology map, per-service CPU/memory bars, deployment status badges        | Components page shows card grid; no topology map; no resource utilization bars               |
| `knowledge_graph_with_search_light` | `/graph`            | ✅     | Topological search input in sidebar, entity inspector, layer filter pills          | Search filters node list in sidebar; no slide-in inspector panel; layer pills not yet wired  |
| `knowledge_graph_with_search_dark`  | `/graph` (dark)     | 🔲     | Dark graph with luminous node glows, neon accent lines, glass-panel inspector      | Dark mode applied globally but graph canvas colors not remapped to Nocturne palette          |
| `patient_dashboard_day`             | `/patient`          | ✅     | Metric orb stat cards, clinical timeline with connector line, demographics bento   | Orb cards done; timeline connector line done; no research enrollment bento                   |
| `patient_profile_day`               | `/patient/profile`  | 🔲     | Privacy settings section, medical preferences, consent timeline by category        | Profile page exists; no privacy settings panel or consent timeline per resource category     |
| `query_ehr_exchange_day`            | `/query`            | 🔲     | Visual query builder (drag-and-drop), federated search results panel, FHIR badges  | Query page has NLQ text input only; no visual builder; no federated multi-site results panel |
| `research_participation_day`        | `/patient/research` | 🔲     | Study enrollment flow, consent management timeline, outcome reporting              | Research page lists studies; no enrollment flow UI; no consent timeline                      |
| `system_logs_day`                   | `/admin/audit`      | ✅     | WCAG-safe status badges (all states), direction/access-type badges, transfer log   | All badge colors now WCAG 2.2 AA; no error severity chart or anomaly detection panel         |
| `technical_compliance_kit_day`      | `/compliance/tck`   | 🔲     | Protocol verification status grid (DSP/DCP/EHDS), pass/fail summary donut chart    | TCK page has test list; no visual grid or donut chart summary                                |
| `user_management_day`               | `/admin/tenants`    | 🔲     | RBAC participant table, role distribution sidebar, access control matrix           | Tenant list exists; no matrix view; role distribution chart not rendered                     |

#### 23a: WCAG 2.2 AA Contrast Fixes ✅

Global replace of 200+ dark-mode-only colour patterns (`bg-*-900`, `text-*-400`, `text-white` on insufficient backgrounds) with pre-verified WCAG 2.2 AA CSS custom property tokens (`--role-*-text/bg/border`, `--layerN-text`). Affected files: 29 TSX + 1 CSS. Committed `dbf1fea`.

Key fixes:

- Auth/signin H1, Keycloak button, demo card usernames
- Admin/audit status badges (all states), direction/access-type badges
- Credentials VC badge, remove button, request result text
- Data/share + data/transfer: JSON syntax highlighter, FHIR resource badges, DSP state functions
- EEHRxF summary stat icons
- globals.css skip-to-content
- Onboarding status pills, step icons, error banner
- All `bg-layer2 text-white` buttons → `bg-[var(--accent)] text-white`

#### 23b: Design Token Additions — globals.css 🔲

Add missing Stitch Vitalis Blue tokens to CSS custom properties:

- `--secondary-container` (#6cf8bb light / #0a3d2e dark) — metric orb fill
- `--primary-fixed` (#d8e2ff light) — icon background tint
- `--on-surface-variant-subtle` — tertiary label text
- `--gradient-cta` — gradient direction token
- Utility classes: `.metric-orb`, `.glass-panel`, `.btn-gradient`, `.activity-timeline`

#### 23c: Patient Dashboard — Metric Orb Cards 🔲

Redesign `/patient` stat section to match `patient_dashboard_day` template:

- Heart Rate card with `.metric-orb` (radial gradient: secondary-container → secondary)
- Blood Pressure card with primary-fixed icon orb
- Research bento card: "Cardiovascular Longevity Study" participation banner
- Activity timeline with vertical connector line

#### 23d: Admin Dashboard — Bento Grid Enhancements 🔲

Enhance `/admin` page to match `administrative_dashboard_day`:

- Add gradient "Generate Report" CTA button in sidebar
- European data flow map (static SVG placeholder with participant nodes)
- Activity log with participant avatar initials + DSP event descriptions
- System health percentage bar for each service

#### 23e: Knowledge Graph — Topological Search Overlay 🔲

Add search overlay to `/graph` matching `knowledge_graph_with_search_light`:

- Search input floated over canvas with glass-panel style
- Entity inspector slide-in panel (right side) showing node details
- Network health metric badges (L1–L5 node counts)
- Layer filter toggle pills below search bar

---

### Phase 21: Hospital-Grade Design System — Light/Dark Mode

**GitHub Issue**: [#9](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/9)
**Branch**: `feature/newdesign`
**Deploy target**: `localhost:3003` (JAD full stack)
**Reference design**: https://stitch.withgoogle.com/projects/16480474636660464855

#### Motivation

The current dark-only UI (bg-gray-900) is not appropriate for hospital and clinical environments where screens are used in bright, clinical-lit rooms. Staff need a crisp, white-default interface that is readable, professional, and accessible. A dark mode option allows evening / low-light usage without abandoning the clinical aesthetic.

#### Design Principles

- **White-first**: default to light mode — clean, clinical, trustworthy
- **Calm palette**: no saturated colours in surfaces; reserve colour for status and action
- **Legibility**: 16px base, 1.6 line-height, Inter/system-ui
- **WCAG 2.2 AA**: all text ≥4.5:1 contrast in both modes
- **Tailwind `class` strategy**: `dark:` variants driven by `<html class="dark">`
- **Persist preference**: `localStorage.setItem("theme", "light"|"dark")`

#### Colour Token System

| Token              | Light (default) | Dark      |
| ------------------ | --------------- | --------- |
| `--bg`             | `#FFFFFF`       | `#0F172A` |
| `--surface`        | `#F8FAFC`       | `#1E293B` |
| `--surface-2`      | `#F1F5F9`       | `#334155` |
| `--text-primary`   | `#0F172A`       | `#F1F5F9` |
| `--text-secondary` | `#475569`       | `#94A3B8` |
| `--border`         | `#E2E8F0`       | `#334155` |
| `--accent`         | `#0369A1`       | `#38BDF8` |
| `--accent-surface` | `#E0F2FE`       | `#0C4A6E` |
| `--success`        | `#16A34A`       | `#4ADE80` |
| `--warning`        | `#D97706`       | `#FCD34D` |
| `--danger`         | `#DC2626`       | `#F87171` |

Layer accent colours (graph) are unchanged; they must be verified for contrast in light mode.

#### Sub-phases

#### 21a: Design Tokens & Tailwind Theme

- Update `ui/tailwind.config.ts`: enable `darkMode: "class"`, extend colour palette with semantic tokens
- Add CSS custom properties to `ui/src/app/globals.css` for `:root` (light) and `.dark` (dark)
- Remove hard-coded `bg-gray-900` / `text-gray-300` from layout root; replace with semantic tokens

**Deliverables**: `tailwind.config.ts`, `globals.css` updated; no visual regressions on existing dark build

#### 21b: Light/Dark Toggle in Navigation

- Add `ThemeToggle` client component: sun icon (light mode), moon icon (dark mode)
- On mount: read `localStorage.getItem("theme")` → apply class to `<html>`; default to `"light"` if unset
- On toggle: flip class, write to `localStorage`
- Insert toggle between notification bell and user menu in `ui/src/components/Navigation.tsx`

**Deliverables**: `ui/src/components/ThemeToggle.tsx` (new), `Navigation.tsx` updated

#### 21c: Component-Level Theme Adoption

Apply light/dark semantic classes across all 16 pages and shared components:

| Area             | Key changes                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Navigation       | `bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700`              |
| Sidebar          | Same surface + border pattern                                                             |
| Cards / panels   | `bg-white dark:bg-slate-800 shadow-sm`                                                    |
| Tables           | `bg-white dark:bg-slate-800`; zebra `odd:bg-slate-50 dark:odd:bg-slate-700/50`            |
| Inputs / selects | `bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600`                       |
| Role badges      | Updated to new palette (clinical blue, slate, teal, amber, rose)                          |
| Buttons          | Primary `bg-sky-700 hover:bg-sky-800`, secondary `border-slate-300`, danger `bg-rose-600` |

**Deliverables**: All `ui/src/app/**/page.tsx` and `ui/src/components/` updated

#### 21d: Graph Explorer Theme Adaptation

- Pass theme to D3/force-graph; switch node labels and link colours on theme change
- Light mode: white canvas `#FFFFFF`, dark labels, light node fill
- Dark mode: current `#0F172A` canvas, white labels
- Listen for `localStorage` theme changes via custom event

**Deliverables**: `ui/src/app/graph/` components updated

#### 21e: WCAG 2.2 AA Contrast Audit

- Run automated contrast checks with Playwright + `axe-core` in both modes
- Fix any failures (target: zero AA violations)
- Update `ui/__tests__/e2e/journeys/` with a new smoke spec covering theme toggle

**Deliverables**: Playwright spec `20-theme-toggle.spec.ts`; zero axe AA violations

#### 21f: localhost:3003 Deployment & E2E Smoke Test

- Start full JAD stack: `docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d`
- Run `PLAYWRIGHT_BASE_URL=http://localhost:3003 npm run test:e2e`
- Verify theme toggle works in live stack
- Screenshot both modes across 5 representative pages

**Deliverables**: Screenshots in `ui/public/images/screenshots/`; all journey tests green

#### Implementation Sequence

```
21a → 21b → 21c (parallel: pages + components) → 21d → 21e → 21f
```

---

### Phase 24: ODRL Policy Enforcement, Federated Search & GraphRAG

**Branch**: `feature/newdesign`
**Deploy target**: `localhost:3003` (JAD full stack)
**Regulatory context**: EHDS Art. 33 (secure processing environments), Art. 46 (data access applications), Art. 49 (HDAB decisions), Art. 50 (data permits), GDPR Art. 25 (data protection by design)

#### Motivation

The `/query` page is the heart of the dataspace: every persona can ask questions, but should **only get answers they are authorised to receive**. Today the NLQ engine translates natural language → Cypher → results without any policy gate. The security investigation (2026-04-10) found:

- **ODRL policies are decorative**: `OdrlPolicy` nodes exist in Neo4j but no API route or proxy endpoint reads `ehdsPermissions`, `ehdsProhibitions`, or `temporalLimit` to filter data at access time.
- **27 of 36 API routes have zero authentication**: analytics, graph, credentials, trust-center, compliance, negotiations, catalog (write!), NLQ, federated — all open.
- **neo4j-proxy is entirely unauthenticated**: the `/federated/query` endpoint accepts arbitrary Cypher from any caller. The write-guard (`startsWith` check) is bypassable via `CALL { CREATE ... }` subqueries.
- **VerifiableCredential status is never checked**: a revoked VC still grants the same access as an active one.
- **Federated search works but has no policy scoping**: queries fan out to all SPEs regardless of the caller's contract scope.
- **No Graph RAG / semantic search**: Text2Cypher uses regex templates or raw LLM; no vector embeddings exist for natural language similarity matching or knowledge-graph-augmented retrieval.

This phase makes ODRL policies a **runtime enforcement layer** — not just metadata — and adds semantic search via GraphRAG with vector embeddings.

#### Architecture Overview

```
User (with JWT role + VC) → Next.js API route
  │
  ├─ 1. Extract session + roles from NextAuth JWT
  ├─ 2. Resolve caller's active contracts + ODRL policies from Neo4j
  ├─ 3. Build policy scope: allowed datasets, permitted purposes, temporal limits
  │
  ├─ NLQ path ─────────────────────────────────────────────────
  │   ├─ 4a. Text2Cypher (template match / LLM / GraphRAG)
  │   ├─ 5a. Inject policy scope into Cypher WHERE clauses
  │   └─ 6a. Execute scoped query → filter results → return
  │
  └─ Federated path ────────────────────────────────────────────
      ├─ 4b. Determine which SPEs the caller has contracts for
      ├─ 5b. Fan out scoped Cypher to permitted SPEs only
      ├─ 6b. Merge results + k-anonymity filter
      └─ 7b. Return with provenance tags
```

#### 24a: API Route Authentication Hardening

Add session-based auth guards to all unprotected API routes. Each route extracts the caller's roles and restricts access:

| Route Group                  | Required Role(s)                           | Policy Scope                                       |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `/api/graph/*`               | Any authenticated                          | Filter nodes by contract scope                     |
| `/api/analytics`             | `DATA_USER`, `HDAB_AUTHORITY`, `EDC_ADMIN` | OMOP data scoped to contracted datasets            |
| `/api/catalog` (GET)         | Any authenticated                          | Full catalog (metadata is public per EHDS Art. 36) |
| `/api/catalog` (POST/DELETE) | `DATA_HOLDER`, `EDC_ADMIN`                 | Own datasets only                                  |
| `/api/credentials`           | `HDAB_AUTHORITY`, `EDC_ADMIN`              | Full VC list; others see own VCs only              |
| `/api/compliance/*`          | Any authenticated                          | Approval chains visible based on role              |
| `/api/trust-center`          | `TRUST_CENTER_OPERATOR`, `EDC_ADMIN`       | Full access                                        |
| `/api/negotiations` (GET)    | Any authenticated                          | Own negotiations only                              |
| `/api/negotiations` (POST)   | `DATA_USER`, `DATA_HOLDER`                 | Caller must have valid VC                          |
| `/api/nlq`                   | Any authenticated                          | Results filtered by ODRL scope                     |
| `/api/federated/*`           | `DATA_USER`, `EDC_ADMIN`                   | Only contracted SPEs                               |
| `/api/patient/*`             | `PATIENT` (own data), `DATA_USER`+contract | FHIR resources per contract                        |

**Deliverables**: Auth middleware helper `requireAuth(roles)` in `ui/src/lib/auth-guard.ts`; all 36 API routes updated.

#### 24b: ODRL Policy Evaluation Engine

Create a server-side policy evaluation module that resolves a caller's effective permissions:

```typescript
// ui/src/lib/odrl-engine.ts
interface PolicyScope {
  participantId: string;
  allowedDatasetIds: string[]; // from GRANTS_ACCESS_TO
  permittedPurposes: string[]; // from OdrlPolicy.ehdsPermissions
  prohibitedActions: string[]; // from OdrlPolicy.ehdsProhibitions
  temporalLimit: { start: Date; end: Date } | null;
  maxRowLimit: number; // from OdrlPolicy.rowLimit or default 1000
  aggregateOnly: boolean; // some policies restrict to aggregate output
}

async function resolveOdrlScope(participantDid: string): Promise<PolicyScope>;
```

**Cypher traversal**:

```cypher
MATCH (p:Participant {participantId: $did})-[:OFFERS|:SUBMITTED]->()
      -[:GOVERNED_BY]->(pol:OdrlPolicy)
OPTIONAL MATCH (c:Contract)-[:COVERS]->(dp:DataProduct)-[:GOVERNED_BY]->(pol)
WHERE c.status = 'FINALIZED'
OPTIONAL MATCH (dp)-[:DESCRIBED_BY]->(ds:HealthDataset)
OPTIONAL MATCH (approval:HDABApproval)-[:GRANTS_ACCESS_TO]->(ds)
WHERE approval.status = 'APPROVED'
  AND (approval.validUntil IS NULL OR approval.validUntil > datetime())
RETURN pol, collect(DISTINCT ds.datasetId) AS datasets,
       pol.ehdsPermissions AS permissions,
       pol.ehdsProhibitions AS prohibitions,
       pol.temporalLimit AS temporalLimit
```

**Missing Neo4j constraint** — add to `init-schema.cypher`:

```cypher
CREATE CONSTRAINT odrl_policy_id IF NOT EXISTS
FOR (p:OdrlPolicy) REQUIRE p.policyId IS UNIQUE;
```

**Deliverables**: `ui/src/lib/odrl-engine.ts`, updated `neo4j/init-schema.cypher`, unit tests.

#### 24c: Query-Time ODRL Enforcement in NLQ

Modify the NLQ pipeline to inject ODRL policy constraints into generated Cypher:

1. **Template queries**: Wrap each template Cypher with a dataset scope filter:

   ```cypher
   // Before: MATCH (p:Patient) RETURN count(p) AS total
   // After:  MATCH (p:Patient) WHERE p.datasetId IN $allowedDatasets RETURN count(p) AS total
   ```

2. **LLM-generated Cypher**: Post-process the LLM output to inject `WHERE` clause restrictions using AST-level rewriting (parse Cypher → inject scope → serialize). Fallback: prepend a `WITH $allowedDatasets AS scope` prologue.

3. **Aggregate-only enforcement**: When `PolicyScope.aggregateOnly = true`, verify the Cypher contains `count()`, `avg()`, `sum()`, or `collect()` — reject raw `RETURN p` queries.

4. **Row limit enforcement**: Cap results at `PolicyScope.maxRowLimit` via `LIMIT` injection.

5. **Temporal enforcement**: Reject queries when `PolicyScope.temporalLimit.end < now()`.

**Deliverables**: Updated `services/neo4j-proxy/src/index.ts` NLQ handler; new `policyRewriter.ts` module.

#### 24d: Federated Search with Policy-Scoped SPE Fan-Out

Currently `/federated/query` fans out to all SPEs. This phase adds contract-aware routing:

1. **SPE registry**: Each SPE is registered as a `DataService` node in Neo4j with a `servesDataset` relationship. The proxy discovers which SPEs serve which datasets.

2. **Scoped fan-out**: Given a caller's `PolicyScope.allowedDatasetIds`, resolve which SPEs host those datasets, and fan out only to those SPEs.

3. **Cross-SPE k-anonymity**: Maintain existing MIN_COHORT_SIZE enforcement but apply it **per-policy** — a DATA_USER with a PUBLIC_HEALTH permit may get k=5, while SCIENTIFIC_RESEARCH requires k=10.

4. **Provenance tagging**: Each result row carries `_source` (SPE label) and `_policyId` (governing ODRL policy), enabling audit trail reconstruction.

5. **Write-guard hardening**: Replace the `startsWith` keyword check with a proper Cypher parser (or at minimum, a regex that catches `CALL { ... }` subquery writes).

**Deliverables**: Updated `POST /federated/query` in neo4j-proxy; SPE registry Cypher; unit tests.

#### 24e: GraphRAG — Vector Embeddings for Semantic Query

Add a Retrieval-Augmented Generation (RAG) layer that combines vector similarity search with graph traversal for natural language queries that don't match templates:

##### Embedding Pipeline

1. **Node text extraction**: For each node type, compose a text representation:

   - `Patient`: `"{name}, {gender}, {birthDate}, conditions: {condition_list}"`
   - `HealthDataset`: `"{title}. {description}. Keywords: {keywords}. License: {license}"`
   - `OdrlPolicy`: `"Policy for {dataProductTitle}: permits {ehdsPermissions}, prohibits {ehdsProhibitions}"`
   - `SnomedConcept` / `ICD10Code`: `"{code}: {display}"`

2. **Embedding model**: Use `text-embedding-3-small` (OpenAI) or `nomic-embed-text` (local via Ollama). Store embeddings as float arrays on the Neo4j node (`embedding` property) using Neo4j 5.13+ vector index.

3. **Neo4j vector index** (add to `init-schema.cypher`):

   ```cypher
   CREATE VECTOR INDEX patient_embedding IF NOT EXISTS
   FOR (p:Patient) ON (p.embedding)
   OPTIONS {indexConfig: {
     `vector.dimensions`: 1536,
     `vector.similarity_function`: 'cosine'
   }};

   CREATE VECTOR INDEX dataset_embedding IF NOT EXISTS
   FOR (d:HealthDataset) ON (d.embedding)
   OPTIONS {indexConfig: {
     `vector.dimensions`: 1536,
     `vector.similarity_function`: 'cosine'
   }};
   ```

4. **Embedding generation script**: `scripts/generate-embeddings.sh` — batch-processes all nodes, calls the embedding API, writes vectors back to Neo4j via `MATCH (n) WHERE elementId(n) = $id SET n.embedding = $vector`.

##### RAG Query Flow

```
User question: "Show me diabetic patients with cardiovascular risk factors"
  │
  ├─ 1. Embed the question → query_vector
  ├─ 2. Vector search: find top-k similar Patient/Condition nodes
  │     CALL db.index.vector.queryNodes('patient_embedding', 20, $queryVector)
  │     YIELD node, score WHERE score > 0.7
  ├─ 3. Graph expansion: traverse from matched nodes
  │     MATCH (node)-[:HAS_CONDITION]->(c:Condition)
  │     MATCH (node)-[:HAS_OBSERVATION]->(o:Observation)
  ├─ 4. ODRL policy filter: restrict to caller's allowed datasets
  ├─ 5. LLM synthesis (optional): generate natural language summary
  └─ 6. Return structured results + provenance
```

##### Three-Tier Query Resolution (Updated)

| Tier | Method            | When                                | Latency   |
| ---- | ----------------- | ----------------------------------- | --------- |
| 1    | Template matching | Regex match on 9 known patterns     | <50ms     |
| 2    | GraphRAG          | Vector similarity + graph traversal | 200-500ms |
| 3    | LLM Text2Cypher   | OpenAI/Ollama generates Cypher      | 1-3s      |

**Deliverables**: `scripts/generate-embeddings.sh`, updated `init-schema.cypher` with vector indexes, new `graphRag.ts` module in neo4j-proxy, updated NLQ handler with three-tier resolution.

#### 24f: Query Page Redesign — Visual Query Builder

Redesign `/query` to match the Stitch `query_ehr_exchange_day` template:

1. **Visual query builder panel** (left): Drag-and-drop node type selectors (Patient, Condition, Medication, Observation), linked by relationship connectors. Each node type shows filterable properties.

2. **Federated results panel** (right): Multi-SPE result cards with source badges, policy scope indicator, and k-anonymity threshold display.

3. **FHIR resource badges**: Each result row tagged with FHIR resource type (R4 badge), OMOP concept ID, and SNOMED/ICD10/LOINC code where applicable.

4. **Policy scope indicator**: Top bar shows the caller's effective ODRL scope — which datasets are accessible, which purposes are permitted, and the temporal window.

5. **Audit trail button**: Each query generates an audit event showing: who queried, what Cypher ran, which ODRL policy governed it, how many results were returned vs. filtered.

**Deliverables**: Redesigned `ui/src/app/query/page.tsx`, new `ui/src/components/QueryBuilder.tsx`, mock data at `ui/public/mock/nlq_query.json`.

#### 24g: Audit Trail & Compliance Logging

Every data access through the query engine generates an audit event:

```typescript
interface QueryAuditEvent {
  timestamp: string;
  participantDid: string;
  roles: string[];
  question: string;
  cypherExecuted: string;
  method: "template" | "graphrag" | "llm";
  policyId: string | null;
  allowedDatasets: string[];
  resultCount: number;
  filteredCount: number; // rows removed by ODRL scope
  federated: boolean;
  speTargets: string[];
  kAnonymityThreshold: number;
}
```

Audit events are written to Neo4j as `(:QueryAuditEvent)` nodes linked to the caller's `(:Participant)` node, and optionally published to NATS for downstream processing.

**Deliverables**: Audit event schema in `init-schema.cypher`, audit writer in neo4j-proxy, NATS publisher.

#### Implementation Sequence

```
24a (auth hardening) → 24b (ODRL engine) → 24c (NLQ enforcement) → 24d (federated scoping)
                                                                          ↓
                                                               24e (GraphRAG embeddings)
                                                                          ↓
                                                               24f (query page redesign)
                                                                          ↓
                                                               24g (audit trail)
```

24a and 24b are prerequisites for all downstream work. 24e (GraphRAG) can proceed in parallel with 24c/24d once the embedding infrastructure is in place.

#### Gap Table: Current State vs. Target

| Capability                  | Current State              | Phase 24 Target                                 | Gap                           |
| --------------------------- | -------------------------- | ----------------------------------------------- | ----------------------------- |
| API authentication          | 9/36 routes guarded        | 36/36 routes guarded                            | 27 routes need auth           |
| ODRL policy evaluation      | Decorative (display only)  | Runtime enforcement on every query              | New engine needed             |
| Query-time filtering        | None — raw Cypher results  | Policy-scoped WHERE injection                   | New Cypher rewriter           |
| Federated policy scoping    | Fan-out to all SPEs        | Fan-out only to contracted SPEs                 | SPE registry + scope resolver |
| Write-guard (proxy)         | `startsWith` keyword check | Full Cypher subquery detection                  | Regex/parser hardening        |
| VC status enforcement       | Never checked              | Access denied if VC revoked/expired             | VC status gate in auth        |
| Vector embeddings           | None                       | 1536-dim on Patient, Dataset, Concept nodes     | Embedding pipeline            |
| GraphRAG retrieval          | None                       | Vector search + graph expansion + policy filter | New RAG module                |
| Visual query builder        | Text input only            | Drag-and-drop node/relationship builder         | New UI component              |
| Audit trail                 | None                       | Per-query audit events in Neo4j + NATS          | New audit subsystem           |
| Neo4j OdrlPolicy constraint | Missing                    | `CREATE CONSTRAINT ... IS UNIQUE`               | 1-line fix                    |

---

### Phase 24 Test Plan — 120 Test Cases

**Spec file**: `ui/__tests__/e2e/journeys/24-query-odrl-graphrag.spec.ts`
**Test ID range**: J300–J419

#### A. API Route Authentication (J300–J319) — 20 tests

| ID   | Test                                                                  | Expected             |
| ---- | --------------------------------------------------------------------- | -------------------- |
| J300 | `GET /api/analytics` without session returns 401                      | Redirect or 401 JSON |
| J301 | `GET /api/graph` without session returns 401                          | 401                  |
| J302 | `GET /api/graph/expand` without session returns 401                   | 401                  |
| J303 | `GET /api/graph/validate` without session returns 401                 | 401                  |
| J304 | `GET /api/credentials` without session returns 401                    | 401                  |
| J305 | `GET /api/trust-center` without session returns 401                   | 401                  |
| J306 | `GET /api/compliance` without session returns 401                     | 401                  |
| J307 | `POST /api/nlq` without session returns 401                           | 401                  |
| J308 | `GET /api/federated` without session returns 401                      | 401                  |
| J309 | `GET /api/negotiations` without session returns 401                   | 401                  |
| J310 | `POST /api/negotiations` without session returns 401                  | 401                  |
| J311 | `POST /api/catalog` without session returns 401                       | 401                  |
| J312 | `DELETE /api/catalog` without session returns 401                     | 401                  |
| J313 | `GET /api/analytics` with PATIENT role returns 403 (wrong role)       | 403                  |
| J314 | `POST /api/catalog` with DATA_USER role returns 403                   | 403                  |
| J315 | `GET /api/trust-center` with DATA_USER role returns 403               | 403                  |
| J316 | `GET /api/admin/policies` with DATA_HOLDER role returns 403           | 403                  |
| J317 | `GET /api/patient/profile` with DATA_USER (no contract) returns 403   | 403                  |
| J318 | `GET /api/analytics` with DATA_USER role + valid contract returns 200 | 200 with scoped data |
| J319 | `GET /api/catalog` (GET only) allows any authenticated user           | 200                  |

#### B. ODRL Policy Engine (J320–J339) — 20 tests

| ID   | Test                                                                          | Expected                                                             |
| ---- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| J320 | `resolveOdrlScope` for PharmaCo returns diab-001 dataset                      | `allowedDatasetIds` includes `urn:uuid:alphaklinik:dataset:diab-001` |
| J321 | `resolveOdrlScope` for TrialCorp returns diab-001 dataset                     | `allowedDatasetIds` includes `urn:uuid:riverside:dataset:diab-001`   |
| J322 | `resolveOdrlScope` for AlphaKlinik (PENDING) returns empty scope              | `allowedDatasetIds = []`                                             |
| J323 | `resolveOdrlScope` for IRS (REJECTED) returns empty scope                     | `allowedDatasetIds = []`                                             |
| J324 | `resolveOdrlScope` for MedReg (HDAB, no application) returns governance scope | HDAB-level access                                                    |
| J325 | `resolveOdrlScope` respects temporal limit — expired policy returns empty     | `temporalLimit.end < now()` → empty                                  |
| J326 | `resolveOdrlScope` respects temporal limit — active policy returns datasets   | `temporalLimit.end > now()` → datasets                               |
| J327 | Policy with `aggregateOnly: true` sets scope flag                             | `scope.aggregateOnly === true`                                       |
| J328 | Policy with `maxRowLimit: 100` sets scope limit                               | `scope.maxRowLimit === 100`                                          |
| J329 | Policy with `ehdsProhibitions: ['COMMERCIAL_USE']` populates prohibitions     | `scope.prohibitedActions` includes `COMMERCIAL_USE`                  |
| J330 | Multiple contracts merge dataset lists (union)                                | Combined `allowedDatasetIds`                                         |
| J331 | Revoked VC for participant returns empty scope                                | VC status check blocks access                                        |
| J332 | Expired VC for participant returns empty scope                                | VC expiry check blocks access                                        |
| J333 | Active VC + approved HDAB + finalized contract = full scope                   | All policy fields populated                                          |
| J334 | No OdrlPolicy node for participant returns default restrictive scope          | `allowedDatasetIds = []`                                             |
| J335 | OdrlPolicy without `ehdsPermissions` defaults to `[]`                         | No permissions = deny                                                |
| J336 | OdrlPolicy with `ehdsPermissions: ['SCIENTIFIC_RESEARCH', 'PUBLIC_HEALTH']`   | Both in `permittedPurposes`                                          |
| J337 | Policy scope is cached per session (second call returns same result)          | Cache hit, no Neo4j query                                            |
| J338 | OdrlPolicy uniqueness constraint prevents duplicate `policyId`                | Constraint error on duplicate                                        |
| J339 | Contract status `TERMINATED` does not grant access                            | Scope excludes terminated contracts                                  |

#### C. NLQ Query-Time Enforcement (J340–J359) — 20 tests

| ID   | Test                                                                             | Expected                             |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------ |
| J340 | NLQ "How many patients?" as PharmaCo returns only contracted patient count       | Count < total patients               |
| J341 | NLQ "How many patients?" as EDC_ADMIN returns all patients                       | Count = total patients               |
| J342 | NLQ "Show patients by gender" as unauthenticated returns 401                     | 401 response                         |
| J343 | NLQ "Show patients by gender" with aggregate-only policy returns grouped results | No individual patient rows           |
| J344 | NLQ "Show me patient P1 details" with aggregate-only policy returns 403          | Individual record blocked            |
| J345 | NLQ template Cypher has `WHERE p.datasetId IN $allowedDatasets` injected         | Cypher audit shows scope             |
| J346 | NLQ LLM-generated Cypher gets policy WHERE clause injected                       | Cypher contains scope filter         |
| J347 | NLQ with expired temporal limit returns empty results                            | 0 rows, policy-expired message       |
| J348 | NLQ result row count does not exceed `maxRowLimit`                               | `results.length <= maxRowLimit`      |
| J349 | NLQ "CALL { CREATE ... }" attack in question is blocked                          | Write-guard rejects                  |
| J350 | NLQ "MERGE ..." in LLM output is blocked by write-guard                          | Query rejected                       |
| J351 | NLQ returns `policyId` in audit metadata                                         | Response includes policy reference   |
| J352 | NLQ federated toggle as DATA_USER with 1 SPE contract queries only that SPE      | `federated: true`, single SPE        |
| J353 | NLQ federated toggle as EDC_ADMIN queries all SPEs                               | All SPEs in response                 |
| J354 | NLQ template "top 10 conditions" scoped to contracted dataset                    | Conditions only from allowed dataset |
| J355 | NLQ "What medications are prescribed?" returns only contracted scope meds        | Medication list filtered             |
| J356 | NLQ with `COMMERCIAL_USE` prohibition + commercial purpose query returns 403     | Purpose mismatch blocked             |
| J357 | NLQ response includes `filteredCount` showing how many rows were policy-removed  | `filteredCount >= 0` in response     |
| J358 | NLQ with no matching template and no LLM returns template catalog                | Method: "none", templates listed     |
| J359 | NLQ audit event is created in Neo4j after each query                             | `QueryAuditEvent` node exists        |

#### D. Federated Search with Policy Scoping (J360–J379) — 20 tests

| ID   | Test                                                                  | Expected                                |
| ---- | --------------------------------------------------------------------- | --------------------------------------- |
| J360 | Federated stats endpoint requires authentication                      | 401 without session                     |
| J361 | Federated query as PharmaCo fans out only to SPE hosting diab-001     | Single SPE in response                  |
| J362 | Federated query as EDC_ADMIN fans out to all SPEs                     | All SPEs in response                    |
| J363 | Federated query with no active contracts returns empty                | 0 rows, message                         |
| J364 | Federated result rows include `_source` provenance tag                | Every row has `_source`                 |
| J365 | Federated result rows include `_policyId` tag                         | Every row has `_policyId`               |
| J366 | k-anonymity threshold for PUBLIC_HEALTH purpose is k=5                | Groups < 5 suppressed                   |
| J367 | k-anonymity threshold for SCIENTIFIC_RESEARCH is k=10                 | Groups < 10 suppressed                  |
| J368 | Federated query with CALL subquery write attempt is blocked           | 400 error                               |
| J369 | Federated query with `DROP` keyword is blocked                        | 400 error                               |
| J370 | Federated query with `DETACH DELETE` is blocked                       | 400 error                               |
| J371 | Federated query with `REMOVE` keyword is blocked                      | 400 error                               |
| J372 | SPE-2 not running: federated degrades to SPE-1 only                   | Results from SPE-1 only                 |
| J373 | SPE registry correctly maps datasets to SPEs                          | Registry Cypher returns correct mapping |
| J374 | Cross-SPE condition aggregation sums counts correctly                 | Total = SPE1 + SPE2                     |
| J375 | Federated stats respect policy scope (DATA_USER sees contracted data) | Stats scoped to allowed datasets        |
| J376 | Federated stats as EDC_ADMIN shows all SPE data                       | Unfiltered totals                       |
| J377 | Federated query timeout (SPE unresponsive) returns partial results    | Partial results + timeout warning       |
| J378 | Federated query rate limiter (20/min) triggers on excessive calls     | 429 after 20 rapid calls                |
| J379 | Federated results are sorted by relevance score when using GraphRAG   | Results ordered by `score`              |

#### E. GraphRAG & Vector Embeddings (J380–J399) — 20 tests

| ID   | Test                                                                            | Expected                                      |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| J380 | Patient nodes have `embedding` property after generation script                 | `p.embedding IS NOT NULL`                     |
| J381 | HealthDataset nodes have `embedding` property                                   | `d.embedding IS NOT NULL`                     |
| J382 | SnomedConcept nodes have `embedding` property                                   | `s.embedding IS NOT NULL`                     |
| J383 | Vector index `patient_embedding` exists in Neo4j                                | `SHOW INDEXES` includes it                    |
| J384 | Vector index `dataset_embedding` exists in Neo4j                                | `SHOW INDEXES` includes it                    |
| J385 | Embedding dimension is 1536 for all vectors                                     | Array length = 1536                           |
| J386 | Vector similarity search for "diabetes" returns diabetic patients               | Top results include diabetes conditions       |
| J387 | Vector similarity search for "cardiovascular" returns heart patients            | Top results include cardiovascular conditions |
| J388 | GraphRAG query "diabetic patients with kidney problems" combines vector + graph | Results traverse Patient→Condition            |
| J389 | GraphRAG results are policy-scoped (only contracted datasets)                   | No results from non-contracted datasets       |
| J390 | GraphRAG fallback to LLM when vector search returns 0 results                   | Method: "llm" in response                     |
| J391 | GraphRAG with similarity score < 0.7 falls through to LLM                       | Low-confidence bypass                         |
| J392 | GraphRAG query latency < 500ms for typical question                             | Response time measured                        |
| J393 | Template match takes priority over GraphRAG                                     | "How many patients?" → template, not RAG      |
| J394 | GraphRAG result includes similarity score per result                            | `score` field in response                     |
| J395 | Embedding generation script handles 100+ patients in batch                      | Script completes without OOM                  |
| J396 | Embedding generation is idempotent (re-run doesn't duplicate)                   | Same embedding count before/after             |
| J397 | GraphRAG with Ollama (local) produces results (no OpenAI key needed)            | Local model works offline                     |
| J398 | GraphRAG result expansion traverses 2 hops from matched nodes                   | Results include conditions + observations     |
| J399 | GraphRAG query audit event records method as "graphrag"                         | Audit shows correct method                    |

#### F. Query Page UI (J400–J409) — 10 tests

| ID   | Test                                                           | Expected                                    |
| ---- | -------------------------------------------------------------- | ------------------------------------------- |
| J400 | Query page loads with policy scope indicator visible           | Scope bar shows allowed datasets            |
| J401 | Policy scope changes when persona switches                     | Different persona → different scope         |
| J402 | Federated toggle disabled when user has no cross-SPE contracts | Toggle grayed out                           |
| J403 | Query results show FHIR resource badges (R4 tag)               | Badge visible per result                    |
| J404 | Query results show SNOMED/ICD10 code badges                    | Code badges visible                         |
| J405 | "Show Cypher" toggle reveals the policy-scoped Cypher          | WHERE clause visible                        |
| J406 | Error state renders when query is policy-blocked               | "Access denied by policy" message           |
| J407 | Audit trail button shows query history for current session     | History panel with timestamps               |
| J408 | Example questions change based on user's effective scope       | PharmaCo sees different examples than Admin |
| J409 | Page is responsive on mobile viewport (375px)                  | No horizontal overflow                      |

#### G. Audit Trail & Compliance (J410–J419) — 10 tests

| ID   | Test                                                          | Expected                                              |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------- |
| J410 | QueryAuditEvent node created after NLQ query                  | Node exists in Neo4j with correct fields              |
| J411 | Audit event includes correct `participantDid`                 | Matches session user                                  |
| J412 | Audit event includes executed Cypher (policy-scoped version)  | Full Cypher in `cypherExecuted`                       |
| J413 | Audit event includes `filteredCount` (rows removed by policy) | Count ≥ 0                                             |
| J414 | Audit event includes `policyId` reference                     | Links to governing OdrlPolicy                         |
| J415 | Audit events are linked to Participant node                   | `(p:Participant)-[:QUERIED]->(audit:QueryAuditEvent)` |
| J416 | NATS audit event published on query execution                 | NATS subscriber receives event                        |
| J417 | EDC_ADMIN can view all audit events                           | Admin audit page shows full list                      |
| J418 | DATA_USER can view only own audit events                      | Filtered to own queries                               |
| J419 | Audit trail survives Docker restart (persisted in Neo4j)      | Audit events present after restart                    |

#### Test Architecture Notes

- Tests J300–J319 (auth) and J320–J339 (ODRL engine) are **Vitest unit tests** — they test server-side logic with MSW mocks.
- Tests J340–J399 (NLQ, federated, GraphRAG) are **integration tests** — they require Neo4j running with seeded data.
- Tests J400–J409 (UI) are **Playwright E2E tests** — they run against the live UI with persona injection.
- Tests J410–J419 (audit) are **integration tests** requiring Neo4j + NATS.
