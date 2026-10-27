---
type: datamodel
title: HealthDCAT-AP catalogue metadata (L2)
description: European health metadata standard describing datasets; the layer federated discovery writes into.
resource: .claude/rules/api-conventions.md, ADR-063 (supersedes ADR-003)
tags: [dcat, L2, federation]
generated: { by: claude-code/fable-5, at: 2026-07-15T15:30:23Z }
verified: { by: human:ma3u, at: 2026-07-15T15:30:23Z }
status: stable
---

```
(:Catalogue)-[:CONTAINS]->(:HealthDataset {datasetId, title, description,
  license, conformsTo[], publisher})-[:HAS_DISTRIBUTION]->(:Distribution {format, accessUrl})
```

Federated datasets add `source: "federated"`, `publisherDid`, `lastSeenAt`
(written by [catalog-enricher](../services/catalog-enricher.md)). Surfaces in
`/data/discover` and `/catalog`.

Profile and namespace: HealthDCAT-AP **Release 8**, the release Implementing
Regulation (EU) 2026/2098 points to, prefix `healthdcatap` =
`http://healthdataportal.eu/ns/health#`
([ADR-063](../../ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md),
superseding ADR-003). The 27 minimum elements of 2026/2098 are not all
carried yet (#697); SHACL validation is #26.
