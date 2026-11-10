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
- [x] A rollback rehearsal: the 0.18 images on the old databases and keys, the suites at their floors again. On 2026-11-09 (#927), from the compose files of `80fea9ad^` and with no new seed: identity 27/0/0, dataspace 32/0/1, health domain 27/0/3. Forward again on `main`: identity 31/0/0 (the suite has grown since), dataspace 32/0/1, health domain 27/0/3. How, and why not `ba42e85^`: [the EDC runtimes README](../../../runtimes/edc/README.md#back-to-018-on-the-compose-stack).

## Azure, in order

Every step names its gate. A failed gate stops the run; the next step does not start. The `az` session lasts an hour (conditional access); log in again before each block.

**0. Window.** 07:00 to 20:00 Berlin, when ADR-053 runs the apps; no demo, no load test. Run `az login` with the PIM role active. Gate: `scripts/azure/check-keycloak-health.sh` exits 0.

**1. Save and look.** `scripts/azure/migrate-edc-to-v1.sh backup`, then `check`. Gate: eight YAML files in `~/.mvhd/edc-v1-rollback/latest`, and `check` shows the 0.18 images on the `_v018` databases.

**2. Keycloak.** `scripts/azure/wire-keycloak-edc1-scopes.sh`, then `--check`. Gate: the three admin scopes are on admin and provisioner, the issuer's `sub` mapper is present, and the 0.18 compliance job still passes.

**3. Images and databases.**

- `DOCKER_CONTEXT=orbstack scripts/azure/push-edc1-images.sh build`, then `push`. It prints `EDC1_TAG`; the images built on 2026-11-05 are `1.0.0-RC5-2fed8ce5b44e`.
- The workflow **EDC 1.0 databases** (`edc-v1-databases.yml`, PR #906 merged first), run as the CI identity.
- Gate: `push-edc1-images.sh check` lists the tag, and the workflow summary lists four databases present.

**4. EDC apps, one at a time.** `EDC1_TAG=<tag> scripts/azure/migrate-edc-to-v1.sh app controlplane`, then `identityhub`, then `issuerservice`. Each one runs the launcher image on its `_v1` database, with `prefix.mapping` and policy validation on. Gate per app: the revision is Healthy and its log has no `SEVERE` at boot. Then `scripts/azure/set-edc-log-level.sh`: the launcher's own command logs with ANSI colour codes, and the script appends `--log-level=info --no-color`. Every `app` run writes the plain command back, so run the script again after one.

**5. siglet.** `migrate-edc-to-v1.sh siglet` (0.1.6, `siglet_v1`, pull endpoint `https://<proxy>/dataspace/data`). Gate: `scripts/azure/17-siglet.sh --check` passes, and ports 8081 to 8083 are exposed.

**6. UI and proxy.** Merge `feat/edc-1.0-rc` into `main`; `deploy-azure.yml` builds and rolls both apps. Then run `migrate-edc-to-v1.sh proxy` and `ui`, which set the JWKS and the 1.0 addresses. Gate: both revisions are Healthy, and `/api/participants` lists contexts and does not answer 502.

**6b. Settings against the local stack.** `migrate-edc-to-v1.sh diff` (read-only). It compares the names of the settings the control plane, IdentityHub, IssuerService and siglet run with on Azure against those the compose files give the local 1.0 stack, the one the suites passed on, and fails on a deprecated name or on a difference not listed with its reason in the script. Values are not compared: they differ by host, and some are secrets. Gate: it exits 0. On 2026-11-06 this step was missing: the local gate was green while the control plane still carried the 0.18 key `edc.iam.trusted-issuer`, and every DSP request between participants answered 401 after the seeds (#881 finding 26). Against the definition saved before the cutover, `diff` names that key, the four `prefix-mapping` keys and the missing policy validation. It needs Docker for `docker compose config`, not a running local stack.

**7. Seeds.** Three runs, each after the one before it has succeeded. The workflows run from `main`, so step 6 comes first.

1. `scripts/azure/seed-issuer-identity-azure.sh seed`, then `verify` (job `mvhd-issuer-identity`): the issuer's key, context and credential definitions on `issuerservice_v1`. Gate: the issuer's DID resolves. `EDC_LINE=v1` is the default and applies no activation SQL: 1.0 activates the context through the identity API (state 200), and the 0.18 SQL would set it to 300. `EDC_LINE=v018` is for a rollback.
2. `edc-reseed-identity-layer.yml`, `plan` then `apply`: the five demo participants with `did:web:mvhd-identityhub%3A7083:<slug>`, through the compose sequence (contexts, IdentityHub records, context config with the DSP profile link, STS secrets, holders, a MembershipCredential each). Gate: the job ends with "OK: the five demo participants carry ... DIDs and hold a credential".
3. `edc-seed-data-assets.yml`, `plan` then `apply`: the standard policies (ADR-077), assets, contract definitions and each context's siglet data plane. Gate: `plan` afterwards lists assets and contract definitions for every context.

Negotiations and the federated catalogue have no Azure seed, as on 0.18: Bruno's live flow and the crawler make them. The IdentityHub contexts come up active from their manifests (`active: true`); the control plane contexts stay `CREATED`, which the hub accepts (#878, #891). The addresses match those `migrate-edc-to-v1.sh ui` sets (checked 2026-11-06).

**8. Re-onboard and check.**

- Onboard the former CFM participants through the hub's onboarding page. On 2026-11-06 CFM held six tenants; two were working participants and were onboarded again (Ostsee Klinikum Rostock, Stadtkrankenhaus Lichtenberg: 201, seven steps, a MembershipCredential each). The other four had no DID on Azure: failed test registrations, as #574 removed.
- Run the compliance ACA job (`target=azure`) at the Azure floors.
- Run the hub's own paths, which the #876 work put on `main`:
  - `/api/participants` lists the contexts. They stay `CREATED` on 1.0, and the route falls back to them (#878, #891).
  - `/api/negotiations` sends the offer's policy whole, to the server's DSP address. A stale context id answers 409.
  - `/api/agreements/{id}` gives the period and the policy for Details.
- Run Bruno `Azure-Dev` `03 Data User` 15 to 22 with the live DSP flow (`dspLiveFlow`, on for Azure-Dev): catalogue, FINALIZED, STARTED, data, agreement.
  - The skip on 21, the certificate-demo 404, is gone: the proxy serves the data (2026-11-06).
  - 23 to 26, the SPE import, count on Azure only while the chosen workspace runs (Matthias, 2026-11-06: the import is accepted as a demo for now). A 503 because the workspace is stopped or starting is expected, not a failure. The workspaces start on demand (ADR-072) and keep their store in tmpfs, so an import is lost when the workspace stops; that is accepted. The attested path (a sealed extract loaded after the Trustee releases the key, ADR-068) is a separate issue.
- Run Playwright J1090 and J1091 (`journeys/53`) in Demo Smoke.
- Run one transfer whose data opens, and one new onboarding from the UI.

What the first cutover (2026-11-06) found after the seeds, both fixed in the scripts:

- **Every DSP request between participants answered 401.** Azure's control plane still carried `edc.iam.trusted-issuer.*`: #754 moved the scripts to `edc.iam.trustedissuer` but never redeployed the app, and 0.18 kept reading the deprecated key. 1.0 reads only `trustedissuer`, so it trusted no issuer. `migrate-edc-to-v1.sh` now renames the key. Seen as Bruno 03/16 and the DSP suite's CAT-1.1 to 1.3; 1.0 logs nothing about why.
- **Every transfer ended TERMINATED** with "Refresh endpoint rejected by policy: scheme must be https". siglet's running revision had mounted the 0.18 `siglet.toml`, without `[token.refresh_endpoint_policy] allow_http`: `17-siglet.sh` wrote the new file after starting the revision, and the update that followed started none. The script now restarts the revision after it writes the file.

## The control plane restarts when NATS loses its task streams (ADR-084)

A new `mvhd-nats` revision or replica deletes `cn-stream` and `tp-stream`, and every negotiation answers 500 until the control plane restarts ([ADR-084](../../ADRs/ADR-084-the-control-plane-restarts-when-its-nats-task-streams-are-gone.md), `docs/gotchas.md` 2026-11-09). The launcher's liveness check reports the missing streams, and the control plane's liveness probe restarts it. To roll it out, in the window of step 0:

1. `migrate-edc-to-v1.sh backup`, so `rollback controlplane` returns to the running 1.0 definition.
2. `DOCKER_CONTEXT=orbstack scripts/azure/push-edc1-images.sh build`, then `push`. It prints the new `EDC1_TAG`.
3. `EDC1_TAG=<tag> scripts/azure/migrate-edc-to-v1.sh app controlplane`, then `set-edc-log-level.sh`. The revision gets the image and three probes: startup on `/api/check/startup`, liveness on `/api/check/liveness` (every 30 s, failing after 3), readiness on TCP 8080.
4. Gate: the revision is Healthy, and its liveness lists the streams:

   ```bash
   script -q /dev/null az containerapp exec -n mvhd-controlplane -g rg-mvhd-dev \
     --command "wget -qO- http://127.0.0.1:8080/api/check/liveness"
   ```

   The answer has a component `NATS task streams` with `"isHealthy":true`. `exec` needs a terminal, hence `script`.

5. Drill, optional, about two minutes of 500s: `az containerapp revision restart -n mvhd-nats -g rg-mvhd-dev --revision <its active revision>`. Gate: the control plane's system log shows `ProbeFailed` three times, then `ContainerTerminated` with reason `ProbeFailure` and a new `ContainerStarted`; both streams are back; Bruno `Azure-Dev` `03 Data User` passes.

Done on 2026-11-09: images `1.0.0-RC5-9be6b44cd517`, revision `mvhd-controlplane--0000198`, backup `~/.mvhd/edc-v1-rollback/20261109T155944Z` (revision 196). The drill passed: two minutes from the NATS restart to both streams back, then `03 Data User` 26 of 26 (timeline in `docs/gotchas.md`, 2026-11-09).

A script that changes `mvhd-nats` (`04-edc-services.sh`) restarts the control plane after it (`restart_controlplane_after_nats_change` in `env.sh`). Anything else that touches NATS, an image change by hand included, leaves it to the probe: about two minutes of 500s. `MVHD_NATS_TASKSTREAMS_LIVENESS_ENABLED=false` on the control plane turns the check off.

## Rollback

The way back to 0.18 is closed since 2026-11-09 (#927): the CFM apps and the 0.18 data planes are deleted, and `edc-retire-v018-azure.yml` (#927 step 6, PR #1048) drops the `_v018` databases. What follows is the record of the cutover's rollback, not a step to take.

- **EDC apps and siglet:** `migrate-edc-to-v1.sh rollback <name>` for each app, newest first. The saved definitions name the 0.18 images and the `_v018` databases, which 1.0 never wrote, and the 0.18 keys are still in Vault.
- **UI and proxy:** revert the merge on `main`. Their saved definitions name `:latest`, which the merge moved; `rollback ui` and `rollback proxy` only restore the settings.
- **Keycloak:** the additions stay; 0.18 ignores them.
- **Databases:** keep the `_v1` databases until the cause is understood.

## After a stable cutover

- Done 2026-11-09 (#927): retire the CFM apps (tenant manager, provision manager, the four agents, the shim) and the 0.18 data planes `mvhd-dp-fhir` and `mvhd-dp-omop` (ADR-078).
- Done: remove the CFM views from `/api/admin/components` and `/topology`.
- Drop the `_v018` databases once the final 1.0 runs: the guarded workflow `edc-retire-v018-azure.yml` (#927 step 6, PR #1048).

CFM itself stays, as eclipse-cfm releases ([ADR-085](../../ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md)); until its step 3 the hub's own provisioning is the default.

## Known limits on 1.0, as on the local stack

- siglet cannot renew an access token after its hour (#881 finding 23, #888). A pull after that needs a new transfer.
- The EHDS policy constraints are declared, not enforced (finding 21), as on 0.18.
- Upstream: the hidden key-alias error (finding 18), and whether 1.0 can log why an issuer is refused (TRUST-6.4).
