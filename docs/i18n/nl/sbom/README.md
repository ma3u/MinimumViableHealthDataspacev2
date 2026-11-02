---
source: docs/sbom/README.md
sourceHash: 0d5a61c2ea379e0356f9642c14a9acd6110406a380ecb6a29fad43f3930ac18a
language: nl
summary: "Eén CycloneDX-stuklijst per uitrolbaar onderdeel, bytestabiel; --check faalt als een stuklijst niet meer bij haar lockfile past."
---

# Software bills of materials

Eén CycloneDX 1.5-bestand per uitrolbaar onderdeel, gegenereerd door
`scripts/security/generate-sbom.sh` (syft over de lockfiles, geen
`node_modules` nodig) en gecommit zodat een beoordelaar de SBOM naast de code
leest die ze beschrijft. `--check` faalt wanneer een gecommitte SBOM niet meer
overeenkomt met de lockfiles; zo wordt een wijziging in de afhankelijkheden
betrapt waarbij de SBOM is vergeten.

| Bestand                      | Wat                                          | Bron van waarheid                              |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `ui.cdx.json`                | de Next.js-hub, `ui/`                        | `ui/package-lock.json`                         |
| `neo4j-proxy.cdx.json`       | de brug voor FHIR, OMOP en NLQ               | `services/neo4j-proxy/package-lock.json`       |
| `epa-ingest.cdx.json`        | de ePA-ingest-CLI en het analytenwoordenboek | `services/epa-ingest/package-lock.json`        |
| `claude-federation.cdx.json` | de gehoste uitlegdienst (ADR-034)            | `services/claude-federation/package-lock.json` |
| `klarbefund-ios.cdx.json`    | de iPhone-app, `clients/ios`                 | `Package.swift`, `project.yml`, de imports     |

De iPhone-app declareert geen pakket van derden, dus haar SBOM somt de
Apple-frameworks op die ze linkt (uit de `import`-statements, via
`scripts/security/generate-ios-sbom.py`) en vermeldt dat in haar metadata. Dat
is de controleerbare vorm van de bewering in
[`docs/klarbefund/self-assessment.md`](../klarbefund/self-assessment.md)
(BSI TR-03161 O.TrdP).

Kwetsbaarheden tegen deze SBOM's: `scripts/security/scan-repo.sh` voert er
lokaal grype over uit; `.github/workflows/security-scan.yml` doet hetzelfde in
de CI voor de hub en uploadt het resultaat naar het tabblad Security.
Containerimages worden apart gescand, met trivy, in dezelfde workflow.
