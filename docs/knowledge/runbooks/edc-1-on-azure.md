---
type: runbook
title: Moving Azure from EDC 0.18 to EDC 1.0
description: What crosses over, what is rebuilt, what is archived, and the gated steps and rollback of the 1.0 cutover on rg-mvhd-dev.
resource: issue #881, ADR-076, ADR-055 (the 0.18 move this follows), branch feat/edc-1.0-rc
tags: [runbook, edc, azure, migration]
status: draft
---

# Runbook: moving Azure from EDC 0.18 to EDC 1.0 (#881)

A draft until the local rehearsal has passed (section "Rehearsal"). It
follows the 0.18 move ([edc-v018-on-azure](edc-v018-on-azure.md)): fresh
databases next to the old ones, each app's definition saved first, rollback
per app. Matthias approves every step that changes Azure; nothing runs during
a live demo or a load test, and no merge to `main` while a live job runs.

## What happens to the data

EDC ships no migration from 0.18 to 1.0, and the schemas differ (stateful
entity versioning, leases on the entities, flattened stores), so nothing is
migrated in place.

| Data                                                                    | 0.18 locally, as a stand-in for Azure                                  | On 1.0                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EDC databases (control plane, IdentityHub, IssuerService, test issuers) | `controlplane`, `identityhub`, `issuerservice`, ... (`_v018` on Azure) | **new** `_v1` databases; the old ones stay untouched for a rollback                                                                                                                                |
| Participants (5 demo)                                                   | 9 contexts in all                                                      | **re-created** by the seeds; same `did:web` identifiers, new context ids                                                                                                                           |
| Participants onboarded through CFM                                      | 4 of the 9 (Riverside General, HealthGov, ...)                         | **re-onboarded** through CFM from an export of the 0.18 tenants (names, roles, DIDs); needs CFM on eclipse-cfm images first                                                                        |
| Keys                                                                    | Vault, under `<did>#key1`                                              | **new keys** under `<did>#key1@<context id>`; the 0.18 keys stay for a rollback (finding 18)                                                                                                       |
| Credentials                                                             | 88 in the IdentityHub, 83 issued                                       | **re-issued** over DCP by the seeds                                                                                                                                                                |
| Assets, policies, contract definitions                                  | 9, 19, 8                                                               | **re-seeded** (`jad/seed-ehds-policies.sh`, `jad/seed-data-assets.sh`, `jad/seed-federated-catalog.sh`)                                                                                            |
| Negotiations, agreements, transfers                                     | 30, 26, 18                                                             | **archived, not migrated**: exported to JSON before the cutover; the DSP audit trail in Neo4j keeps its records. Links from the audit trail or an SPE import to an old agreement answer 404 on 1.0 |
| CFM state (tenants, profiles, VPAs)                                     | `cfm` database                                                         | **new** CFM database: the old one says "deployed" for participants 1.0 does not have                                                                                                               |
| Keycloak realm                                                          | Postgres                                                               | **changed in place** by `scripts/azure/wire-keycloak-edc1-scopes.sh`; 0.18 ignores the additions, so they stay through a rollback                                                                  |
| Neo4j graph, audit chain                                                | Neo4j                                                                  | **unchanged**                                                                                                                                                                                      |

## Before the cutover: what must be green locally

Each from empty `_v1` databases, seeded only by the repository's scripts
(the "from scratch" row in #881):

1. The three suites at the 0.18 floors: identity 27/0/0, dataspace 32/0/1,
   health domain 27/0/3. **Green on 2026-11-05 (`5d7f2084`).**
2. The hub's flows: Bruno `03 Data User` with `BRUNO_DSP_LIVE=1`, Playwright
   J1090 and J1091. **Green on 2026-11-05**, apart from a stale test image and
   an Azure-only assertion (#881).
3. **CFM onboarding of a new tenant on 1.0. Open (finding 22):** the
   2026-03 CFM agents call the IdentityHub's and IssuerService's `v1alpha`
   APIs, which answer 404 on 1.0. eclipse-cfm v0.0.6 calls `v1` and `v5`;
   moving to its images is ADR-076 decision 3.
4. The Keycloak delta on a 0.18 realm: `wire-keycloak-edc1-scopes.sh` adds the
   three admin scopes and the issuer's `sub`, a second run changes nothing,
   and the tokens keep the claims 0.18 reads. **Green on 2026-11-05.**
5. A rollback rehearsal: the 0.18 images on the old databases and keys, the
   suites at their floors again.
6. CI builds and labels the launcher images (ADR-076 decision 4).

## Rehearsal (local)

From the local 0.18 stack, exactly the Azure order below with compose in
place of `az containerapp`: archive, Keycloak delta, `_v1` databases
(`jad/init-postgres-edc1.sql`), `docker-compose.edc1.yml`, seeds, CFM
re-onboarding, checks; then the rollback, and the checks again on 0.18.
Pin the Docker engine (`DOCKER_CONTEXT=orbstack`) for every command: another
session switching the current context sent a restart to the wrong engine on
2026-11-05.

## Azure, in order

Every step names its gate. A failed gate stops the run; the next step does
not start.

0. **Window.** Office hours (ADR-053), no demo, no load test. `az login`, PIM
   role, `scripts/azure/check-keycloak-health.sh` exits 0.
1. **Archive.** Export negotiations, agreements and transfers of every
   participant from the 0.18 Management API to JSON, and `pg_dump` the 0.18
   EDC and CFM databases. Gate: one file per participant, row counts match
   the databases.
2. **Save the definitions** of the EDC apps, siglet, the CFM apps and the UI
   (as `migrate-edc-to-v018.sh backup` did). Gate: one YAML per app.
3. **Keycloak.** `scripts/azure/wire-keycloak-edc1-scopes.sh`, then `--check`.
   Gate: the three admin scopes on admin and provisioner, the issuer's `sub`
   mapper present, and 0.18 still answers the compliance job.
4. **Databases.** `_v1` databases on the Flexible Server, and a new CFM
   database. Gate: empty, owned by the apps' users.
5. **Apps, one at a time**, each a new revision: control plane, IdentityHub,
   IssuerService (1.0 launcher images, `_v1` databases, the settings of
   `docker-compose.edc1.yml`: `prefix.mapping`, policy validation on), siglet
   0.1.6 (`jad/siglet-edc1.toml`, Postgres store, signaling and token API
   authentication on), neo4j-proxy (`/dataspace/data`), CFM managers and
   agents (eclipse-cfm), UI (`EDC_MGMT_API_VERSION=v5`,
   `EDR_DATA_URL` and `EDR_DATA_HOSTS` for the proxy). Gate per app: healthy,
   no `SEVERE` at boot.
6. **Seeds**, the order of the local run: participants, IdentityHub, context
   config and DSP profile, issuer identity, holders, definitions, credentials,
   the Simpl test issuer, policies, assets, negotiations, federated catalogue.
   Gate: each script exits 0.
7. **CFM re-onboarding** of the archived tenants. Gate: every VPA `active`,
   every DID resolves.
8. **Checks.** Compliance ACA job (`target=azure`) at the Azure floors,
   Bruno `Azure-Dev` with the live DSP flow, Playwright J1090 and J1091 in
   Demo Smoke, one transfer whose data opens, one new onboarding from the UI.

## Rollback

Per app, from the definitions saved in step 2: they name the 0.18 images and
the old databases, which 1.0 never wrote, and the 0.18 keys are still in
Vault. The Keycloak additions stay; 0.18 ignores them. Keep the `_v1`
databases until the cause is understood.

## Open before this runbook leaves draft

- CFM on eclipse-cfm images, and a new onboarding on 1.0 (finding 22).
- The archive export and a `migrate-edc-to-v1.sh` (backup, apps, rollback),
  written against the local rehearsal.
- The rollback rehearsal.
- siglet with its Postgres store and authentication on (findings 13, 9).
- Upstream: the hidden key-alias error (finding 18) and whether 1.0 can log
  why an issuer is refused (TRUST-6.4).
