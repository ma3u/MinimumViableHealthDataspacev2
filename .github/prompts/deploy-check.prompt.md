---
description: Pre-deploy validation — run the repo's real gates and report a pass/fail checklist.
mode: agent
---

Run the actual gates. Do not report a step as passing that you did not run, and do
not substitute a lighter command for a heavier one.

```bash
cd ui && npx tsc --noEmit -p tsconfig.build.json   # type-check (excludes tests)
cd ui && npm run lint                              # budget: ≤ 55 warnings
cd ui && npm test                                  # Vitest, full suite
cd ui && npm run build                             # production build
cd ui && npm audit --audit-level=high --omit=dev   # pre-push gate
pre-commit run --all-files                         # everything the hooks enforce
```

Optional, when the change warrants it:

```bash
cd ui && npm run test:e2e                # needs UI + Neo4j running
./scripts/run-dsp-tck.sh                 # DSP protocol conformance
./scripts/run-dcp-tests.sh               # DCP credentials
./scripts/run-ehds-tests.sh              # EHDS domain rules
```

Report one line per gate: name, PASS or FAIL, and on failure the first real error
line — not a summary of it. Finish with an explicit go/no-go.

Two repo-specific checks that a green suite will not catch:

- Every new route under `ui/src/app/api/` has a fixture in `ui/public/mock/` with a
  matching response shape (gotcha #3 — the static build fails silently otherwise).
- Any schema change in `docs/` is mirrored in `neo4j/init-schema.cypher`.

Deploy is `git push` to `main`, which triggers
`.github/workflows/deploy-azure.yml`. Remember ACA caches `:latest` — a job or app
will not re-pull on restart, so the deploy must push a new revision.
