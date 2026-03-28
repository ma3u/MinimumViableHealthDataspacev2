# /deploy-check — Pre-Deploy Validation

Run all pre-deployment checks before pushing to main or merging a PR.

## Usage

```
/deploy-check              # full check (live + static)
/deploy-check --static     # static GitHub Pages export only
/deploy-check --docker     # Docker Compose stack only
/deploy-check --k8s        # Kubernetes (OrbStack) only
```

## Full Validation Sequence

### 1 — TypeScript and lint

```bash
cd ui
npx tsc --noEmit -p tsconfig.build.json
npm run lint
```

Expected: 0 TypeScript errors, ≤ 55 ESLint warnings.

### 2 — Unit tests

```bash
cd ui && npm test
```

Expected: all Vitest tests pass.

### 3 — Static export build

```bash
cd ui && npm run build
```

Expected: `out/` directory created, no build errors.
Note: the build runs without `NEXT_PUBLIC_STATIC_EXPORT=true` here. The CI workflow
handles moving the `api/` folder. For a local static export simulation:

```bash
mv src/app/api /tmp/api_disabled
NEXT_PUBLIC_STATIC_EXPORT=true npm run build
mv /tmp/api_disabled src/app/api
```

### 4 — E2E smoke tests

```bash
cd ui
npx playwright test --project=chromium --grep @smoke
```

If no `@smoke` tag exists, run the static journeys spec:

```bash
npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts --project=chromium
```

### 5 — Docker Compose stack health

```bash
docker compose up -d
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
docker compose ps
```

Expected: HTTP 200, all services `Up`.

### 6 — Neo4j schema idempotency check

```bash
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace
```

Expected: completes without errors (all constraints/indexes use `IF NOT EXISTS`).

### 7 — GitHub Actions status

```bash
gh run list --limit 5
```

Expected: last `Deploy Next.js to GitHub Pages` run is `success`.

### 8 — Kubernetes health (if deploying to OrbStack)

```bash
kubectl -n health-dataspace get pods
kubectl rollout status deployment/health-dataspace-ui -n health-dataspace
```

Expected: all pods `Running`, rollout `successfully rolled out`.

## Checklist Before Merging

- [ ] TypeScript: 0 errors
- [ ] ESLint: ≤ 55 warnings
- [ ] Vitest: all pass
- [ ] Static build: no errors, `out/` generated
- [ ] E2E: no new failures
- [ ] Mock JSON added for any new API route
- [ ] No real organisation names in new content
- [ ] `MERGE` (not `CREATE`) in any new Cypher
- [ ] Pre-commit hooks pass: `pre-commit run --all-files`
