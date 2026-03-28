# Skills — Health Dataspace

One skill package per major domain concern. Each skill is auto-triggered when the task type matches.

---

## skill: neo4j-schema

**Trigger:** Task involves adding nodes, relationships, constraints, or indexes to the knowledge graph.

### What I do

1. Read `neo4j/init-schema.cypher` to understand existing constraints and indexes.
2. Read the relevant section of `docs/health-dataspace-graph-schema.md` for the target layer.
3. Draft the new `MERGE`/`MATCH` Cypher and constraint using `IF NOT EXISTS`.
4. Verify the new node/relationship fits within the 5-layer model:
   - L1 Dataspace: Participant, DataProduct, Contract, HDABApproval, TrustCenter, SPESession
   - L2 Metadata: HealthDataset, Distribution, EEHRxFProfile
   - L3 FHIR R4: Patient, Encounter, Condition, Observation, MedicationRequest, Procedure
   - L4 OMOP CDM: OMOPPerson, ConditionOccurrence, Measurement, DrugExposure
   - L5 Ontology: SnomedConcept, LoincCode, ICD10Code, RxNormConcept
5. Add schema definition to `neo4j/init-schema.cypher` and update the corresponding markdown doc.
6. Add seed data to `neo4j/insert-synthetic-schema-data.cypher` if needed.

---

## skill: api-route

**Trigger:** Task involves adding or modifying a Next.js API route under `ui/src/app/api/`.

### What I do

1. Read existing route in the same domain for pattern reference.
2. Implement the route handler using `NextRequest` / `NextResponse`.
3. Add `getServerSession(authOptions)` + role guard if the route needs protection.
4. Add static export fallback: create `ui/public/mock/<endpoint>.json` with realistic synthetic data.
5. Register the mock path in `ui/src/lib/api.ts` `MOCK_MAP`.
6. Write a Vitest unit test using MSW to mock the fetch.
7. Check TypeScript: `npx tsc --noEmit -p tsconfig.build.json`.

---

## skill: static-persona

**Trigger:** Task involves demo personas, localStorage persistence, or GitHub Pages static export behaviour.

### What I do

1. Read `ui/src/lib/use-demo-persona.ts` and `ui/src/lib/auth.ts` `DEMO_PERSONAS`.
2. Understand: `IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"`.
3. For new persona-aware components: call `useDemoPersona()` unconditionally, use `IS_STATIC` guard.
4. For new navigation items: add role filter in `ui/src/components/Navigation.tsx` nav groups.
5. For new mock data: differentiate per persona (e.g., `?patientId=P1` vs `?patientId=P2`).
6. Add E2E coverage in `ui/__tests__/e2e/journeys/19-static-github-pages.spec.ts` using `setPersona()` helper.

---

## skill: playwright-journey

**Trigger:** Task involves adding E2E tests, Playwright specs, or journey coverage.

### What I do

1. Read `ui/__tests__/e2e/journeys/` to find the next available `J` number range.
2. Read `ui/playwright.config.ts` for project configuration.
3. Write specs following the `setPersona(page, username)` pattern for static mode tests.
4. Structure tests as: arrange (set persona / navigate) → act → assert on visible content.
5. Avoid asserting on CSS class names; use text content, aria labels, or `data-testid`.
6. Run: `npx playwright test <spec> --project=chromium` to verify locally.

---

## skill: keycloak-auth

**Trigger:** Task involves authentication, Keycloak configuration, OIDC, roles, or JWT claims.

### What I do

1. Read `ui/src/lib/auth.ts` for the full NextAuth + Keycloak configuration.
2. Key invariant: `wellKnown` must use `KEYCLOAK_SERVER_URL` (Docker-internal), `issuer` uses `KEYCLOAK_PUBLIC_URL` (browser-visible).
3. Role extraction: roles come from `token.realm_access?.roles` in the JWT callback.
4. Middleware protection: read `ui/src/middleware.ts` before adding any new protected route.
5. Demo personas: defined in `DEMO_PERSONAS` array in `auth.ts` — add new personas there, not in component files.

---

## skill: compliance-layer

**Trigger:** Task involves EHDS articles, DSP protocol, DCP credentials, ODRL policies, or audit trail.

### What I do

1. Read `docs/health-dataspace-graph-schema.md` for the relevant layer (L1 DSP, L2 DCAT-AP).
2. Reference the correct EHDS article for any new patient-data feature:
   - Art. 3–12: primary use (patient portal, health records)
   - Art. 50–51: secondary use (research, Trust Center, pseudonymisation)
3. `TransferEvent` nodes are append-only (immutable audit log) — never delete them.
4. New consent operations must create `PatientConsent` nodes with `revoked: false` and `timestamp`.
5. ODRL policies on `DataProduct` nodes must specify `permission`, `prohibition`, or `obligation`.
6. Run `./scripts/run-ehds-tests.sh` after any compliance-layer change.

---

## skill: graph-visualisation

**Trigger:** Task involves the force-directed graph explorer, layer colours, persona views, or node filtering.

### What I do

1. Read `ui/src/lib/graph-constants.ts` for `LABEL_LAYER`, `LAYER_COLORS`, `NODE_ROLE_COLORS`, `PERSONA_VIEWS`.
2. Layer colours (fixed): L1 `#2471A3`, L2 `#148F77`, L3 `#1E8449`, L4 `#CA6F1E`, L5 `#7D3C98`.
3. New node labels must be added to `LABEL_LAYER` mapping.
4. New persona views must be added to `PERSONA_VIEWS` constant.
5. Read `ui/src/app/api/graph/route.ts` for the Cypher queries that populate the graph.
6. Test via `curl http://localhost:3000/api/graph?persona=<id>` then check node/edge counts.
