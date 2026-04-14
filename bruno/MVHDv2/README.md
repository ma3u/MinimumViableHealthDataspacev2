# MVHDv2 Bruno API Collection

A [Bruno](https://www.usebruno.com/) collection covering all 38 Next.js API routes of the
Minimum Viable Health Dataspace v2 reference implementation.

## Why Bruno?

Bruno collections are plain `.bru` files that live in git alongside the code. Unlike
Postman, there is no cloud sync, no proprietary export, and the collection diffs cleanly in
PRs. The same files work in the [Bruno desktop app](https://www.usebruno.com/downloads),
the VS Code extension, and the [bruno CLI](https://docs.usebruno.com/bru-cli/overview)
for CI runs.

## Open the collection

1. Install Bruno (desktop or `npm i -g @usebruno/cli`).
2. In the Bruno app: **Open Collection → select** `bruno/MVHDv2/`.
3. Pick an environment from the dropdown:
   - **Local** — `http://localhost:3000` (NextAuth + Keycloak + Neo4j running locally)
   - **Static-mock** — `https://ma3u.github.io/MinimumViableHealthDataspacev2`
     (GitHub Pages static export, mock JSON, no auth)
   - **Azure-Dev** — `https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io`
     (live ACA stack — only reachable Mon–Fri 07:00–20:00 Europe/Berlin per ADR-016)

## Authentication

Most routes require a NextAuth session cookie. There are three ways to get one:

1. **Browser sign-in then copy cookie** — sign in at `{{baseUrl}}/auth/signin` (Keycloak realm
   `edcv`, e.g. `edcadmin / edcadmin`), open DevTools → Application → Cookies, copy the
   `next-auth.session-token` value, and paste it into Bruno's collection-level
   `Cookie: next-auth.session-token=...` header.
2. **Static-mock environment** — bypasses auth entirely; routes serve fixtures from
   `ui/public/mock/*.json`.
3. **Demo persona localStorage** — for the GitHub Pages static export only, set
   `localStorage.demo-persona = "edcadmin"` in DevTools before requests.

The `auth/[...nextauth]` route is intentionally not in the collection — it's a NextAuth
internal handler, not a REST endpoint.

## Coverage

| Folder       | Routes | Notes                                                  |
| ------------ | ------ | ------------------------------------------------------ |
| Health       | 1      | Liveness probe                                         |
| Catalog      | 3      | HealthDCAT-AP datasets — list / create / delete        |
| Graph        | 4      | 5-layer Neo4j graph queries                            |
| Patient      | 6      | FHIR profile, insights, research consent (GDPR Art. 7) |
| Compliance   | 2      | EHDS / GDPR / DSP status + TCK results                 |
| Credentials  | 4      | DCP v1.0 W3C VCs                                       |
| Negotiations | 3      | DSP 2025-1 contract negotiations                       |
| Transfers    | 3      | DCore data plane transfers                             |
| Assets       | 2      | EDC asset registration                                 |
| Participants | 5      | DID:web participant CRUD                               |
| Tasks        | 1      | Aggregated contract / transfer pipeline tasks          |
| Trust Center | 1      | DID resolution + attestation chain                     |
| Federated    | 1      | Cross-site cohort query (k-anonymity)                  |
| NLQ          | 2      | Text2Cypher templates + run                            |
| EEHRxF       | 1      | EEHRxF profile catalog (Layer 2b)                      |
| Analytics    | 1      | OMOP-derived dashboard                                 |
| ODRL Scope   | 1      | Effective ODRL scope for current participant           |
| Admin        | 8      | Tenants, audit, components, topology, policies (CRUD)  |
| **Total**    | **49** | + collection.bru, bruno.json, 3 environments           |

## Running the collection in CI

```bash
npm i -g @usebruno/cli
bru run bruno/MVHDv2 --env Local --reporter-html bruno-report.html
```

The CLI honours the same environment files. For Azure-Dev you'll typically wire a session
cookie through `--env-var sessionCookie=$(...)` and reference it from a per-request
`Cookie:` header.

## Adding a new endpoint

1. Drop a new `.bru` file under the appropriate folder.
2. Set `seq:` to the next number in that folder.
3. Use `{{baseUrl}}` and any of the env vars (`{{participantId}}`, `{{patientId}}`,
   `{{studyId}}`, `{{proxyUrl}}`).
4. For request bodies, use `body:json { ... }` — the block contents are valid JSON.
5. Commit the file. PR diffs are readable.

## See also

- `ui/src/app/api/**/route.ts` — the source of truth for request/response shapes
- `ui/public/mock/*.json` — fixture responses used by the static export
- `.claude/rules/api-conventions.md` — protocol versions, role matrix, data models
- ADR-008 (testing strategy) — how Bruno fits alongside Vitest + Playwright
