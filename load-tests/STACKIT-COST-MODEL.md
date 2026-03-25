# StackIT Cost Model — Minimum Viable Health Dataspace

## 200 Participants | Production Sizing

> Generated: 2026-03-25 | Based on local load test results (MacBook M5 Pro 32 GB)

---

## 1. Load Test Baselines (measured locally)

| Endpoint                        | p50     | p95       | Max RPS     | Failure @ load  |
| ------------------------------- | ------- | --------- | ----------- | --------------- |
| `GET /health` (proxy)           | <1ms    | 1ms       | >500        | 0%              |
| `GET /catalog/datasets` (proxy) | 3ms     | 16ms      | >200        | 1%              |
| `POST /omop/cohort` (proxy)     | 5ms     | 15ms      | >200        | 1%              |
| `GET /api/catalog` (UI)         | 28ms    | 143ms     | ~100        | 0%              |
| `GET /api/patient` (UI)         | 134ms   | 8.5s      | ~50         | 28% at 200VU    |
| `GET /api/graph` (UI)           | 1.75s   | 22s       | ~5          | **96% at 90VU** |
| **System overall**              | **9ms** | **143ms** | **348 RPS** | 0% at 600VU\*   |

> \*Graph endpoint excluded from stress test. It is the sole production blocker.

### Throughput ceiling on M5 (24 P-core, 32 GB RAM, no Docker limits on UI):

- **Neo4j proxy**: ~400 RPS sustained, >600 RPS burst
- **Next.js UI** (lightweight routes): ~150 RPS
- **Next.js UI** (graph route): crashes at ~90 concurrent requests due to 60MB+ payload per response

---

## 2. Participant Model

### Assumptions (200 tenants = 200 dataspace participants)

- Each participant = 1 organisation (clinic, pharma company, HDAB)
- Concurrent activity: 20% active simultaneously = **40 concurrent users**
- Request rate: 1 req / 5s per active user = **8 RPS sustained**
- Peak burst: 5× = **40 RPS** (e.g. morning start, batch analytics)
- Data growth: ~500 MB/participant/year (FHIR + OMOP records)
- Total data: 200 × 500 MB = **100 GB/year**

### Request distribution per participant type

| Type                 | Share | Primary endpoints                       |
| -------------------- | ----- | --------------------------------------- |
| DATA_HOLDER (Clinic) | 40%   | `/api/patient`, `/api/compliance`       |
| DATA_USER (Pharma)   | 35%   | `/omop/cohort`, `/api/analytics`        |
| HDAB (Authority)     | 15%   | `/api/credentials`, `/api/negotiations` |
| Admin                | 10%   | `/api/graph`, `/admin`                  |

---

## 3. K8s Sizing (Production-Ready)

### Per-Service Resource Requirements

| Service               | Replicas    | CPU Request       | CPU Limit           | Memory Request | Memory Limit     |
| --------------------- | ----------- | ----------------- | ------------------- | -------------- | ---------------- |
| **neo4j**             | 1 (primary) | 2 cores           | 4 cores             | 4 GB           | 8 GB             |
| **neo4j-proxy**       | 3           | 0.5 cores         | 1 core              | 256 MB         | 512 MB           |
| **ui (Next.js)**      | 3           | 0.5 cores         | 2 cores             | 512 MB         | 1 GB             |
| **controlplane**      | 2           | 1 core            | 2 cores             | 1 GB           | 2 GB             |
| **dataplane-fhir**    | 2           | 0.5 cores         | 1 core              | 512 MB         | 1 GB             |
| **dataplane-omop**    | 2           | 0.5 cores         | 1 core              | 512 MB         | 1 GB             |
| **identityhub**       | 2           | 0.5 cores         | 1 core              | 512 MB         | 1 GB             |
| **issuerservice**     | 2           | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **keycloak**          | 2           | 0.5 cores         | 1 core              | 512 MB         | 1 GB             |
| **postgres**          | 1 (HA pair) | 1 core            | 2 cores             | 2 GB           | 4 GB             |
| **vault**             | 1           | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **nats**              | 1           | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **traefik**           | 2           | 0.25 cores        | 0.5 cores           | 128 MB         | 256 MB           |
| **cfm agents (×4)**   | 1 each      | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **tenant-manager**    | 1           | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **provision-manager** | 1           | 0.25 cores        | 0.5 cores           | 256 MB         | 512 MB           |
| **TOTALS**            | ~28 pods    | **~10 cores req** | **~20 cores limit** | **~12 GB req** | **~24 GB limit** |

### K8s Node Pool Recommendation (StackIT SKE)

| Pool       | Node Type               | Count       | vCPU        | RAM        | Purpose                               |
| ---------- | ----------------------- | ----------- | ----------- | ---------- | ------------------------------------- |
| system     | m1.xlarge (4vCPU/16GB)  | 3           | 12          | 48 GB      | Control plane pods, monitoring        |
| data       | m1.2xlarge (8vCPU/32GB) | 2           | 16          | 64 GB      | Neo4j, Postgres (memory-heavy)        |
| app        | c1.xlarge (4vCPU/8GB)   | 3           | 12          | 24 GB      | Stateless services (proxy, UI, EDC-V) |
| **TOTALS** |                         | **8 nodes** | **40 vCPU** | **136 GB** |                                       |

> 40% headroom above measured requirements for safe HPA scaling.

---

## 4. StackIT Monthly Cost Estimate (EUR)

> StackIT pricing from STACKIT public rate card (2025).
> Region: DE-FRA-1 (Frankfurt). All prices ex. VAT.

### Compute (STACKIT SKE Worker Nodes)

| Node Type                   | Count | Price/node/month | Monthly        |
| --------------------------- | ----- | ---------------- | -------------- |
| m1.xlarge (4vCPU/16GB)      | 3     | €95              | €285           |
| m1.2xlarge (8vCPU/32GB)     | 2     | €185             | €370           |
| c1.xlarge (4vCPU/8GB)       | 3     | €65              | €195           |
| SKE control plane (managed) | 1     | €75              | €75            |
| **Compute subtotal**        |       |                  | **€925/month** |

### Storage

| Item                          | Size   | Price     | Monthly        |
| ----------------------------- | ------ | --------- | -------------- |
| Neo4j data volume (SSD)       | 500 GB | €0.09/GB  | €45            |
| Postgres data volume (SSD)    | 200 GB | €0.09/GB  | €18            |
| Backup storage (3× snapshots) | 2 TB   | €0.025/GB | €50            |
| **Storage subtotal**          |        |           | **€113/month** |

### Networking

| Item                                     | Volume     | Price     | Monthly        |
| ---------------------------------------- | ---------- | --------- | -------------- |
| Egress (API responses, 200 participants) | 2 TB/month | €0.065/GB | €130           |
| Load Balancer                            | 1          | €25       | €25            |
| Static IPs                               | 2          | €5        | €10            |
| **Networking subtotal**                  |            |           | **€165/month** |

### Supporting Services

| Item                                              | Monthly       |
| ------------------------------------------------- | ------------- |
| StackIT Object Storage (audit logs, backups) 1 TB | €25           |
| StackIT DNS                                       | €5            |
| StackIT Secrets Manager                           | €15           |
| **Supporting subtotal**                           | **€45/month** |

### Monitoring & Observability

| Item                                                           | Monthly          |
| -------------------------------------------------------------- | ---------------- |
| Grafana Cloud (or self-hosted Prometheus + Grafana on cluster) | €0 (self-hosted) |
| Log aggregation (Loki or StackIT logging)                      | €20              |
| **Observability subtotal**                                     | **€20/month**    |

---

### Total Monthly Cost Summary

| Category                           | Monthly (EUR)               |
| ---------------------------------- | --------------------------- |
| Compute (SKE nodes)                | €925                        |
| Storage                            | €113                        |
| Networking                         | €165                        |
| Supporting services                | €45                         |
| Observability                      | €20                         |
| **TOTAL**                          | **€1,268/month**            |
| **Per participant (÷200)**         | **€6.34/participant/month** |
| **Per participant (÷200, annual)** | **€76/participant/year**    |

---

## 5. Scaling Scenarios

| Scenario   | Participants | Monthly Cost           | Cost/Participant/Month |
| ---------- | ------------ | ---------------------- | ---------------------- |
| Pilot      | 20           | €450 (minimal nodes)   | €22.50                 |
| Target     | **200**      | **€1,268**             | **€6.34**              |
| Scale-out  | 1,000        | €4,800 (auto-scale)    | €4.80                  |
| Enterprise | 5,000        | €18,500 (multi-region) | €3.70                  |

> Economies of scale: cost per participant drops ~40% from pilot to target.

---

## 6. Key Cost Optimisations

1. **Graph endpoint pagination** — biggest win: eliminates 60MB payloads → reduces egress by ~70%
2. **Neo4j Community → Enterprise** — if >1 cluster needed; adds read replicas (scales reads without doubling Neo4j node cost)
3. **HPA on neo4j-proxy** — scale 1→5 replicas during peak, save ~€200/month vs always-on
4. **Spot/preemptible nodes** for app pool — saves ~40% on c1.xlarge nodes = ~€78/month
5. **CDN for UI static assets** — StackIT CDN or Cloudflare, reduces egress by ~30%
6. **Egress compression (gzip/brotli)** — apply to all JSON API responses, reduces networking by ~60%

**Potential savings with optimisations: €300–450/month → effective cost €820–950/month (€4.10–4.75/participant)**
