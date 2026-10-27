# ADR-063: HealthDCAT-AP follows the release Implementing Regulation 2026/2098 points to, today Release 8, in its own namespace

**Status:** Accepted (2026-10-27, implemented with #694)
**Date:** 2026-10-27
**Supersedes:** [ADR-003](ADR-003-healthdcat-ap-alignment.md)
**Relates to:** [ADR-020](ADR-020-cross-participant-dataset-discovery.md)
**Tracks:** [#694](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/694), [#26](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/26)

## Context

ADR-003 aligned the catalogue layer with "W3C HealthDCAT-AP 2.1". There is
no such W3C release. HealthDCAT-AP is the European Commission's application
profile of DCAT-AP for the EHDS, and the repository named three versions and
three namespaces for it at once:

| Where                                              | Version said | Namespace used                          |
| -------------------------------------------------- | ------------ | --------------------------------------- |
| ADR-003, the protocol table, the catalogue page    | 2.1          |                                         |
| `register-fhir-dataset-hdcatap.cypher`, README     | 1.0          |                                         |
| the proxy's JSON-LD (`routes/catalog.ts`)          |              | `http://healthdcat-ap.eu/ns#`           |
| the catalogue page's JSON-LD export                |              | `https://healthdcat-ap.github.io/ns#`   |
| the catalogue editor's Turtle                      |              | `http://healthdataportal.eu/ns/health#` |
| the EDC asset descriptions under `jad/edcv-assets` | 1.0          | `http://healthdcat-ap.eu/ns#`           |

Two things changed outside the repository:

- **Implementing Regulation (EU) 2026/2098** (Art. 77(4)) makes dataset
  descriptions use HealthDCAT-AP's definitions, cardinalities and vocabularies,
  with 27 minimum elements, and refers to the profile at its "latest" address
  rather than a fixed release. It applies from 26 March 2029.
- The profile moved. The GitHub site is decommissioned and redirects to
  `data.health.europa.eu/healthdcat-ap/releases/latest/`, which on 2026-10-27
  resolves to **Release 8**: a European Commission draft specification
  published 2026-05, extending **DCAT-AP 3.0**, with the prefix
  `healthdcatap` bound to `http://healthdataportal.eu/ns/health#`. Against
  Release 7, which #694 names, Release 8 adds an optional
  `healthdcatap:hdabCoordinator`, makes `dct:title` mandatory on the
  `csvw:TableGroup` that describes a dataset's variables, adds `adms:status`
  for withdrawn datasets and clarifies that `healthdcatap:hasVariables` is
  mandatory when `healthdcatap:hasStructuredData` is true.

## Decision

1. The hub targets **the release the implementing act points to**, which is
   the "latest" release. Code and documents name the release they were checked
   against, today **Release 8**, so a reader knows what "compliant" was
   measured against; moving to a newer release is a deliberate change with a
   line in this ADR's table below.
2. **One namespace**: `http://healthdataportal.eu/ns/health#`, the one the
   specification binds. The proxy's JSON-LD, the catalogue page's export and
   the EDC asset descriptions use it now; the editor already did.
3. **Version labels say "Release 8"** where they said 2.1 or 1.0: the
   protocol table in `.claude/rules/api-conventions.md`, the compliance
   reviewer, the OpenAPI description, the catalogue page, the architecture
   page, the README, the onboarding guide and the seed header. Historical
   material (submissions, past decks, the Spain demo guides) keeps what it
   said at the time.
4. The node labels ADR-003 introduced (`Catalogue`, `HealthDataset`,
   `Distribution`) stay.

| Release | Checked    | Notes                                               |
| ------- | ---------- | --------------------------------------------------- |
| 8       | 2026-10-27 | Namespace and labels aligned; metadata content open |

## Consequences

- The namespace change is visible to anyone who consumed the proxy's JSON-LD
  with the old prefix IRI. Nothing in this repository did; the federated
  crawler maps by local name.
- **Content is not yet Release 8.** The dataset descriptions do not carry the
  27 minimum elements of 2026/2098: missing today are among others
  `healthdcatap:hdab`, `hasCodingSystem`, `hasCodeValues`,
  `dcatap:applicableLegislation`, `hasStructuredData` with its variables, and
  provenance; `healthCategory` is free text instead of the Art. 51(1)(a)-(q)
  list; the catalogue enricher drops the health properties on federation.
  Those are #694 item 5 and validation against the Release 8 SHACL shapes is
  #26; both are follow-up work, tracked in their own issues.
- A release bump is now a small, explicit change: the table above, the labels,
  and the shapes the validator loads.

## Alternatives considered

- **Pin Release 7, as #694 says.** Lost because Release 8 has superseded it
  at the address the implementing act cites, and its changes are additive.
- **Keep the old namespace for compatibility.** Lost because no consumer
  depends on it, and a wrong namespace makes every triple the hub publishes
  mean something other than HealthDCAT-AP.
- **Say no version at all.** Lost because "HealthDCAT-AP compliant" without a
  release cannot be checked.
