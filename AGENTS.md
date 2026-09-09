# AGENTS.md

Cross-tool entry point for agentic assistants (GitHub Copilot, Claude Code, Codex,
Cursor). Copilot reads this alongside `.github/copilot-instructions.md`; Claude Code
reads `CLAUDE.md`. Keep this file lean — depth belongs in the linked material.

## Purpose

EHDS regulation reference implementation: the Dataspace Protocol (DSP), FHIR R4,
OMOP CDM, and biomedical ontologies unified in a 5-layer Neo4j knowledge graph,
with a Next.js UI over it. 127 synthetic patients, 5300+ graph nodes. Live
deployment: <https://ehds.mabu.red> (Azure Container Apps, resource group
`rg-mvhd-dev`).

## Commands

```bash
# UI (Next.js 14) — primary working area
cd ui && npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # ESLint — pre-commit enforces --max-warnings 55
npx tsc --noEmit -p tsconfig.build.json   # pre-commit type-check (excludes tests)
npm test               # Vitest unit suite (pre-push runs this with --bail 1)
npm run test:e2e       # Playwright (needs running UI + Neo4j)

# Neo4j proxy (Express + TypeScript)
cd services/neo4j-proxy && npm run dev    # port 9090; npm test for its Vitest suite

# Minimal stack: Neo4j + UI
docker compose up -d
cat neo4j/init-schema.cypher | docker exec -i health-dataspace-neo4j \
  cypher-shell -u neo4j -p healthdataspace

# Full JAD stack (19 services — needs 8 GB Docker RAM)
docker compose -f docker-compose.yml -f docker-compose.jad.yml up -d
./scripts/bootstrap-jad.sh && ./jad/seed-all.sh      # phases 1–7, strict order

# Quality gates (same ones CI and the git hooks run)
pre-commit install && pre-commit install --hook-type pre-push
pre-commit run --all-files

# Azure deploy: push to main triggers .github/workflows/deploy-azure.yml
```

## Directory map

| Path                                         | What lives there                                            |
| -------------------------------------------- | ----------------------------------------------------------- |
| `ui/src/app/`                                | Next.js 14 app router — pages + `api/` routes               |
| `ui/src/lib/`                                | `auth.ts`, `api.ts` (static-export mock map), `neo4j.ts`    |
| `ui/__tests__/`                              | `unit/` (Vitest + MSW) · `e2e/journeys/` (Playwright)       |
| `services/neo4j-proxy/`                      | Express FHIR/OMOP/NLQ/federated bridge (port 9090)          |
| `services/catalog-crawler\|catalog-enricher` | Federated discovery pipeline (issue #8)                     |
| `neo4j/`                                     | `init-schema.cypher` + seed cyphers (idempotent MERGE only) |
| `jad/`                                       | JAD stack seeds, `keycloak-realm.json`                      |
| `scripts/azure/`                             | Numbered deploy phases 01–10 + `env.sh`                     |

## Coding conventions

Extracted from the repo, not assumed. Full detail in the path-scoped files under
`.github/instructions/` (Copilot) and `.claude/rules/` (Claude Code) — the two sets
are mirrors of the same conventions.

- **TypeScript** — strict mode; `@/*` maps to `ui/src/*`; `"use client"` first line
  on client components; unused params prefixed `_`; avoid `as any`.
- **Cypher** — `PascalCase` labels, `UPPER_SNAKE_CASE` relationships, `camelCase`
  properties; always `MERGE` with explicit `ON CREATE SET` / `ON MATCH SET`; every
  constraint and index `IF NOT EXISTS`.
- **Bash** — `set -euo pipefail` after the shebang; quote every expansion;
  shellcheck runs at error severity in pre-commit; scripts named `verb-noun.sh`.
- **Prettier** formats `*.md`, `*.yaml`, `*.json`, `*.ts`, `*.tsx` in pre-commit and
  reformats staged files — `git add` again and retry. Do not fight its output.
- **Fictional organisations only** in demo data and docs. Real names (TK, gematik)
  only behind the `NEXT_PUBLIC_DEMO_TK` build flag.

## Top gotchas

1. **Vault secrets are lost on Docker restart** — in-memory only; re-run
   `./scripts/bootstrap-jad.sh`.
2. **JAD seed phases 1–7 are strictly ordered** — FHIR before OMOP (phase 4 needs
   phase 3).
3. **Static export disables API routes** — CI renames `ui/src/app/api/`; guard with
   `NEXT_PUBLIC_STATIC_EXPORT` and mirror every route in `ui/public/mock/*.json`.
   A route added without a fixture breaks the published github.io demo silently.
4. **Keycloak: never use `wellKnown` in the NextAuth provider** (container-internal
   `localhost` breaks token exchange); the UI client is confidential + PKCE S256.
   See `docs/knowledge/runbooks/keycloak-realm-drift.md`.
5. **ACA caches `:latest` images** — a job or app won't re-pull on restart; a deploy
   must push a new revision. Full log in `docs/gotchas.md`.

## Knowledge & planning

- `docs/knowledge/index.md` — OKF v0.2 concept bundle: services, data models, APIs,
  runbooks. One concept per file; frontmatter carries `generated` / `verified` /
  `status` trust signals.
- `docs/planning/index.md` — work items in `done/ · current/ · future/`.
- `docs/ADRs/` — canonical ADR corpus (ADR-001…028). `docs/adr/0000-template.md` is
  the Nygard template for new ones. Never edit an accepted ADR — supersede it.
- `docs/diagrams/` — Mermaid for flow/sequence/state/ER, PlantUML for
  class/component/deployment. Structural ADRs link their before/after diagram.
- Before significant changes: check the ADRs, the planning index, and `gh issue list`.

## Token discipline

Keep routinely-loaded documents small (ADR-026: under ~15K tokens). This file and
`.github/copilot-instructions.md` stay lean on purpose; depth lives in skills,
path-scoped instructions, ADRs, and the OKF bundle, which load on demand. Link
`docs/knowledge/index.md` rather than inlining what it already says.
