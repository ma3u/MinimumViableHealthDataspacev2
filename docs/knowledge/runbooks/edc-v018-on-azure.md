# Runbook: moving Azure to the EDC 0.18 build (ADR-055)

Moves the five EDC apps on `rg-mvhd-dev` from the April build
(`jad-*:2026-04-14`) to the build compose and CI run (`jad-*:4a7e5bd096c5`),
so CFM onboarding works on Azure (#503). Each phase is checked before the
next one starts. Rollback is per app, from the definition saved before the
change, which names the April image and the April database.

Run it inside office hours (ADR-053). Before starting:

- `az login`, then `az account set --subscription INF-STG-EU_EHDS`;
- activate the PIM role `rol-ssg-prd-project_owner` (the issuer job in phase 4
  needs it: Container Apps Contributor has no action for jobs);
- the database workflow is on `main` since #517 merged (OIDC runs only
  there);
- announce that onboarding, credentials and the TCK page are down for the window.

Sign-in, the graph and the patient views do not depend on the EDC services.

## What differs, measured 2026-10-04

|                                                       | April build (live) | 0.18 build (compose, CI)                                                                                                    |
| ----------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Management API                                        | `v4alpha`          | `v5beta`                                                                                                                    |
| Participant config (`PUT …/participants/{id}/config`) | 500, no equivalent | present                                                                                                                     |
| IssuerService path ids                                | base64-decoded     | plain                                                                                                                       |
| Required settings                                     | none of the below  | NATS event stream `EDC_EVENTS_NATS_*` (the connector does not start without it), DCP scopes, trusted issuer, participant id |
| Issuer ports                                          | admin 10013 only   | also identity 10015, DID 10016, issuance 10012, STS 10011, status list 9999                                                 |
| Image command                                         | `-jar <name>.jar`  | same jars, plus `-javaagent:opentelemetry-javaagent.jar`                                                                    |

The live commands come from `set-edc-log-level.sh` and leave the OpenTelemetry
agent out. Keep it that way until #418 gives Azure a collector; otherwise the
agent logs export errors to `localhost:4317`.

## Phases

All commands from the repository root, with `export KEYCLOAK_PUBLIC_HOSTNAME=auth.ehds.mabu.red`.

### 0. Images (done 2026-10-04)

`scripts/azure/import-jad-images.sh` copied the four images into ACR as
`:4a7e5bd096c5` and read them back. No app changed.

### 1. Fresh databases

```bash
gh workflow run edc-v018-databases.yml --ref main
```

Runs `scripts/azure/create-edc-v018-databases.sh` as the CI identity.
Check: the run log ends with `all five 0.18 databases exist`.

### 2. Save every app's definition

```bash
scripts/azure/migrate-edc-to-v018.sh check    # all five on jad-*:2026-04-14
scripts/azure/migrate-edc-to-v018.sh backup   # to ~/.mvhd/edc-v018-rollback/<time>
```

### 3. Apps, one at a time

```bash
scripts/azure/migrate-edc-to-v018.sh app controlplane
scripts/azure/migrate-edc-to-v018.sh app identityhub
scripts/azure/migrate-edc-to-v018.sh app issuerservice
scripts/azure/17-siglet.sh                        # the data planes need it first
scripts/azure/migrate-edc-to-v018.sh app dp-fhir
scripts/azure/migrate-edc-to-v018.sh app dp-omop
```

The 0.18 data plane launcher refuses to start without `edc.iam.siglet.*` and
`edc.events.nats.*` (#542, #574): two attempts on 2026-10-05 were rolled back
for exactly that. `17-siglet.sh` creates `mvhd-siglet` (database `siglet`,
storage `postgres-vault`, the transit key `signing-siglet`, internal ingress
on 8080), and the data planes get `EDC_IAM_SIGLET_JWKS_URL=http://mvhd-siglet/keys`.
Check that siglet is Healthy before moving a data plane:

```bash
scripts/azure/17-siglet.sh --check
az containerapp logs show -n mvhd-siglet -g rg-mvhd-dev --tail 30 --follow false
```

Each writes one revision (image, `_v018` database, the compose settings, and
for IdentityHub and IssuerService the new ports) and waits for it to be
Healthy. After each, read its log before going on:

```bash
az containerapp logs show -n mvhd-controlplane -g rg-mvhd-dev --tail 80 --follow false | grep -E 'SEVERE|required|Exception' | head
```

Nothing should match. `Configuration object ... is required` means a missing
setting: add it to `settings()` in the script and run the step again.

### 4. The issuer's identity

```bash
scripts/azure/seed-issuer-identity-azure.sh seed     # key, context, activation, definitions
scripts/azure/seed-issuer-identity-azure.sh verify   # restart, then the DID must resolve
```

Both run the job `mvhd-issuer-identity` inside the environment and print its
log. Check: `verify` ends with `resolves with 1 verification method(s)` and
`Succeeded (verify)`.

### 5. Agents, shim and UI

```bash
scripts/azure/05-cfm-agents.sh                 # shim to v5beta; EDC-V agent to IdentityHub :7085
scripts/azure/migrate-edc-to-v018.sh ui        # EDC_MGMT_API_VERSION=v5beta
```

The four CFM agents read their configuration from a mounted file once, at
start, and a changed secret makes no new revision. `05-cfm-agents.sh`
therefore restarts each agent that already existed (since #574); before
that, a rerun left them on the old configuration while their health stayed
green. Check that each agent's latest revision restarted:

```bash
for a in mvhd-cfm-kcagent mvhd-cfm-edcvagent mvhd-cfm-regagent mvhd-cfm-obagent; do
  az containerapp logs show -n "$a" -g rg-mvhd-dev --tail 5 --follow false | head -2
done
```

Then re-seed what the fresh databases do not have, from the Actions tab, each
after the one before it has succeeded:

1. `cfm-remove-tenants.yml`, `plan` then `apply`: failed test tenants out of
   IdentityHub (first: an onboarding still polling one stops only then, #577),
   the control plane, Keycloak and the CFM database (rows copied into
   `removed_tenants` and `removed_participant_profiles`). A tenant whose
   activities are all active is refused.
2. `edc-reseed-identity-layer.yml`, `plan` then `apply`: the five demo
   participants with `did:web:mvhd-identityhub%3A7083:<slug>`, through
   compose's own sequence (control plane, IdentityHub with generated keys, the
   STS secrets, holders, a MembershipCredential each). It mirrors every
   control-plane context, so step 1 goes first. It replaces
   `edc-seed-participants.yml`, whose script seeded the graph-layer DIDs and
   one shared fake key and now refuses to run (#574);
3. `cfm-seed.yml`: the cell, profile and activities onboarding reads.

### 6. Checks

The health probes prove nothing here: every app was green while onboarding
failed for weeks (#503). The check that counts is the last one, a real
registration after `cfm-seed.yml`.

1. `scripts/azure/check-keycloak-health.sh` exits 0.
2. `./scripts/run-api-tests.sh Azure-Dev`: no new failures against the run
   before the window.
3. Run `cfm-seed.yml` from the Actions tab (the cell, profile and activities
   onboarding reads), and wait for it to succeed.
4. Register a fictional participant at https://ehds.mabu.red/onboarding:
   all three activities reach `active`, and
   `az containerapp logs show -n mvhd-cfm-regagent -g rg-mvhd-dev --tail 50 --follow false`
   shows no `Error processing message`.

## Rollback

Per app, from the saved definition:

```bash
scripts/azure/migrate-edc-to-v018.sh rollback controlplane   # or identityhub, issuerservice, dp-fhir, dp-omop, ui
```

For the shim, check out `jad/cfm-cp-shim-azure.conf` from before #517 and run
`05-cfm-agents.sh`. The April databases stay untouched until a week after
the window; then a note on #503, and they are dropped.

## A fresh install

`04-edc-services.sh` still creates the apps the April way. On a new
environment: run it, then `create-edc-v018-databases.sh` and phases 2 to 5.

## Known after the move

In 0.18's virtual mode the DSP provider side answers 404 for every path
(#345, local stack). Azure has never completed a negotiation (#180), so
nothing regresses, but #345 becomes the next blocker on both stacks.
