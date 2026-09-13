# Knowledge bundle change log

- 2026-07-15 — Initial OKF v0.1 bundle generated from CLAUDE.md,
  .claude/rules/\*, docs/architecture/federation.md, docs/gotchas.md,
  scripts/azure/env.sh, docker-compose files, and the 2026-07-15
  Keycloak login incident. 23 concepts across services/datamodels/apis/
  runbooks/decisions.
- 2026-09-08 — Migrated the bundle from OKF v0.1 to **v0.2** across 26 concept
  files. `timestamp:` → `generated: { by: claude-code/fable-5, at: … }` (both
  breaking v0.2 renames; no concept used the body `# Citations` list, so nothing
  moved to `sources:`). Added `verified: { by: human:ma3u, at: … }` — the
  bundle's originating commits are human co-authored and merged via PR — and
  `status: stable`. `generated.at` now comes from each file's last git commit
  rather than a hand-written date, which corrected
  `runbooks/postgres-16-to-17-azure.md` from 2026-07-15 to 2026-07-17.
