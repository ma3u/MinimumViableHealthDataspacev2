# /fix-issue — Issue Investigation Workflow

Investigate and fix a GitHub issue in this repository.

## Usage

```
/fix-issue 123
/fix-issue 123 --dry-run    # diagnose only, no code changes
```

`$ARGUMENTS` is the issue number.

## Workflow

### Step 1 — Read the issue

```bash
gh issue view $ARGUMENTS
```

Also check for linked PRs:

```bash
gh issue view $ARGUMENTS --json linkedBranches,comments
```

### Step 2 — Understand the failing area

Based on the issue description, identify the affected layer:

| Symptom                             | Where to look                                                              |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Graph not loading / wrong nodes     | `ui/src/app/api/graph/route.ts`, `graph-constants.ts`                      |
| Static export / GitHub Pages broken | `ui/src/lib/api.ts`, `ui/public/mock/`, `IS_STATIC` guards                 |
| Keycloak / login error              | `ui/src/lib/auth.ts`, `KEYCLOAK_SERVER_URL` vs `KEYCLOAK_PUBLIC_URL`       |
| Role-based nav wrong                | `ui/src/components/Navigation.tsx`, `ui/src/middleware.ts`                 |
| Patient portal missing data         | `ui/src/app/patient/*/page.tsx`, mock JSON in `ui/public/mock/`            |
| Neo4j query fails                   | `neo4j/init-schema.cypher`, `services/neo4j-proxy/src/`                    |
| Pre-commit hook failure             | `.pre-commit-config.yaml`, prettier/eslint/tsc output                      |
| JAD stack not starting              | `docker-compose.jad.yml`, `scripts/bootstrap-jad.sh`, Vault in-memory loss |
| Compliance test failure             | `scripts/run-dsp-tck.sh`, `scripts/run-dcp-tests.sh`                       |

### Step 3 — Reproduce locally

```bash
cd ui && npm run dev
# or for static export:
NEXT_PUBLIC_STATIC_EXPORT=true npm run build && npx serve out
```

Run the relevant Playwright spec if an E2E regression:

```bash
npx playwright test __tests__/e2e/journeys/<relevant-spec>.spec.ts --project=chromium
```

### Step 4 — Fix

- Make the minimal change that resolves the issue.
- Do not refactor unrelated code.
- Add or update a test that would have caught this regression.

### Step 5 — Verify

```bash
npx tsc --noEmit -p tsconfig.build.json
npm run lint
npm test
```

### Step 6 — Commit

```bash
git add <changed files>
git commit -m "fix(<scope>): <what was broken> (#$ARGUMENTS)"
git push origin main
```

Reference the issue number in the commit message so GitHub auto-closes it.
