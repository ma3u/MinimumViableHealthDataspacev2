---
title: "Issue #97 Phase B — EDC v0.18 upgrade analysis (JAD lockstep)"
status: current
owner: ma3u
updated: 2026-07-15
adr: ../../ADRs/ADR-029-dependency-version-pinning.md
---

# EDC v0.16 → v0.18 upgrade analysis

Sources: eclipse-edc/Connector release notes v0.17.0 + v0.18.0,
`Metaform/jad` @ `4a7e5bd096c58814748e956cc9329586ad309698`
(main HEAD 2026-05-18, pins `edc = "0.18.0-SNAPSHOT"`, `jadVersion=0.0.2-SNAPSHOT`),
touchpoint grep of this repo (2026-07-15).

## Key discovery — no rebuild needed

Metaform's own CI publishes **public, per-commit, multi-arch images** for
exactly our four launchers: `ghcr.io/metaform/jad/{controlplane,dataplane,identity-hub,issuerservice}:<full-git-sha>`.
The EDC-0.18-aligned HEAD (`4a7e5bd0…`) is already published. Phase B therefore
**consumes pinned upstream images instead of rebuilding from `vendor/`** —
this supersedes the ADR-005 source-build pipeline for the JAD four and gives
us the provenance (per-SHA tags + `org.opencontainers.image.source` label)
that our own 2026-04-11 builds lacked. Opt-in overlay:
`docker-compose.jad-edc018.yml`.

## Breaking changes mapped to our touchpoints

| Change (release)                                        | Our exposure                                                                                               | Action                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Data-plane signaling becomes DEFAULT (0.18 #5694)       | both dataplanes (`mvhd-dp-fhir`, `mvhd-dp-omop`) register via jad launcher config                          | validate DPS registration on stack bring-up; jad `config/` already targets DPS |
| Identity carried in `sub` claim (0.18 #5813)            | DCP flows: IdentityHub ↔ IssuerService ↔ controlplane; `scripts/run-dcp-tests.sh` asserts token contents | re-run DCP suite; adjust assertions if they inspect claim layout               |
| `conformsTo` adopted from dct (0.18 #5780)              | catalog JSON-LD consumed by `services/catalog-crawler` → enricher → `HealthDataset.conformsTo[]`           | enricher mapping must accept `dct:conformsTo`; add a fixture test              |
| Token-exchange auth for HashiCorp Vault (0.18 #5821)    | controlplane ↔ Vault (`mvhd-vault`, now pinned 2.0)                                                       | review jad Vault config; aligns with the Vault 2.0 pin from Phase A            |
| Well-known path config removed (0.17 #5527)             | jad launcher config only (our NextAuth never used EDC well-known)                                          | none expected; verify on bring-up                                              |
| Claims stored in contract agreement (0.17 #5626)        | EDC Postgres store schema → migration on upgrade                                                           | fresh DBs locally; Azure `controlplane` DB will migrate — snapshot first       |
| v5alpha management APIs ported (0.17 #5588/#5594/#5603) | our code already targets `/v5alpha/participants` (25 call sites) and `/api/mgmt/v5alpha` in `jad/*.sh`     | aligned — expected to work unchanged                                           |

## CFM status (lockstep caveat)

CFM sources are **stale or empty upstream** (`cfm-fulcrum` Go 2025-07,
`cfm-edc` README-only); our six `cfm-*` tags share one digest built 2026-04-11.
CFM stays digest-pinned. Risk: old CFM agents against new EDC management API —
mitigated short-term by the Neo4j fallback in `/api/admin/tenants`, but
tenant provisioning flows must be exercised on the upgraded stack before
Azure cutover. `UNKNOWN — exact CFM build source; confirm with Metaform before
any CFM rebuild.`

## Validation gate (blocked on a running stack)

1. `docker compose -f docker-compose.yml -f docker-compose.jad.yml -f docker-compose.jad-edc018.yml up -d`
2. `./scripts/bootstrap-jad.sh && ./jad/seed-all.sh` (phases 1–7)
3. `./scripts/run-dcp-tests.sh` · `./scripts/run-dsp-tck.sh` · `./scripts/run-ehds-tests.sh`
4. `PLAYWRIGHT_BASE_URL=http://localhost:3003 npx playwright test --project=live`
5. Only then: swap the four image refs in `docker-compose.jad.yml` + Azure
   `scripts/azure/env.sh`, snapshot the Azure `controlplane` Postgres DB, roll out.

## Gate run results (2026-07-15, local JAD stack on OrbStack)

Two additional **required-config breaking changes** surfaced only at runtime:

1. **NATS event publishing is mandatory** on all four launchers
   (`edc.events.nats.url` / `.stream` — jad PR #108): controlplane failed DI
   without it. Fixed via env (`EDC_EVENTS_NATS_*`, stream `edc-events`,
   `create: true` against our JetStream-enabled NATS).
2. **Siglet cert-exchange service is mandatory for dataplanes**
   (`edc.iam.siglet.issuer` / `.jwks.url`): new Rust service from
   `eclipse-dataplane-core/dsdk-facet-rs`. Added as a compose service
   (memory backend, signaling/management auth disabled for dev) + Vault
   transit engine with an ed25519 `signing-siglet` key (now created by
   `bootstrap-jad.sh` on every run — Vault is in-memory).
3. **Management API moved v5alpha → v5beta** and now **enforces OAuth**
   (401 without a bearer token; 0.17 authn/authz port). All shell suites and
   the UI EDC client are now version-parameterised (`EDC_MGMT_API_VERSION`;
   scripts default v5beta, UI defaults v5alpha until the Azure cutover and
   gets v5beta via `docker-compose.live.yml`).
4. **Bonus find (ADR-029 vindicated):** GHCR `cfm-tmanager`/`cfm-pmanager`
   `:latest` were overwritten 2026-04-11 by the shared CFM _agent_ image —
   the managers only ever worked from stale local caches. Re-pinned to the
   working 2026-03-09 digests in `docker-compose.jad.yml`.

| Gate step                                                                            | Result                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack boot (19 services + siglet)                                                    | ✅ all healthy                                                                                                                                                |
| bootstrap-jad + seed phases (identity, credentials, assets, negotiations, transfers) | ✅ incl. consumer+provider data-plane transfers on DPS                                                                                                        |
| DCP v1.0 suite                                                                       | ✅ 16 passed / 0 failed / 6 skipped                                                                                                                           |
| DSP 2025-1 TCK                                                                       | ✅ 27 passed / 0 failed / 6 skipped                                                                                                                           |
| EHDS domain suite                                                                    | ✅ 18 passed / 5 skipped / 2 failed — both pre-existing Neo4j seed-data findings (Art-53 chain completeness, 4 orphaned OMOPPersons), untouched by EDC images |
| Playwright `--project=live` (3003)                                                   | see issue #97 comment                                                                                                                                         |

## Azure cutover checklist (Phase D)

1. Mirror `ghcr.io/metaform/jad/*:4a7e5bd0…` into ACR; update `scripts/azure/env.sh` EDC image refs.
2. New ACA app `mvhd-siglet` (postgres-vault backend + real Vault token — NOT the dev flags).
3. `EDC_EVENTS_NATS_*` env on the four EDC apps; verify ACA NATS JetStream volume.
4. Snapshot the Azure `controlplane` Postgres DB (0.17 agreement-claims migration), then roll.
5. Set `EDC_MGMT_API_VERSION=v5beta` on `mvhd-ui`.
