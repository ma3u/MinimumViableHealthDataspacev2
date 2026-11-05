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
the class hierarchy the HealthData@EU validator imports, less one triple:
DCAT 2's `dcat:Catalog rdfs:subClassOf dcat:Dataset` would bring the Dataset
shapes onto the catalogue node (17 violations). The HealthDCAT-AP team
confirmed this as upstream ([w3c/dx-dcat#136](https://github.com/w3c/dx-dcat/issues/136)),
will work around it in Release 9 and advised dropping the triple until then
(#884). With it dropped, 0 violations on the catalogue and on every dataset;
`--as-published` keeps it. The
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

Languages (#782): English is the source language. A translation is the same
property with the language as suffix (`titleDe`, `descriptionDe`,
`hdcatapKeywordsDe`, and `Fr`, `Nl`, `Es`), set by
`neo4j/seed-catalog-translations.cypher`: German and Spanish for every
dataset, French and Dutch where the dataset comes from a country that speaks
them, with the terms of `ui/src/lib/i18n/ehds-terminology.json` (French and
Spanish abbreviate the Regulation EEDS). The
serialiser writes `dct:title`, `dct:description` and `dcat:keyword` as values
tagged with their language (one value per language, as DCAT-AP asks), and the
catalogue shows the language a visitor picks in the menu bar, falling back to English
per text and marking the fallback. The editor does not take translations yet,
and the `catalog_search` fulltext index reads the English texts only.
