---
source: docs/klarbefund/evidence.md
sourceHash: fc5bb296ce79d86a900f5cca02fcf97d746c0622fb87b553939e7d62d0325723
language: nl
summary: "De nauwkeurigheidsbenchmark, de pariteitscontrole van het woordenboek, het runverslag en wat nog ontbreekt."
---

# Klarbefund: bewijs

Wat een beoordelaar buiten dit project kan controleren aan Klarbefund, de iPhone-scanner
voor laboratoriumuitslagen ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)),
en wat nog ontbreekt. Geschreven voor de eerste vraag van een zorgverzekeraar, een ziekenhuis of een
auditor: _is de extractie juist, zijn de gegevens veilig, en is dit een
medisch hulpmiddel?_ Gegevensbescherming, BSI TR-03161 en regelgeving worden
beoordeeld in [`self-assessment.md`](self-assessment.md); hoe u dit alles
op een Mac uitvoert, staat in [`run-on-mac.md`](run-on-mac.md). De beschrijving voor de persoon zelf staat in
[`README.md`](README.md), de kant van de ontwikkelaar in
[`clients/ios/README.md`](../../clients/ios/README.md).

Klarbefund is open source onder de [Apache License 2.0](../../LICENSE). Het
project is geen leverancier: er staat geen bedrijf achter, er is geen ondersteuningscontract en
geen garantie. Wie de app, of een fork ervan, in gebruik neemt, exploiteert deze en draagt
de verplichtingen op het gebied van gegevensbescherming en beveiliging die daarbij horen.

## Status

- Bij de inzending voor de HL7 AI Challenge 2026 (deadline 2026-06-30) was Klarbefund
  een prototype. De prijs ("Open Solution") ging naar het EHDS-platform in
  deze repository.
- In de presentatie van de winnaar werd de app als livedemo getoond.
- De app staat in TestFlight, goedgekeurd door de bètabeoordeling van Apple voor externe testers
  ([ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)).
- De app leest Apple Health (HealthKit, alleen-lezen) en maakt verbinding met de demohub,
  waarvan het secundair gebruik plaatsvindt in de beveiligde verwerkingsomgeving van de hub
  ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).

## Wat al is aangetoond

| Bewering                                                                 | Bewijs                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Een verslechterde scan verliest rijen, maar verzint nooit waarden        | `Tests/SharedTests/ScanningTests.swift`: synthetische vellen onder scheefstand, schittering, weinig licht, onscherpte en lage resolutie, gelezen met Vision; elke gecodeerde waarde die niet op het vel staat, laat de test falen |
| Duitse getalnotatie (decimale komma, `1.240` = 1240, `0.300`)            | `Tests/SharedTests/LabLineParserTests.swift`                                                                                                                                                                                      |
| De eenheid bepaalt de LOINC-code; urine is nooit serum                   | `LabLineParserTests.swift`, `RealScanLessonsTests.swift` (lay-outs van 19 echte scans, elke waarde verzonnen)                                                                                                                     |
| Niets wordt stilzwijgend weggelaten                                      | Zelftest (`-MBSelfTest`, 27 controles): elke afgedrukte rij eindigt als gecodeerd, niet toegewezen of niet gelezen                                                                                                                |
| OCR-waarden blijven voorlopig                                            | Herkomstmodel (`Sources/Shared/Provenance.swift`): alleen de eigen PDF-tekstlaag van een laboratorium levert FHIR `final` op                                                                                                      |
| Een echte scan kan worden afgespeeld zonder de telefoon of de afbeelding | `swift run ScanReplay`, `swift run LabFile`; beide weigeren paden binnen deze repository                                                                                                                                          |
| Exports volgen standaarden                                               | FHIR R4-bundle met LOINC en UCUM (`FhirBundleParityTests.swift`), OMOP CDM v5.4 (`OmopExportTests.swift`)                                                                                                                         |
| Gegevens blijven standaard op het apparaat                               | OCR en analyse op het apparaat, versleuteling per item, geen iCloud-back-up, afzonderlijke toestemmingen, export en verwijdering ([README](README.md#privacy-and-safety))                                                         |

## Nauwkeurigheid meten

`ExtractionAccuracy` (`clients/ios/Sources/Shared/ExtractionAccuracy.swift`)
vergelijkt een extractie veld voor veld met een handmatig gecontroleerde referentie: waarde met
de vergelijkingsoperator, eenheid, LOINC-code (of de verwachte weigering), afgedrukt
referentie-interval en laboratoriumdatum. De kerncijfers:

- **exact**: rijen die in elk gecontroleerd veld juist zijn;
- **stille fouten**: rijen die zijn gecodeerd, dus als waarde worden getoond, en die onjuist zijn in
  waarde, eenheid of code. Dit is het getal dat klinisch telt; het doel
  is nul;
- **onecht**: gecodeerde waarden zonder een rij op het vel erachter;
- **gemist** en **niet gelezen**: verloren rijen, en regels die aan de beoordelaar worden voorgelegd.

Er zijn twee manieren om het uit te voeren:

1. **Synthetische benchmark, in CI.** `AccuracyBenchmarkTests` rendert het
   synthetische panel onder negen scanomstandigheden, leest het met Vision en controleert
   dat er onder elke omstandigheid nul stille fouten zijn. Lokaal: `cd clients/ios && swift test`; als
   `KLARBEFUND_BENCHMARK_OUT=<file>` is ingesteld, worden de aantallen daar als JSON weggeschreven.
   Een `ios-unit-tests`-job voor `.github/workflows/test.yml` (in behandeling, YAML in
   [`run-on-mac.md`](run-on-mac.md#4-put-the-swift-suite-into-ci)) voert de
   volledige Swift-suite uit op `macos-26` en bewaart die JSON als het
   artefact `klarbefund-accuracy-benchmark`; totdat die job er is, bouwt CI alleen het
   doel `Shared`. Er zijn geen echte gegevens bij betrokken, dus de JSON kan worden gepubliceerd zoals
   hij is.
2. **Pilot op echte uitslagen, nooit in de repository.** Een deelnemer exporteert
   diagnostiek uit de app (ADR-038), en naast elk `diagnostics.json` wordt
   op basis van het papier een `truth.json` geschreven:

   ```json
   {
     "schema": 1,
     "labDate": "2026-09-12",
     "rows": [
       {
         "label": "LDL-Cholesterin",
         "value": 141,
         "unit": "mg/dl",
         "loinc": "2089-1",
         "referenceText": "< 116"
       },
       {
         "label": "Ferritin",
         "value": 10,
         "comparator": "<",
         "unit": "ug/l",
         "loinc": "2276-4"
       },
       {
         "label": "Natrium [U]",
         "value": 80,
         "unit": "mmol/l",
         "loinc": null,
         "refused": true
       }
     ]
   }
   ```

   ```bash
   cd clients/ios
   swift run ScanReplay ~/Pilot/export --truth          # per row: which fields were wrong, no values
   swift run ScanReplay ~/Pilot/export --truth --json   # counts only, the part to publish
   ```

   Alleen de aantallen verlaten de map van de deelnemer. Voordat een uitslag wordt gebruikt:
   schriftelijke toestemming van de deelnemer (doel, bewaartermijn, intrekking, en
   of waarden naar een toelichtingsdienst gaan), en een controle dat de studie waaruit de
   uitslag afkomstig is het delen van de resultaten niet beperkt.

Streefwaarden per veld worden vastgelegd voordat een pilot wordt gemeten, en de
steekproefomvang van de pilot wordt naast elk getal vermeld.

## Uitvoeringsverslag

De checklist in [`run-on-mac.md`](run-on-mac.md) is voor het laatst uitgevoerd op 2026-10-15 bij
commit `1474295d` van deze branch, op macOS 26.7.1 met Xcode 26 (Swift 6.4).
Alles hieronder is de synthetische benchmark; er was geen echte uitslag bij betrokken, dus de
aantallen worden gepubliceerd zoals ze zijn in
[`accuracy-benchmark.json`](accuracy-benchmark.json), het bestand dat de uitvoering heeft geschreven.
Dit is het project dat zichzelf controleert: een beoordelaar reproduceert het met dezelfde
drie opdrachten, en een pilot op echte uitslagen staat nog open.

| Stap                      | Resultaat                                                |
| ------------------------- | -------------------------------------------------------- |
| `swift build`             | Shared, AnalyteParity, ScanReplay en LabFile gebouwd     |
| `swift run AnalyteParity` | pariteit ok: 1589 coderingen, 71 eenheden                |
| `swift test`              | 319 tests in 54 suites geslaagd, 0 fouten, ongeveer 10 s |

Eén synthetisch panel van 8 rijen, gelezen met Vision onder negen omstandigheden, in totaal 72
referentierijen. `AccuracyBenchmarkTests` controleert dat er onder elke
omstandigheid nul stille fouten zijn; de overige kolommen worden gerapporteerd, niet gecontroleerd.

| Omstandigheid              | Gevonden | Exact | Stille fouten | Onecht | Niet gelezen regels | Referentie juist |
| -------------------------- | -------: | ----: | ------------: | -----: | ------------------: | ---------------: |
| schone scan van 150 dpi    |        8 |     8 |             0 |      0 |                   0 |            8 / 8 |
| 1 graad scheef             |        8 |     8 |             0 |      0 |                   0 |            8 / 8 |
| 2 graden scheef            |        7 |     5 |             0 |      0 |                   0 |            5 / 7 |
| 5 graden scheef            |        5 |     0 |             0 |      0 |                   2 |            0 / 5 |
| schemerige ruimte          |        8 |     8 |             0 |      0 |                   0 |            8 / 8 |
| schittering door flitser   |        8 |     8 |             0 |      0 |                   0 |            8 / 8 |
| lichte bewegingsonscherpte |        7 |     7 |             0 |      0 |                   1 |            7 / 7 |
| sterke onscherpte          |        0 |     0 |             0 |      0 |                   0 |            0 / 0 |
| lage resolutie             |        7 |     6 |             0 |      0 |                   1 |            7 / 7 |
| **alle negen**             |       58 |    50 |         **0** |  **0** |                   4 |          51 / 58 |

Wat de getallen zeggen: een schoon, schemerig, schitterend of licht scheef vel wordt
volledig en exact gelezen. Naarmate het vel slechter wordt, verliest de app rijen, eerst in de
kolom met het referentie-interval, daarna hele rijen, totdat sterke onscherpte helemaal niets
meer oplevert. Op geen enkel moment toont de app een waarde, eenheid of code die onjuist is, en dat is
de eigenschap die de suite afdwingt.

Eén bevinding uit de uitvoering zelf: het testdoel compileerde niet met
Swift 6.4, omdat `Comparator` dubbelzinnig was geworden tussen `Shared` en de
platform-SDK. De test noemt nu `Shared.Comparator`, zoals `OmopExportTests`
al deed.

## Open

| Onderwerp                                    | Wat ontbreekt                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beoogd doel (MDR)                            | Een schriftelijke kwalificatie volgens MDCG 2019-11 Rev.1. Het grensgeval is het trendscherm, dat waarden kleurt tegen gepubliceerde bandbreedtes (ADR-039); het standpunt van het project is dat een vergelijking met een geciteerd getal geen bevinding is. Een extern advies.                                                                                                                                                                        |
| Exploitant van de gehoste toelichtingsdienst | Toelichtingen worden standaard op het apparaat uitgevoerd. De persoon kan overschakelen naar de gehoste dienst (standaard Azure OpenAI, EU-datazone; Anthropic als opt-in, Verenigde Staten) of naar een eigen Azure OpenAI- of Anthropic-account. Wie de gehoste dienst exploiteert, verwerkt gezondheidsgegevens en moet die rol documenteren (register van verwerkingsactiviteiten, verwerkersovereenkomsten).                                       |
| Gegevensbescherming                          | Gegevensstroomdiagram en een sjabloon voor een gegevensbeschermingseffectbeoordeling voor een exploitant.                                                                                                                                                                                                                                                                                                                                               |
| Beveiliging                                  | Dreigingsmodel, SBOM en een zelf uitgevoerde beveiligingstest bestaan sinds 2026-10-15 (`docs/security/threat-model-klarbefund.md`, `docs/sbom/`, `docs/security/security-test-report-2026-10-15.md`). De app wordt sinds 2026-10-15 vergrendeld met Face ID of de toegangscode (ADR-060). Open: een onafhankelijke penetratietest en de leemtelijst op eisniveau tegen BSI TR-03161 deel 1. CodeQL draait bij elke iOS-wijziging (`codeql-swift.yml`). |
| Nauwkeurigheid in de pilot                   | Referentiebestanden en geaggregeerde aantallen uit echte uitslagen, zoals hierboven.                                                                                                                                                                                                                                                                                                                                                                    |
