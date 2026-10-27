# HealthDCAT-AP Release 8 SHACL, vendored

The official validation shapes of
[HealthDCAT-AP Release 8](https://data.health.europa.eu/healthdcat-ap/releases/release-8/),
European Commission draft specification published 2026-05, extending DCAT-AP
3.0. Used by [`../validate.py`](../validate.py) for #700; why the hub follows
this release is [ADR-063](../../../docs/ADRs/ADR-063-healthdcat-ap-release-8-and-its-namespace.md).

| File                                | Source, under `https://data.health.europa.eu/healthdcat-ap/releases/release-8/html/shacl/HealthDCAT-AP_validator/config/rdf-validator/ehds/` |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `non-public-shapes.ttl`             | `shapes/non-public-shapes.ttl`                                                                                                               |
| `range.ttl`                         | `ranges/range.ttl`                                                                                                                           |
| `mdr-vocabularies.shape.ttl`        | `controlled-vocabularies/mdr-vocabularies.shape.ttl`                                                                                         |
| `non-public-shapes_recommended.ttl` | `recommended/non-public-shapes_recommended.ttl`                                                                                              |
| `imports.ttl`                       | `imports/imports.ttl`                                                                                                                        |

Downloaded 2026-10-27, byte for byte (the whitespace hooks skip this folder);
`SHA256SUMS` records them and the validator refuses a file that no longer
matches. The specification is published under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), European Commission.

The validator runs two stages, as the specification describes: DCAT-AP
3.0.1 first ([`../dcat-ap-3.0.1/`](../dcat-ap-3.0.1/README.md)), then these
shapes.

`vocabularies.ttl` is not upstream: it is a snapshot, made the same day, of
the EU controlled vocabularies the shapes check against, cut to each
concept's scheme, English label and type (only where the vocabulary states
one), and each scheme's title: health categories (Art. 51),
coding systems, standards and health themes from
`hdeu-dcat.data.health.europa.eu/resource/authority/`, and access rights, data
themes, dataset types, file types and the 24 official EU languages from
`publications.europa.eu/resource/authority/`. Refresh it when a vocabulary
changes.

## The class hierarchy the official validator loads

The HealthData@EU validator imports the ontologies listed in
`imports.ttl` (vendored from `imports/imports.ttl`, byte for byte) into the
data graph. Their `rdfs:subClassOf` triples decide what a shape targets, so
`imports-hierarchy.ttl` holds them (160 triples, made with
[`../snapshot-imports.py`](../snapshot-imports.py) on 2026-10-27), and the
validator adds it to every data graph. Two imports did not answer that day:
`www.w3.org/ns/adms.ttl` was taken from SEMIC's ADMS 2.00 copy (no
`subClassOf`), and `www.w3.org/ns/locn.ttl` was unreachable everywhere.

One consequence is upstream's: DCAT 2 makes `dcat:Catalog` a subclass of
`dcat:Dataset`, so every Dataset shape also judges the catalogue (hdab,
health category, provenance and the rest). The official validator reports
17 such violations on the hub's catalogue and 0 on its 20 datasets; the
release's own AGORA example, wrapped in a catalogue, shows the same. The
validator lists them, names them as that issue and does not fail on them;
`--strict` counts them. Remove that exception when upstream decides.

## One repair

In `non-public-shapes.ttl` the rule "if `healthdcatap:hasStructuredData` is
true there must be a `healthdcatap:hasVariables`" is an `sh:or` inside an
`sh:property` that has no `sh:path`. SHACL requires a path on a property
shape, and pySHACL refuses the file. The validator moves that `sh:or` to the
dataset's node shape in memory, where it states the same constraint, and
prints how many shapes it repaired. The file itself stays as published.

## Refreshing for a new release

Download the four files and `imports/imports.ttl` of the new release, update
this table and `SHA256SUMS`, regenerate `vocabularies.ttl` and
`imports-hierarchy.ttl`, run
`python3 scripts/healthdcat-ap/validate.py` on the fixture and on a running
proxy, and add a line to the release table in ADR-063's successor.
