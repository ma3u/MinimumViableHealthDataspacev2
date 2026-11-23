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
- 2026-10-02 · Added `runbooks/cost-efficient-logging.md` (status draft): logging
  strategy for #418 / ADR-045, from a measured `mvhd-logs` baseline (91 % of 31 days'
  console bytes were crash-loop stack traces; 14 days hit the 1 GB cap).
- 2026-10-04 · `runbooks/aca-postgres-ephemeral-recovery.md` set to deprecated: the
  `mvhd-postgres` container app is deleted (ADR-041 phase 4). `services/postgres.md`
  now names the Flexible Server `mvhd-pg-b53a0449` as the Azure resource.
- 2026-10-04 · `runbooks/cost-efficient-logging.md`: Phase B steps 8 (neo4j-proxy), 9 and 10
  (local) marked done, with what was verified; UI logging and the Azure observability app
  remain open.
- 2026-10-27 · Added `datamodels/secondary-use-opt-out.md` (status draft) for the
  Art. 71 opt-out of #694 / ADR-062. `datamodels/healthdcat-ap.md` now names
  HealthDCAT-AP Release 8 and its namespace (ADR-063, superseding ADR-003).
- 2026-10-27 · `datamodels/healthdcat-ap.md`: the Release 8 content of #700 (seed,
  variables model, serialiser, SHACL validation, federation).
- 2026-11-02 · Added `runbooks/spe-attestation-azure.md` (status draft): phase 21 of
  #774 / ADR-069, the two SPE workspaces on ACI confidential containers attested to
  the access body's Trustee; pinning reference values, checks, stop and start, and
  the failures of 2026-11-01/02 by symptom.
- 2026-11-09 · Added `datamodels/bonus-programme-consent.md` (status draft): #934
  steps 3 and 4 / ADR-080, AlphaKasse's bonus programme as a crawled DCAT-AP
  `dcat:DataService`, the person's consent to it, and the transfer gate that
  answers 403 after a withdrawal. The process is published at
  `docs/ehds/bonus-programme-data-flow.md`.
- 2026-11-18 · `runbooks/edc-1-on-azure.md`: "What the RC moves taught us" (#930),
  from the RC6 and RC7 moves: read the delta for what our scripts write by hand
  (Vault aliases, credential formats, data plane registration), write both forms
  during the overlap, find a stalled issuance by its state at debug level, gate
  locally from empty volumes with all five suites.
- 2026-11-18 · `runbooks/edc-1-on-azure.md` and `runbooks/cfm-fork.md`: Azure runs
  EDC 1.0.0-RC7 and CFM `v0.0.9-mvhd.1` (#930), with the cutover's images,
  backup and gate results.
- 2026-11-19 · `runbooks/edc-1-on-azure.md`: the RC8 row (#930). RC8 broke no
  gate; Linked Data credentials became opt-in (Connector #6242), which changed
  the refusal `run-simpl-issuer-interop.sh` reads. A rehearsal that keeps the
  Neo4j volume needs the seed files `main` changed since.
- 2026-11-20 · `runbooks/edc-1-on-azure.md` and `runbooks/cfm-fork.md`: Azure runs
  EDC 1.0.0-RC8 and CFM `v0.0.9-mvhd.2` (#930), with the cutover's images,
  backup and gate results. `20-cfm-fork.sh --check` reports the database
  missing while the estate is stopped; read it on a running estate.
- 2026-11-23 · Added `services/dataplane.md` (status draft): the hub's own data
  plane on the DataPlane SDK (ADR-095, #888), five transfer types into an
  attested SPE inbox over HTTP and Kafka, its checks and its limits.
