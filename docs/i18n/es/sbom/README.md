---
source: docs/sbom/README.md
sourceHash: 0d5a61c2ea379e0356f9642c14a9acd6110406a380ecb6a29fad43f3930ac18a
language: es
summary: "Una lista de materiales CycloneDX por componente desplegable, estable byte a byte; --check falla cuando una lista ya no coincide con su archivo de bloqueo."
---

# Listas de materiales de software

Un archivo CycloneDX 1.5 por cada componente desplegable, generado por
`scripts/security/generate-sbom.sh` (syft sobre los lockfiles, sin necesidad
de `node_modules`) y confirmado en el repositorio para que un revisor lea la
lista junto al código que describe. `--check` falla cuando una lista
confirmada ya no coincide con los lockfiles; así se detecta un cambio de
dependencias en el que se olvidó la lista.

| Archivo                      | Qué                                                      | Fuente de referencia                           |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `ui.cdx.json`                | el hub Next.js, `ui/`                                    | `ui/package-lock.json`                         |
| `neo4j-proxy.cdx.json`       | el puente de FHIR, OMOP y NLQ                            | `services/neo4j-proxy/package-lock.json`       |
| `epa-ingest.cdx.json`        | la CLI de ingesta de la ePA y el diccionario de analitos | `services/epa-ingest/package-lock.json`        |
| `claude-federation.cdx.json` | el servicio de explicaciones alojado (ADR-034)           | `services/claude-federation/package-lock.json` |
| `klarbefund-ios.cdx.json`    | la aplicación para iPhone, `clients/ios`                 | `Package.swift`, `project.yml`, los imports    |

La aplicación para iPhone no declara ningún paquete de terceros, por lo que
su lista enumera los frameworks de Apple que enlaza (a partir de las
sentencias `import`, mediante `scripts/security/generate-ios-sbom.py`) y lo
indica en sus metadatos. Esa es la forma comprobable de la afirmación de
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI TR-03161 O.TrdP).

Vulnerabilidades frente a estas listas: `scripts/security/scan-repo.sh`
ejecuta grype sobre ellas en local; `.github/workflows/security-scan.yml` hace
lo mismo en la CI para el hub y sube el resultado a la pestaña Security. Las
imágenes de contenedor se analizan por separado, con trivy, en el mismo
workflow.
