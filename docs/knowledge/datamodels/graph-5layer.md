---
type: datamodel
title: 5-layer knowledge graph
description: The unifying model — dataspace, metadata, clinical, analytics, ontology — in one Neo4j database.
resource: neo4j/init-schema.cypher, docs/health-dataspace-graph-schema.md
tags: [neo4j, architecture]
timestamp: 2026-07-15T00:00:00Z
---

L1 Dataspace Marketplace → L2 HealthDCAT-AP → L3 FHIR R4 → L4 OMOP CDM →
L5 Biomedical Ontology. Layers connect via `CODED_BY` (L3/L4 → L5) and
`MAPS_TO` (L3 → L4). Layer accent colours are fixed in
`ui/src/lib/graph-constants.ts`. Diagram: `docs/diagrams/graph-5layer.mmd`.
Details: [fhir-r4-nodes](fhir-r4-nodes.md), [omop-cdm-nodes](omop-cdm-nodes.md),
[dsp-contract-chain](dsp-contract-chain.md), [healthdcat-ap](healthdcat-ap.md).
