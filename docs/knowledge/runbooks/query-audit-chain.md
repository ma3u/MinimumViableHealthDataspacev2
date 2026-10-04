# Runbook: The query audit chain

#418, [ADR-045](../../ADRs/ADR-045-observability-and-regulatory-audit-trail.md) plane 2,
first slice. Every NLQ query (`POST /nlq`) and federated query
(`POST /federated/query`) in the Neo4j proxy leaves a FHIR R4 `AuditEvent` in
the IHE BALP "Query" shape, hash-chained to the one before it. A refused query
is recorded too.

## What is decided

| Decision                              | Choice (2026-10-04)                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The record cannot be written          | **Fail closed**: the caller gets 503 and no data. A refused query stays refused.                  |
| The question and the generated Cypher | **SHA-256 only**. Cypher can carry values from the question, such as a name, so it is hashed too. |
| Scope of this slice                   | NLQ and federated queries. FHIR, OMOP, transfers, permits and patient rights follow.              |

## How the chain works

| Part                        | Where                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Record, chain, verification | `services/neo4j-proxy/src/audit-chain.ts`                                                    |
| Callers                     | `routes/nlq.ts`, `routes/federated.ts`                                                       |
| Schema                      | `neo4j/init-schema.cypher`: `AuditEvent.id`, `AuditChain.id` unique, index on `(chain, seq)` |
| Check                       | `scripts/verify-audit-chain.sh`                                                              |

- Each `(:AuditEvent)` holds `seq`, `prevHash`, `hash` and the resource as RFC 8785
  canonical JSON. `hash = SHA-256(JCS({chain, seq, prevHash, resource}))`; the first
  record's `prevHash` is 64 zeros.
- One `(:AuditChain {id: "query"})` node holds `seq` and `head`. The write
  transaction sets a property on it before reading them, which takes its lock, so
  concurrent queries extend the chain one at a time. Tested on Neo4j 5.26 with 25
  concurrent appends: sequence 1 to 25, no gap, no duplicate.
- Changing, removing or reordering any record breaks the hash of that record or
  the link of the next one.

## Check the chain

```bash
# local stack (defaults bolt://localhost:7687, neo4j / healthdataspace)
scripts/verify-audit-chain.sh
# another Neo4j
NEO4J_URI=bolt://host:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=... scripts/verify-audit-chain.sh
```

Exit 0: `intact, N record(s), head <hash>`. Exit 1: `BROKEN at seq N: <reason>`,
the first record that does not match. Exit 2: Neo4j could not be read.

## Not yet

The chain proves order and integrity inside Neo4j, but someone with write access
to Neo4j can rewrite the whole chain from a point onward. The next steps in #418
close that: a daily digest signed with Vault Transit and an RFC 3161 timestamp,
a write-once copy (S3 Object Lock or Azure Blob immutability), and
`GET /api/admin/audit/export` for the access body.
