# Production Readiness Assessment

## Well-Architected Framework (WAF) + Cloud Adoption Framework (CAF)

### EHDS Integration Hub

> Assessment date: 2026-03-25 | Based on load tests + codebase analysis

---

## Executive Summary

| Pillar                      | Score    | Status                                 |
| --------------------------- | -------- | -------------------------------------- |
| WAF: Operational Excellence | 4/10     | 🔴 Needs Work                          |
| WAF: Security               | 6/10     | 🟡 Partial                             |
| WAF: Reliability            | 5/10     | 🔴 Needs Work                          |
| WAF: Performance Efficiency | 4/10     | 🔴 Needs Work                          |
| WAF: Cost Optimization      | 5/10     | 🟡 Partial                             |
| WAF: Sustainability         | 3/10     | 🔴 Needs Work                          |
| CAF: Strategy & Plan        | 7/10     | 🟡 Good for MVP                        |
| CAF: Govern & Manage        | 4/10     | 🔴 Needs Work                          |
| **Overall**                 | **5/10** | **🟡 MVP-Ready, NOT Production-Ready** |

---

## WAF Pillar 1: Operational Excellence

### Current State

- ✅ Pre-commit hooks (Prettier, shellcheck, hadolint, TypeScript, ESLint)
- ✅ Automated E2E tests (Playwright) and unit tests (Vitest)
- ✅ DSP/DCP/EHDS compliance test scripts
- ✅ Structured seed scripts with phase control (`--from`, `--only`)
- ❌ No structured logging (no correlation IDs, no structured JSON logs)
- ❌ No distributed tracing (no OpenTelemetry)
- ❌ No alerting rules or on-call runbooks
- ❌ HashiCorp Vault in dev mode (in-memory, lost on restart)
- ❌ No CI/CD pipeline for K8s deployment (GitHub Actions only for Pages)
- ❌ No feature flags for phased rollouts

### Remediation Roadmap (Priority Order)

| Priority | Action                                                                        | Effort | Impact   |
| -------- | ----------------------------------------------------------------------------- | ------ | -------- |
| P0       | Vault: switch to file/integrated storage (not in-memory dev mode)             | 2d     | Critical |
| P0       | Add OpenTelemetry SDK to neo4j-proxy and UI (traces + metrics)                | 3d     | High     |
| P1       | Add structured logging (pino/winston with correlation IDs)                    | 2d     | High     |
| P1       | Create K8s Helm chart or Kustomize for all 19 services                        | 5d     | High     |
| P1       | Add GitHub Actions CI pipeline for K8s deployment to StackIT SKE              | 3d     | High     |
| P2       | Write operational runbooks (Vault recovery, Neo4j seed replay, EDC-V restart) | 3d     | Medium   |
| P2       | Add Prometheus metrics endpoint to neo4j-proxy (`/metrics`)                   | 1d     | Medium   |

---

## WAF Pillar 2: Security

### Current State

- ✅ Keycloak OIDC with 6 role-based scopes
- ✅ DID/VC-based participant identity (IdentityHub + IssuerService)
- ✅ DSP contract enforcement before data transfer
- ✅ ODRL policies on all DataProducts
- ✅ Route protection via Next.js middleware
- ✅ No secrets in codebase (Vault + env vars)
- ⚠️ Vault in dev mode (seal keys not persisted — P0 risk)
- ⚠️ Neo4j Community: no role-based DB access control (single user)
- ⚠️ Neo4j proxy has no rate limiting (exhaustion possible)
- ❌ No network policies (K8s pods can talk to each other freely)
- ❌ No OWASP ZAP / security scan in CI
- ❌ CORS policy not verified under load
- ❌ No audit log rotation/retention policy (EHDS requires 10-year retention)
- ❌ No mTLS between internal services (relies on Docker network trust)
- ❌ k-anonymity in federated query (`/federated/query`) not validated at scale

### Remediation Roadmap

| Priority | Action                                                                          | Effort | Impact            |
| -------- | ------------------------------------------------------------------------------- | ------ | ----------------- |
| P0       | Vault persistent storage (Raft or file backend)                                 | 2d     | Critical          |
| P0       | Add rate limiting to neo4j-proxy (express-rate-limit: 100 req/min/IP)           | 0.5d   | Critical          |
| P0       | Enforce k-anonymity threshold in production (min_cohort_size ≥ 5)               | 1d     | Critical (GDPR)   |
| P1       | Add K8s NetworkPolicies (deny-all default, allow-list per service)              | 2d     | High              |
| P1       | Enable Neo4j role-based access (upgrade to Enterprise OR use proxy-only access) | 3d     | High              |
| P1       | Add OWASP ZAP scan to CI                                                        | 1d     | High              |
| P1       | Configure audit log retention (10 years, EHDS Art. 50)                          | 2d     | High (Compliance) |
| P2       | mTLS between internal services via Istio or Linkerd                             | 5d     | Medium            |
| P2       | Rotate Keycloak client secrets on schedule                                      | 1d     | Medium            |

---

## WAF Pillar 3: Reliability

### Current State (from load tests)

- ✅ Neo4j proxy: 99%+ success at 200 VUs, handles 348 RPS at 600 VUs
- ✅ Lightweight UI routes: stable up to 600 VUs
- ❌ **CRITICAL: `/api/graph` crashes Next.js at ~90 concurrent requests**
  - Root cause: 60MB+ JSON payload per response (5,300+ nodes serialised)
  - Fix: paginate graph API or return aggregated summary + lazy-load
- ❌ No health check retries or circuit breakers
- ❌ Neo4j Community Edition: no clustering, no automatic failover
- ❌ Docker volumes not backed up automatically
- ❌ No graceful shutdown handling in neo4j-proxy (in-flight requests dropped)
- ❌ Vault restart loses all secrets (requires full re-bootstrap)
- ❌ No readiness/liveness probes configured for K8s

### Remediation Roadmap

| Priority | Action                                                                     | Effort | Impact   |
| -------- | -------------------------------------------------------------------------- | ------ | -------- |
| P0       | **Fix graph API**: add pagination (`?page=&limit=`) + node-level lazy load | 3d     | Critical |
| P0       | Add K8s readiness + liveness probes for all services                       | 1d     | Critical |
| P0       | Persistent Vault storage (see Security P0)                                 | 2d     | Critical |
| P1       | Add circuit breaker to neo4j-proxy (opossum library)                       | 1d     | High     |
| P1       | Configure Neo4j automatic backup to object storage (daily)                 | 2d     | High     |
| P1       | Add graceful shutdown to neo4j-proxy (drain connections on SIGTERM)        | 0.5d   | High     |
| P2       | Neo4j Enterprise or Fabric for HA (if budget allows)                       | 5d     | Medium   |
| P2       | Multi-region active-passive failover via StackIT                           | 8d     | Medium   |

---

## WAF Pillar 4: Performance Efficiency

### Current State (from load tests)

- ✅ Neo4j proxy p95=16ms (catalog), p95=15ms (OMOP) — excellent
- ✅ OMOP cohort aggregation: 80ms average, scales to 200+ VUs
- ✅ No N+1 queries observed in proxy (single Cypher queries)
- ❌ Graph API: 60MB payload → 1.75s p50, 22s p95, crashes at 90 VUs
- ❌ Patient API: p95=8.5s at 200 VUs (Neo4j query not optimized)
- ❌ No response caching (catalog is static, could be cached 60s)
- ❌ No compression (gzip/brotli) on API responses
- ❌ No Neo4j query result caching (APOC cache not configured)
- ❌ Neo4j heap max 1GB: with 5300+ nodes, this is tight under concurrent load
- ❌ No CDN for static UI assets

### Remediation Roadmap

| Priority | Action                                                                               | Effort | Impact   |
| -------- | ------------------------------------------------------------------------------------ | ------ | -------- |
| P0       | Paginate `/api/graph` (return 200 nodes/page, client renders incrementally)          | 3d     | Critical |
| P1       | Add HTTP response compression (next.config.js `compress: true`, Express compression) | 0.5d   | High     |
| P1       | Cache catalog response (Redis or in-memory, 60s TTL)                                 | 1d     | High     |
| P1       | Increase Neo4j heap to 2GB + page cache to 4GB in production                         | 0.5d   | High     |
| P1       | Add Neo4j indexes for all FHIR query paths (Patient.fhirId, Condition.code)          | 1d     | High     |
| P2       | APOC query result caching for expensive traversals                                   | 2d     | Medium   |
| P2       | Add CDN (Cloudflare or StackIT CDN) for static UI assets                             | 2d     | Medium   |

### Performance targets (production K8s, after fixes)

| Scenario                     | Target RPS | p95 Target |
| ---------------------------- | ---------- | ---------- |
| 200 participants (sustained) | 40 RPS     | <500ms     |
| 200 participants (peak 5×)   | 200 RPS    | <2s        |
| 1,000 participants (scaled)  | 200 RPS    | <1s        |

---

## WAF Pillar 5: Cost Optimization

### Current State

- ✅ Neo4j Community (free, vs Enterprise ≥€15k/year)
- ✅ Docker Compose minimises cloud cost for dev/test
- ❌ Vault dev mode wipes secrets → forced full re-bootstrap = ops cost
- ❌ No autoscaling (HPA) configured for stateless services
- ❌ Graph API data transfer: 60MB × N requests = high egress cost
- ❌ No cost tagging strategy for tenant isolation billing

### Remediation Roadmap

| Priority                    | Action                                      | Monthly Saving     |
| --------------------------- | ------------------------------------------- | ------------------ |
| P0                          | Fix graph API payload (pagination)          | €90/month egress   |
| P1                          | Enable gzip on all APIs                     | €78/month egress   |
| P1                          | HPA for neo4j-proxy (min 1, max 5 replicas) | €150/month compute |
| P1                          | Spot nodes for app pool (3× c1.xlarge)      | €78/month compute  |
| P2                          | CDN for static assets                       | €40/month egress   |
| **Total potential savings** |                                             | **~€436/month**    |

---

## WAF Pillar 6: Sustainability

### Current State

- ❌ No carbon-aware scheduling
- ❌ No idle-down of non-production environments
- ❌ No resource utilisation reporting
- ❌ Graph API wastes 60MB of compute + network per request

### Recommendations

1. Use StackIT's DE-FRA-1 region (Schwarz Group targets 100% renewable energy)
2. Auto-shutdown dev/staging environments outside business hours (saves ~60% dev cost)
3. Fix graph API — reduces CPU + network by ~70% per graph view
4. Set Neo4j page cache limits properly (avoid OS memory pressure)
5. Use HPA + KEDA for event-driven scaling (scale to zero during off-hours)

---

## CAF Assessment

### Strategy & Plan (7/10)

- ✅ Clear EHDS regulatory motivation
- ✅ FHIR R4, OMOP CDM, DSP alignment
- ✅ Fictional participants (trademark policy documented)
- ✅ Phased seeding approach (7 phases, resumable)
- ❌ No formal SLA defined for dataspace participants
- ❌ No data governance policy registry beyond ODRL policies

### Ready (5/10)

- ✅ All services containerised
- ✅ Working local dev stack
- ❌ No K8s manifests / Helm chart
- ❌ No StackIT SKE configuration
- ❌ Vault not production-ready

### Adopt (6/10)

- ✅ DSP 2025-1 TCK compliance tests
- ✅ DCP v1.0 compliance
- ✅ EHDS domain tests
- ❌ No chaos engineering (no resilience testing)
- ❌ No data migration runbook for version upgrades

### Govern & Manage (4/10)

- ❌ No cost allocation tags per tenant
- ❌ No EHDS audit log retention policy (required: 10 years)
- ❌ No incident response plan
- ❌ No change management process
- ❌ No SLA monitoring dashboard
- ⚠️ k-anonymity not enforced by policy (code-level only)

---

## Consolidated P0 Blockers (Must fix before production)

| #                   | Issue                                                   | Effort   | WAF Pillar                |
| ------------------- | ------------------------------------------------------- | -------- | ------------------------- |
| 1                   | Graph API crashes at 90 concurrent users (60MB payload) | 3d       | Reliability + Performance |
| 2                   | Vault dev mode loses secrets on restart                 | 2d       | Reliability + Security    |
| 3                   | No rate limiting on neo4j-proxy                         | 0.5d     | Security                  |
| 4                   | k-anonymity not enforced by policy (federated query)    | 1d       | Security (GDPR)           |
| 5                   | No K8s readiness/liveness probes                        | 1d       | Reliability               |
| 6                   | EHDS audit log retention policy missing                 | 2d       | Governance                |
| **Total P0 effort** |                                                         | **~10d** |                           |

## Consolidated P1 (Production hardening, sprint 2)

Total effort: **~25 developer-days**

## Timeline to Production-Ready

| Phase                   | Duration     | Deliverables                                                     |
| ----------------------- | ------------ | ---------------------------------------------------------------- |
| Sprint 1 (P0 fixes)     | 2 weeks      | Graph pagination, Vault persistence, rate limiting, K8s probes   |
| Sprint 2 (P1 hardening) | 3 weeks      | OTel, structured logging, compression, caching, network policies |
| Sprint 3 (K8s deploy)   | 2 weeks      | Helm chart, CI/CD to StackIT SKE, full load test on cloud        |
| Sprint 4 (Compliance)   | 2 weeks      | Audit retention, OWASP scan, chaos testing, runbooks             |
| **Total**               | **~9 weeks** | Production-ready EHDS dataspace                                  |
