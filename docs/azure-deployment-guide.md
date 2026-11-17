# Azure Deployment Guide: EHDS Integration Hub

> **Last updated:** 2026-11-12
> **Target platform:** Azure Container Apps (Consumption plan)
> **Region:** West Europe (a new Flexible Server may need North Europe, section 4.5)
> **Services:** EDC 1.0 (ADR-078), siglet, CFM from the fork (ADR-088), PostgreSQL Flexible Server
>
> **Section 4 is current**: the order that built the estate from an empty
> resource group on EDC 1.0, rehearsed end to end on 2026-11-11 (#927). So are
> the database and image tables in section 3 and the script table in section 5. The diagram in section 2 and the internal endpoint table in section 3
> still show the April 2026 deployment on EDC 0.18, with its two data planes
> and the 2026-03 CFM managers, which #927 deleted on 2026-11-09; for the EDC
> services on 1.0 see [edc-1-on-azure](knowledge/runbooks/edc-1-on-azure.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture Overview](#2-architecture-overview)
3. [Current Endpoints](#3-current-endpoints)
4. [Fresh Deployment (from scratch)](#4-fresh-deployment-from-scratch)
5. [Deployment Scripts Reference](#5-deployment-scripts-reference)
6. [Post-Deployment Setup](#6-post-deployment-setup)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Observability](#8-observability)
9. [Teardown](#9-teardown)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Tools

```bash
az version          # Azure CLI ≥ 2.60 with containerapp extension
docker version      # Docker with buildx (amd64 cross-compilation)
gh version          # GitHub CLI (for setting secrets)
java -version       # Java 21 (for Synthea patient generation, optional)
```

### Azure requirements

- An Azure subscription with `Contributor` access
- Resource providers registered: `Microsoft.App`, `Microsoft.ContainerRegistry`,
  `Microsoft.DBforPostgreSQL`, `Microsoft.OperationalInsights`
- Sufficient quota in target region for Container Apps Consumption plan

### Repository access

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2.git
cd MinimumViableHealthDataspacev2
```

---

## 2. Architecture Overview

```
                    Internet
                       │
            ┌──────────┴──────────┐
            │   Azure Container   │
            │   Apps Environment  │
            │   (mvhd-env)        │
            │                     │
   ┌────────┼────────┐   ┌───────┼────────┐
   │ mvhd-ui (3000)  │   │ mvhd-keycloak  │
   │ [EXTERNAL]      │   │ (8080)         │
   │ Next.js 14      │   │ [EXTERNAL]     │
   └────────┬────────┘   └───────┬────────┘
            │                     │
   ┌────────┴─────────────────────┴──────────────────────┐
   │                   INTERNAL NETWORK                   │
   │                                                      │
   │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
   │  │ neo4j-proxy │  │ controlplane │  │  vault     │  │
   │  │ (9090)      │  │ (8081)       │  │  (8200)    │  │
   │  └──────┬──────┘  └──────┬───────┘  └────────────┘  │
   │         │                │                            │
   │  ┌──────┴──────┐  ┌─────┴──────────────────────┐    │
   │  │ neo4j       │  │ dp-fhir │ dp-omop │ nats   │    │
   │  │ (7474/7687) │  │ (11002) │ (11012) │ (4222) │    │
   │  └─────────────┘  └────────┴─────────┴────────┘    │
   │                                                      │
   │  ┌──────────────┐  ┌─────────────┐  ┌────────────┐  │
   │  │ identityhub  │  │ issuer-     │  │ tenant-mgr │  │
   │  │ (7081)       │  │ service     │  │ (8080)     │  │
   │  └──────────────┘  │ (10013)     │  ├────────────┤  │
   │                     └─────────────┘  │ provision- │  │
   │                                       │ mgr (8080)│  │
   │                                       └────────────┘  │
   └───────────────────────────────────────────────────────┘
                           │
                  ┌────────┴────────┐
                  │  PostgreSQL     │
                  │  Flexible       │
                  │  (North Europe) │
                  │  pg-mvhd-dev    │
                  └─────────────────┘
```

### Resource inventory

| Resource      | Type                    | Location     | SKU             |
| ------------- | ----------------------- | ------------ | --------------- |
| `rg-mvhd-dev` | Resource Group          | West Europe  | n/a             |
| `acrmvhddev`  | Container Registry      | West Europe  | Basic           |
| `mvhd-env`    | ACA Environment         | West Europe  | Consumption     |
| `pg-mvhd-dev` | PostgreSQL Flex Server  | North Europe | B_Standard_B1ms |
| `mvhd-logs`   | Log Analytics Workspace | West Europe  | PerGB2018       |

---

## 3. Current Endpoints

### Public endpoints (internet-accessible)

| Service            | URL                                                                                                                      | Purpose                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **UI**             | https://ehds.mabu.red                                                                                                    | Next.js application, the main entry point  |
| **Keycloak**       | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io                                              | OIDC provider, realm: `edcv`               |
| **Keycloak Admin** | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io/admin/                                       | Admin console (user: `admin`, pw: `admin`) |
| **Keycloak OIDC**  | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io/realms/edcv/.well-known/openid-configuration | OIDC discovery document                    |
| **GitHub Pages**   | https://ma3u.github.io/MinimumViableHealthDataspacev2/                                                                   | Static export (demo/offline mode)          |

### Internal endpoints (ACA environment only)

| Service               | Internal FQDN                                                                       | Port  | Protocol |
| --------------------- | ----------------------------------------------------------------------------------- | ----- | -------- |
| **Neo4j** (Bolt)      | `mvhd-neo4j` (short app name, see note)                                             | 7687  | TCP      |
| **Neo4j Proxy**       | `mvhd-neo4j-proxy.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`   | 9090  | HTTP     |
| **Vault**             | `mvhd-vault.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`         | 8200  | HTTP     |
| **NATS**              | `mvhd-nats.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`          | 4222  | TCP      |
| **Control Plane**     | `mvhd-controlplane.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`  | 8081  | HTTP     |
| **DP FHIR**           | `mvhd-dp-fhir.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`       | 11002 | HTTP     |
| **DP OMOP**           | `mvhd-dp-omop.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`       | 11012 | HTTP     |
| **Identity Hub**      | `mvhd-identityhub.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`   | 7081  | HTTP     |
| **Issuer Service**    | `mvhd-issuerservice.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io` | 10013 | HTTP     |
| **Tenant Manager**    | `mvhd-tenant-mgr.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`    | 8080  | HTTP     |
| **Provision Manager** | `mvhd-provision-mgr.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io` | 8080  | HTTP     |

Neo4j is the exception in that table: it has TCP ingress with `targetPort` and
`exposedPort` 7687 and no `additionalPortMappings`, so there is no HTTP endpoint
on 7474; a row for one stood here and cost issue #205. (An
`additionalPortMappings: [7474]` experiment was tried and reverted on
2026-04-13; ADR-017 is about what that revert destroyed.) ACA routes
environment-local TCP by short app name only, so `bolt://mvhd-neo4j:7687` is the
address; the `*.internal.<domain>` FQDN is the HTTP ingress name and times out
on TCP. `scripts/azure/env.sh` exports it as `NEO4J_BOLT_URI`.

### Database endpoints (private)

The hub's Flexible Server, `mvhd-pg-b53a0449.postgres.database.azure.com`,
port 5432, TLS (ADR-041). Its databases, and the step that creates each
(`PG_DATABASES` in `env.sh`):

| Database                                                             | Created by                         | Used by                       |
| -------------------------------------------------------------------- | ---------------------------------- | ----------------------------- |
| `keycloak`, `cfm`                                                    | `13-postgres-flexible-server.sh 2` | Keycloak; CFM from the fork   |
| `vault`                                                              | `14-vault-on-postgres.sh 1`        | Vault's storage (ADR-046)     |
| `controlplane_v1`, `identityhub_v1`, `issuerservice_v1`, `siglet_v1` | `create-edc-v1-databases.sh`       | the EDC 1.0 launchers, siglet |
| `taskdb`                                                             | `wire-task-store.sh`               | the proxy's task store        |

The EDC 0.18 databases (`controlplane`, `dataplane`, `dataplane_omop`,
`identityhub`, `issuerservice` and their `_v018` successors) were dropped with
#594 and #927.

### Container images (ACR)

In `acrmvhdehds` (`ACR_NAME`). Third-party images are pinned (ADR-029).

| Image                                                                    | Source                                          | Pushed by                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- |
| `mvhd-ui:<sha>`, `:latest`                                               | `ui/Dockerfile`                                 | `deploy-azure.yml` on every merge to main     |
| `mvhd-neo4j-proxy:<sha>`, `:latest`                                      | `services/neo4j-proxy/Dockerfile`               | `deploy-azure.yml`                            |
| `mvhd-edc-controlplane`, `-identity-hub`, `-issuerservice` `:<EDC1_TAG>` | `runtimes/edc` (ADR-076)                        | `push-edc1-images.sh build`, `push`           |
| `siglet:sha-<digest>`                                                    | the digest `docker-compose.jad.yml` pins        | `17-siglet.sh` (`az acr import`)              |
| `cfm/<manager or agent>:<fork version>` (eight)                          | the fork tag in `.github/upstream.json`         | `20-cfm-fork.sh images`                       |
| `keycloak:26.8.0`; `keycloak-ehds:<version>-<sha>`                       | `quay.io/keycloak/keycloak`; with the theme     | `03-identity.sh`; `wire-keycloak-theme.sh`    |
| `vault:2.0`; `mvhd-vault-unseal:<sha>`                                   | `hashicorp/vault`; `scripts/azure/vault-unseal` | `03-identity.sh`; `14-vault-on-postgres.sh 2` |
| `neo4j:5.26.28-community`                                                | Docker Hub                                      | `02-data-layer.sh`                            |
| `nats:2.14.3-alpine`                                                     | Docker Hub                                      | `04-edc-services.sh`                          |
| `mvhd-neo4j-seed`, `mvhd-vault-bootstrap`                                | `neo4j/`; generated by `06-post-deploy.sh`      | `06-post-deploy.sh`                           |

The `jad-*` images of EDC 0.18 and the 2026-03 CFM's were deleted from the
registry on 2026-11-10 (#927).

### ACA Jobs

| Job                    | Image                         | Purpose                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------ |
| `mvhd-neo4j-seed`      | `mvhd-neo4j-seed:latest`      | Load schema + synthetic data into Neo4j          |
| `mvhd-vault-bootstrap` | `mvhd-vault-bootstrap:latest` | Configure Vault JWT auth, policies, signing keys |
| `mvhd-fhir-loader`     | `mvhd-fhir-loader:http`       | Load Synthea FHIR bundles into Neo4j             |

---

## 4. Fresh Deployment (from scratch)

The order below built the estate from an empty resource group on EDC 1.0 and
passed end to end: a rebuild rehearsal in `rg-mvhd-rehearsal` on 2026-11-11
(evidence on [#927](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/927)).
Every script is in `scripts/azure/` and reads `env.sh`. A step names what has
to be true before the next one starts.

### 4.1 Before you start

- **Rights.** PIM `rol-ssg-prd-project_owner` active
  (`~/.claude/scripts/az-pim-activate.sh`): 01 and 05 assign roles, and the
  seeds run Container Apps jobs. Contributor alone cannot assign roles.
- **Logins.** `az login` lasts an hour (conditional access). Log in again
  before each block below, never inside one; the rehearsal needed three.
- **Tools.** `az` with the `containerapp` extension (1.3.0b5), Docker with
  buildx (`DOCKER_CONTEXT=orbstack`), `python3` with PyYAML, `jq`, `bru` for
  the checks.
- **A second resource group** (a rehearsal, a disaster-recovery copy) sets its
  own globally unique names before anything runs. `env.sh` refuses to start
  while one of them still names the hub's, so nothing reaches the hub's Key
  Vault, registry, Flexible Server or domain:

  ```bash
  export RG=rg-mvhd-rehearsal KEY_VAULT_NAME=kv-mvhd-r<sfx> ACR_NAME=acrmvhdr<sfx> \
    PG_FLEX_NAME=mvhd-pg-r<sfx> SPE_DNS_SUFFIX=r<sfx> CUSTOM_DOMAIN=
  ```

  Its Keycloak then answers on its Container Apps address, which `env.sh`
  finds once 01 has made the environment, and the laptop keeps its rollback
  copies in `~/.mvhd/rg/<RG>/`, apart from the hub's.

### 4.2 The order

| #   | Step                                                                                                                                                                                           | Time   | Gate                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 1   | `01-foundation.sh`: resource group, Key Vault (purge protection, RBAC), `id-mvhd-claude-federation` with Key Vault Secrets User, Log Analytics, registry, storage and shares, environment      | 16 min | exits 0; the environment alone takes 15 minutes                                                        |
| 2   | Images, once the registry exists: `push-edc1-images.sh build`, then `push` (prints `EDC1_TAG`); `build-images.sh` for the UI and the proxy                                                     | 3 min  | `push-edc1-images.sh check` lists the tag                                                              |
| 3   | `02-data-layer.sh`: Flexible Server and its password (13 phases 1 and 2), Neo4j and `neo4j-password`                                                                                           | 11 min | 13 phase 1 ends with the server `Ready`                                                                |
| 4   | `03-identity.sh`: Keycloak with `keycloak-admin-password` generated into Key Vault, Vault on Postgres (14)                                                                                     | 7 min  | the sidecar logs `[vault-init] ready`                                                                  |
| 5   | `create-edc-v1-databases.sh` (on the hub: the workflow `edc-v1-databases.yml`)                                                                                                                 | 1 min  | four databases present                                                                                 |
| 6   | `04-edc-services.sh`: NATS, the three EDC apps on base settings, the proxy                                                                                                                     | 3 min  | NATS and the proxy Healthy; the EDC apps fail until step 8 (no `edc.events.nats.url` yet), as expected |
| 7   | `06-post-deploy.sh`: the `edcv` realm, then the Neo4j seed job and the Vault bootstrap job. Can run beside step 6                                                                              | 5 min  | both job executions `Succeeded` (the seed takes 5 minutes after the script ends)                       |
| 8   | `migrate-edc-to-v1.sh backup`, then `app controlplane`, `app identityhub`, `app issuerservice`, then `set-edc-log-level.sh`                                                                    | 3 min  | each revision Healthy                                                                                  |
| 9   | `wire-keycloak-edc1-scopes.sh`, then `--check`                                                                                                                                                 | 1 min  | the three `:admin` scopes on admin and provisioner, the issuer's `sub` mapper                          |
| 10  | `17-siglet.sh`, then `--check` (directly: `migrate-edc-to-v1.sh siglet` wants a siglet backup, which a new build cannot have)                                                                  | 4 min  | Healthy, ports 8081 to 8083                                                                            |
| 11  | `05-ui.sh`, then `rotate-keycloak-ui-client-secret.sh --rotate`, `rotate-edc-admin-client-secret.sh --rotate`, `wire-ui-client-scope.sh`                                                       | 5 min  | both secrets come from Key Vault, the public defaults are refused                                      |
| 12  | `migrate-edc-to-v1.sh backup` (now with siglet and the UI), then `proxy`, `ui`, `diff`                                                                                                         | 3 min  | `diff` exits 0                                                                                         |
| 13  | `seed-issuer-identity-azure.sh seed`, then `verify`                                                                                                                                            | 5 min  | `issuer identity: OK`                                                                                  |
| 14  | `run-seed-job.sh reseed plan`, then `apply` (on the hub also the workflow `edc-reseed-identity-layer.yml`)                                                                                     | 10 min | "the five demo participants carry ... DIDs and hold a credential"                                      |
| 15  | `run-seed-job.sh data-assets apply` (on the hub also `edc-seed-data-assets.yml`)                                                                                                               | 4 min  | assets and contract definitions per context                                                            |
| 16  | CFM from the fork (ADR-088): `wire-cfm-agents-client.sh`, `20-cfm-fork.sh images`, `CFM_AZURE_GO="mvhd-cfm-tmanager mvhd-cfm-pmanager mvhd-cfm-agents" 20-cfm-fork.sh apps`, `seed`, `--check` | 13 min | three apps Healthy, cell and dataspace profile seeded                                                  |

Steps 1 to 16 took about two hours of script time; the rehearsal took three
with its fixes. The seeds and both CFM steps are idempotent; so are 01 to 06
when what they create already exists.

### 4.3 Proving it

```bash
scripts/azure/check-keycloak-health.sh "$KEYCLOAK_PUBLIC_URL" edcv
NEXTAUTH_SECRET=<the UI's> BRUNO_BASE_URL=<the UI's address> BRUNO_KEYCLOAK_URL="$KEYCLOAK_PUBLIC_URL" \
  scripts/run-api-tests.sh Azure-Dev "03 Data User"
```

On the rehearsal: Keycloak served `edcv` from its database; Bruno `03 Data
User` passed 25 of 26 with the live DSP flow (catalogue from the connector,
negotiation `FINALIZED`, transfer `STARTED`, the data from the provider's data
plane); the one failure is `09`, which wants GraphRAG on Azure OpenAI
(`07-ai-foundry.sh`, not part of this order). A new participant onboarded
through `POST /api/participants` answered 201 with seven steps, the
MembershipCredential request among them. All thirteen apps were still Healthy
the next morning. Setting by setting, the rebuilt apps match the hub's names
except where a step in 4.4 adds its own.

### 4.4 After the core

Each of these is independent of the others and was not part of the
rehearsal. On the hub they are what the live apps carry beyond 4.2:

- Security: `rotate-vault-token.sh apply`, then `revoke-root` (#359);
  `guard-keycloak-console.sh`; `secure-accounts.sh`.
- Keycloak: `wire-keycloak-theme.sh`, `wire-keycloak-events.sh`.
- The UI's extras: `wire-dsp-catalog-token.sh --create`,
  `wire-pid-fingerprint-key.sh --create`, `wire-task-store.sh`,
  `15-communication-email.sh`, `19-eudi-verifier.sh` (deploy-azure.yml sets
  the EUDI settings on every merge), `wire-klarbefund-*.sh`,
  `12-meinbefund-identity.sh`, `11-claude-federation.sh provision`.
- Analytics and operations: `07-ai-foundry.sh` and the workflow
  `graphrag-deploy.yml`, `07-observability.sh`, `16-observability-app.sh`,
  `08-compliance-runner.sh`, `09-fhir-loader.sh`, `10-catalog-crawler.sh`,
  `18-offhours-jobs.sh`, the `size-*.sh` scripts.
- The SPE workspaces and Trustee: `21-aci-confidential-spe.sh` (ADR-068,
  ADR-069).
- Custom domains, on the hub only: `06-post-deploy.sh` with `CUSTOM_DOMAIN`
  set binds `ehds.mabu.red` (DNS records at the registrar), and the
  keycloak-custom-domain workflow `auth.ehds.mabu.red`.

### 4.5 What the rehearsal met

- **Key Vault.** The tenant's policy "Key vaults should have deletion
  protection enabled" refuses a vault without purge protection. A deleted
  vault therefore keeps its name for its seven days of soft delete; pick a
  new suffix for the next rehearsal.
- **Postgres capacity.** West Europe refused a new `Standard_B1ms` with
  `SkuNotAvailable` in every zone although `list-skus` offers it; North Europe
  took it. Set `PG_FLEX_LOCATION=northeurope`, with a new `PG_FLEX_NAME`: for
  a while after a failed create the old name stays bound to West Europe.
- **Images.** The UI under amd64 emulation builds slowly on Apple Silicon.
  The rehearsal copied the images CI had built on `main` (`az acr import`);
  on the hub, `deploy-azure.yml` builds them on every merge but only updates
  an existing `mvhd-ui`, so step 11 must have run once.
- **Costs.** About $0.3 an hour idle for everything in 4.2 (Container Apps,
  West Europe, 2026-11-11 prices), Postgres B1ms $0.02 an hour.

Delete a rehearsal with `az group delete --name <RG> --yes`, never
`teardown.sh` without `RG` set: it deletes `rg-mvhd-dev` by default.

---

## 5. Deployment Scripts Reference

All scripts live in `scripts/azure/` and share common variables from `scripts/azure/env.sh`.

| Script                                                                                                | Purpose                                                                                                 | Section 4.2 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| `env.sh`                                                                                              | Shared names and helpers (source, do not execute); refuses a second resource group that names the hub's | 4.1         |
| `01-foundation.sh`                                                                                    | Resource group, Key Vault and its reader identity, Log Analytics, ACR, storage, environment             | 1           |
| `push-edc1-images.sh`                                                                                 | Build and push the EDC 1.0 launchers                                                                    | 2           |
| `build-images.sh`                                                                                     | Build the UI and the proxy, push the third-party images                                                 | 2           |
| `02-data-layer.sh`                                                                                    | Flexible Server (through 13) and Neo4j                                                                  | 3           |
| `13-postgres-flexible-server.sh`                                                                      | The server (1), `keycloak` and `cfm` (2); `PG_FLEX_LOCATION`, `PG_FLEX_ZONE`                            | 3           |
| `03-identity.sh`                                                                                      | Keycloak and Vault (through 14)                                                                         | 4           |
| `14-vault-on-postgres.sh`                                                                             | Vault's storage on Postgres and the unseal sidecar                                                      | 4           |
| `create-edc-v1-databases.sh`                                                                          | The four EDC 1.0 databases                                                                              | 5           |
| `04-edc-services.sh`                                                                                  | NATS, the EDC apps on base settings, the proxy                                                          | 6           |
| `06-post-deploy.sh`                                                                                   | Realm, Neo4j seed job, Vault bootstrap job; the custom domain on the hub                                | 7           |
| `migrate-edc-to-v1.sh`                                                                                | The EDC apps' full 1.0 settings, the proxy's and the UI's; `diff`, `backup`, `rollback`                 | 8, 12       |
| `set-edc-log-level.sh`                                                                                | The EDC apps at INFO without colour                                                                     | 8           |
| `wire-keycloak-edc1-scopes.sh`                                                                        | The realm's 1.0 scopes                                                                                  | 9           |
| `17-siglet.sh`                                                                                        | siglet, the data plane                                                                                  | 10          |
| `05-ui.sh`                                                                                            | Creates `mvhd-ui`                                                                                       | 11          |
| `rotate-keycloak-ui-client-secret.sh`, `rotate-edc-admin-client-secret.sh`, `wire-ui-client-scope.sh` | The UI's and the admin client's secrets by Key Vault reference, the UI's scope                          | 11          |
| `seed-issuer-identity-azure.sh`                                                                       | The issuer's key, context and credential definitions                                                    | 13          |
| `run-seed-job.sh`                                                                                     | The identity layer and the data assets, as the two seed workflows                                       | 14, 15      |
| `wire-cfm-agents-client.sh`, `20-cfm-fork.sh`                                                         | CFM from the fork: its Keycloak client, images, apps and seed                                           | 16          |
| `status.sh`                                                                                           | Status of the services and databases                                                                    |             |
| `teardown.sh`                                                                                         | Deletes the resource group `RG` names (`rg-mvhd-dev` by default) after a typed confirmation             |             |

## 6. Post-Deployment Setup

After the container apps are running, three bootstrap jobs must run:

### 6.1 Neo4j Schema + Data Seeding

```bash
az containerapp job start --name mvhd-neo4j-seed --resource-group rg-mvhd-dev
```

Loads `neo4j/*.cypher` files (schema, synthetic data, DSP marketplace, DCAT-AP, EEHRxF profiles,
EHDS credentials, FHIR-to-OMOP transform, transfer events, trust center, audit provenance,
compliance matrix).

### 6.2 Vault Bootstrap

```bash
az containerapp job start --name mvhd-vault-bootstrap --resource-group rg-mvhd-dev
```

Configures JWT auth (Keycloak JWKS), KV v2 secrets engine, participant/provisioner policies,
AES encryption key, IssuerService EdDSA signing key, and data plane token keys.

### 6.3 Keycloak Realm Import

Done by `06-post-deploy.sh` via Keycloak Admin REST API:

- Imports realm `edcv` from `jad/keycloak-realm.json`
- Updates `health-dataspace-ui` client with Azure redirect URIs
- Creates 7 demo personas (edcadmin, clinicuser, researcher, regulator, lmcuser, patient1, patient2)

### 6.4 FHIR Patient Loading (optional)

Generate Synthea patients and load into Neo4j:

```bash
# Generate 127 synthetic patients (requires Java 21)
./scripts/generate-synthea.sh 127

# Build and push the FHIR loader image
docker buildx build --platform linux/amd64 \
  -t acrmvhddev.azurecr.io/mvhd-fhir-loader:http --push /tmp/fhir-loader-build

# Run the loader job
az containerapp job start --name mvhd-fhir-loader --resource-group rg-mvhd-dev
```

---

## 7. CI/CD Pipeline

### GitHub Actions workflow

File: `.github/workflows/deploy-azure.yml`

**Trigger:** Push to `main` branch or manual `workflow_dispatch`.

**What it does:**

1. Authenticates to Azure via OIDC federation (no stored secrets)
2. Logs into ACR
3. Builds UI and Neo4j Proxy images for `linux/amd64`
4. Tags with both `latest` and the commit SHA
5. Deploys to Azure Container Apps

### GitHub Secrets required

| Secret                  | Value                                  | Description                |
| ----------------------- | -------------------------------------- | -------------------------- |
| `AZURE_CLIENT_ID`       | `fc966b10-5c4c-4334-ac48-6601461704ae` | App registration client ID |
| `AZURE_TENANT_ID`       | `8b87af7d-8647-4dc7-8df4-5f69a2011bb5` | Azure AD tenant ID         |
| `AZURE_SUBSCRIPTION_ID` | `541101de-aabf-4fb6-90b7-c47468f07a8d` | Azure subscription ID      |

### Setting up OIDC federation for a new environment

```bash
# Create app registration
az ad app create --display-name mvhd-github-actions

# Create service principal and assign roles
APP_ID=$(az ad app list --display-name mvhd-github-actions --query "[0].appId" -o tsv)
az ad sp create --id $APP_ID
az role assignment create --assignee $APP_ID --role Contributor --scope /subscriptions/<SUB_ID>
az role assignment create --assignee $APP_ID --role AcrPush --scope <ACR_ID>

# Create federated credential
az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:ma3u/MinimumViableHealthDataspacev2:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Set GitHub secrets
gh secret set AZURE_CLIENT_ID -b "$APP_ID"
gh secret set AZURE_TENANT_ID -b "<TENANT_ID>"
gh secret set AZURE_SUBSCRIPTION_ID -b "<SUB_ID>"
```

---

## 8. Observability

### Log Analytics

- **Workspace:** `mvhd-logs` (ID: `6c5814cc-e63f-4f4c-b996-83c6686b048e`)
- **Retention:** 30 days
- **Diagnostic settings:** `mvhd-diagnostics`: all ACA logs + metrics

### Saved KQL queries

Access via: Azure Portal > Log Analytics > mvhd-logs > Saved Queries > "MVHD Monitoring"

| Query         | Description                                       |
| ------------- | ------------------------------------------------- |
| `mvhd-errors` | Container errors across all services              |
| `mvhd-health` | Service health overview with last-seen timestamps |
| `mvhd-auth`   | Keycloak authentication events                    |
| `mvhd-neo4j`  | Neo4j and proxy activity                          |

### Useful ad-hoc KQL queries

```kusto
// All errors in the last hour
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where Log_s contains "error" or Log_s contains "ERROR"
| project TimeGenerated, ContainerAppName_s, Log_s
| order by TimeGenerated desc

// Container restarts
ContainerAppSystemLogs_CL
| where Reason_s in ("CrashLoopBackOff", "OOMKilled", "BackOff")
| project TimeGenerated, ContainerAppName_s, Reason_s, Log_s
| order by TimeGenerated desc

// Request volume per service (last 24h)
ContainerAppConsoleLogs_CL
| summarize LogCount=count() by ContainerAppName_s, bin(TimeGenerated, 1h)
| render timechart
```

### Alerts

| Alert                  | Condition                       | Severity | Action |
| ---------------------- | ------------------------------- | -------- | ------ |
| `mvhd-ui-down`         | UI replicas < 1 for 5 min       | Sev 1    | Email  |
| `mvhd-keycloak-down`   | Keycloak replicas < 1 for 5 min | Sev 1    | Email  |
| `mvhd-neo4j-down`      | Neo4j replicas < 1 for 5 min    | Sev 1    | Email  |
| `mvhd-ui-high-latency` | UI requests > 100/5min          | Sev 3    | Email  |

### Dashboard

Azure Portal > Dashboards > "MVHD Health Dataspace Monitoring"

---

## 9. Teardown

```bash
# Delete everything (irreversible)
./scripts/azure/teardown.sh

# Or manually:
az group delete --name rg-mvhd-dev --yes --no-wait
```

This deletes all container apps, PostgreSQL, ACR, Log Analytics, alerts, and dashboard.

---

## 10. Troubleshooting

### Common issues

| Symptom                             | Cause                                                      | Fix                                                                          |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ECONNREFUSED` on token exchange    | UI using `localhost` for Keycloak instead of internal FQDN | Set `KEYCLOAK_ISSUER` to internal URL, `KEYCLOAK_PUBLIC_URL` to external URL |
| `image OS/Arch must be linux/amd64` | Image built on Apple Silicon (arm64)                       | Rebuild with `docker buildx build --platform linux/amd64`                    |
| Keycloak prints help text and exits | Missing startup command                                    | Set command to `/opt/keycloak/bin/kc.sh start-dev`                           |
| Vault `-dev` flag parsed by az CLI  | `--args "-dev"` syntax conflict                            | Use `VAULT_DEV_ROOT_TOKEN_ID=root` env var instead                           |
| Neo4j Bolt timeout from ACA jobs    | ACA Envoy proxy doesn't support raw TCP well               | Use Neo4j HTTP transactional API (`/db/neo4j/tx/commit`) instead             |
| PostgreSQL creation fails in region | Regional capacity restriction                              | Try `northeurope` or `germanywestcentral`                                    |
| `OAuthCallback` error after login   | Missing PKCE `code_challenge_method`                       | Ensure NextAuth checks include `["pkce", "state"]`                           |
| Graph API returns "Unauthorized"    | Expected: API routes require authentication session        | Sign in via Keycloak first                                                   |
| UI shows mock data instead of live  | `NEXT_PUBLIC_STATIC_EXPORT=true`                           | Set to `false` for Azure deployment                                          |

### Checking service health

```bash
# All services at a glance
./scripts/azure/status.sh

# Container logs
az containerapp logs show --name mvhd-ui --resource-group rg-mvhd-dev --tail 50

# Job execution logs
az containerapp job logs show --name mvhd-neo4j-seed --resource-group rg-mvhd-dev \
  --execution <EXECUTION_NAME> --container mvhd-neo4j-seed

# ACA environment logs (all services)
az monitor log-analytics query --workspace mvhd-logs --analytics-query \
  "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | take 50"
```

### Restarting a service

```bash
# Create a new revision (restarts the container)
az containerapp revision restart --name mvhd-ui --resource-group rg-mvhd-dev \
  --revision $(az containerapp revision list --name mvhd-ui --resource-group rg-mvhd-dev \
  --query "[0].name" -o tsv)
```
