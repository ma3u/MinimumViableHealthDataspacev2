# ADR-003: W3C HealthDCAT-AP Alignment

**Status:** Accepted
**Date:** 2025-07-24
**Supersedes:** —

## Context

The initial Neo4j schema used informal node labels for dataset metadata (e.g., `DataDistribution`, `DataCatalog`) that did not align with the W3C HealthDCAT-AP 2.1 vocabulary. For interoperability with other EHDS dataspaces and compliance with the DSP Catalog Protocol, the metadata layer must use standard vocabulary terms and support JSON-LD serialization.

## Decision

Align Neo4j Layer 2 (metadata) nodes to the formal HealthDCAT-AP vocabulary:

- Rename `DataDistribution` to `Distribution`
- Rename `DataCatalog` to `Catalogue` (British spelling per DCAT-AP)
- Add mandatory DCAT-AP properties: `dct:title`, `dct:description`, `dct:publisher`, `dcat:theme`
- Add recommended properties: `dct:conformsTo`, `dct:license`, `dcat:temporalResolution`
- Implement JSON-LD serialization on the `/catalog/datasets` endpoint for federated catalog exchange

## Consequences

### Positive

- Enables federated catalog interoperability with other EHDS dataspaces
- JSON-LD output satisfies DSP Catalog Protocol requirements
- Standard vocabulary makes the schema self-documenting for domain experts
- Aligns with EU regulatory expectations for cross-border health data sharing

### Trade-offs

- Existing queries referencing old node labels required migration
- JSON-LD serialization adds complexity to the proxy layer
- Must track HealthDCAT-AP specification updates as the standard evolves

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- Neo4j schema: `neo4j/init-schema.cypher`
- HealthDCAT-AP spec: W3C HealthDCAT-AP 2.1
