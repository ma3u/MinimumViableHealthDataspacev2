# Audit Log Retention Policy

## European Health Data Space (EHDS) Compliance

> Applies to: all deployments of the EHDS Integration Hub
> Legal basis: Regulation (EU) 2025/327, Art. 73(1)(e) (secure processing environment: logs of access and activity)
> Effective: 2026-03-25, corrected 2026-10-27 (#694)

---

## 1. What Must Be Logged

Every data access event must produce an audit record. The Neo4j proxy creates a
`TransferEvent` node for each access through `logTransferEvent()` in
`services/neo4j-proxy/src/audit.ts`.

Each record contains, among others:

| Field         | Description                                           |
| ------------- | ----------------------------------------------------- |
| `eventId`     | Unique UUID per event                                 |
| `timestamp`   | ISO-8601 datetime in UTC                              |
| `retainUntil` | `timestamp` plus 12 months; nothing deletes it before |
| `endpoint`    | API path accessed (e.g. `/omop/cohort`)               |
| `method`      | HTTP method                                           |
| `participant` | DID of the requesting organisation                    |
| `statusCode`  | HTTP response status                                  |
| `resultCount` | Number of records returned                            |
| `permitId`    | The data permit the access ran under, when known      |

Recorded transfers (`DataTransfer` nodes) carry `retainUntil` the same way.
Additionally, all HTTP access logs from Traefik (JSON format) are retained.

---

## 2. Retention Requirements

Art. 73(1)(e) requires the secure processing environment to keep identifiable logs
of access and of all activities in it for the period necessary to verify and audit
all processing operations, and at least one year. TEHDAS2 D7.4 (SPE specification,
v1.2) repeats the one-year floor. The hub keeps **12 months** as that floor:
`RETENTION_MONTHS` in `ui/src/lib/retention.ts` and `duration({months: 12})` in
`services/neo4j-proxy/src/audit.ts`.

| Log type                                   | Minimum retention | Basis                     |
| ------------------------------------------ | ----------------- | ------------------------- |
| Data access events (`TransferEvent` nodes) | **12 months**     | EHDS Art. 73(1)(e)        |
| Recorded transfers (`DataTransfer` nodes)  | **12 months**     | EHDS Art. 73(1)(e)        |
| Contract negotiations                      | not set           | no EHDS period of its own |
| Traefik HTTP access logs                   | **2 years**       | Internal operations       |
| Keycloak authentication logs               | **2 years**       | Internal operations       |
| Application error logs                     | **1 year**        | Internal operations       |

Twelve months is a floor, not a ceiling. An access body that needs a record for
longer to finish an audit (a supervision case under Art. 63, a complaint) keeps it
for that period; the "period necessary" half of Art. 73(1)(e) is what governs that.

An earlier version of this document claimed a ten-year duty under "EHDS Art.
50(3)". That was a proposal-era number (proposal Art. 50 is adopted Art. 73), and
no paragraph of the adopted Regulation sets ten years for these logs. No other
source in this repository supports it, so the claim is withdrawn. If a Member
State's implementing law or a data holder's own records duty sets a longer period,
cite that source next to the number before quoting it.

---

## 3. Implementation

### 3a. Neo4j: TransferEvent and DataTransfer nodes

Both are stored in the primary Neo4j instance with a persistent volume, and both
carry `retainUntil`, 12 months after they were recorded.

**Backup schedule:** Daily snapshot to object storage (StackIT Object Storage or S3-compatible).

The schema requires an id on every access event:

```cypher
// Run once after schema initialisation
CREATE CONSTRAINT transfer_event_immutable IF NOT EXISTS
FOR (te:TransferEvent) REQUIRE te.eventId IS NOT NULL;
```

**Retention enforcement:** `GET /api/admin/audit/retention` reports how many
records exist, how many are past `retainUntil` and how many are protected.
`POST /api/admin/audit/retention` with `{ "confirm": true }` deletes only the
records past their `retainUntil` date; a record without `retainUntil`, or younger
than 12 months, is never touched. Access body and operator only
(`HDAB_AUTHORITY`, `EDC_ADMIN`). The equivalent Cypher:

```cypher
MATCH (te:TransferEvent)
WHERE te.retainUntil IS NOT NULL
  AND datetime(toString(te.retainUntil)) < datetime()
DETACH DELETE te;
```

Purging is a decision, not a schedule: run it only when no audit still needs the
records.

### 3b. Traefik: HTTP access logs

Traefik is configured with `--accesslog=true --accesslog.format=json` in `docker-compose.jad.yml`.

In production (StackIT SKE), pipe Traefik logs to a log aggregation service:

```yaml
# K8s log retention label, add to the Traefik Deployment
metadata:
  labels:
    log-retention: "2y"
```

For local development, logs are written to the Docker daemon. To persist them:

```bash
docker logs health-dataspace-traefik --since 2025-01-01 > traefik-$(date +%Y%m).log
```

### 3c. Docker Compose: log driver

Add the following to all services in `docker-compose.jad.yml` to enable structured logging with size limits:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "10"
    labels: "service,retention"
```

Not applied yet: no compose file sets a log driver today. The Vault override that this section used to point at was removed in #404; Vault is file-backed in `docker-compose.jad.yml` itself since 2026-09-26.

---

## 4. Data Subject Rights (GDPR + EHDS)

Audit logs contain participant DIDs (organisation identifiers), not personal data directly. However:

- If a DID is linked to an individual in a Data Product, that constitutes personal data under GDPR Art. 4.
- Data subjects may request access to audit records that identify them (GDPR Art. 15).
- Erasure requests (GDPR Art. 17) are weighed against the Art. 73(1)(e) duty: a log
  younger than 12 months, or still needed to audit a processing operation, is kept
  (GDPR Art. 17(3)(b), a legal obligation).

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
// Count TransferEvents by month for the past year
MATCH (te:TransferEvent)
WHERE te.timestamp > datetime() - duration('P1Y')
RETURN date.truncate('month', date(te.timestamp)) AS month,
       count(te) AS events
ORDER BY month;
```

Annual audit review must be documented and signed off by the DPO.
