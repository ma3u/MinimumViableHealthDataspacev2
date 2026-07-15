# CLAUDE.md

EHDS regulation reference implementation: DSP Dataspace Protocol + FHIR R4 + OMOP CDM + biomedical
ontologies unified in a 5-layer Neo4j knowledge graph. 127 synthetic patients, 5300+ graph nodes.
Live deployment: https://ehds.mabu.red (Azure Container Apps, resource group `rg-mvhd-dev`).

## Commands

```bash
# UI (Next.js 14) — primary working area
cd ui && npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # ESLint — pre-commit enforces --max-warnings 55
npx tsc --noEmit -p tsconfig.build.json   # pre-commit type-check (excludes tests)
npm test               # Vitest unit suite (pre-push runs this with --bail)
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

# Azure deploy: push to main triggers .github/workflows/deploy-azure.yml
```

## Directory map

```
ui/src/app/             — Next.js 14 app router (pages + api/ routes)
ui/src/lib/             — auth.ts, api.ts (static-export mock map), neo4j.ts
ui/__tests__/           — unit/ (Vitest + MSW) · e2e/journeys/ (Playwright)
ui/public/mock/         — JSON fixtures for NEXT_PUBLIC_STATIC_EXPORT=true
services/neo4j-proxy/   — Express FHIR/OMOP/NLQ/federated bridge (port 9090)
services/catalog-crawler|catalog-enricher — federated discovery pipeline (issue #8)
neo4j/                  — init-schema.cypher + seed cyphers (idempotent MERGE only)
jad/                    — JAD stack seeds, keycloak-realm.json
scripts/azure/          — numbered deploy phases 01–10 + env.sh
docs/                   — see "Knowledge & planning" below
```

## Conventions

@.claude/rules/code-style.md
@.claude/rules/testing.md
@.claude/rules/api-conventions.md

## Top gotchas

1. **Vault secrets lost on Docker restart** — in-memory only; re-run `./scripts/bootstrap-jad.sh`.
2. **JAD seed phases 1–7 are strictly ordered** — FHIR before OMOP (phase 4 needs phase 3).
3. **Static export disables API routes** — CI renames `src/app/api/`; guard with
   `NEXT_PUBLIC_STATIC_EXPORT` and mirror every route in `ui/public/mock/*.json`.
4. **Pre-commit Prettier reformats staged files** — `git add` again and retry the commit;
   pre-push runs full Vitest + `npm audit --audit-level=high --omit=dev`.
5. **Keycloak: never use `wellKnown` in the NextAuth provider** (container-internal
   `localhost` breaks token exchange) and the UI client is confidential + PKCE S256 —
   see `ui/src/lib/auth.ts`, `jad/keycloak-realm.json`, and the realm-drift runbook
   `docs/knowledge/runbooks/keycloak-realm-drift.md`.
6. **ACA caches `:latest` images** — a job/app won't re-pull on restart; deploy pushes a
   new revision (see `docs/gotchas.md` for the full operational gotcha log).

## Knowledge & planning

- `docs/knowledge/index.md` — OKF concept bundle: services, data models, APIs, runbooks.
- `docs/planning/index.md` — work items in `done/ · current/ · future/`; roadmap detail in
  `docs/planning/roadmap-phases-*.md`; issue table in `docs/planning-health-dataspace-v2.md`.
- `docs/ADRs/` — canonical ADR corpus (ADR-001…028). `docs/adr/0000-template.md` is the
  Nygard template for new ones; never edit an accepted ADR — supersede it.
- Before significant changes: check ADRs + planning index + `gh issue list`. Keep any
  routinely-loaded doc under ~15K tokens (ADR-026) — index stays small, detail in archives.
- **Fictional orgs only** in demo data/docs (AlphaKlinik Berlin, PharmaCo Research AG,
  MedReg DE, Limburg Medical Centre, Institut de Recherche Santé); real names (e.g. TK,
  gematik) ONLY behind the `NEXT_PUBLIC_DEMO_TK` flag — details in
  @.claude/rules/code-style.md.
