---
description: Pre-deploy validation — run the real gates, report pass/fail checklist
argument-hint: "[--static | --docker | --azure]"
allowed-tools: Bash, Read, Grep
---

## Context (auto-injected)

- TypeScript: !`cd ui && npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK`
- Lint (budget ≤ 55 warnings): !`cd ui && npm run lint 2>&1 | tail -3`
- Unit tests: !`cd ui && npm test 2>&1 | tail -3`
- Prod-dependency audit (pre-push gate): !`cd ui && npm audit --audit-level=high --omit=dev 2>&1 | tail -2`
- Last CI runs: !`gh run list --limit 5`

## Task

Interpret the injected results and complete the remaining checks for the requested
target, then print a pass/fail checklist. Commands are the repo's real gates
(sources: `ui/package.json`, `.pre-commit-config.yaml`, `.github/workflows/`):

- **Static (GitHub Pages):** `cd ui && npm run build` must produce `out/`; the CI
  workflow renames `src/app/api/` — every new API route needs a
  `ui/public/mock/*.json` fixture (CLAUDE.md gotcha #3). Spot-check with
  `npx playwright test __tests__/e2e/journeys/19-static-github-pages.spec.ts --project=chromium`.
- **Docker:** `docker compose up -d`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
  expects 200; re-run `neo4j/init-schema.cypher` (idempotent) without errors.
- **Azure:** push to main triggers `.github/workflows/deploy-azure.yml`
  (builds UI + neo4j-proxy images, updates ACA apps). Verify with
  `gh run list --workflow=deploy-azure.yml --limit 1` and a live check of
  https://ehds.mabu.red. Remember ACA caches `:latest` (docs/gotchas.md).

## Checklist to print

- [ ] TypeScript 0 errors · [ ] ESLint ≤ 55 warnings · [ ] Vitest all pass
- [ ] npm audit: no high/critical prod CVEs (this blocks pre-push)
- [ ] Static build OK + mock fixture for every new route
- [ ] Cypher idempotent (`MERGE`, `IF NOT EXISTS` only)
- [ ] No real org names outside `NEXT_PUBLIC_DEMO_TK`
- [ ] `pre-commit run --all-files` clean
