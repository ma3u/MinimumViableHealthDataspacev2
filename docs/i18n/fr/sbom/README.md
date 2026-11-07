---
source: docs/sbom/README.md
sourceHash: b6ea390a515e8f32871bc2a5e3054d3f902d56d7ff7838ab3ab1202a837b8a20
language: fr
summary: Une nomenclature CycloneDX par composant déployable, stable à l’octet près ; --check échoue quand une nomenclature ne correspond plus à son fichier de verrouillage.
---

# Nomenclatures logicielles

Un fichier CycloneDX par composant déployable ([1.7](https://cyclonedx.org/docs/1.7/json/) pour le hub et les
trois services, [1.5](https://cyclonedx.org/docs/1.5/json/) pour l’application iPhone, comme l’indique le
`specVersion` de chaque fichier), généré par
[`scripts/security/generate-sbom.sh`](../../scripts/security/generate-sbom.sh) ([syft](https://github.com/anchore/syft/releases/tag/v1.51.1) sur les lockfiles, sans besoin de
`node_modules`) et versionné afin qu’un relecteur lise la nomenclature à côté
du code qu’elle décrit. `--check` échoue lorsqu’une nomenclature versionnée ne
correspond plus aux lockfiles ; c’est ainsi qu’est détectée une modification
de dépendance qui a oublié la nomenclature.

| Fichier                                                    | Contenu                                                                                              | Source de référence                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`ui.cdx.json`](ui.cdx.json)                               | le hub Next.js, [`ui/`](../../ui)                                                                    | [`ui/package-lock.json`](../../ui/package-lock.json)                                                            |
| [`neo4j-proxy.cdx.json`](neo4j-proxy.cdx.json)             | la passerelle FHIR, OMOP et NLQ                                                                      | [`services/neo4j-proxy/package-lock.json`](../../services/neo4j-proxy/package-lock.json)                        |
| [`epa-ingest.cdx.json`](epa-ingest.cdx.json)               | la CLI d’ingestion ePA et le dictionnaire des analytes                                               | [`services/epa-ingest/package-lock.json`](../../services/epa-ingest/package-lock.json)                          |
| [`claude-federation.cdx.json`](claude-federation.cdx.json) | le service d’explication hébergé ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md)) | [`services/claude-federation/package-lock.json`](../../services/claude-federation/package-lock.json)            |
| [`klarbefund-ios.cdx.json`](klarbefund-ios.cdx.json)       | l’application iPhone, [`clients/ios`](../../clients/ios)                                             | [`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), les imports |

L’application iPhone ne déclare aucun paquet tiers ; sa nomenclature liste
donc les frameworks Apple qu’elle lie (à partir des instructions `import`, via
[`scripts/security/generate-ios-sbom.py`](../../scripts/security/generate-ios-sbom.py)) et l’indique dans ses métadonnées.
C’est la forme vérifiable de l’affirmation figurant dans
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.TrdP).

Vulnérabilités par rapport à ces nomenclatures : [`scripts/security/scan-repo.sh`](../../scripts/security/scan-repo.sh)
exécute [grype](https://github.com/anchore/grype/releases/tag/v0.118.0) sur elles en local ; [`.github/workflows/security-scan.yml`](../../.github/workflows/security-scan.yml) fait
de même dans la CI pour le hub et téléverse le résultat dans [l’onglet
Security](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning). Les images de conteneurs sont analysées séparément, avec [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), dans
le même workflow.
