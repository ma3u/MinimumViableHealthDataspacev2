---
type: datamodel
title: HealthDCAT-AP catalogue metadata (L2)
description: European health metadata standard describing datasets; the layer federated discovery writes into.
resource: .claude/rules/api-conventions.md, ADR-003
tags: [dcat, L2, federation]
timestamp: 2026-07-15T00:00:00Z
---

```
(:Catalogue)-[:CONTAINS]->(:HealthDataset {datasetId, title, description,
  license, conformsTo[], publisher})-[:HAS_DISTRIBUTION]->(:Distribution {format, accessUrl})
```

Federated datasets add `source: "federated"`, `publisherDid`, `lastSeenAt`
(written by [catalog-enricher](../services/catalog-enricher.md)). Alignment
decision: ADR-003. Surfaces in `/data/discover` and `/catalog`.
