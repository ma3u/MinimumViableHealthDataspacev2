# Audit Log Retention Policy

## European Health Data Space (EHDS) Compliance

> Applies to: all deployments of the EHDS Integration Hub
> Legal basis: EHDS Regulation (EU) 2025/327, Article 50 — Logging and audit trails
> Effective: 2026-03-25

---

## 1. What Must Be Logged

Every data access event must produce an immutable audit record. The system already creates `TransferEvent` nodes in Neo4j via the `logTransferEvent()` function in `services/neo4j-proxy/src/index.ts`.

Each record contains:

| Field         | Description                             |
| ------------- | --------------------------------------- |
| `eventId`     | Unique UUID per event                   |
| `timestamp`   | ISO-8601 datetime in UTC                |
| `endpoint`    | API path accessed (e.g. `/omop/cohort`) |
| `method`      | HTTP method                             |
| `participant` | DID of the requesting organisation      |
| `statusCode`  | HTTP response status                    |
| `resultCount` | Number of records returned              |

Additionally, all HTTP access logs from Traefik (JSON format) must be retained.

---

## 2. Retention Requirements

| Log type                                   | Minimum retention | Legal basis         |
| ------------------------------------------ | ----------------- | ------------------- |
| Data access events (`TransferEvent` nodes) | **10 years**      | EHDS Art. 50(3)     |
| Contract negotiations                      | **10 years**      | EHDS Art. 50(3)     |
| Data transfer records                      | **10 years**      | EHDS Art. 50(3)     |
| Traefik HTTP access logs                   | **2 years**       | Internal operations |
| Keycloak authentication logs               | **2 years**       | Internal operations |
| Application error logs                     | **1 year**        | Internal operations |

---

## 3. Implementation

### 3a. Neo4j — TransferEvent nodes

TransferEvent nodes are stored in the primary Neo4j instance with a persistent Docker volume.

**Backup schedule:** Daily snapshot to object storage (StackIT Object Storage or S3-compatible).

To prevent accidental deletion, apply a Neo4j constraint:

```cypher
-- Run once after schema initialisation
CREATE CONSTRAINT transfer_event_immutable IF NOT EXISTS
FOR (te:TransferEvent) REQUIRE te.eventId IS NOT NULL;
```

**Retention enforcement (Cypher job — run monthly):**

```cypher
-- Remove TransferEvents older than 10 years ONLY if legally permitted
-- In most EHDS deployments, deletion is NOT permitted — archive instead
MATCH (te:TransferEvent)
WHERE te.timestamp < datetime() - duration('P10Y')
  AND te.archived = true
DELETE te;
```

### 3b. Traefik — HTTP access logs

Traefik is configured with `--accesslog=true --accesslog.format=json` in `docker-compose.jad.yml`.

In production (StackIT SKE), pipe Traefik logs to a log aggregation service:

```yaml
# K8s log retention label — add to Traefik Deployment
metadata:
  labels:
    log-retention: "2y"
```

For local development, logs are written to the Docker daemon. To persist them:

```bash
docker logs health-dataspace-traefik --since 2025-01-01 > traefik-$(date +%Y%m).log
```

### 3c. Docker Compose — log driver

Add the following to all services in `docker-compose.jad.yml` to enable structured logging with size limits:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "10"
    labels: "service,retention"
```

This is already included in the `docker-compose.vault-persistent.yml` override pattern.

---

## 4. Data Subject Rights (GDPR + EHDS)

Audit logs contain participant DIDs (organisation identifiers), not personal data directly. However:

- If a DID is linked to an individual in a Data Product, that constitutes personal data under GDPR Art. 4.
- Data subjects may request access to audit records that identify them (GDPR Art. 15).
- Deletion requests must be evaluated against EHDS Art. 50 retention obligations — the 10-year duty overrides GDPR Art. 17 erasure in most cases.

---

## 5. Roles and Responsibilities

| Role                           | Responsibility                                   |
| ------------------------------ | ------------------------------------------------ |
| Dataspace Operator             | Maintain backup schedule, monitor retention jobs |
| HDAB (Health Data Access Body) | Audit trail access for regulatory review         |
| Data Holder                    | Confirm completeness of their transfer events    |
| DPO (Data Protection Officer)  | Review policy annually, approve exceptions       |

---

## 6. Verification

To verify audit log completeness, query Neo4j:

```cypher
-- Count TransferEvents by month for the past year
MATCH (te:TransferEvent)
WHERE te.timestamp > datetime() - duration('P1Y')
RETURN date.truncate('month', date(te.timestamp)) AS month,
       count(te) AS events
ORDER BY month;
```

Annual audit review must be documented and signed off by the DPO.
