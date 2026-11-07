---
source: docs/sbom/README.md
sourceHash: b6ea390a515e8f32871bc2a5e3054d3f902d56d7ff7838ab3ab1202a837b8a20
language: nl
summary: Eén CycloneDX-stuklijst per uitrolbaar onderdeel, bytestabiel; --check faalt als een stuklijst niet meer bij haar lockfile past.
---

# Software bills of materials

Eén CycloneDX-bestand per uitrolbaar onderdeel ([1.7](https://cyclonedx.org/docs/1.7/json/) voor de hub en de
drie diensten, [1.5](https://cyclonedx.org/docs/1.5/json/) voor de iPhone-app, zoals de `specVersion` van elk
bestand aangeeft), gegenereerd door
[`scripts/security/generate-sbom.sh`](../../scripts/security/generate-sbom.sh) ([syft](https://github.com/anchore/syft/releases/tag/v1.51.1) over de lockfiles, geen
`node_modules` nodig) en gecommit zodat een beoordelaar de SBOM naast de code
leest die ze beschrijft. `--check` faalt wanneer een gecommitte SBOM niet meer
overeenkomt met de lockfiles; zo wordt een wijziging in de afhankelijkheden
betrapt waarbij de SBOM is vergeten.

| Bestand                                                    | Wat                                                                                         | Bron van waarheid                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`ui.cdx.json`](ui.cdx.json)                               | de Next.js-hub, [`ui/`](../../ui)                                                           | [`ui/package-lock.json`](../../ui/package-lock.json)                                                           |
| [`neo4j-proxy.cdx.json`](neo4j-proxy.cdx.json)             | de brug voor FHIR, OMOP en NLQ                                                              | [`services/neo4j-proxy/package-lock.json`](../../services/neo4j-proxy/package-lock.json)                       |
| [`epa-ingest.cdx.json`](epa-ingest.cdx.json)               | de ePA-ingest-CLI en het analytenwoordenboek                                                | [`services/epa-ingest/package-lock.json`](../../services/epa-ingest/package-lock.json)                         |
| [`claude-federation.cdx.json`](claude-federation.cdx.json) | de gehoste uitlegdienst ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md)) | [`services/claude-federation/package-lock.json`](../../services/claude-federation/package-lock.json)           |
| [`klarbefund-ios.cdx.json`](klarbefund-ios.cdx.json)       | de iPhone-app, [`clients/ios`](../../clients/ios)                                           | [`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), de imports |

De iPhone-app declareert geen pakket van derden, dus haar SBOM somt de
Apple-frameworks op die ze linkt (uit de `import`-statements, via
[`scripts/security/generate-ios-sbom.py`](../../scripts/security/generate-ios-sbom.py)) en vermeldt dat in haar metadata. Dat
is de controleerbare vorm van de bewering in
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.TrdP).

Kwetsbaarheden tegen deze SBOM's: [`scripts/security/scan-repo.sh`](../../scripts/security/scan-repo.sh) voert er
lokaal [grype](https://github.com/anchore/grype/releases/tag/v0.118.0) over uit; [`.github/workflows/security-scan.yml`](../../.github/workflows/security-scan.yml) doet hetzelfde in
de CI voor de hub en uploadt het resultaat naar het [tabblad Security](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning).
Containerimages worden apart gescand, met [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), in dezelfde workflow.
