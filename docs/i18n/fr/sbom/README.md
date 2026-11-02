---
source: docs/sbom/README.md
sourceHash: 0d5a61c2ea379e0356f9642c14a9acd6110406a380ecb6a29fad43f3930ac18a
language: fr
---

# Nomenclatures logicielles

Un fichier CycloneDX 1.5 par composant déployable, généré par
`scripts/security/generate-sbom.sh` (syft sur les lockfiles, sans besoin de
`node_modules`) et versionné afin qu’un relecteur lise la nomenclature à côté
du code qu’elle décrit. `--check` échoue lorsqu’une nomenclature versionnée ne
correspond plus aux lockfiles ; c’est ainsi qu’est détectée une modification
de dépendance qui a oublié la nomenclature.

| Fichier                      | Contenu                                                | Source de référence                            |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `ui.cdx.json`                | le hub Next.js, `ui/`                                  | `ui/package-lock.json`                         |
| `neo4j-proxy.cdx.json`       | la passerelle FHIR, OMOP et NLQ                        | `services/neo4j-proxy/package-lock.json`       |
| `epa-ingest.cdx.json`        | la CLI d’ingestion ePA et le dictionnaire des analytes | `services/epa-ingest/package-lock.json`        |
| `claude-federation.cdx.json` | le service d’explication hébergé (ADR-034)             | `services/claude-federation/package-lock.json` |
| `klarbefund-ios.cdx.json`    | l’application iPhone, `clients/ios`                    | `Package.swift`, `project.yml`, les imports    |

L’application iPhone ne déclare aucun paquet tiers ; sa nomenclature liste
donc les frameworks Apple qu’elle lie (à partir des instructions `import`, via
`scripts/security/generate-ios-sbom.py`) et l’indique dans ses métadonnées.
C’est la forme vérifiable de l’affirmation figurant dans
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI TR-03161 O.TrdP).

Vulnérabilités par rapport à ces nomenclatures : `scripts/security/scan-repo.sh`
exécute grype sur elles en local ; `.github/workflows/security-scan.yml` fait
de même dans la CI pour le hub et téléverse le résultat dans l’onglet
Security. Les images de conteneurs sont analysées séparément, avec trivy, dans
le même workflow.
