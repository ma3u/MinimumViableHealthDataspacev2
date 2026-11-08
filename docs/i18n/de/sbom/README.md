---
source: docs/sbom/README.md
sourceHash: b6ea390a515e8f32871bc2a5e3054d3f902d56d7ff7838ab3ab1202a837b8a20
language: de
summary: Eine CycloneDX-Stückliste je auslieferbarem Teil, bytegenau stabil; --check schlägt fehl, wenn eine Stückliste nicht mehr zu ihrer Lock-Datei passt.
---

# Software-Stücklisten

Eine CycloneDX-Datei je auslieferbarem Teil ([1.7](https://cyclonedx.org/docs/1.7/json/) für den Hub und die
drei Dienste, [1.5](https://cyclonedx.org/docs/1.5/json/) für die iPhone-App, wie es die `specVersion` jeder
Datei angibt), erzeugt von
[`scripts/security/generate-sbom.sh`](../../scripts/security/generate-sbom.sh) ([syft](https://github.com/anchore/syft/releases/tag/v1.51.1) über die Lockfiles, ohne
`node_modules`) und eingecheckt, damit ein Prüfer die Stückliste neben dem Code
liest, den sie beschreibt. `--check` schlägt fehl, wenn eine eingecheckte
Stückliste nicht mehr zu den Lockfiles passt; so fällt eine geänderte
Abhängigkeit auf, deren Stückliste vergessen wurde.

| Datei                                                      | Was                                                                                            | Maßgebliche Quelle                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`ui.cdx.json`](ui.cdx.json)                               | der Next.js-Hub, [`ui/`](../../ui)                                                             | [`ui/package-lock.json`](../../ui/package-lock.json)                                                            |
| [`neo4j-proxy.cdx.json`](neo4j-proxy.cdx.json)             | die Brücke für FHIR, OMOP und NLQ                                                              | [`services/neo4j-proxy/package-lock.json`](../../services/neo4j-proxy/package-lock.json)                        |
| [`epa-ingest.cdx.json`](epa-ingest.cdx.json)               | die ePA-Ingest-CLI und das Analyt-Wörterbuch                                                   | [`services/epa-ingest/package-lock.json`](../../services/epa-ingest/package-lock.json)                          |
| [`claude-federation.cdx.json`](claude-federation.cdx.json) | der gehostete Erklärdienst ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md)) | [`services/claude-federation/package-lock.json`](../../services/claude-federation/package-lock.json)            |
| [`klarbefund-ios.cdx.json`](klarbefund-ios.cdx.json)       | die iPhone-App, [`clients/ios`](../../clients/ios)                                             | [`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), die Importe |

Die iPhone-App bindet kein Paket Dritter ein. Ihre Stückliste führt daher die
Apple-Frameworks auf, die sie linkt (aus den `import`-Anweisungen, durch
[`scripts/security/generate-ios-sbom.py`](../../scripts/security/generate-ios-sbom.py)), und sagt das in ihren Metadaten. Das
ist die prüfbare Form der Aussage in
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.TrdP).

Schwachstellen gegen diese Stücklisten: [`scripts/security/scan-repo.sh`](../../scripts/security/scan-repo.sh) lässt
[grype](https://github.com/anchore/grype/releases/tag/v0.118.0) lokal darüber laufen; [`.github/workflows/security-scan.yml`](../../.github/workflows/security-scan.yml) tut dasselbe
in der CI für den Hub und lädt das Ergebnis in den [Security-Tab](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning) hoch.
Container-Images werden getrennt davon mit [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0) geprüft, im selben Workflow.
