# Azure Deployment Plan — Minimum Viable Health Dataspace v2

> **Status:** Deployed & Operational
> **Author:** Matthias Buchhorn
> **Date:** 2026-04-11
> **Scope:** Migrate 19-service JAD stack + Neo4j knowledge graph from Docker Compose to Azure

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Azure Target Architecture](#3-azure-target-architecture)
4. [Key Decision: AKS vs Azure Container Apps](#4-key-decision-aks-vs-azure-container-apps)
5. [Key Decision: HashiCorp Vault vs Azure Key Vault](#5-key-decision-hashicorp-vault-vs-azure-key-vault)
6. [Service-by-Service Migration Map](#6-service-by-service-migration-map)
7. [Networking & DNS](#7-networking--dns)
8. [Identity & Access Management](#8-identity--access-management)
9. [Data Layer](#9-data-layer)
10. [Secrets & Configuration Management](#10-secrets--configuration-management)
11. [Observability](#11-observability)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Security & Compliance](#13-security--compliance)
14. [Cost Estimation](#14-cost-estimation)
15. [Migration Phases](#15-migration-phases)
16. [Risk Register](#16-risk-register)
17. [Open Questions](#17-open-questions)
18. [Deployment Outcomes (2026-04-11)](#18-deployment-outcomes-2026-04-11)

---

## 1. Executive Summary

This document plans the deployment of the EHDS (European Health Data Space) reference implementation to Microsoft Azure. The stack comprises 19 interconnected services including EDC-V connectors, DCP identity services, a Neo4j knowledge graph, Keycloak OIDC, HashiCorp Vault, NATS messaging, PostgreSQL, and a Next.js UI.

The deployment must satisfy **EHDS Art. 3–12 / 50–51**, **GDPR Art. 15–22**, **DSP 2025-1**, and **DCP v1.0** compliance requirements while remaining cost-effective for a reference implementation.

**Recommended approach:** Azure Container Apps (ACA) for application workloads + Azure managed services for data and identity, with an AKS upgrade path for production-grade deployments.

---

## 2. Current Architecture

### 2.1 Service Inventory (Docker Compose)

| Category                      | Services                                                    | Count |
| ----------------------------- | ----------------------------------------------------------- | ----- |
| **Infrastructure**            | Traefik, PostgreSQL, Vault, Keycloak, NATS, vault-bootstrap | 6     |
| **EDC-V Core**                | controlplane, dataplane-fhir, dataplane-omop, neo4j-proxy   | 4     |
| **Identity (DCP)**            | identityhub, issuerservice                                  | 2     |
| **Tenant/Provisioning (CFM)** | tenant-manager, provision-manager, 4 agents                 | 6     |
| **Data Stores**               | Neo4j (primary), Neo4j SPE2 (federated)                     | 2     |
| **UI**                        | Next.js graph-explorer                                      | 1     |
| **Init Jobs**                 | jad-seed, vault-bootstrap                                   | 2     |

### 2.2 Data Stores

| Store      | Technology        | Databases        | Purpose                                       |
| ---------- | ----------------- | ---------------- | --------------------------------------------- |
| Graph DB   | Neo4j 5 Community | 2 instances      | 5-layer knowledge graph (5300+ nodes)         |
| Relational | PostgreSQL 17     | 9 databases      | Service metadata, Keycloak, task management   |
| Secrets    | HashiCorp Vault   | KV v2 + JWT auth | AES keys, participant secrets, JWT policies   |
| Messaging  | NATS JetStream    | 1 stream         | Async consumer notifications, transfer events |

### 2.3 Network Topology

- Traefik v3.4 routes `*.localhost` hostnames to services
- Internal Docker network `edcv` (health-dataspace-edcv)
- ~25 internal HTTP endpoints across services
- Keycloak split-horizon DNS: `localhost:8080` (browser) vs `keycloak:8080` (internal)

---

## 3. Azure Target Architecture

```
                         ┌─────────────────────────────────────┐
                         │         Azure Front Door / AG       │
                         │   (TLS termination, WAF, routing)   │
                         └──────────────┬──────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────────┐
                    │                   │                       │
              ┌─────▼─────┐    ┌───────▼───────┐    ┌─────────▼─────────┐
              │  Next.js   │    │  Keycloak     │    │  API Gateway      │
              │  UI (ACA)  │    │  (ACA/AKS)    │    │  (APIM or ACA)    │
              └─────┬──────┘    └───────┬───────┘    └─────────┬─────────┘
                    │                   │                       │
         ┌──────────┴──────────────────┴───────────────────────┘
         │                    VNet (Private)
         │
    ┌────┴────────────────────────────────────────────────────────┐
    │                                                             │
    │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
    │  │ Control  │  │ DataPlane │  │ Identity │  │   CFM     │  │
    │  │ Plane    │  │ FHIR/OMOP │  │ Hub      │  │ Tenant+   │  │
    │  │ (ACA)    │  │ (ACA)     │  │ (ACA)    │  │ Provision │  │
    │  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
    │       │              │             │              │         │
    │  ┌────┴──────────────┴─────────────┴──────────────┘         │
    │  │                                                          │
    │  │  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐  │
    │  │  │ Azure DB for │  │ Neo4j on   │  │ Azure Key Vault │  │
    │  │  │ PostgreSQL   │  │ ACA / VM   │  │ or HashiVault   │  │
    │  │  └──────────────┘  └────────────┘  └─────────────────┘  │
    │  │                                                          │
    │  │  ┌──────────────┐  ┌────────────┐                       │
    │  │  │ Azure Svc Bus│  │ neo4j-proxy│                       │
    │  │  │ or NATS(ACA) │  │ (ACA)      │                       │
    │  │  └──────────────┘  └────────────┘                       │
    │  │                                                          │
    └──┴──────────────────────────────────────────────────────────┘
```

---

## 4. Key Decision: AKS vs Azure Container Apps

### 4.1 Comparison Matrix

| Criterion                  | AKS (Azure Kubernetes Service)                       | ACA (Azure Container Apps)                         | Winner |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------ |
| **Operational complexity** | High — manage node pools, upgrades, RBAC, networking | Low — serverless, Microsoft-managed infrastructure | ACA    |
| **Cost (dev/staging)**     | ~$200–400/mo minimum (2–3 node cluster)              | ~$50–150/mo (consumption plan, scale-to-zero)      | ACA    |
| **Cost (production)**      | Predictable with reserved instances                  | Can spike under sustained load                     | AKS    |
| **Scale-to-zero**          | Not native (KEDA add-on partial)                     | Built-in per container app                         | ACA    |
| **Kubernetes ecosystem**   | Full K8s API, Helm, operators, CRDs                  | Dapr sidecar, limited K8s compatibility            | AKS    |
| **Neo4j operator**         | Official Neo4j K8s operator available                | Must run as container with volume mount            | AKS    |
| **Service mesh**           | Istio/Linkerd/OSM natively supported                 | Built-in Envoy-based ingress                       | AKS    |
| **Stateful workloads**     | StatefulSets, PVCs, CSI drivers                      | Persistent volumes via Azure Files (limited)       | AKS    |
| **Init containers/jobs**   | Full K8s Job/CronJob support                         | ACA Jobs (GA) — good fit for seed scripts          | Tie    |
| **Multi-container pods**   | Native sidecar pattern                               | Sidecar containers supported (GA)                  | Tie    |
| **Networking**             | Full VNet integration, Network Policies              | VNet integration, but simplified model             | AKS    |
| **RBAC granularity**       | Namespace-level, pod security standards              | Container app-level, simpler model                 | AKS    |
| **Compliance certs**       | SOC2, ISO 27001, HIPAA BAA, HDS                      | SOC2, ISO 27001 (HIPAA BAA via Environment)        | AKS    |
| **Team expertise needed**  | Kubernetes admin required                            | Developer-friendly, minimal infra knowledge        | ACA    |
| **Time to production**     | 2–4 weeks (infra setup)                              | 3–5 days (containerized apps)                      | ACA    |
| **Existing K8s manifests** | Can reuse OrbStack manifests directly                | Requires conversion to ACA YAML/Bicep              | AKS    |

### 4.2 Recommendation

**Primary: Azure Container Apps (ACA)** for the reference implementation.

**Rationale:**

1. **19 services** is within ACA's sweet spot (up to ~30 container apps per environment)
2. **Scale-to-zero** dramatically reduces cost for dev/staging environments
3. **ACA Jobs** handle the seed scripts (phases 1–7) and vault-bootstrap cleanly
4. **Dapr integration** can replace NATS for pub/sub if desired (optional)
5. **Faster time-to-deploy** — the team can focus on EHDS compliance, not K8s operations
6. Most services are **stateless HTTP** — ideal for ACA

**AKS upgrade path for production:**

- When Neo4j needs enterprise clustering (causal cluster, not Community)
- When network policies require K8s-level granularity (e.g., PCI-DSS segmentation)
- When the service count exceeds ACA limits or requires custom CRDs
- When HIPAA BAA with full audit logging is required

### 4.3 Hybrid Option

Run **ACA for application services** + **AKS for stateful workloads** (Neo4j, PostgreSQL) in the same VNet. This provides the best of both worlds but increases operational complexity.

**Verdict: Start with ACA, plan AKS escape hatch.**

---

## 5. Key Decision: HashiCorp Vault vs Azure Key Vault

### 5.1 Comparison Matrix

| Criterion                | HashiCorp Vault (self-managed)              | Azure Key Vault                                   | Winner   |
| ------------------------ | ------------------------------------------- | ------------------------------------------------- | -------- |
| **Operational overhead** | High — unseal, backup, HA, upgrades         | Zero — fully managed                              | Azure KV |
| **Cost**                 | Compute cost for Vault container + storage  | ~$0.03/10K operations (Standard)                  | Azure KV |
| **JWT auth method**      | Native — used by EDC-V for Keycloak JWT     | Not native — requires custom middleware           | Vault    |
| **KV v2 secrets**        | Native — versioned, metadata, soft-delete   | Native — versioned, soft-delete, purge protection | Tie      |
| **Dynamic secrets**      | DB credentials, PKI, SSH, AWS/Azure/GCP     | Not supported — static secrets only               | Vault    |
| **Transit encryption**   | Built-in transit engine (AES, RSA, Ed25519) | Limited — keys for encrypt/decrypt only           | Vault    |
| **EDC-V integration**    | Out-of-the-box (`edc.vault.hashicorp.*`)    | Requires EDC-V Azure Key Vault extension          | Vault    |
| **EHDS compliance**      | Depends on deployment security              | Azure compliance certifications (SOC2, ISO, HDS)  | Azure KV |
| **HSM backing**          | Enterprise only (Vault Enterprise + HSM)    | Standard (software) or Premium (HSM-backed)       | Azure KV |
| **Managed identity**     | Manual service account setup                | Native Azure AD managed identity                  | Azure KV |
| **Audit logging**        | Self-managed audit device                   | Azure Monitor + Diagnostic Logs built-in          | Azure KV |
| **Disaster recovery**    | Manual replication setup                    | Geo-redundant by default                          | Azure KV |
| **HA availability**      | Must configure (Raft or Consul backend)     | 99.99% SLA (Standard)                             | Azure KV |

### 5.2 Current Vault Usage in the Project

The project uses Vault for:

1. **JWT Auth Method** — Keycloak JWKS validation for service-to-service auth
2. **KV v2 Secrets** — Participant-scoped secrets (`participants/*`), AES encryption key
3. **Policies** — `participants-restricted` (per-participant isolation), `provisioner-policy` (full CFM access)
4. **JWT Roles** — `participant` and `provisioner` roles bound to Keycloak issuer and realm roles

### 5.3 Migration Complexity

| Vault Feature                | Azure Key Vault Equivalent       | Migration Effort                       |
| ---------------------------- | -------------------------------- | -------------------------------------- |
| KV v2 secrets                | Key Vault Secrets                | Low — API mapping                      |
| JWT auth method              | Azure AD + App Registrations     | **High** — requires EDC-V code changes |
| Vault policies               | Azure RBAC + Access Policies     | Medium — redesign access model         |
| Transit encryption (AES key) | Key Vault Keys (encrypt/decrypt) | Medium — API differences               |
| Trusted issuer config        | Custom config or Azure AD        | Medium                                 |

### 5.4 Recommendation

**Phase 1: Keep HashiCorp Vault on ACA** (containerized, with persistent storage).

**Rationale:**

1. **EDC-V has native Vault integration** — `edc.vault.hashicorp.url` / `edc.vault.hashicorp.token` are built-in config
2. **JWT auth method** is deeply integrated into the CFM agent workflow — replacing it requires significant code changes
3. **Bootstrap scripts** (`jad/bootstrap-vault.sh`) are Vault-CLI specific
4. Migration to Azure Key Vault is a **non-trivial refactoring project** touching controlplane, identityhub, issuerservice, and all CFM agents

**Phase 2 (future): Migrate to Azure Key Vault** when:

- EDC-V ships an Azure Key Vault extension (or we build one)
- The JWT auth method is replaced by Azure AD Managed Identity
- HSM-backed key storage is required for production compliance
- The operational cost of self-managed Vault outweighs migration effort

**Interim hardening for Vault on ACA:**

- Use Azure Files (Premium) for persistent storage instead of in-memory dev mode
- Store unseal keys in Azure Key Vault (inception pattern — AKV protects Vault)
- Enable audit logging to Azure Monitor via sidecar
- Use ACA health probes for automatic restart on seal

---

## 6. Service-by-Service Migration Map

### 6.1 Application Services → Azure Container Apps

| Current Service     | ACA Container App    | CPU/Memory | Scale | Notes                                                   |
| ------------------- | -------------------- | ---------- | ----- | ------------------------------------------------------- |
| graph-explorer (UI) | `mvhd-ui`            | 0.5/1Gi    | 1–5   | Next.js, static export option via Azure Static Web Apps |
| controlplane        | `mvhd-controlplane`  | 1.0/2Gi    | 1–3   | DSP protocol endpoints, needs stable hostname           |
| dataplane-fhir      | `mvhd-dp-fhir`       | 0.5/1Gi    | 1–3   | HttpData-PUSH transfers                                 |
| dataplane-omop      | `mvhd-dp-omop`       | 0.5/1Gi    | 1–3   | HttpData-PULL transfers                                 |
| neo4j-proxy         | `mvhd-neo4j-proxy`   | 0.5/1Gi    | 1–3   | Express HTTP-to-Cypher bridge                           |
| identityhub         | `mvhd-identityhub`   | 0.5/1Gi    | 1–2   | DCP credential storage                                  |
| issuerservice       | `mvhd-issuerservice` | 0.5/1Gi    | 1–2   | VC issuance, status lists                               |
| tenant-manager      | `mvhd-tenant-mgr`    | 0.25/512Mi | 1–2   | CFM tenant lifecycle                                    |
| provision-manager   | `mvhd-provision-mgr` | 0.25/512Mi | 1–2   | CFM resource provisioning                               |
| Keycloak            | `mvhd-keycloak`      | 1.0/2Gi    | 1–2   | OIDC provider (or Azure AD B2C)                         |
| Vault               | `mvhd-vault`         | 0.25/512Mi | 1     | Singleton, persistent volume                            |
| NATS                | `mvhd-nats`          | 0.25/512Mi | 1     | JetStream, persistent volume                            |

### 6.2 Background Agents → ACA Jobs or Sidecars

| Current Service        | ACA Deployment                             | Notes                         |
| ---------------------- | ------------------------------------------ | ----------------------------- |
| cfm-agents (Keycloak)  | Sidecar on `mvhd-tenant-mgr` or ACA Job    | Event-driven, listens to NATS |
| cfm-edcv-agent         | Sidecar on `mvhd-provision-mgr` or ACA Job | Event-driven                  |
| cfm-registration-agent | ACA Job (event trigger)                    | VC/IH/Issuer coordination     |
| cfm-onboarding-agent   | ACA Job (event trigger)                    | CP/IH/Issuer setup            |
| vault-bootstrap        | ACA Job (manual trigger)                   | One-time init                 |
| jad-seed               | ACA Job (manual trigger)                   | One-time seed (phases 1–7)    |

### 6.3 Data Services → Azure Managed Services

| Current Service       | Azure Service                                 | SKU                                 | Notes                                              |
| --------------------- | --------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| PostgreSQL 17 (9 DBs) | Azure Database for PostgreSQL Flexible Server | Burstable B1ms (dev), GP D2s (prod) | Single server, 9 databases, VNet integration       |
| Neo4j 5 Community     | Neo4j on ACA (container)                      | 2 vCPU / 4Gi                        | No Azure-managed Neo4j; use container + Azure Disk |
| Neo4j SPE2            | Neo4j on ACA (container)                      | 1 vCPU / 2Gi                        | Federated query instance                           |

### 6.4 Infrastructure Services → Azure Native

| Current Service | Azure Service                         | Notes                                      |
| --------------- | ------------------------------------- | ------------------------------------------ |
| Traefik v3.4    | Azure Container Apps built-in ingress | Envoy-based, auto-TLS with managed certs   |
| —               | Azure Front Door (optional)           | WAF, global load balancing, custom domains |
| —               | Azure Monitor + Log Analytics         | Replace docker logs, Traefik access logs   |
| —               | Azure Container Registry (ACR)        | Store custom images (neo4j-proxy, UI)      |

### 6.5 Alternative: Azure Static Web Apps for UI

The Next.js UI already supports static export (`NEXT_PUBLIC_STATIC_EXPORT=true`). Instead of running it as an ACA container, consider **Azure Static Web Apps**:

- Free tier available (100 GB bandwidth/mo)
- Built-in GitHub Actions integration
- Global CDN distribution
- Custom domain + free TLS
- API proxying to ACA backend via `staticwebapp.config.json`

**Trade-off:** Static export disables API routes and NextAuth — the UI would rely entirely on mock data or client-side API calls to the ACA backend.

---

## 7. Networking & DNS

### 7.1 VNet Architecture

```
Resource Group: rg-mvhd-{env}
VNet: vnet-mvhd-{env} (10.0.0.0/16)
├── snet-aca        (10.0.0.0/21)   — ACA Environment (requires /23 minimum)
├── snet-postgres   (10.0.8.0/24)   — Azure DB for PostgreSQL
├── snet-neo4j      (10.0.9.0/24)   — Neo4j containers (if using ACI/VM)
├── snet-vault      (10.0.10.0/24)  — Vault (if isolated)
└── snet-endpoints  (10.0.11.0/24)  — Private Endpoints (ACR, Key Vault, etc.)
```

### 7.2 DNS Strategy

| Current (Traefik)    | Azure Equivalent                                             |
| -------------------- | ------------------------------------------------------------ |
| `*.localhost`        | `*.{env}.{region}.azurecontainerapps.io` (auto-assigned)     |
| `keycloak.localhost` | `keycloak.mvhd-{env}.azurecontainerapps.io` or custom domain |
| `cp.localhost`       | Internal FQDN within ACA Environment (no public exposure)    |
| `vault.localhost`    | Internal only — no public ingress                            |

### 7.3 Internal vs External Exposure

| Service             | External Ingress | Internal Only        | Notes                                     |
| ------------------- | ---------------- | -------------------- | ----------------------------------------- |
| UI                  | Yes              | —                    | Public-facing                             |
| Keycloak            | Yes              | —                    | OIDC discovery must be browser-accessible |
| controlplane (DSP)  | Yes (port 8082)  | Mgmt (8081) internal | DSP protocol is participant-facing        |
| identityhub (DID)   | Yes (port 7083)  | Others internal      | DID resolution must be public             |
| issuerservice (DID) | Yes (port 10016) | Others internal      | DID resolution must be public             |
| All other services  | —                | Yes                  | No public access needed                   |

### 7.4 Keycloak Split-Horizon DNS (Critical)

The existing gotcha (#5 in CLAUDE.md) about Keycloak `wellKnown` applies to Azure too:

- **Browser URL:** `https://keycloak.mvhd.example.com/realms/edcv`
- **Internal URL:** `https://mvhd-keycloak.internal.{env}.azurecontainerapps.io/realms/edcv`
- NextAuth must use the **internal URL** for token exchange and the **public URL** for `authorization` and `issuer`

---

## 8. Identity & Access Management

### 8.1 Azure AD / Entra ID Integration

| Concern                     | Approach                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| **Service-to-service auth** | Azure Managed Identity (system-assigned) for each ACA container app         |
| **Human auth (UI)**         | Keycloak remains primary OIDC provider (EHDS persona model)                 |
| **Keycloak ↔ Azure AD**    | Optional: Keycloak identity broker to Azure AD for enterprise SSO           |
| **ACR pull**                | ACA system-assigned managed identity with `AcrPull` role                    |
| **PostgreSQL auth**         | Azure AD authentication + managed identity (no passwords in config)         |
| **Key Vault access**        | Managed identity with RBAC (Key Vault Secrets User / Key Vault Crypto User) |

### 8.2 Keycloak on Azure — Options

| Option                            | Pros                                      | Cons                                                                                           |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Keycloak on ACA** (recommended) | Full control, existing realm config works | Must manage upgrades, backups                                                                  |
| **Azure AD B2C**                  | Managed, scalable, Azure-native           | Cannot model EHDS-specific roles (EDC_ADMIN, HDAB_AUTHORITY, etc.) without heavy customization |
| **Keycloak on AKS**               | StatefulSet, operator support             | Overkill for reference implementation                                                          |

**Recommendation:** Keep Keycloak on ACA. Import `jad/keycloak-realm.json` via init job.

---

## 9. Data Layer

### 9.1 PostgreSQL Migration

**Azure Database for PostgreSQL — Flexible Server**

| Setting    | Dev/Staging                      | Production                          |
| ---------- | -------------------------------- | ----------------------------------- |
| SKU        | Burstable B1ms (1 vCPU, 2 GiB)   | General Purpose D2s (2 vCPU, 8 GiB) |
| Storage    | 32 GiB                           | 128 GiB + auto-grow                 |
| HA         | Disabled                         | Zone-redundant HA                   |
| Backup     | 7-day retention                  | 35-day retention, geo-redundant     |
| Networking | VNet integration (private)       | VNet + Private Endpoint             |
| Auth       | Azure AD + password (transition) | Azure AD Managed Identity only      |

**Database Initialization:**

- Run `jad/init-postgres.sql` via ACA Job or `az postgres flexible-server execute`
- Creates 9 databases with per-service credentials
- Transition to Azure AD auth eliminates password management

### 9.2 Neo4j Deployment

Neo4j has no Azure-managed service. Options:

| Option                         | Pros                                    | Cons                                                       | Cost/mo (est.)  |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------- | --------------- |
| **Neo4j on ACA** (recommended) | Simple, integrated, ACA managed         | Community edition limits (no clustering, no online backup) | $50–100         |
| **Neo4j on Azure VM**          | Full control, enterprise edition option | VM management, manual scaling                              | $80–200         |
| **Neo4j AuraDB** (managed)     | Fully managed, enterprise features      | Vendor lock-in, network latency, cost                      | $200+           |
| **Neo4j on AKS**               | K8s operator, StatefulSets              | Requires AKS cluster                                       | $200+ (cluster) |

**Neo4j on ACA specifics:**

- Use Azure Managed Disk (Premium SSD) mounted as persistent volume
- Community edition supports single instance only — acceptable for reference implementation
- Schema init via ACA Job: `cat init-schema.cypher | cypher-shell`
- SPE2 instance as separate ACA container app with its own volume

### 9.3 NATS JetStream

| Option                        | Pros                                 | Cons                                       |
| ----------------------------- | ------------------------------------ | ------------------------------------------ |
| **NATS on ACA** (recommended) | Simple, existing config works        | Must manage persistence                    |
| **Azure Service Bus**         | Managed, enterprise, Azure-native    | Requires protocol change in all CFM agents |
| **Dapr pub/sub on ACA**       | ACA-native, multiple broker backends | Abstraction layer adds complexity          |

**Recommendation:** NATS on ACA with Azure Files persistent volume. The CFM agents use NATS-specific APIs (`cfm-bucket`, `cfm-stream`) that would require non-trivial refactoring for Azure Service Bus.

---

## 10. Secrets & Configuration Management

### 10.1 Secret Categories

| Category                  | Current Location                      | Azure Target                                             |
| ------------------------- | ------------------------------------- | -------------------------------------------------------- |
| DB passwords              | Docker env vars / `init-postgres.sql` | Azure Key Vault + Managed Identity (eliminate passwords) |
| Keycloak admin creds      | Docker env vars                       | Azure Key Vault secret reference in ACA                  |
| Vault root token          | In-memory / `vault/init.json`         | Azure Key Vault (bootstrap only)                         |
| EDC-V participant secrets | HashiCorp Vault KV v2                 | HashiCorp Vault on ACA (Phase 1)                         |
| AES encryption keys       | HashiCorp Vault transit               | HashiCorp Vault on ACA (Phase 1)                         |
| NextAuth secret           | Docker env var                        | ACA secret / Azure Key Vault                             |
| OIDC client secrets       | Keycloak realm config                 | Keycloak (unchanged)                                     |

### 10.2 ACA Secret References

ACA supports referencing Azure Key Vault secrets directly:

```yaml
properties:
  configuration:
    secrets:
      - name: nextauth-secret
        keyVaultUrl: https://kv-mvhd-dev.vault.azure.net/secrets/nextauth-secret
        identity: system
```

### 10.3 Configuration Strategy

| Config Type                        | Mechanism                                        |
| ---------------------------------- | ------------------------------------------------ |
| Per-environment (dev/staging/prod) | ACA Environment variables + Bicep parameters     |
| Shared across services             | ACA Environment-level env vars                   |
| Sensitive values                   | Azure Key Vault → ACA secret references          |
| Vault-specific (EDC-V)             | HashiCorp Vault (internal, ACA container)        |
| Feature flags                      | ACA env vars (`NEXT_PUBLIC_STATIC_EXPORT`, etc.) |

---

## 11. Observability

### 11.1 Monitoring Stack

| Concern                 | Azure Service                       | Notes                                               |
| ----------------------- | ----------------------------------- | --------------------------------------------------- |
| **Container logs**      | Azure Monitor + Log Analytics       | ACA sends stdout/stderr automatically               |
| **Application metrics** | Application Insights                | Auto-instrumentation for Node.js (UI, neo4j-proxy)  |
| **Custom metrics**      | Azure Monitor Metrics               | EDC-V, Keycloak JMX → Prometheus → Azure Monitor    |
| **Distributed tracing** | Application Insights                | OpenTelemetry SDK in Java services                  |
| **Alerting**            | Azure Monitor Alerts                | Health check failures, error rate thresholds        |
| **Dashboards**          | Azure Workbooks / Grafana (managed) | Service health, transfer metrics, compliance status |
| **Keycloak metrics**    | Prometheus endpoint → Azure Monitor | KC_METRICS_ENABLED=true already configured          |
| **NATS monitoring**     | NATS port 8222 → health probe       | JetStream stats via HTTP monitor                    |

### 11.2 Health Probes

All services already expose HTTP health endpoints. Map to ACA probes:

```yaml
probes:
  - type: liveness
    httpGet:
      path: /health
      port: 8080
    periodSeconds: 30
  - type: readiness
    httpGet:
      path: /health
      port: 8080
    initialDelaySeconds: 10
```

---

## 12. CI/CD Pipeline

### 12.1 GitHub Actions → Azure Deployment

Extend existing workflows (`.github/workflows/`) with Azure deployment stages:

```
test.yml (existing)          pages.yml (existing)         deploy-azure.yml (new)
├── Unit tests               ├── Static build             ├── Build & push to ACR
├── Secret scan              ├── E2E tests                ├── Bicep validate
└── Coverage                 └── GitHub Pages deploy      ├── Deploy to dev (ACA)
                                                          ├── Run compliance suite
                                                          ├── Promote to staging
                                                          └── Manual gate → prod
```

### 12.2 Container Registry

- **Azure Container Registry (ACR)** — Basic tier for dev ($0.167/day), Standard for prod
- Push custom images: `mvhd-ui`, `mvhd-neo4j-proxy`
- Pull GHCR images for EDC-V services (or mirror to ACR for reliability)
- ACA pulls from ACR via managed identity (no credentials)

### 12.3 Infrastructure as Code

**Bicep** (Azure-native IaC) for all infrastructure:

```
infra/
├── main.bicep                 — Orchestrator
├── modules/
│   ├── vnet.bicep             — VNet + subnets
│   ├── acr.bicep              — Container Registry
│   ├── postgres.bicep         — PostgreSQL Flexible Server
│   ├── keyvault.bicep         — Azure Key Vault
│   ├── aca-environment.bicep  — ACA Environment
│   ├── aca-apps.bicep         — All container apps
│   ├── aca-jobs.bicep         — Init/seed jobs
│   ├── monitoring.bicep       — Log Analytics + App Insights
│   └── frontdoor.bicep        — Azure Front Door (optional)
├── parameters/
│   ├── dev.bicepparam
│   ├── staging.bicepparam
│   └── prod.bicepparam
└── scripts/
    ├── deploy.sh              — az deployment wrapper
    └── seed.sh                — Post-deploy data seeding
```

---

## 13. Security & Compliance

### 13.1 EHDS Compliance on Azure

| EHDS Requirement            | Azure Implementation                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| Art. 3–12 (Patient rights)  | Keycloak PATIENT role + UI patient portal (unchanged)                             |
| Art. 50 (Secondary use)     | HDAB approval workflow via controlplane (unchanged)                               |
| Art. 51 (Secure processing) | Neo4j SPE2 in isolated subnet, no public ingress                                  |
| Data sovereignty            | Azure region selection (EU-only: West Europe, North Europe, Germany West Central) |
| Audit trail                 | Azure Monitor Diagnostic Logs + Application Insights                              |

### 13.2 Network Security

| Control           | Implementation                                             |
| ----------------- | ---------------------------------------------------------- |
| VNet isolation    | All services in private VNet, no public IPs except ingress |
| NSGs              | Network Security Groups on each subnet                     |
| Private endpoints | PostgreSQL, Key Vault, ACR via private endpoints           |
| TLS everywhere    | ACA auto-TLS for external, mTLS for internal (Dapr/Envoy)  |
| WAF               | Azure Front Door WAF (OWASP 3.2 ruleset)                   |
| DDoS              | Azure DDoS Protection (Standard plan for prod)             |

### 13.3 Data Protection

| Control               | Implementation                                    |
| --------------------- | ------------------------------------------------- |
| Encryption at rest    | Azure-managed keys (default) or CMK via Key Vault |
| Encryption in transit | TLS 1.2+ enforced on all endpoints                |
| Backup encryption     | Azure-managed, geo-redundant for prod             |
| Key rotation          | Azure Key Vault auto-rotation policies            |
| GDPR data residency   | EU region lock via Azure Policy                   |

### 13.4 Compliance Certifications

Azure regions in EU provide: SOC 1/2/3, ISO 27001/27017/27018, HIPAA, HDS (France), C5 (Germany), ENS (Spain).

---

## 14. Cost Estimation

### 14.1 Dev/Staging Environment (Consumption Plan)

| Resource                                 | SKU                         | Est. Monthly Cost |
| ---------------------------------------- | --------------------------- | ----------------- |
| ACA Environment (12 container apps)      | Consumption (scale-to-zero) | $80–150           |
| ACA Jobs (seed, bootstrap)               | Consumption (on-demand)     | $5                |
| Azure DB for PostgreSQL                  | Burstable B1ms              | $25               |
| Azure Key Vault                          | Standard                    | $5                |
| Azure Container Registry                 | Basic                       | $5                |
| Log Analytics                            | 5 GB/day free tier          | $0                |
| Azure Files (Neo4j, Vault, NATS volumes) | Standard, 50 GiB            | $5                |
| **Total (dev)**                          |                             | **~$125–195/mo**  |

### 14.2 Production Environment

| Resource                            | SKU                       | Est. Monthly Cost                  |
| ----------------------------------- | ------------------------- | ---------------------------------- |
| ACA Environment (12 container apps) | Dedicated (D4, always-on) | $300–500                           |
| ACA Jobs                            | Consumption               | $10                                |
| Azure DB for PostgreSQL             | GP D2s, zone-redundant HA | $200                               |
| Azure Key Vault                     | Standard                  | $10                                |
| Azure Container Registry            | Standard                  | $20                                |
| Azure Front Door                    | Standard                  | $35 + traffic                      |
| Log Analytics + App Insights        | 10 GB/day                 | $70                                |
| Azure Files Premium (Neo4j)         | 100 GiB                   | $15                                |
| Azure DDoS Protection               | Standard                  | $0 (if existing subscription plan) |
| **Total (prod)**                    |                           | **~$660–860/mo**                   |

### 14.3 Cost Optimization Strategies

- **Scale-to-zero** in dev for low-traffic services (CFM agents, seed jobs)
- **Reserved instances** for PostgreSQL in production (1-year = ~35% savings)
- **Azure Hybrid Benefit** if existing Windows Server / SQL Server licenses
- **Dev/Test pricing** for non-production subscriptions
- **Spot instances** on AKS if migrated later (non-critical workloads)

---

## 15. Migration Phases

### Phase 0: Foundation (Week 1)

- [ ] Create Azure subscription and resource groups (`rg-mvhd-dev`, `rg-mvhd-prod`)
- [ ] Set up VNet, subnets, NSGs
- [ ] Deploy Azure Container Registry (ACR)
- [ ] Deploy Azure Key Vault
- [ ] Configure GitHub Actions OIDC federation for Azure deployments (no stored secrets)
- [ ] Write Bicep modules for core infrastructure

### Phase 1: Data Layer (Week 2)

- [ ] Deploy Azure Database for PostgreSQL Flexible Server
- [ ] Run `init-postgres.sql` to create 9 databases
- [ ] Deploy Neo4j Community on ACA with Azure Disk persistent volume
- [ ] Run `init-schema.cypher` and `insert-synthetic-schema-data.cypher`
- [ ] Deploy NATS on ACA with Azure Files persistent volume
- [ ] Verify data layer connectivity from within VNet

### Phase 2: Identity & Secrets (Week 2–3)

- [ ] Deploy HashiCorp Vault on ACA with Azure Files persistent volume
- [ ] Run `bootstrap-vault.sh` adapted for Azure (replace localhost URLs)
- [ ] Store Vault unseal key in Azure Key Vault
- [ ] Deploy Keycloak on ACA with PostgreSQL backend
- [ ] Import `keycloak-realm.json` (adjust redirect URIs for Azure domains)
- [ ] Verify OIDC flow: browser → Keycloak → token → API

### Phase 3: Core Services (Week 3–4)

- [ ] Push custom images to ACR (`mvhd-ui`, `mvhd-neo4j-proxy`)
- [ ] Deploy controlplane, dataplane-fhir, dataplane-omop on ACA
- [ ] Deploy identityhub, issuerservice on ACA
- [ ] Deploy neo4j-proxy on ACA
- [ ] Update all service configs: PostgreSQL URLs, Vault URLs, Keycloak URLs, NATS URLs
- [ ] Verify DSP protocol endpoints (controlplane port 8082 external)

### Phase 4: Tenant & Provisioning (Week 4)

- [ ] Deploy tenant-manager, provision-manager on ACA
- [ ] Deploy CFM agents (Keycloak, EDC-V, registration, onboarding) as ACA Jobs or sidecars
- [ ] Run seed scripts (phases 1–7) as ACA Jobs
- [ ] Verify tenant creation → participant provisioning → credential issuance flow

### Phase 5: UI & Ingress (Week 4–5)

- [ ] Deploy Next.js UI on ACA (or Azure Static Web Apps for static export)
- [ ] Configure ACA ingress (external for UI, Keycloak; internal for backend services)
- [ ] Set up custom domain + TLS certificate (Azure-managed or Let's Encrypt)
- [ ] Resolve Keycloak split-horizon DNS for Azure
- [ ] Run Playwright E2E tests against Azure deployment

### Phase 6: Observability & CI/CD (Week 5)

- [ ] Configure Log Analytics workspace and Application Insights
- [ ] Set up Azure Monitor alerts (service health, error rates)
- [ ] Create `deploy-azure.yml` GitHub Actions workflow
- [ ] Integrate compliance test suite into Azure deployment pipeline
- [ ] Create Azure Workbook dashboard for service health

### Phase 7: Hardening & Go-Live (Week 6)

- [ ] Enable Azure Front Door with WAF rules
- [ ] Run security scan (OWASP ZAP against Azure deployment)
- [ ] Run full compliance suite (DSP TCK, DCP, EHDS)
- [ ] Configure backup policies (PostgreSQL, Neo4j volumes)
- [ ] Document runbook: scaling, failover, incident response
- [ ] Performance testing under load
- [ ] Go-live checklist and sign-off

---

## 16. Risk Register

| #   | Risk                                        | Impact | Probability | Mitigation                                                                    |
| --- | ------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------- |
| R1  | Neo4j Community single-instance is a SPOF   | High   | Medium      | Azure Disk snapshots every 6h; document AuraDB upgrade path                   |
| R2  | Vault unsealing after ACA container restart | Medium | High        | Auto-unseal via Azure Key Vault (transit engine); health probe triggers alert |
| R3  | Keycloak realm import fails on Azure        | Medium | Low         | Test realm import in CI; keep Keycloak DB backup                              |
| R4  | NATS JetStream data loss on ACA restart     | Medium | Medium      | Azure Files persistent volume; configure NATS file store (not memory)         |
| R5  | EDC-V images from GHCR unavailable          | High   | Low         | Mirror to ACR; pin image digests                                              |
| R6  | ACA consumption plan cold starts            | Low    | High        | Use minimum replica count of 1 for critical services                          |
| R7  | PostgreSQL connection limits exceeded       | Medium | Medium      | PgBouncer sidecar or Azure built-in connection pooling                        |
| R8  | Azure region outage (EU)                    | High   | Very Low    | Geo-redundant PostgreSQL backup; document manual DR procedure                 |
| R9  | Cost overrun from ACA scaling               | Medium | Medium      | Set max replicas, configure budget alerts                                     |
| R10 | Split-horizon DNS misconfiguration          | High   | Medium      | Document explicitly; test in E2E suite; use ACA internal DNS names            |

---

## 17. Open Questions

1. **Custom domain:** What domain will host the production deployment? (e.g., `mvhd.healthdata.eu`)
2. **Azure AD integration:** Should Keycloak federate to Azure AD for enterprise SSO, or remain standalone?
3. **Neo4j edition:** Is Community edition sufficient, or do we need Enterprise for clustering/backup?
4. **EHDS certification:** Does the reference implementation need formal EHDS certification, or is self-assessment sufficient?
5. **Multi-tenancy:** Should dev/staging/prod share one ACA Environment with separate apps, or separate environments?
6. **Vault migration timeline:** When should we target Azure Key Vault migration (requires EDC-V extension)?
7. **Data residency:** Which specific Azure region? Germany West Central (Frankfurt) for strictest German data protection?
8. **Budget:** What is the monthly Azure budget for dev + prod environments?
9. **Azure Static Web Apps:** Should the UI use Static Web Apps (free tier, CDN) or ACA (more flexibility)?
10. **Disaster recovery:** Is active-passive DR required, or is backup-restore sufficient?

---

## Appendix A: Bicep Skeleton

```bicep
// main.bicep — MVHD Azure Deployment
targetScope = 'resourceGroup'

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Azure region')
param location string = resourceGroup().location

@description('Neo4j password')
@secure()
param neo4jPassword string

module vnet 'modules/vnet.bicep' = {
  name: 'vnet'
  params: { environment: environment, location: location }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: { environment: environment, location: location }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    environment: environment
    location: location
    subnetId: vnet.outputs.postgresSubnetId
  }
}

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: { environment: environment, location: location }
}

module acaEnv 'modules/aca-environment.bicep' = {
  name: 'aca-environment'
  params: {
    environment: environment
    location: location
    subnetId: vnet.outputs.acaSubnetId
  }
}

module acaApps 'modules/aca-apps.bicep' = {
  name: 'aca-apps'
  params: {
    environment: environment
    acaEnvironmentId: acaEnv.outputs.environmentId
    acrLoginServer: acr.outputs.loginServer
    postgresHost: postgres.outputs.fqdn
    keyvaultUri: keyvault.outputs.vaultUri
    neo4jPassword: neo4jPassword
  }
}
```

## Appendix B: ACA Container App Example (Bicep)

```bicep
resource controlplane 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'mvhd-controlplane'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: acaEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8081
        transport: 'http'
      }
      secrets: [
        { name: 'vault-token', keyVaultUrl: '${keyvaultUri}secrets/vault-root-token', identity: 'system' }
      ]
      registries: [
        { server: acrLoginServer, identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'controlplane'
          image: '${acrLoginServer}/jad-controlplane:latest'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'edc.hostname', value: 'controlplane' }
            { name: 'edc.vault.hashicorp.url', value: 'https://mvhd-vault.internal...' }
            { name: 'edc.vault.hashicorp.token', secretRef: 'vault-token' }
            { name: 'edc.datasource.default.url', value: 'jdbc:postgresql://${postgresHost}:5432/controlplane' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/api/check/health', port: 8080 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/api/check/health', port: 8080 }, initialDelaySeconds: 15 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}
```

---

---

## 18. Deployment Outcomes (2026-04-11)

### 18.1 Deployed Infrastructure

| Resource           | Type                                        | Location         | Name / ID                              |
| ------------------ | ------------------------------------------- | ---------------- | -------------------------------------- |
| Resource Group     | `Microsoft.Resources/resourceGroups`        | West Europe      | `rg-mvhd-dev`                          |
| Container Registry | `Microsoft.ContainerRegistry/registries`    | West Europe      | `acrmvhddev` (`acrmvhddev.azurecr.io`) |
| ACA Environment    | `Microsoft.App/managedEnvironments`         | West Europe      | `mvhd-env` (`blackforest-0a04f26e`)    |
| PostgreSQL Flex    | `Microsoft.DBforPostgreSQL/flexibleServers` | **North Europe** | `pg-mvhd-dev`                          |

### 18.2 Container Apps — 13 Services

| App                  | Image                                            | Ingress      | FQDN                                                                                |
| -------------------- | ------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------- |
| `mvhd-ui`            | `acrmvhddev.azurecr.io/mvhd-ui:latest`           | **External** | `mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io`                     |
| `mvhd-keycloak`      | `acrmvhddev.azurecr.io/keycloak:latest`          | **External** | `mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io`               |
| `mvhd-neo4j`         | `acrmvhddev.azurecr.io/neo4j:5-community`        | Internal     | `mvhd-neo4j.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`         |
| `mvhd-neo4j-proxy`   | `acrmvhddev.azurecr.io/mvhd-neo4j-proxy:latest`  | Internal     | `mvhd-neo4j-proxy.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`   |
| `mvhd-vault`         | `acrmvhddev.azurecr.io/vault:latest`             | Internal     | `mvhd-vault.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`         |
| `mvhd-nats`          | `acrmvhddev.azurecr.io/nats:alpine`              | Internal     | `mvhd-nats.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`          |
| `mvhd-controlplane`  | `acrmvhddev.azurecr.io/jad-controlplane:latest`  | Internal     | `mvhd-controlplane.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`  |
| `mvhd-dp-fhir`       | `acrmvhddev.azurecr.io/jad-dataplane:latest`     | Internal     | `mvhd-dp-fhir.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`       |
| `mvhd-dp-omop`       | `acrmvhddev.azurecr.io/jad-dataplane:latest`     | Internal     | `mvhd-dp-omop.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`       |
| `mvhd-identityhub`   | `acrmvhddev.azurecr.io/jad-identity-hub:latest`  | Internal     | `mvhd-identityhub.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`   |
| `mvhd-issuerservice` | `acrmvhddev.azurecr.io/jad-issuerservice:latest` | Internal     | `mvhd-issuerservice.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io` |
| `mvhd-tenant-mgr`    | `acrmvhddev.azurecr.io/cfm-tmanager:latest`      | Internal     | `mvhd-tenant-mgr.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io`    |
| `mvhd-provision-mgr` | `acrmvhddev.azurecr.io/cfm-pmanager:latest`      | Internal     | `mvhd-provision-mgr.internal.blackforest-0a04f26e.westeurope.azurecontainerapps.io` |

### 18.3 Public Endpoints

| Endpoint         | URL                                                                         | Purpose                                   |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| **UI**           | https://mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io       | Next.js 14 application — main entry point |
| **Keycloak**     | https://mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io | OIDC provider (realm: `edcv`)             |
| **GitHub Pages** | https://ma3u.github.io/MinimumViableHealthDataspacev2/                      | Static export (demo/docs)                 |

### 18.4 CI/CD Pipeline

- **Workflow:** `.github/workflows/deploy-azure.yml`
- **Trigger:** Push to `main` branch + manual `workflow_dispatch`
- **Authentication:** Azure AD OIDC federation (no stored secrets)
  - App Registration: `mvhd-github-actions` (App ID: `fc966b10-5c4c-4334-ac48-6601461704ae`)
  - Federated credential: `repo:ma3u/MinimumViableHealthDataspacev2:ref:refs/heads/main`
- **GitHub Secrets:**
  - `AZURE_CLIENT_ID` — App registration client ID
  - `AZURE_TENANT_ID` — Azure AD tenant ID
  - `AZURE_SUBSCRIPTION_ID` — Azure subscription ID
- **Build scope:** UI + Neo4j Proxy (custom images, amd64). JAD/CFM images are pre-built and stored in ACR.

### 18.5 Issues Encountered & Solutions

| #   | Issue                                           | Root Cause                                                                                     | Solution                                                                                         |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | PostgreSQL creation failed in `westeurope`      | Regional capacity restriction — "The location is restricted from performing this operation"    | Deployed PostgreSQL to `northeurope` instead; cross-region latency acceptable for reference impl |
| 2   | Keycloak `--command` syntax error               | ACA `--command` passes all args as a single string; `--http-port=8080` treated as unrecognized | Used `KC_HTTP_PORT=8080` env var instead of CLI args                                             |
| 3   | Vault `--args "-dev"` treated as az CLI flag    | Azure CLI parsed `-dev` as its own flag, not Vault's                                           | Set `VAULT_DEV_ROOT_TOKEN_ID=root` env var which auto-triggers dev mode                          |
| 4   | Neo4j seed job failed (Bolt protocol)           | ACA internal ingress only supports HTTP/HTTPS, not raw TCP (Bolt uses port 7687)               | Rewrote seed script to use Neo4j HTTP transactional API (`/db/neo4j/tx/commit`) with curl + jq   |
| 5   | All images `linux/arm64` — ACA requires `amd64` | Mac M-series builds arm64 by default; GHCR images from upstream were also arm64                | Rebuilt all images with `docker buildx --platform linux/amd64`; JAD/CFM built from source        |
| 6   | JAD Java build failure with Java 26             | `JAVA_TOOL_OPTIONS=--add-modules jdk.incubator.vector` incompatible; Java 26 too new           | Set `JAVA_HOME` to Java 17, cleared `JAVA_TOOL_OPTIONS`, let Gradle auto-provision Java 21       |
| 7   | UI `NEXTAUTH_URL` pointed to Keycloak URL       | Copy/paste error during initial ACA deployment                                                 | Fixed via `az containerapp update` to correct UI FQDN                                            |

### 18.6 Azure Policy Findings

No custom Azure policies were found on the subscription (`PER-MSD-VS-MBUCHHORN-01`). The PostgreSQL capacity restriction in `westeurope` is a platform limitation, not a policy. No naming, region, or VM type restrictions are enforced.

### 18.7 Image Build Sources

| Image               | Source                                        | Build Method                                            |
| ------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `mvhd-ui`           | `./ui/Dockerfile`                             | `docker buildx --platform linux/amd64`                  |
| `mvhd-neo4j-proxy`  | `./services/neo4j-proxy/Dockerfile`           | `docker buildx --platform linux/amd64`                  |
| `jad-controlplane`  | `ma3u/jad` repo — Gradle shadow JAR (Java 21) | `./gradlew :launchers:controlplane:shadowJar` → Docker  |
| `jad-dataplane`     | `ma3u/jad` repo — Gradle shadow JAR (Java 21) | `./gradlew :launchers:dataplane:shadowJar` → Docker     |
| `jad-identity-hub`  | `ma3u/jad` repo — Gradle shadow JAR (Java 21) | `./gradlew :launchers:identity-hub:shadowJar` → Docker  |
| `jad-issuerservice` | `ma3u/jad` repo — Gradle shadow JAR (Java 21) | `./gradlew :launchers:issuerservice:shadowJar` → Docker |
| `cfm-tmanager`      | `Metaform/cfm-fulcrum` repo — Go binary       | `GOARCH=amd64 go build` → Docker                        |
| `cfm-pmanager`      | `Metaform/cfm-fulcrum` repo — Go binary       | `GOARCH=amd64 go build` → Docker                        |
| `keycloak`          | `quay.io/keycloak/keycloak:latest`            | Pulled amd64 manifest                                   |
| `vault`             | `hashicorp/vault:latest`                      | Pulled amd64 manifest                                   |
| `neo4j:5-community` | `neo4j:5-community`                           | Pulled amd64 manifest                                   |
| `nats:alpine`       | `nats:alpine`                                 | Pulled amd64 manifest                                   |

All custom images also pushed to GHCR (`ghcr.io/ma3u/`).

### 18.8 Post-Deployment Configuration

**Keycloak Realm Import:**

- Realm `edcv` imported via Keycloak Admin REST API
- `health-dataspace-ui` client updated with Azure redirect URIs
- 7 demo personas available (edcadmin, clinicuser, researcher, regulator, lmcuser, patient1, patient2)

**Neo4j Seeding (ACA Job: `mvhd-neo4j-seed`):**

- Schema: 76 statements (constraints, indexes, labels)
- Synthetic data: 51 statements (participants, datasets, FHIR, OMOP, ontology)
- Additional data: DSP marketplace, DCAT-AP, EEHRxF profiles, EHDS credentials, FHIR→OMOP transform, transfer events, trust center, audit provenance, compliance matrix
- Final node count: **81,823 nodes** (127 Synthea patients with full clinical data loaded)
- Synthea generated 206 FHIR R4 bundles (127 alive + 13 deceased + hospital/practitioner resources)
- FHIR loader ACA job (`mvhd-fhir-loader`) loaded bundles via Neo4j HTTP transactional API

**Vault Bootstrap (ACA Job: `mvhd-vault-bootstrap`):**

- JWT auth enabled with Keycloak JWKS endpoint
- KV v2 secrets engine at `participants/`
- Participant-scoped policy (`participants-restricted`)
- Provisioner policy (full access for CFM)
- AES encryption key for EDC-V
- IssuerService EdDSA signing key (DCP credential issuance)
- Data plane token keys (FHIR + OMOP)

**Neo4j Bolt Access:**

- Added TCP port mapping (7687) via `additionalPortMappings` on `mvhd-neo4j`
- neo4j-proxy connects via `bolt://mvhd-neo4j.internal...azurecontainerapps.io:7687`

### 18.9 End-to-End Verification (2026-04-11)

| Check                     | Result                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| UI homepage               | 200 — title: "European Health Data Space \| Interactive Demo"      |
| Sign-in page              | 200                                                                |
| Keycloak OIDC discovery   | 57 fields, issuer matches Azure URL                                |
| Graph API (authenticated) | 401 Unauthorized (correct — requires session)                      |
| All 13 container apps     | Running / Provisioning: Succeeded                                  |
| Neo4j data                | 81,823 nodes (127 Synthea patients + full clinical/ontology graph) |
| Vault secrets             | JWT auth + KV engine + signing keys configured                     |

### 18.10 Custom Domain Setup (Future)

No custom domain is currently configured. The deployment uses Azure-provided FQDNs.

**To add a custom domain later:**

1. **DNS Configuration** — Add these DNS records for your domain (e.g., `mvhd.example.com`):

   ```
   CNAME  ui.mvhd.example.com       → mvhd-ui.blackforest-0a04f26e.westeurope.azurecontainerapps.io
   CNAME  auth.mvhd.example.com     → mvhd-keycloak.blackforest-0a04f26e.westeurope.azurecontainerapps.io
   TXT    asuid.ui.mvhd.example.com → 638D1E3BB51AAF53AC9FC4D1D45EC8FBBA81B180CD2D39417A068E8BD2A85828
   ```

2. **Bind domain to container app:**

   ```bash
   az containerapp hostname add --name mvhd-ui --resource-group rg-mvhd-dev \
     --hostname ui.mvhd.example.com
   az containerapp hostname bind --name mvhd-ui --resource-group rg-mvhd-dev \
     --hostname ui.mvhd.example.com --environment mvhd-env --validation-method CNAME
   ```

3. **Azure-managed TLS certificate** is provisioned automatically after DNS validation.

4. **Update Keycloak redirect URIs** and `NEXTAUTH_URL` env var to match the new domain.

- **Static IP:** `20.73.141.188`
- **Domain Verification ID:** `638D1E3BB51AAF53AC9FC4D1D45EC8FBBA81B180CD2D39417A068E8BD2A85828`

### 18.11 Observability

**Log Analytics Workspace:** `law-mvhd-dev` (ID: `924ee5c9-ecfa-4e9b-aef4-fc7d30972f91`)

**Diagnostic Settings:** `mvhd-diagnostics` — all ACA logs + metrics → Log Analytics

**Azure Portal Dashboard:** "MVHD Health Dataspace Monitoring"

- Errors & Warnings (24h timechart)
- Log Volume by Service (24h)
- Container Lifecycle Events
- Keycloak Auth Events

**Saved KQL Queries** (category: "MVHD Monitoring"):

- `mvhd-errors` — Container errors across all services
- `mvhd-health` — Service health overview with last-seen timestamps
- `mvhd-auth` — Keycloak authentication events
- `mvhd-neo4j` — Neo4j and proxy activity

**Alert Rules:**
| Alert | Condition | Severity |
|-------|-----------|----------|
| `mvhd-ui-down` | UI replicas < 1 for 5 min | Sev 1 (Critical) |
| `mvhd-keycloak-down` | Keycloak replicas < 1 for 5 min | Sev 1 (Critical) |
| `mvhd-neo4j-down` | Neo4j replicas < 1 for 5 min | Sev 1 (Critical) |
| `mvhd-ui-high-latency` | UI requests > 100/5min | Sev 3 (Informational) |

**Action Group:** `mvhd-alerts` → email: matthias.buchhorn@soprasteria.com

**Access:**

- Dashboard: Azure Portal → Dashboards → "MVHD Health Dataspace Monitoring"
- Logs: Azure Portal → Log Analytics → law-mvhd-dev → Saved Queries → "MVHD Monitoring"
- Alerts: Azure Portal → Monitor → Alerts

---

_This document is a living plan. Update as decisions are made and Azure deployment progresses._
