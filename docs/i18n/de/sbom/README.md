---
source: docs/sbom/README.md
sourceHash: 0d5a61c2ea379e0356f9642c14a9acd6110406a380ecb6a29fad43f3930ac18a
language: de
summary: "Eine CycloneDX-Stückliste je auslieferbarem Teil, bytegenau stabil; --check schlägt fehl, wenn eine Stückliste nicht mehr zu ihrer Lock-Datei passt."
---

# Software-Stücklisten

Eine CycloneDX-1.5-Datei je auslieferbarem Teil, erzeugt von
`scripts/security/generate-sbom.sh` (syft über die Lockfiles, ohne
`node_modules`) und eingecheckt, damit ein Prüfer die Stückliste neben dem Code
liest, den sie beschreibt. `--check` schlägt fehl, wenn eine eingecheckte
Stückliste nicht mehr zu den Lockfiles passt; so fällt eine geänderte
Abhängigkeit auf, deren Stückliste vergessen wurde.

| Datei                        | Was                                          | Maßgebliche Quelle                             |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `ui.cdx.json`                | der Next.js-Hub, `ui/`                       | `ui/package-lock.json`                         |
| `neo4j-proxy.cdx.json`       | die Brücke für FHIR, OMOP und NLQ            | `services/neo4j-proxy/package-lock.json`       |
| `epa-ingest.cdx.json`        | die ePA-Ingest-CLI und das Analyt-Wörterbuch | `services/epa-ingest/package-lock.json`        |
| `claude-federation.cdx.json` | der gehostete Erklärdienst (ADR-034)         | `services/claude-federation/package-lock.json` |
| `klarbefund-ios.cdx.json`    | die iPhone-App, `clients/ios`                | `Package.swift`, `project.yml`, die Importe    |

Die iPhone-App bindet kein Paket Dritter ein. Ihre Stückliste führt daher die
Apple-Frameworks auf, die sie linkt (aus den `import`-Anweisungen, durch
`scripts/security/generate-ios-sbom.py`), und sagt das in ihren Metadaten. Das
ist die prüfbare Form der Aussage in
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI TR-03161 O.TrdP).

Schwachstellen gegen diese Stücklisten: `scripts/security/scan-repo.sh` lässt
grype lokal darüber laufen; `.github/workflows/security-scan.yml` tut dasselbe
in der CI für den Hub und lädt das Ergebnis in den Security-Tab hoch.
Container-Images werden getrennt davon mit trivy geprüft, im selben Workflow.
