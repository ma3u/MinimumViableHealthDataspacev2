---
source: docs/klarbefund/evidence.md
sourceHash: fc5bb296ce79d86a900f5cca02fcf97d746c0622fb87b553939e7d62d0325723
language: de
summary: "Der Genauigkeits-Benchmark, die Paritätsprüfung des Wörterbuchs, das Laufprotokoll und was noch fehlt."
---

# Klarbefund: Belege

Was eine Prüferin oder ein Prüfer außerhalb dieses Projekts an Klarbefund, dem iPhone-Scanner
für Laborbefunde ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)),
überprüfen kann und was noch fehlt. Geschrieben für die erste Frage einer Krankenversicherung, eines
Krankenhauses oder eines Auditors: _Ist die Extraktion richtig, sind die Daten sicher, und ist
dies ein Medizinprodukt?_ Datenschutz, BSI TR-03161 und Regulierung werden
in [`self-assessment.md`](self-assessment.md) bewertet; wie man all dies
auf einem Mac ausführt, steht in [`run-on-mac.md`](run-on-mac.md). Die Beschreibung für die Nutzerinnen und Nutzer steht in
[`README.md`](README.md), die Entwicklerseite in
[`clients/ios/README.md`](../../clients/ios/README.md).

Klarbefund ist Open Source unter der [Apache License 2.0](../../LICENSE). Das
Projekt ist kein Hersteller: Es steht kein Unternehmen dahinter, es gibt keinen Supportvertrag und
keine Gewährleistung. Wer die App oder einen Fork davon bereitstellt, betreibt sie und trägt
die damit verbundenen Pflichten für Datenschutz und Sicherheit.

## Status

- Bei der Einreichung zur HL7 AI Challenge 2026 (Einsendeschluss 2026-06-30) war Klarbefund
  ein Prototyp. Die Auszeichnung ("Open Solution") ging an die EHDS-Plattform in
  diesem Repository.
- In der Präsentation der Gewinner wurde die App als Live-Demo gezeigt.
- Sie ist in TestFlight, durch Apples Beta-Prüfung für externe Tester freigegeben
  ([ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)).
- Sie liest Apple Health (HealthKit, nur lesend) und verbindet sich mit dem Demo-Hub,
  dessen Sekundärnutzung in der sicheren Verarbeitungsumgebung des Hubs läuft
  ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).

## Was bereits belegt ist

| Aussage                                                                      | Beleg                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ein verschlechterter Scan verliert Zeilen, er erfindet nie Werte             | `Tests/SharedTests/ScanningTests.swift`: synthetische Blätter mit Schräglage, Blendung, schwachem Licht, Unschärfe und niedriger Auflösung, mit Vision gelesen; jeder codierte Wert, der nicht auf dem Blatt steht, lässt den Test scheitern |
| Deutsche Zahlenregeln (Dezimalkomma, `1.240` = 1240, `0.300`)                | `Tests/SharedTests/LabLineParserTests.swift`                                                                                                                                                                                                 |
| Die Einheit bestimmt den LOINC-Code; Urin ist nie Serum                      | `LabLineParserTests.swift`, `RealScanLessonsTests.swift` (Layouts von 19 echten Scans, jeder Wert erfunden)                                                                                                                                  |
| Nichts wird stillschweigend verworfen                                        | Selbsttest (`-MBSelfTest`, 27 Prüfungen): Jede gedruckte Zeile endet als codiert, nicht zugeordnet oder ungelesen                                                                                                                            |
| OCR-Werte bleiben vorläufig                                                  | Provenienzmodell (`Sources/Shared/Provenance.swift`): Nur die eigene PDF-Textebene eines Labors ergibt FHIR `final`                                                                                                                          |
| Ein echter Scan kann ohne das Telefon oder das Bild erneut abgespielt werden | `swift run ScanReplay`, `swift run LabFile`; beide verweigern Pfade innerhalb dieses Repositorys                                                                                                                                             |
| Exporte sind standardkonform                                                 | FHIR-R4-Bundle mit LOINC und UCUM (`FhirBundleParityTests.swift`), OMOP CDM v5.4 (`OmopExportTests.swift`)                                                                                                                                   |
| Daten bleiben standardmäßig auf dem Gerät                                    | Texterkennung und Analyse auf dem Gerät, Verschlüsselung pro Eintrag, kein iCloud-Backup, getrennte Einwilligungen, Export und Löschung ([README](README.md#privacy-and-safety))                                                             |

## Genauigkeit messen

`ExtractionAccuracy` (`clients/ios/Sources/Shared/ExtractionAccuracy.swift`)
vergleicht eine Extraktion Feld für Feld mit einer von Hand geprüften Wahrheit: Wert mit
seinem Vergleichsoperator, Einheit, LOINC-Code (oder die erwartete Verweigerung), gedruckter Referenzbereich
und Labordatum. Seine Kennzahlen:

- **exakt**: Zeilen, die in jedem geprüften Feld richtig sind;
- **stille Fehler**: Zeilen, die codiert, also als Wert angezeigt wurden und in
  Wert, Einheit oder Code falsch sind. Dies ist die klinisch entscheidende Zahl; das Ziel
  ist null;
- **unecht**: codierte Werte, hinter denen keine Zeile auf dem Blatt steht;
- **verpasst** und **ungelesen**: verlorene Zeilen und Zeilen, die zur Prüfung übergeben wurden.

Zwei Arten, es auszuführen:

1. **Synthetischer Benchmark, in der CI.** `AccuracyBenchmarkTests` rendert das
   synthetische Panel unter neun Scanbedingungen, liest es mit Vision und stellt sicher,
   dass unter jeder Bedingung null stille Fehler auftreten. Lokal: `cd clients/ios && swift test`; ist
   `KLARBEFUND_BENCHMARK_OUT=<file>` gesetzt, werden die Zählwerte dort als JSON geschrieben.
   Ein Job `ios-unit-tests` für `.github/workflows/test.yml` (ausstehend, YAML in
   [`run-on-mac.md`](run-on-mac.md#4-put-the-swift-suite-into-ci)) führt die
   gesamte Swift-Suite auf `macos-26` aus und bewahrt dieses JSON als das
   Artefakt `klarbefund-accuracy-benchmark` auf; bis er eingebunden ist, baut die CI nur das
   Target `Shared`. Es sind keine echten Daten beteiligt, daher kann das JSON so veröffentlicht werden,
   wie es ist.
2. **Pilot mit echten Befunden, nie im Repository.** Eine teilnehmende Person exportiert
   Diagnosedaten aus der App (ADR-038), und neben jede
   `diagnostics.json` wird aus dem Papierbefund eine `truth.json` geschrieben:

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

   Nur die Zählwerte verlassen den Ordner der teilnehmenden Person. Bevor ein Befund verwendet wird:
   schriftliche Einwilligung der teilnehmenden Person (Zweck, Aufbewahrung, Widerruf und
   ob Werte an einen Erklärdienst gehen) sowie eine Prüfung, dass die Studie, aus der der
   Befund stammt, die Weitergabe ihrer Ergebnisse nicht einschränkt.

Zielwerte pro Feld werden festgelegt, bevor ein Pilot gemessen wird, und der
Stichprobenumfang des Piloten wird neben jeder Zahl angegeben.

## Laufprotokoll

Die Checkliste in [`run-on-mac.md`](run-on-mac.md) wurde zuletzt am 2026-10-15 ausgeführt, bei
Commit `1474295d` dieses Branches, auf macOS 26.7.1 mit Xcode 26 (Swift 6.4).
Alles Folgende ist der synthetische Benchmark; kein echter Befund war beteiligt, daher werden die
Zählwerte so veröffentlicht, wie sie in
[`accuracy-benchmark.json`](accuracy-benchmark.json) stehen, der Datei, die der Lauf geschrieben hat.
Dies ist das Projekt, das sich selbst prüft: Eine Prüferin oder ein Prüfer reproduziert es mit denselben
drei Befehlen, und ein Pilot mit echten Befunden ist noch offen.

| Schritt                   | Ergebnis                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `swift build`             | Shared, AnalyteParity, ScanReplay und LabFile gebaut       |
| `swift run AnalyteParity` | Parität in Ordnung: 1589 Codierungen, 71 Einheiten         |
| `swift test`              | 319 Tests in 54 Suites bestanden, 0 Fehlschläge, etwa 10 s |

Ein synthetisches Panel mit 8 Zeilen, mit Vision unter neun Bedingungen gelesen, insgesamt 72
Wahrheitszeilen. `AccuracyBenchmarkTests` stellt sicher, dass unter jeder Bedingung null stille Fehler auftreten;
die anderen Spalten werden berichtet, nicht geprüft.

| Bedingung                  | Gefunden | Exakt | Stille Fehler | Unecht | Ungelesene Zeilen | Referenz richtig |
| -------------------------- | -------: | ----: | ------------: | -----: | ----------------: | ---------------: |
| sauberer Scan mit 150 dpi  |        8 |     8 |             0 |      0 |                 0 |            8 / 8 |
| 1 Grad schräg              |        8 |     8 |             0 |      0 |                 0 |            8 / 8 |
| 2 Grad schräg              |        7 |     5 |             0 |      0 |                 0 |            5 / 7 |
| 5 Grad schräg              |        5 |     0 |             0 |      0 |                 2 |            0 / 5 |
| dunkler Raum               |        8 |     8 |             0 |      0 |                 0 |            8 / 8 |
| Blitzreflex                |        8 |     8 |             0 |      0 |                 0 |            8 / 8 |
| leichte Bewegungsunschärfe |        7 |     7 |             0 |      0 |                 1 |            7 / 7 |
| starke Unschärfe           |        0 |     0 |             0 |      0 |                 0 |            0 / 0 |
| niedrige Auflösung         |        7 |     6 |             0 |      0 |                 1 |            7 / 7 |
| **alle neun**              |       58 |    50 |         **0** |  **0** |                 4 |          51 / 58 |

Was die Zahlen sagen: Ein sauberes, dunkles, spiegelndes oder leicht schräges Blatt wird
vollständig und exakt gelesen. Je stärker sich das Blatt verschlechtert, desto mehr Zeilen verliert die App, zuerst in der
Spalte des Referenzbereichs, dann ganze Zeilen, bis starke Unschärfe überhaupt nichts mehr
ergibt. An keiner Stelle zeigt sie einen Wert, eine Einheit oder einen Code, der falsch ist; das ist
die Eigenschaft, die die Suite durchsetzt.

Eine Feststellung aus dem Lauf selbst: Das Test-Target ließ sich mit
Swift 6.4 nicht kompilieren, weil `Comparator` zwischen `Shared` und dem
Plattform-SDK mehrdeutig geworden war. Der Test nennt jetzt `Shared.Comparator`, wie es `OmopExportTests`
bereits tat.

## Offen

| Thema                                   | Was fehlt                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zweckbestimmung (MDR)                   | Eine schriftliche Qualifizierung nach MDCG 2019-11 Rev.1. Der Grenzfall ist der Trendbildschirm, der Werte gegenüber veröffentlichten Bereichen einfärbt (ADR-039); die Position des Projekts ist, dass ein Vergleich mit einer zitierten Zahl kein Befund ist. Ein externes Gutachten.                                                                                                                                                                                |
| Betreiber des gehosteten Erklärdienstes | Erklärungen laufen standardmäßig auf dem Gerät. Die Person kann zum gehosteten Dienst wechseln (Standard Azure OpenAI, EU-Datenzone; Anthropic als Opt-in, Vereinigte Staaten) oder zu ihrem eigenen Azure-OpenAI- oder Anthropic-Konto. Wer den gehosteten Dienst betreibt, verarbeitet Gesundheitsdaten und muss diese Rolle dokumentieren (Verzeichnis von Verarbeitungstätigkeiten, Auftragsverarbeitungsverträge).                                                |
| Datenschutz                             | Datenflussdiagramm und eine Vorlage für eine Datenschutz-Folgenabschätzung für einen Betreiber.                                                                                                                                                                                                                                                                                                                                                                        |
| Sicherheit                              | Bedrohungsmodell, SBOM und ein selbst durchgeführter Sicherheitstest existieren seit 2026-10-15 (`docs/security/threat-model-klarbefund.md`, `docs/sbom/`, `docs/security/security-test-report-2026-10-15.md`). Die App sperrt sich seit 2026-10-15 mit Face ID oder dem Gerätecode (ADR-060). Offen: ein unabhängiger Penetrationstest und die Lückenliste auf Anforderungsebene gegen BSI TR-03161 Teil 1. CodeQL läuft bei jeder iOS-Änderung (`codeql-swift.yml`). |
| Genauigkeit im Pilot                    | Wahrheitsdateien und aggregierte Zählwerte aus echten Befunden, wie oben.                                                                                                                                                                                                                                                                                                                                                                                              |
