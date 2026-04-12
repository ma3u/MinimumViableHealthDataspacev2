# ADR-002: EDC Data Plane Architecture

**Status:** Accepted
**Date:** 2025-07-24
**Supersedes:** —

## Context

The health dataspace must serve two distinct clinical data formats — FHIR R4 for clinical exchange and OMOP CDM for observational analytics — each with different query patterns and access control requirements. The EDC connector's data plane needs to route requests to the correct backend while maintaining a single integration point for the Neo4j knowledge graph.

## Decision

Deploy a three-component data plane architecture:

1. **FHIR HTTP Data Plane** (port 11002) — DCore data plane instance handling FHIR R4 clinical data requests
2. **OMOP HTTP Data Plane** (port 11012) — DCore data plane instance handling OMOP CDM analytics requests
3. **Neo4j Query Proxy** (port 9090) — Express/TypeScript bridge that translates HTTP requests into parameterized Cypher queries against the Neo4j knowledge graph

The proxy serves as the single integration point between the data planes and Neo4j, exposing endpoints for FHIR Patient bundles, OMOP cohort queries, and HealthDCAT-AP catalog data.

## Consequences

### Positive

- Clear separation of clinical (FHIR) and analytics (OMOP) data paths
- Neo4j Query Proxy is the single integration point, simplifying security and monitoring
- Each data plane can be scaled independently based on load patterns
- Proxy uses parameterized Cypher, preventing injection attacks

### Trade-offs

- Three services to deploy and monitor instead of one monolithic data plane
- Proxy adds a network hop between data plane and Neo4j
- Proxy must be kept in sync with Neo4j schema changes

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Neo4j Proxy source: `services/neo4j-proxy/`
- Proxy endpoints: `/fhir/Patient`, `/omop/cohort`, `/catalog/datasets`
