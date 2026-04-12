# ADR-001: PostgreSQL vs Neo4j Data Storage Split

**Status:** Accepted
**Date:** 2025-07-24
**Supersedes:** —

## Context

The JAD stack introduces PostgreSQL 17 with 7 databases for EDC-V connector state machines (contract negotiation, transfer process, policy definitions) and CFM services (Keycloak, IdentityHub, FederatedCatalog). Meanwhile, the health knowledge graph in Neo4j stores ~57K nodes across 5 layers — from marketplace metadata down to biomedical ontologies. These are fundamentally different data access patterns: transactional state machines vs. relationship-rich traversals.

## Decision

Split data storage by access pattern:

- **PostgreSQL** stores transactional, state-machine-driven data: EDC-V connector databases, CFM service databases, and Keycloak realm data.
- **Neo4j** stores the relationship-rich health knowledge graph (Layers 1-5): marketplace, HealthDCAT-AP metadata, FHIR R4 clinical, OMOP CDM analytics, and biomedical ontologies.
- **Layer 1 (marketplace)** is dual-write: EDC-V writes contract/transfer state to PostgreSQL, and a NATS event projection populates Neo4j L1 nodes for graph visualization.

## Consequences

### Positive

- Each database is used for its optimal access pattern
- Neo4j graph traversals remain fast without transactional locking overhead
- PostgreSQL ACID guarantees protect contract state machine integrity
- EDC-V/CFM services use their native PostgreSQL dialect without adaptation

### Trade-offs

- EDC-V PostgreSQL databases are opaque (schema owned by upstream projects)
- Neo4j L1 marketplace data is eventually consistent with PostgreSQL source of truth
- Dual-write via NATS adds operational complexity and requires monitoring for projection lag
- Developers must understand which store is authoritative for each data domain

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Neo4j schema: `neo4j/init-schema.cypher`
- JAD stack databases: `docker-compose.jad.yml`
