---
type: datamodel
title: HealthDCAT-AP catalogue metadata (L2)
description: European health metadata standard describing datasets; the layer federated discovery writes into.
resource: .claude/rules/api-conventions.md, ADR-063 (supersedes ADR-003), services/neo4j-proxy/src/healthdcat-ap.ts, scripts/healthdcat-ap/validate.py
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
superseding ADR-003).

Release 8 content (#700): `neo4j/register-healthdcat-ap-r8.cypher` gives every
dataset the mandatory properties as vocabulary codes (`hdcatapAccessRights`,
`hdcatapApplicableLegislation`, `hdcatapHealthCategories`, `hdcatapHasStructuredData`,
`hdcatapCodingSystems`, `hdcatapHealthThemes`, ...), an access body
(`(:Participant)-[:GOVERNS]->`), a contact point, a distribution and its
variables:

```
(:HealthDataset)-[:HAS_VARIABLES]->(:VariablesTableGroup {groupId, title})
  -[:HAS_TABLE]->(:VariablesTable {tableId, name, title})
  -[:HAS_COLUMN]->(:VariablesColumn {columnId, name, title, description, datatype})
```

`services/neo4j-proxy/src/healthdcat-ap.ts` serialises it as JSON-LD with the
EU vocabularies' IRIs; `scripts/healthdcat-ap/validate.py` checks it with the
official SHACL for non-public data, in CI on the golden fixture
(`services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld`). It loads
the class hierarchy the HealthData@EU validator imports, so both agree: 0
violations on every dataset, and 17 on the catalogue node, where DCAT 2's
`dcat:Catalog rdfs:subClassOf dcat:Dataset` brings in the Dataset shapes. That
is an upstream question; the validator names it and does not fail on it
(`--strict` does). The
catalogue enricher carries the properties through federation.

The recommended properties come from the graph where it holds a dataset's
patients: the people (without those who opted out, Art. 71), their ages, the
period and the most frequent SNOMED CT codes. For the synthetic datasets
whose patients are not in the graph, the seed states the population, period,
ages and ICD-10 codes (section 6 of `neo4j/register-healthdcat-ap-r8.cypher`).
Every dataset also states how often it grows (irregularly), its time step (a
day) and how long it is kept (ten years after its last record). Left out on
purpose: `dpv:hasPersonalData` (the data is synthetic), `adms:sample` (data
leaves only under a permit), `dct:source`, `dct:relation` and
`dct:isReferencedBy` (none exist) and `dqv:hasQualityAnnotation`, the Art. 78
quality label (#697).

`/catalog/editor` writes a dataset under the same property names, with the
Art. 51 categories the data holder states, and gives it what Release 8
requires of every dataset, so a saved entry validates at once. Its Turtle
export is the proxy's JSON-LD written as Turtle (`ui/src/lib/healthdcat-ap.ts`);
CI validates the Turtle and checks it is the same graph
(`validate.py --same-as`).
