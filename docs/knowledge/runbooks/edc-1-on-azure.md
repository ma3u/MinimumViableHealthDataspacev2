---
type: runbook
title: Moving Azure from EDC 0.18 to EDC 1.0
description: What crosses over, what is rebuilt, what stays as the archive, and the gated steps, commands and rollback of the 1.0 cutover on rg-mvhd-dev.
resource: issue #881, ADR-078, ADR-055 (the 0.18 move this follows), branch feat/edc-1.0-rc
tags: [runbook, edc, azure, migration]
status: draft
---

# Runbook: moving Azure from EDC 0.18 to EDC 1.0 (#881)

It follows the 0.18 move ([edc-v018-on-azure](edc-v018-on-azure.md)): fresh databases beside the old ones, each app's definition saved first, rollback per app. [ADR-078](../../ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md) decides the shape:

- Container Apps stay.
- CFM leaves; the hub provisions participants itself.
- siglet is the data plane, and the proxy's `/dataspace/data` is the transfer endpoint.

Matthias approves every step that changes Azure. Nothing runs during a live demo or a load test, and nothing merges to `main` while a live job runs. Pin the Docker engine for every local command (`DOCKER_CONTEXT=orbstack`).

Azure runs 1.0.0-RC5 until the final 1.0.0 is tagged (Matthias, 2026-11-05: "start with Azure"). The final is the same procedure with a new `EDC1_TAG`.

## What happens to the data

EDC ships no migration from 0.18 to 1.0, and the schemas differ, so nothing is migrated in place.

| Data                                   | On 0.18                                                       | On 1.0                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EDC databases                          | `controlplane_v018`, `identityhub_v018`, `issuerservice_v018` | **new** `_v1` databases (workflow `edc-v1-databases.yml`). The `_v018` ones are not written again: they are the archive and the rollback                                                        |
| siglet                                 | database `siglet`, 0.18 transfer types                        | **new** `siglet_v1` (0.1.6 refuses a database a newer build migrated); pull endpoint is the proxy                                                                                               |
| Participants (5 demo)                  | contexts on 0.18                                              | **re-created** by the seeds; same `did:web` identifiers, new context ids                                                                                                                        |
| Participants onboarded through CFM     | CFM tenants                                                   | **re-onboarded through the hub** (`POST /api/participants`, ADR-078) from their names and roles                                                                                                 |
| Keys                                   | Vault, under `<did>#key1`                                     | **new keys**: the seeds use `<did>#key1@<context id>`, the hub uses `<context id>-key1` (the compose Vault's file storage limits names; measured 2026-11-05). The 0.18 keys stay for a rollback |
| Credentials                            | IdentityHub                                                   | **re-issued** over DCP by the seeds and the hub                                                                                                                                                 |
| Assets, policies, contract definitions | 0.18 control plane                                            | **re-seeded**                                                                                                                                                                                   |
| Negotiations, agreements, transfers    | 0.18 control plane                                            | **not migrated**. They stay readable in the `_v018` databases. The DSP audit trail in Neo4j keeps its records; links to an old agreement answer 404 on 1.0                                      |
| Keycloak realm                         | Postgres                                                      | **changed in place** by `scripts/azure/wire-keycloak-edc1-scopes.sh`; 0.18 ignores the additions                                                                                                |
| Neo4j graph, audit chain               | Neo4j                                                         | **unchanged**                                                                                                                                                                                   |

## Green locally before Azure

- [x] The three suites at the 0.18 floors from empty `_v1` databases: identity 27/0/0, dataspace 32/0/1, health domain 27/0/3 (`5d7f2084`).
- [x] The hub's flows: Bruno `03 Data User` with `BRUNO_DSP_LIVE=1`, Playwright J1090 and J1091.
- [x] A new participant onboarded through the hub on 1.0: 201 with 7 steps, MembershipCredential within 6 s, DID resolves (`21aae2a1`).
- [x] The Keycloak delta on a 0.18 realm, applied twice, tokens unchanged for 0.18.
- [ ] A rollback rehearsal: the 0.18 images on the old databases and keys, the suites at their floors again.

## Azure, in order

Every step names its gate. A failed gate stops the run; the next step does not start. The `az` session lasts an hour (conditional access); log in again before each block.

**0. Window.** 07:00 to 20:00 Berlin, when ADR-053 runs the apps; no demo, no load test. Run `az login` with the PIM role active. Gate: `scripts/azure/check-keycloak-health.sh` exits 0.

**1. Save and look.** `scripts/azure/migrate-edc-to-v1.sh backup`, then `check`. Gate: eight YAML files in `~/.mvhd/edc-v1-rollback/latest`, and `check` shows the 0.18 images on the `_v018` databases.

**2. Keycloak.** `scripts/azure/wire-keycloak-edc1-scopes.sh`, then `--check`. Gate: the three admin scopes are on admin and provisioner, the issuer's `sub` mapper is present, and the 0.18 compliance job still passes.

**3. Images and databases.**

- `DOCKER_CONTEXT=orbstack scripts/azure/push-edc1-images.sh build`, then `push`. It prints `EDC1_TAG`; the images built on 2026-11-05 are `1.0.0-RC5-2fed8ce5b44e`.
- The workflow **EDC 1.0 databases** (`edc-v1-databases.yml`, PR #906 merged first), run as the CI identity.
- Gate: `push-edc1-images.sh check` lists the tag, and the workflow summary lists four databases present.

**4. EDC apps, one at a time.** `EDC1_TAG=<tag> scripts/azure/migrate-edc-to-v1.sh app controlplane`, then `identityhub`, then `issuerservice`. Each one runs the launcher image on its `_v1` database, with `prefix.mapping` and policy validation on. Gate per app: the revision is Healthy and its log has no `SEVERE` at boot.

**5. siglet.** `migrate-edc-to-v1.sh siglet` (0.1.6, `siglet_v1`, pull endpoint `https://<proxy>/dataspace/data`). Gate: `scripts/azure/17-siglet.sh --check` passes, and ports 8081 to 8083 are exposed.

**6. UI and proxy.** Merge `feat/edc-1.0-rc` into `main`; `deploy-azure.yml` builds and rolls both apps. Then run `migrate-edc-to-v1.sh proxy` and `ui`, which set the JWKS and the 1.0 addresses. Gate: both revisions are Healthy, and `/api/participants` lists contexts and does not answer 502.

**7. Seeds**, in the order of the local run: participants, IdentityHub, context config and DSP profile, issuer identity, holders, definitions, credentials, policies, assets, negotiations, federated catalogue. Gate: each script exits 0. The Azure seed path on 1.0 (`05-cp-participants.sh`, `seed-data-assets-job.sh` with `MGMT_V=v5`) has not been run yet; read each script's 1.0 changes from `scripts/` on the branch first.

**8. Re-onboard and check.**

- Onboard the former CFM participants through the hub's onboarding page.
- Run the compliance ACA job (`target=azure`) at the Azure floors.
- Run Bruno `Azure-Dev` with the live DSP flow, and Playwright J1090 and J1091 in Demo Smoke.
- Run one transfer whose data opens, and one new onboarding from the UI.

## Rollback

- **EDC apps and siglet:** `migrate-edc-to-v1.sh rollback <name>` for each app, newest first. The saved definitions name the 0.18 images and the `_v018` databases, which 1.0 never wrote, and the 0.18 keys are still in Vault.
- **UI and proxy:** revert the merge on `main`. Their saved definitions name `:latest`, which the merge moved; `rollback ui` and `rollback proxy` only restore the settings.
- **Keycloak:** the additions stay; 0.18 ignores them.
- **Databases:** keep the `_v1` databases until the cause is understood.

## After a stable cutover

- Retire the CFM apps (tenant manager, provision manager, the four agents, the shim) and the 0.18 data planes `mvhd-dp-fhir` and `mvhd-dp-omop` (ADR-078).
- Remove the CFM views from `/api/admin/components` and `/topology`.
- Drop the `_v018` databases once the final 1.0 runs (a guarded workflow, as `drop-edc-april-databases.sh`).

## Known limits on 1.0, as on the local stack

- siglet cannot renew an access token after its hour (#881 finding 23, #888). A pull after that needs a new transfer.
- The EHDS policy constraints are declared, not enforced (finding 21), as on 0.18.
- Upstream: the hidden key-alias error (finding 18), and whether 1.0 can log why an issuer is refused (TRUST-6.4).
