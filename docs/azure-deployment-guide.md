# Azure Deployment Guide — EHDS Integration Hub

> **Last updated:** 2026-04-11
> **Target platform:** Azure Container Apps (Consumption plan)
> **Region:** West Europe (PostgreSQL in North Europe)
> **Services:** 13 container apps + 3 ACA jobs + PostgreSQL Flexible Server

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

| Resource       | Type                    | Location     | SKU             |
| -------------- | ----------------------- | ------------ | --------------- |
| `rg-mvhd-dev`  | Resource Group          | West Europe  | —               |
| `acrmvhddev`   | Container Registry      | West Europe  | Basic           |
| `mvhd-env`     | ACA Environment         | West Europe  | Consumption     |
| `pg-mvhd-dev`  | PostgreSQL Flex Server  | North Europe | B_Standard_B1ms |
| `law-mvhd-dev` | Log Analytics Workspace | West Europe  | PerGB2018       |

---

## 3. Current Endpoints

### Public endpoints (internet-accessible)

| Service            | URL                                                                                                                      | Purpose                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **UI**             | https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io                                                    | Next.js 14 application — main entry point  |
| **Keycloak**       | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io                                              | OIDC provider, realm: `edcv`               |
| **Keycloak Admin** | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io/admin/                                       | Admin console (user: `admin`, pw: `admin`) |
| **Keycloak OIDC**  | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io/realms/edcv/.well-known/openid-configuration | OIDC discovery document                    |
| **GitHub Pages**   | https://ma3u.github.io/MinimumViableHealthDataspacev2/                                                                   | Static export (demo/offline mode)          |

### Internal endpoints (ACA environment only)

| Service               | Internal FQDN                                                                       | Port  | Protocol |
| --------------------- | ----------------------------------------------------------------------------------- | ----- | -------- |
| **Neo4j** (HTTP)      | `mvhd-neo4j.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`         | 7474  | HTTP     |
| **Neo4j** (Bolt)      | `mvhd-neo4j.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`         | 7687  | TCP      |
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

### Database endpoints (private)

| Service        | Host                                      | Port | Databases                                                                                        |
| -------------- | ----------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| **PostgreSQL** | `pg-mvhd-dev.postgres.database.azure.com` | 5432 | `keycloak`, `controlplane`, `dataplane`, `dataplane_omop`, `identityhub`, `issuerservice`, `cfm` |

### Container images (ACR)

| Image                                            | Source                              | Build                 |
| ------------------------------------------------ | ----------------------------------- | --------------------- |
| `acrmvhddev.azurecr.io/mvhd-ui:latest`           | `./ui/Dockerfile`                   | CI/CD on push to main |
| `acrmvhddev.azurecr.io/mvhd-neo4j-proxy:latest`  | `./services/neo4j-proxy/Dockerfile` | CI/CD on push to main |
| `acrmvhddev.azurecr.io/jad-controlplane:latest`  | `ma3u/jad` — Gradle shadow JAR      | Manual build          |
| `acrmvhddev.azurecr.io/jad-dataplane:latest`     | `ma3u/jad` — Gradle shadow JAR      | Manual build          |
| `acrmvhddev.azurecr.io/jad-identity-hub:latest`  | `ma3u/jad` — Gradle shadow JAR      | Manual build          |
| `acrmvhddev.azurecr.io/jad-issuerservice:latest` | `ma3u/jad` — Gradle shadow JAR      | Manual build          |
| `acrmvhddev.azurecr.io/cfm-tmanager:latest`      | `Metaform/cfm-fulcrum` — Go         | Manual build          |
| `acrmvhddev.azurecr.io/cfm-pmanager:latest`      | `Metaform/cfm-fulcrum` — Go         | Manual build          |
| `acrmvhddev.azurecr.io/keycloak:latest`          | `quay.io/keycloak/keycloak`         | Pulled amd64          |
| `acrmvhddev.azurecr.io/vault:latest`             | `hashicorp/vault`                   | Pulled amd64          |
| `acrmvhddev.azurecr.io/neo4j:5-community`        | `neo4j:5-community`                 | Pulled amd64          |
| `acrmvhddev.azurecr.io/nats:alpine`              | `nats:alpine`                       | Pulled amd64          |

### ACA Jobs

| Job                    | Image                         | Purpose                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------ |
| `mvhd-neo4j-seed`      | `mvhd-neo4j-seed:latest`      | Load schema + synthetic data into Neo4j          |
| `mvhd-vault-bootstrap` | `mvhd-vault-bootstrap:latest` | Configure Vault JWT auth, policies, signing keys |
| `mvhd-fhir-loader`     | `mvhd-fhir-loader:http`       | Load Synthea FHIR bundles into Neo4j             |

---

## 4. Fresh Deployment (from scratch)

Use the deployment scripts in `scripts/azure/`. Each phase builds on the previous one.

```bash
# Authenticate
az login

# Phase 0: Foundation — resource group, ACR, Log Analytics, ACA environment
./scripts/azure/01-foundation.sh

# Phase 1: Data layer — PostgreSQL, Neo4j
./scripts/azure/02-data-layer.sh

# Phase 2: Identity — Keycloak, Vault
./scripts/azure/03-identity.sh

# Phase 3: EDC-V core services — controlplane, dataplanes, identity hub, issuer
./scripts/azure/04-edc-services.sh

# Phase 4: CFM + UI — tenant/provision managers, Next.js UI
./scripts/azure/05-cfm-ui.sh

# Phase 5: Post-deployment — seed Neo4j, bootstrap Vault, import Keycloak realm
./scripts/azure/06-post-deploy.sh

# Phase 6: Observability — diagnostic settings, alerts, dashboard
./scripts/azure/07-observability.sh
```

Total deployment time: ~20 minutes (excluding image builds).

---

## 5. Deployment Scripts Reference

All scripts live in `scripts/azure/` and share common variables from `scripts/azure/env.sh`.

| Script                | Purpose                                                  | Duration |
| --------------------- | -------------------------------------------------------- | -------- |
| `env.sh`              | Shared environment variables (source, do not execute)    | —        |
| `01-foundation.sh`    | Resource group, ACR, Log Analytics, ACA environment      | ~5 min   |
| `02-data-layer.sh`    | PostgreSQL Flex + Neo4j container app                    | ~5 min   |
| `03-identity.sh`      | Keycloak + Vault container apps                          | ~3 min   |
| `04-edc-services.sh`  | Control plane, data planes, identity hub, issuer service | ~3 min   |
| `05-cfm-ui.sh`        | Tenant manager, provision manager, Next.js UI            | ~3 min   |
| `06-post-deploy.sh`   | Seed Neo4j, bootstrap Vault, import Keycloak realm       | ~5 min   |
| `07-observability.sh` | Diagnostic settings, alerts, dashboard                   | ~2 min   |
| `teardown.sh`         | Delete entire resource group                             | ~5 min   |
| `build-images.sh`     | Build all custom images for amd64 and push to ACR        | ~15 min  |
| `status.sh`           | Show status of all services and endpoints                | instant  |

---

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

- **Workspace:** `law-mvhd-dev` (ID: `924ee5c9-ecfa-4e9b-aef4-fc7d30972f91`)
- **Retention:** 30 days
- **Diagnostic settings:** `mvhd-diagnostics` — all ACA logs + metrics

### Saved KQL queries

Access via: Azure Portal > Log Analytics > law-mvhd-dev > Saved Queries > "MVHD Monitoring"

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
| Graph API returns "Unauthorized"    | Expected — API routes require authentication session       | Sign in via Keycloak first                                                   |
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
az monitor log-analytics query --workspace law-mvhd-dev --analytics-query \
  "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | take 50"
```

### Restarting a service

```bash
# Create a new revision (restarts the container)
az containerapp revision restart --name mvhd-ui --resource-group rg-mvhd-dev \
  --revision $(az containerapp revision list --name mvhd-ui --resource-group rg-mvhd-dev \
  --query "[0].name" -o tsv)
```
