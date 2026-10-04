# Runbook: moving Azure to the EDC 0.18 build (ADR-054)

Moves the five EDC apps on `rg-mvhd-dev` from the April build
(`jad-*:2026-04-14`) to the build compose and CI run (`jad-*:4a7e5bd096c5`),
so CFM onboarding works on Azure (#503). Each phase is checked before the
next one starts. Rollback is per app: activate its previous revision, which
still names the April image and the April database.

Run it inside office hours (ADR-053), with a fresh `az login`, and announce
that onboarding, credentials and the TCK page are down for the window.

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

### 0. Images (done 2026-10-04)

`scripts/azure/import-jad-images.sh` copied the four images into ACR as
`:4a7e5bd096c5` and read them back. No app changed.

### 1. Fresh databases

Create `controlplane_v018`, `dataplane_v018`, `dataplane_omop_v018`,
`identityhub_v018`, `issuerservice_v018` on `mvhd-pg-b53a0449`. The
maintainer account cannot create databases (Container Apps Contributor only),
so this is a workflow run as the CI identity, like `retire-pg-data-share.yml`.
Check: `az postgres flexible-server db list` lists all five.

### 2. Vault

Into the Azure Vault, through the bootstrap job of `06-post-deploy.sh`:

- the `participants/` KV mount and the `issuer` JWT role the 0.18 issuer
  reads its key through (compose: `jad/bootstrap-vault.sh`);
- a freshly generated Ed25519 key for `did:web:mvhd-issuerservice%3A10016:issuer#key-1`,
  never the compose key, which is in the repository;
- `statuslist-signing-key`.
  Check: the job reports each write, and a second run reports each as kept.

### 3. Apps, one at a time, control plane first

Per app: new revision with the 0.18 image, the settings compose has and
Azure lacks, and the `_v018` database URL. The issuer also gets 10015 and
10016 as `additionalPortMappings`. Check after each: the revision is healthy,
and its log shows no `SEVERE` and no `Configuration object ... is required`.

Order: control plane, IdentityHub, IssuerService, data plane FHIR, data plane
OMOP. A data plane registers with the control plane on start
(`configure-data-planes.sh`), so it goes last.

### 4. The issuer's identity

From inside the environment (an ACA job, or `az containerapp exec` into
`mvhd-cfm-cp-shim`, which has curl):

- `POST http://mvhd-issuerservice:10015/api/identity/v1alpha/participants`
  with the manifest from `scripts/seed-issuer-identity.sh`, DID and endpoints
  rewritten to `mvhd-issuerservice`;
- the activation records of `jad/seed-issuer-identity.sql`, then a restart;
- the credential definitions `jad/seed-jad.sh` creates.
  Check: `http://mvhd-issuerservice:10016/issuer/did.json` answers with a
  verification method.

### 5. Shim, UI, re-seed

- `jad/cfm-cp-shim-azure.conf`: forward `v5alpha` to `v5beta`, redeploy
  the shim (`05-cfm-agents.sh` deploys it).
- `mvhd-ui`: `EDC_MGMT_API_VERSION=v5beta` (it is `v4alpha` today, set by
  `05-cfm-ui.sh`).
- Re-seed: `edc-seed-participants.yml` (IdentityHub), `edc-seed-cp-participants.yml`
  (control plane; it probes the version), `vault-bootstrap-participant-keys.yml`,
  `cfm-seed.yml`, then the issuer holders.

### 6. Checks

1. `scripts/azure/check-keycloak-health.sh` exits 0.
2. `./scripts/run-api-tests.sh Azure-Dev`: no new failures against the run
   before the window.
3. Register a fictional participant at https://ehds.mabu.red/onboarding:
   all three activities reach `active`, and
   `az containerapp logs show -n mvhd-cfm-regagent -g rg-mvhd-dev --tail 50`
   shows no `Error processing message`.

## Rollback

Per app, `az containerapp revision activate` on the previous revision, then
deactivate the 0.18 one. The April databases are untouched until a week after
the window; after that a note on #503 and the same workflow drops them.

## Known after the move

In 0.18's virtual mode the DSP provider side answers 404 for every path
(#345, local stack). Azure has never completed a negotiation (#180), so
nothing regresses, but #345 becomes the next blocker on both stacks.
