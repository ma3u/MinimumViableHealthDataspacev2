---
source: docs/sbom/README.md
sourceHash: b6ea390a515e8f32871bc2a5e3054d3f902d56d7ff7838ab3ab1202a837b8a20
language: es
summary: Una lista de materiales CycloneDX por componente desplegable, estable byte a byte; --check falla cuando una lista ya no coincide con su archivo de bloqueo.
---

# Listas de materiales de software

Un archivo CycloneDX por cada componente desplegable ([1.7](https://cyclonedx.org/docs/1.7/json/) para el hub
y los tres servicios, [1.5](https://cyclonedx.org/docs/1.5/json/) para la aplicación para iPhone, como indica
el `specVersion` de cada archivo), generado por
[`scripts/security/generate-sbom.sh`](../../scripts/security/generate-sbom.sh) ([syft](https://github.com/anchore/syft/releases/tag/v1.51.1) sobre los lockfiles, sin necesidad
de `node_modules`) y confirmado en el repositorio para que un revisor lea la
lista junto al código que describe. `--check` falla cuando una lista
confirmada ya no coincide con los lockfiles; así se detecta un cambio de
dependencias en el que se olvidó la lista.

| Archivo                                                    | Qué                                                                                                      | Fuente de referencia                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`ui.cdx.json`](ui.cdx.json)                               | el hub Next.js, [`ui/`](../../ui)                                                                        | [`ui/package-lock.json`](../../ui/package-lock.json)                                                            |
| [`neo4j-proxy.cdx.json`](neo4j-proxy.cdx.json)             | el puente de FHIR, OMOP y NLQ                                                                            | [`services/neo4j-proxy/package-lock.json`](../../services/neo4j-proxy/package-lock.json)                        |
| [`epa-ingest.cdx.json`](epa-ingest.cdx.json)               | la CLI de ingesta de la ePA y el diccionario de analitos                                                 | [`services/epa-ingest/package-lock.json`](../../services/epa-ingest/package-lock.json)                          |
| [`claude-federation.cdx.json`](claude-federation.cdx.json) | el servicio de explicaciones alojado ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md)) | [`services/claude-federation/package-lock.json`](../../services/claude-federation/package-lock.json)            |
| [`klarbefund-ios.cdx.json`](klarbefund-ios.cdx.json)       | la aplicación para iPhone, [`clients/ios`](../../clients/ios)                                            | [`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), los imports |

La aplicación para iPhone no declara ningún paquete de terceros, por lo que
su lista enumera los frameworks de Apple que enlaza (a partir de las
sentencias `import`, mediante [`scripts/security/generate-ios-sbom.py`](../../scripts/security/generate-ios-sbom.py)) y lo
indica en sus metadatos. Esa es la forma comprobable de la afirmación de
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.TrdP).

Vulnerabilidades frente a estas listas: [`scripts/security/scan-repo.sh`](../../scripts/security/scan-repo.sh)
ejecuta [grype](https://github.com/anchore/grype/releases/tag/v0.118.0) sobre ellas en local; [`.github/workflows/security-scan.yml`](../../.github/workflows/security-scan.yml) hace
lo mismo en la CI para el hub y sube el resultado a la [pestaña Security](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning). Las
imágenes de contenedor se analizan por separado, con [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), en el mismo
workflow.
