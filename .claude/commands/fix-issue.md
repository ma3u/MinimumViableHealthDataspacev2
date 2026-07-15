---
description: Investigate and fix a GitHub issue — root cause, plan, validation
argument-hint: "<issue-number> [--dry-run]"
allowed-tools: Bash(gh issue view:*), Bash(git log:*), Read, Grep, Glob
---

## Context (auto-injected)

- Issue: !`gh issue view $ARGUMENTS`
- Recent commits: !`git log --oneline -10`

## Task

1. **Root-cause hypothesis** — state it with evidence. Map the symptom to the layer
   first (table sourced from repo history):

   | Symptom                      | Where to look                                                                 |
   | ---------------------------- | ----------------------------------------------------------------------------- |
   | Graph wrong/empty            | `ui/src/app/api/graph/route.ts`, `ui/src/lib/graph-constants.ts`              |
   | Static export / Pages broken | `ui/src/lib/api.ts`, `ui/public/mock/`, `IS_STATIC` guards                    |
   | Keycloak / login error       | `ui/src/lib/auth.ts`, `jad/keycloak-realm.json`, realm-drift runbook          |
   | Role-based nav wrong         | `ui/src/components/Navigation.tsx`, `ui/src/middleware.ts`                    |
   | Neo4j query fails            | `neo4j/init-schema.cypher`, `services/neo4j-proxy/src/index.ts`               |
   | NLQ / federated query wrong  | proxy 4-tier resolver — see ADR-020 + `docs/architecture/federation.md`       |
   | JAD stack broken             | `docker-compose.jad.yml`, `scripts/bootstrap-jad.sh` (Vault is in-memory)     |
   | Azure deploy issue           | `scripts/azure/*.sh`, `.github/workflows/deploy-azure.yml`, `docs/gotchas.md` |

2. **Impacted files** — exact paths, must-change vs may-change.
3. **Fix plan** — minimal targeted change; add the test that would have caught it.
   Architectural decisions → new ADR in `docs/ADRs/` from `docs/adr/0000-template.md`,
   linked in the planning index ADR table (workflow: CLAUDE.md "Knowledge & planning").
4. **Validate:** `npx tsc --noEmit -p tsconfig.build.json` · `npm run lint` ·
   targeted Vitest file · relevant Playwright journey.
5. Commit as `fix(<scope>): <what was broken> (#$ARGUMENTS)` on a `fix/…` branch;
   `--dry-run` stops after step 3.
