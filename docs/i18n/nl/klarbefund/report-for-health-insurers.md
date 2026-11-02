---
source: docs/klarbefund/report-for-health-insurers.md
sourceHash: 821e6839f6e4c6afb7b5fe7ead3e9e6b766be700275755cd2ba9f59988ae279a
language: nl
summary: "De drie vragen van een zorgverzekeraar, klopt de extractie, zijn de gegevens veilig, is het een medisch hulpmiddel, beantwoord met het bewijs, plus het white-label- en adviesaanbod."
---

# Klarbefund: bewijsrapport voor zorgverzekeraars

Datum 2026-10-15. Opgesteld door het project voor een wettelijke of particuliere
zorgverzekeraar, een ziekenhuisgroep of een ePA-leverancier die dezelfde drie
vragen stelt: _is de extractie juist, zijn de gegevens veilig, en is dit een
medisch hulpmiddel?_ Alles hier is gegenereerd met tools die iedereen op de
repository kan uitvoeren, met de vermelde opdrachten, en elk open punt wordt als
open benoemd. De versie van één pagina voor een stuurgroepvergadering is de overzichtstabel; de
rest is het bewijs achter elke regel.

**Wat er wordt aangeboden.** Klarbefund is een demo-omgeving en een open-source
referentie-implementatie (Apache 2.0). Het is geen product met een leverancier
erachter. Wat het project een zorgverzekeraar aanbiedt, is ofwel een **white-labelversie**
van de app, onder de naam en de verantwoordelijkheid als exploitant van de zorgverzekeraar,
ofwel **technisch advies** om de scanner, het coderingswoordenboek
en de FHIR-writer te integreren in een ePA- of EPD-app die de zorgverzekeraar al exploiteert. Beide
routes vertrekken vanuit het onderstaande bewijs.

## Overzicht

| Vraag                                     | Antwoord, met het bewijs                                                                                                                                                                                                                                                                            | Status                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Leest de app laboratoriumwaarden correct? | Synthetische benchmark onder negen scanomstandigheden: 0 stille fouten, 0 verzonnen waarden, 50 van 72 rijen exact; verslechterde scans verliezen rijen, ze tonen nooit een onjuiste waarde. 1751 analytcoderingen, 71 eenheden, LOINC en UCUM.                                                     | aangetoond, pilot op echte uitslagen open |
| Zijn de gegevens veilig?                  | Standaard op het apparaat, Face ID of toegangscode vóór de resultaten, AES-GCM per record, sleutel in de door de Secure Enclave ondersteunde Keychain, geen pakket van derden, alleen-lezen Apple Health. CodeQL 0 bevindingen, 0 bekende kwetsbaarheden, 9 posture-tests, dreigingsmodel, SBOM.    | zelf getest, onafhankelijke test open     |
| Is het een medisch hulpmiddel?            | Beoogd doel: opslaan, weergeven, exporteren en uitleggen wat een meting is; geen diagnose, geen oordeel. Volgens MDCG 2019-11 in het algemeen geen hulpmiddel; de kleuring van de trends is het grensgeval dat het project schriftelijk heeft vastgelegd.                                           | standpunt vastgelegd, extern advies open  |
| Past het bij de ePA en de EHDS?           | FHIR R4 met LOINC, UCUM, SNOMED CT, CVX en ATC; de testdatabase bevat nu vier van de vijf prioritaire categorieën van EHDS art. 14; de hub exporteert het volledige dossier in één Bundle; het wellnesslabel van art. 47 is van toepassing als de app als interoperabel op de markt wordt gebracht. | ja                                        |
| Is het een DiGA?                          | Nee, bewust niet: een DiGA moet een hulpmiddel met CE-markering zijn. Er worden geen DiGA-certificaten geclaimd.                                                                                                                                                                                    | n.v.t.                                    |
| Kan mijn team dit verifiëren?             | Ja: bij elk getal hoort een opdracht, de scans en tests draaien op een Mac met Xcode, en de API-collectie van de hub (Bruno) oefent de integratie.                                                                                                                                                  | ja                                        |

## 1. Wat Klarbefund doet

Een persoon fotografeert een laboratoriumuitslag of opent de PDF van het laboratorium.
De app leest deze op het apparaat, codeert elke rij met LOINC en UCUM, bewaart
het afgedrukte referentie-interval, toont trends over uitslagen heen en exporteert het
dossier als FHIR R4, OMOP CDM, JSON of PDF. Waarden die uit een foto zijn gelezen, blijven
`preliminary` totdat de persoon ze controleert; alleen de eigen PDF-tekstlaag
van een laboratorium levert `final` op. Met toestemming schrijft de app het dossier van de persoon
naar diens eigen account op de EHDS-demohub, met daarnaast weekgemiddelden uit Apple
Health. Verder verlaat niets de telefoon.

Details: [`README.md`](README.md) (voor de persoon zelf),
[`clients/ios/README.md`](../../clients/ios/README.md) (ontwikkelaar),
[`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md).

## 2. Nauwkeurigheid

De maatstaf is `ExtractionAccuracy`: een vergelijking veld voor veld met een
handmatig gecontroleerde referentie, waarde, eenheid, code, referentie-interval en datum. Het getal
dat klinisch telt, is **stille fouten**, rijen die de app als waarde toonde
en onjuist had; de benchmark controleert dat dit onder elke omstandigheid nul is.

| Omstandigheid              | Gevonden | Exact | Stille fouten | Onecht |
| -------------------------- | -------: | ----: | ------------: | -----: |
| schone scan van 150 dpi    |        8 |     8 |             0 |      0 |
| 1 graad scheef             |        8 |     8 |             0 |      0 |
| 2 graden scheef            |        7 |     5 |             0 |      0 |
| 5 graden scheef            |        5 |     0 |             0 |      0 |
| schemerige ruimte          |        8 |     8 |             0 |      0 |
| schittering door flitser   |        8 |     8 |             0 |      0 |
| lichte bewegingsonscherpte |        7 |     7 |             0 |      0 |
| sterke onscherpte          |        0 |     0 |             0 |      0 |
| lage resolutie             |        7 |     6 |             0 |      0 |
| **alle negen**             |       58 |    50 |         **0** |  **0** |

Synthetische vellen, elk 8 rijen, gelezen met Apple Vision, 2026-10-15
([`accuracy-benchmark.json`](accuracy-benchmark.json)). Een pilot op echte
uitslagen, met schriftelijke toestemming en waarbij alleen aantallen de map van de deelnemer
verlaten, is ontworpen ([`evidence.md`](evidence.md#measuring-accuracy)) en
nog niet uitgevoerd; een eigen pilot van de zorgverzekeraar is de logische volgende stap.

## 3. Beveiliging en gegevensbescherming

| Laag                   | Wat is gedaan                                                                                                                                                                                             | Resultaat, 2026-10-15                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Statische analyse      | CodeQL over de app (82 Swift-bestanden); CodeQL en Semgrep over de hub in CI                                                                                                                              | 0 bevindingen                                                                 |
| Afhankelijkheden       | CycloneDX-stuklijsten voor de app en elke hubdienst ([`docs/sbom/`](../sbom/README.md)); grype en npm audit daartegen                                                                                     | 0 bekende kwetsbaarheden; de app heeft 0 pakketten van derden                 |
| Geheimen               | gitleaks over de boom en de laatste 200 commits                                                                                                                                                           | 0 na beoordeling                                                              |
| Containers, manifesten | trivy over Dockerfiles en Kubernetes-manifesten                                                                                                                                                           | 0 HIGH na twee correcties; 2 MEDIUM, 12 LOW geaccepteerd of open              |
| Buildconfiguratie      | `SecurityPostureTests`: entitlements, privacymanifest, ATS, cryptografie, PKCE, HealthKit alleen-lezen, exportconformiteit                                                                                | 11 van 11 geslaagd                                                            |
| Dreigingsmodel         | STRIDE voor de app ([`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md)) naast dat van de hub                                                                                          | opgesteld; restrisico's vermeld                                               |
| Live hub, van buitenaf | 40 anonieme black-boxcontroles: route-afscherming, redirects, headers, TLS, Keycloak-console                                                                                                              | TLS- en consolecontroles geslaagd; afschermingscontroles vereisen kantooruren |
| AVG                    | Art. 25 standaardinstellingen, art. 5 minimalisatie, art. 6/9 toestemmingen, art. 15/17/20 rechten: voldaan in code; transparantie en doorgiften deels; DPIA en rol van verwerkingsverantwoordelijke open | zie [`self-assessment.md`](self-assessment.md)                                |
| BSI TR-03161 deel 1    | Beoordeeld per groep doelstellingen: 9 voldaan, 3 deels, 1 open (weerbaarheid, met redenen afgewezen in ADR-060), 2 n.v.t.                                                                                | input voor de gapanalyse van een laboratorium                                 |

De volledige methode, bevindingen en correcties staan in
[`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md).
Het is het project dat zichzelf test. Een onafhankelijke penetratietest, waar
een zorgverzekeraar terecht om zal vragen, wordt daar vermeld met wat die zou toevoegen.

## 4. Positie ten aanzien van regelgeving

| Kader               | Positie                                                                                                                                                                                                                                                                                                                                                  | Open                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| MDR / IVDR          | Opslag, weergave, export en uitleg van wat een meting is; geen diagnose, risicoscore of behandeladvies. Volgens MDCG 2019-11 Rev.1 in het algemeen geen hulpmiddel. Het trendscherm kleurt waarden tegen gepubliceerde bandbreedtes met bronvermelding; het standpunt van het project is dat een vergelijking met een geciteerd getal geen bevinding is. | schriftelijke kwalificatie, extern advies |
| DiGA (§ 139e SGB V) | Niet van toepassing; bewust geen hulpmiddel                                                                                                                                                                                                                                                                                                              | geen                                      |
| EU AI-verordening   | Geen hoog risico zolang het geen hulpmiddel is; elk antwoord, op het apparaat of gehost, noemt aanbieder en model (art. 50)                                                                                                                                                                                                                              | geen                                      |
| EHDS 2025/327       | Art. 3 inzage in het dossier met toestemming; art. 47 wellnesslabel als de app op de markt wordt gebracht als interoperabel met EPD-systemen                                                                                                                                                                                                             | labeltekst bij het op de markt brengen    |
| Apple               | TestFlight-bèta goedgekeurd voor externe testers; App Privacy-label: gezondheidsgegevens, niet gekoppeld, niet gevolgd                                                                                                                                                                                                                                   | geen                                      |

## 5. De testdatabase en de soorten uitslagen die zij bevat

De demohub draait op 127 synthetische patiënten (Synthea) plus handmatig ingevoerde
dossiers, in een Neo4j-graaf die FHIR R4 en OMOP CDM weerspiegelt. Op 2026-10-15
kreeg deze de vier soorten uitslagen waar een ePA-integrator als eerste om vraagt (ADR-059).

| Soort uitslag                                                      | Codering            | In de app       | In de testdatabase | Hoe een integrator deze krijgt                   |
| ------------------------------------------------------------------ | ------------------- | --------------- | ------------------ | ------------------------------------------------ |
| Laboratorium, bloed en urine                                       | LOINC, UCUM         | ja              | ja                 | `/api/patient/observations`, FHIR Bundle         |
| Rust-ecg, Holter                                                   | LOINC 11524-6, EC   | ja              | **nieuw**          | `include=all`, DiagnosticReport met Observations |
| Spirometrie, CPET, inspanningstest, lactaat                        | LOINC, PF en EC     | ja              | gepland            |                                                  |
| DXA-lichaamssamenstelling                                          | LOINC 38269-7, RAD  | ja              | gepland            |                                                  |
| Continue glucosemonitoring                                         | LOINC 107930-0      | ja              | gepland            |                                                  |
| 24-uursbloeddruk, apparaatschermen                                 | LOINC               | ja              | gepland            |                                                  |
| Weekgemiddelden van wearables                                      | LOINC               | ja              | ja                 | geschreven door de app (ADR-057)                 |
| Verslagen van beeldvorming (röntgen, echocardiografie, echografie) | LOINC, RAD          | nee (verhalend) | **nieuw**          | `include=all`, DiagnosticReport met conclusie    |
| Vaccinatiegegevens                                                 | CVX                 | nee             | **nieuw**          | `include=all`, Immunization                      |
| Medicatieplan (BMP)                                                | ATC, dosering 1-0-1 | nee             | **nieuw**          | `include=all`, MedicationStatement               |
| Aandoeningen, medicatie                                            | SNOMED CT, RxNorm   | via de hub      | ja                 | profiel-API, `$everything`                       |

Kandidaten hierna, per categorie van EHDS art. 14: microbiologie,
allergiepanels, genetica (laboratoriumuitslagen); pathologie, slaaponderzoeken,
beschrijvende ecg-verslagen (verslagen); door patiënten gerapporteerde uitkomsten en ontslagbrieven
(patiëntenoverzicht, ontslagverslagen). Elk is één seedbestand en één mapper.

Oefening: `bruno/MVHDv2/01 Patient/06 My whole record` haalt de Bundle op
met alle vier categorieën en faalt duidelijk zichtbaar wanneer een categorie ontbreekt.

## 6. Integratieroutes

1. **White-label-app.** De app zoals hij is, hernoemd en ondertekend door de zorgverzekeraar,
   met de zorgverzekeraar als exploitant: privacyverklaring, DPIA, verwerkersovereenkomst
   voor de gehoste toelichtingsdienst (Azure OpenAI, EU-datazone, standaard),
   en het Apple-account. De code blijft open source.
2. **Componenten in een bestaande ePA- of EPD-app.** Het Swift-pakket `Shared`
   (scannen, het woordenboek met 1751 coderingen, herkomst, FHIR- en
   OMOP-writers, toestemmingen) heeft geen afhankelijkheid van derden en wordt gedekt door 419
   tests; het past in een bestaande iOS-app. Hetzelfde woordenboek bestaat in
   TypeScript (`services/epa-ingest`) voor een route aan de serverzijde.
3. **Alleen aan de kant van de hub.** Het platform van een zorgverzekeraar leest het dossier als FHIR R4
   uit de API van de hub, of voert de ePA-ingest-CLI uit op PDF's die het al
   in bezit heeft, zonder de app.

In elke route is de zorgverzekeraar eigenaar van de rollen op het gebied van gegevensbescherming; het project
levert de sjablonen en het bewijs.

## 7. Wat nog open is

| Punt                                                                             | Wie het afsluit                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| Onafhankelijke penetratietest, TR-03161-leemtelijst                              | een door het BSI erkend laboratorium               |
| Nauwkeurigheid van de pilot op echte uitslagen                                   | de pilot van de zorgverzekeraar, met toestemmingen |
| Schriftelijke MDR-kwalificatie, extern advies                                    | regelgevingsjuristen                               |
| DPIA, register van verwerkingsactiviteiten, rol van verwerkingsverantwoordelijke | de exploitant                                      |
| Secties op de profielpagina voor de nieuwe soorten uitslagen                     | het project                                        |
| Swift-suite in CI (vereist rechten voor workflows)                               | de eigenaar van de repository                      |

## 8. Verifieer het zelf

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2 && cd MinimumViableHealthDataspacev2
cd clients/ios && swift test                                   # 419 tests, incl. the benchmark and the posture tests
cd ../.. && scripts/security/scan-repo.sh                      # SBOM check, grype, trivy, gitleaks, semgrep, hadolint, npm audit
scripts/security/check-hub-blackbox.sh                         # the live hub from outside, office hours Mon-Fri 05:17-18:13 UTC
./scripts/run-api-tests.sh Local "01 Patient"                  # the record as an integrator receives it
```

Documenten: [`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md),
[`run-on-mac.md`](run-on-mac.md), [`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md),
[`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md),
[ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md).
