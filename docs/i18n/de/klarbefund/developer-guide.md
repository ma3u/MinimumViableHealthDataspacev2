---
source: docs/klarbefund/developer-guide.md
sourceHash: f0d7769fce7fc6456f496107240e536fdaaf9613f960c0c227a902737249f275
language: de
summary: "Die App bauen, starten und testen: die Pipeline von der Kamera bis zum versiegelten Speicher, das gemeinsame Wörterbuch, der Aufbau des Speichers, der Entwicklungsdatensatz, die beiden Testsuiten, Diagnose und TestFlight."
---

# Entwicklerhandbuch für Klarbefund

Wie Sie die iPhone-App in
[`clients/ios/`](../../clients/ios/) bauen, ausführen, testen und ändern. Das [Benutzerhandbuch](user-guide.md) zeigt,
was eine Person sieht; dieses Handbuch zeigt, was dahintersteht. Die kurze Befehlsübersicht
ist [`clients/ios/README.md`](../../clients/ios/README.md); die Arbeit wird
in [Issue #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) verfolgt.

Jeder Screenshot und jede Zahl in diesem Handbuch stammt aus dem eigenen
fiktiven Entwicklungsdatensatz der App. Nirgends im Repository ist ein realer Befund
beteiligt, und [die zwei Regeln am Ende](#two-rules-that-are-not-negotiable)
sagen, warum das nicht verhandelbar ist.

## Was Sie brauchen

| Werkzeug                                                                 | Version                                                                                                                                                                                                                                                     | Wozu                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS mit Xcode                                                          | [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes) oder neuer, iOS 26 SDK oder neuer; die CI baut mit Xcode 26.6 auf dem [macOS-26-Runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) | Die App zielt auf iOS 26; das Swift-Paket deklariert macOS 26 für die Werkzeuge                                                                                                                                               |
| Swift                                                                    | 6.0, [strikte Nebenläufigkeit](https://www.swift.org/documentation/concurrency/)                                                                                                                                                                            | [`Package.swift`](../../clients/ios/Package.swift) und [`project.yml`](../../clients/ios/project.yml) legen es beide fest                                                                                                     |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen)                        | `brew install xcodegen`                                                                                                                                                                                                                                     | Das `.xcodeproj` wird aus `project.yml` erzeugt und nie committet                                                                                                                                                             |
| Node                                                                     | wie für `ui/`                                                                                                                                                                                                                                               | Nur um das Wörterbuch aus [`services/epa-ingest`](../../services/epa-ingest) neu zu erzeugen                                                                                                                                  |
| [PlantUML](https://www.plantuml.com/), [Graphviz](https://graphviz.org/) | `brew install plantuml`                                                                                                                                                                                                                                     | Nur um die Diagramme in diesem Handbuch neu zu rendern                                                                                                                                                                        |
| Ein iPhone                                                               | iOS 26 oder neuer                                                                                                                                                                                                                                           | Nur für die Kamera, Face ID, [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) und [TestFlight](https://developer.apple.com/testflight/); alles andere läuft im Simulator |

## Wie es aufgebaut ist

![Klarbefund als geschichtete ArchiMate-Sicht: die Geschäftsschicht mit der Person, der Ärztin oder dem Arzt und dem Forschungsteam sowie den sechs Dingen, die eine Person tut; die Anwendungsschicht mit den vier Diensten, der App, dem Shared-Paket, den Werkzeugen, dem Hub und dem Generator; die Technologieschicht mit den Frameworks des iPhones, dem Mac und Azure Container Apps](img/klarbefund-architecture.svg)

Quelle: [`diagrams/klarbefund-architecture.puml`](diagrams/klarbefund-architecture.puml),
gerendert mit [`scripts/render-plantuml.sh`](../../scripts/render-plantuml.sh) `docs/klarbefund/diagrams/*.puml`.

Die Sicht folgt [ArchiMate 3.2](https://pubs.opengroup.org/architecture/archimate32-doc/): Die Geschäftsschicht (gelb) zeigt, wer was
tut, die Anwendungsschicht (blau) die Dienste, die die Software bereitstellt, und
die Komponenten, die sie realisieren, die Technologieschicht (grün), worauf alles
läuft. Ein Pfeil von einem unteren Band zu einem oberen bedeutet „dient“; ein gepunkteter
Pfeil mit hohler Spitze bedeutet „realisiert“. Drei Dinge lassen sich daraus ablesen:

- **[`Sources/Shared`](../../clients/ios/Sources/Shared/)** ist ein Swift-Paket, das für iOS und macOS kompiliert. Es
  enthält den Parser, die Nachverarbeitung der Texterkennung, das generierte Wörterbuch der Parameter
  und die Referenzbereiche, das Datensatzmodell mit seiner Herkunft sowie
  die Exportformate ([FHIR R4](https://hl7.org/fhir/R4/), [OMOP CDM](https://ohdsi.github.io/CommonDataModel/cdm54.html), das Diagnosepaket). Nichts darin
  berührt das Netzwerk, den Schlüsselbund oder den Speicher, weshalb jede
  Zahl, die die App berechnet, auf einem Mac mit `swift test` reproduziert werden kann.
- **[`Sources/MeinBefund`](../../clients/ios/Sources/MeinBefund/)** ist die App: SwiftUI-Views, [VisionKit](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller)-Scannen, der
  versiegelte Speicher, das Teilen-Menü der Exporte, die EHDS-Verbindung, die App-Sperre,
  die Analyse-Anbieter sowie die nur im Debug-Build vorhandenen Demodaten und der Selbsttest.
- **[`Tools/`](../../clients/ios/Tools)** sind vier Kommandozeilenprogramme auf Basis des Shared-Pakets:
  [`LabFile`](../../clients/ios/Tools/LabFile) importiert ein PDF oder Bild genau so, wie es die App täte, [`ScanReplay`](../../clients/ios/Tools/ScanReplay)
  lässt einen Diagnoseexport erneut durch den aktuellen Parser laufen, [`AnalyteParity`](../../clients/ios/Tools/AnalyteParity)
  belegt, dass das generierte Wörterbuch seiner TypeScript-Quelle entspricht, und [`IconGen`](../../clients/ios/Tools/IconGen)
  zeichnet das App-Symbol.

```
clients/ios/
  project.yml                    XcodeGen spec: the Shared framework and the MeinBefund app
  Package.swift                  SwiftPM: Shared, the four tools, SharedTests
  Sources/Shared/                parser, provenance model, formats; *.generated.swift are generated
  Sources/MeinBefund/            the app; en.lproj and de.lproj hold the strings
  Tools/{LabFile,ScanReplay,AnalyteParity,IconGen}/
  Tests/SharedTests/             Swift Testing: what the app computes
  Tests/UITests/                 XCUITest: what it shows, and what a tap does
  Scripts/                       build, install, upload, screenshots, localisation, CodeQL
  appstore/                      App Store Connect texts and the screenshot upload
```

## Bauen und ausführen

```bash
cd clients/ios
brew install xcodegen                          # once
swift test                                     # the Shared package, on the Mac
swift run AnalyteParity                        # the generated table agrees with its source
xcodegen generate && open MeinBefund.xcodeproj # then run the MeinBefund scheme in Xcode
```

Von der Kommandozeile in einen Simulator beachten Sie die **Ad-hoc-Signatur**:
Ohne sie schlägt jeder Schlüsselbund-Aufruf mit [`-34018`](https://developer.apple.com/documentation/security/errsecmissingentitlement) fehl, und der Speicher kann
seinen Schlüssel nicht anlegen.

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES build
```

Auf ein angeschlossenes iPhone: [`Scripts/install-device.sh`](../../clients/ios/Scripts/install-device.sh). Das generierte Projekt
enthält kein Signing-Team, daher schlägt ein einfaches `xcodebuild` für ein Gerät fehl; das
Skript ergänzt eines aus `TEAM_ID` oder aus dem Schlüsselbund und installiert, was es
gebaut hat. TestFlight: [`Scripts/archive-and-upload.sh`](../../clients/ios/Scripts/archive-and-upload.sh); sein Kopf nennt die vier
Dinge, die zuvor im Apple-Developer-Konto vorhanden sein müssen. Die Version ist
in `project.yml` festgelegt: `MARKETING_VERSION` entspricht dem Eintrag in [App Store Connect](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds),
und `CURRENT_PROJECT_VERSION` steigt mit jedem Upload, weil App
Store Connect eine bereits gesehene Build-Nummer ablehnt, und zwar erst nach dem Upload.

## Demodaten und Startargumente

<img src="img/list.png" width="300" alt="Die Befundliste, gefüllt mit dem Entwicklungsdatensatz: sieben fiktive Befunde von einem Labor, einer Praxis und einem Studienzentrum über drei Jahre"> <img src="img/detail.png" width="300" alt="Ein fiktiver Befund aus dem Entwicklungsdatensatz, mit zu prüfenden Werten und den Listen der nicht zugeordneten und nicht gelesenen Zeilen">

Jedes der folgenden Startargumente existiert nur in einem Debug-Build. Die Prüfungen sind
`#if DEBUG`, nicht nur ein Flag: Ein Flag kann entdeckt werden, Code, der nicht
kompiliert ist, nicht.

| Argument               | Was es bewirkt                                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-MBDemoSeed`          | Zwei fiktive Befunde, nur im Arbeitsspeicher. Genug für einen Screenshot; damit startet jeder UI-Test.                                                                                                                       |
| `-MBDevData`           | Sieben fiktive Befunde über drei Jahre und vier Quellen, im Code erzeugt: Ein Verlauf hat eine Form, die Liste der nicht zugeordneten Zeilen hat Einträge, jeder Befund hat Seiten.                                          |
| `-MBShot <screen>`     | Öffnet einen Bildschirm direkt, sobald die Befunde geladen sind: `list detail scan trends reference history profile consent settings privacy consents connect programmes graph relate relatePaired relateUSB relateUSBDone`. |
| `-MBSelfTest`          | Führt einen synthetischen Befund durch die gesamte Pipeline im App-Target und protokolliert 27 Prüfungen (siehe [Der Selbsttest](#the-self-test)).                                                                           |
| `-MBUSBSelfTest`       | Wartet über das USB-Kabel mit einem festen Testtoken auf den Mac und sendet nur den Endrahmen ([Relate](#relate-der-graph-auf-dem-telefon-und-auf-dem-mac)).                                                                 |
| `-MBExportDiagnostics` | Erstellt das Diagnosearchiv im temporären Verzeichnis der App für [`Scripts/pull-diagnostics.sh`](../../clients/ios/Scripts/pull-diagnostics.sh).                                                                            |

Der Entwicklungsdatensatz wird **erzeugt, nicht gespeichert**. Eine Zeile gibt die Bezeichnung, den Wert,
die Einheit und den vom Labor gedruckten Bereich an, und [`Analytes.lookup`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) codiert sie
genau so, wie es einen Scan codiert. Kein Code im Datensatz kann falsch sein, eine Zeile, die das
Wörterbuch nicht codieren kann, landet von selbst in der Liste der nicht zugeordneten Zeilen, und der
Datensatz folgt dem Wörterbuch, wenn sich das Wörterbuch ändert. Die Seiten werden
von [`SyntheticSheet`](../../clients/ios/Sources/Shared/SyntheticSheet.swift) gezeichnet, demselben Renderer, den die Tests lesen.

Ein Demostart sperrt nie: Die App-Sperre liest das Seed-Flag und bleibt offen,
sodass die UI-Tests und das Screenshot-Skript dort laufen, wo niemand eine
Code-Abfrage beantworten kann. In einem Release-Build existieren weder das Flag noch die Ausnahme.

Screenshots für die Dokumentation und den App Store stammen aus einem Skript,
das jeden Bildschirm per Argument statt per gescripteter Tipps startet, sodass
eine neue Aufnahme nach einer Layoutänderung keine neuen Koordinaten braucht:

```bash
SEED=-MBDevData OUT=/tmp/shots SCREENS="list detail trends" Scripts/capture-screenshots.sh
Scripts/capture-screenshots.sh                 # the App Store set, size-checked, into appstore/screenshots/en
```

## Von der Kamera in den Speicher

![Die Scan-Pipeline als Sequenz: Der Scanner der App übergibt die Seiten an LabImport, das die Herkunft bestimmt, den Text erkennt oder liest, die Durchläufe abgleicht, die Spaltenrollen ableitet, jede Zeile gegen das generierte Wörterbuch parst, den Kopf liest und das Ergebnis an den Prüfbildschirm und dann an den versiegelten Speicher übergibt](img/klarbefund-scan-pipeline.svg)

Quelle: [`diagrams/klarbefund-scan-pipeline.puml`](diagrams/klarbefund-scan-pipeline.puml).

Die Reihenfolge ist fest, und jeder Schritt hat genau einen Verantwortlichen
([ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)):

1. **Zuerst die Herkunft.** [`LabImport`](../../clients/ios/Sources/Shared/LabImport.swift) entscheidet anhand der Datei, nie anhand ihrer
   Endung: Ein PDF mit der eigenen Textebene des Labors ist
   `lab-issued-digital`, und seine Observations sind `final`; alles, was
   durch die Texterkennung muss, ist `ocr-transcribed` und `preliminary`. Das ist
   bewusst streng, denn eine Transkription als `final` zu kennzeichnen, ist der Fehler,
   auf den es ankommt.
2. **Erkennung.** [`VisionDocumentReader`](../../clients/ios/Sources/Shared/VisionDocumentReader.swift) führt zwei [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images)-Durchläufe aus, Deutsch und
   Englisch, mit **ausgeschalteter** Sprachkorrektur: `Lp(a)` oder ein
   Dezimalkomma zu „korrigieren“, schadet aktiv. [`DocumentReconciler`](../../clients/ios/Sources/Shared/DocumentReconciler.swift) führt die Durchläufe zusammen,
   und [`TableRoles`](../../clients/ios/Sources/Shared/TableRoles.swift) leitet je Tabelle ab, welche Spalte die Bezeichnung, den Wert, die Einheit
   und den Bereich enthält.
3. **Parsen.** [`LabLineParser`](../../clients/ios/Sources/Shared/LabLineParser.swift) liest jede Zeile. Wenn das gewöhnliche Parsen
   nichts findet, kommen die Blattleser zum Zug: ambulante Blutdruckmessung,
   Ruhe- und Belastungs-EKG, Langzeit-EKG, Spiroergometrie, Laktat,
   CGM-Glukoseprofil, DXA und die Anzeige einer Körperanalysewaage, die
   eine Anzeige und kein Befund ist und nur auf ihren Hauptwert hin gelesen wird.
4. **Codierung.** [`Analytes.lookup(label, unit)`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) wählt den LOINC-Code. Die Einheit
   entscheidet, nie der Name allein. Eine Größe, die LOINC nicht codiert (viszerales Fett
   als Masse, ein Wasseranteil), wird mit ihrer Einheit, ohne Code und mit einer verpflichtenden
   Begründung mitgeführt; ein Organismus aus einem Stuhlbefund trägt seine [NCBI-Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy)-ID,
   weil LOINC Tests benennt und keine Organismen.
5. **Der Kopf.** [`ReportMetadata`](../../clients/ios/Sources/Shared/ReportMetadata.swift) und [`PrintedFields`](../../clients/ios/Sources/Shared/PrintedFields.swift) lesen das Labor,
   das Labordatum, das Ausstellungsdatum und die Befundnummer vom Blatt; das Labordatum
   hat Vorrang vor Eingangs- und Ausstellungsdatum, und die Person bestätigt
   es vor dem Speichern.
6. **Erhaltung.** Jede Zeile, die wie ein Messwert aussieht, endet als codiert,
   nicht zugeordnet oder nicht gelesen. Eine Zeile in keiner der drei Gruppen ist nicht zu unterscheiden von
   einer Zeile, die nie gedruckt wurde, und genau so ist einmal eine HbA1c-Zeile
   verloren gegangen ([`docs/gotchas.md`](../gotchas.md#2026-09-19-the-measurement-that-justified-the-ocr-hybrid-was-taken-on-the-wrong-os), 2026-09-19). Der Selbsttest prüft das.
7. **Prüfen und speichern.** [`ReviewViews`](../../clients/ios/Sources/MeinBefund/ReviewViews.swift) zeigt, was gelesen wurde; [`ReportStore`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)
   versiegelt es.

`swift run LabFile ~/Downloads/befund.pdf` führt die Schritte 1 bis 6 auf einem Mac aus und
gibt die Herkunft, den Kopf und jede Zeile als codiert, nicht zugeordnet oder
nicht gelesen aus; `--values` ergänzt die Zahlen, `--rows` ergänzt das Layout der Texterkennung.
Es lehnt einen Pfad innerhalb dieses Repositorys ab.

## Der Speicher und die Sperre

Drei versiegelte Dateien je Befund unter `Application Support/Reports`, jede
[AES-GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm) unter demselben Schlüsselbund-Schlüssel, [vollständiger Dateischutz](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete), [vom
Backup ausgeschlossen](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup):

```
<id>.sealed         the record (LabReport)
<id>.scan.sealed    the pages as one PDF
<id>.diag.sealed    the scan's diagnostics (ScanDiagnostics)
profile.sealed      sex, date of birth, height (Profile)
consents.sealed     the three consent decisions (ConsentLedger)
```

Der Schlüssel ist [`ThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) und bei gesperrtem Telefon nicht verfügbar, sodass eine
Kopie des Containers nur Chiffretext liefert und der systemeigene Schnappschuss der App
mit `EPERM` fehlschlägt; [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) legt die Build-Einstellungen fest, und die
[Selbstbewertung](self-assessment.md) dokumentiert die Messung. Datensätze,
die geschrieben wurden, bevor ein Feld existierte, lassen sich weiterhin decodieren: Jedes spätere Feld ist optional oder
hat einen Standardwert.

Die App-Sperre ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))
besteht aus zwei Typen. [`AppLockPolicy`](../../clients/ios/Sources/Shared/AppLockPolicy.swift) in Shared entscheidet, _ob_ eine Abfrage fällig ist,
und ist rein, sodass [`AppLockPolicyTests`](../../clients/ios/Tests/SharedTests/AppLockPolicyTests.swift) auf einem Mac läuft; [`AppLock`](../../clients/ios/Sources/MeinBefund/AppLock.swift) in der App fragt
[LocalAuthentication](https://developer.apple.com/documentation/localauthentication), _wie_, per Face ID, Touch ID oder Code, und
[`PrivacyCover`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) zeichnet die Abdeckung, die der App-Umschalter sieht. Dieselbe ADR begründet, warum
Certificate Pinning und Jailbreak-Erkennung abgelehnt wurden.

## Das Wörterbuch wird generiert, nie kopiert

[`Sources/Shared/Analytes.generated.swift`](../../clients/ios/Sources/Shared/Analytes.generated.swift), [`ReferenceRanges.generated.swift`](../../clients/ios/Sources/Shared/ReferenceRanges.generated.swift)
und [`PromptText.generated.swift`](../../clients/ios/Sources/Shared/PromptText.generated.swift) werden erzeugt aus
[`services/epa-ingest`](../../services/epa-ingest):

```bash
cd services/epa-ingest && npm run generate:swift
cd clients/ios && swift run AnalyteParity      # 1760 codings, 96 units on 2026-11-07
```

Bearbeiten Sie sie nicht von Hand. Fügen Sie einen Parameter in [`analytes.ts`](../../services/epa-ingest/src/analytes.ts) oder einen Bereich in
[`reference-ranges.ts`](../../services/epa-ingest/src/reference-ranges.ts) hinzu, erzeugen Sie neu und committen Sie beides. Die CI schlägt fehl, wenn eine generierte Datei
nicht mehr zu ihrer Quelle passt, denn eine veraltete Kopie ist genau die stille
Abweichung, die das Monorepo verhindern soll: ein iPhone, das Lp(a) auf eine Weise codiert,
und der Ingest-Dienst auf eine andere, bemerkt erst, wenn ein Wert bei einer Ärztin oder einem Arzt ankommt.

Der Generator für Referenzbereiche lehnt einen Bereich ab, dessen Parameter das Wörterbuch
nicht kennt oder für dessen Einheit dieser Parameter nicht definiert ist. Nur Parameter mit
einer zitierbaren veröffentlichten Quelle erhalten einen Bereich
([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)); für jeden anderen
Parameter zeichnet der Bildschirm Verlauf den Bereich, den das eigene Labor der Person gedruckt hat.

## Tests und wozu sie jeweils dienen

```bash
swift test                                     # Swift Testing: what the app computes
Scripts/run-ui-tests.sh                        # XCUITest: what it shows, and what a tap does
swift test --filter AccuracyBenchmarkTests     # the accuracy benchmark; KLARBEFUND_BENCHMARK_OUT=<file> writes its JSON
swift test --filter SecurityPostureTests       # the build settings the self-assessment relies on
```

**Die Unit-Suite** ([`Tests/SharedTests/`](../../clients/ios/Tests/SharedTests/), [Swift Testing](https://developer.apple.com/documentation/testing)) ist die größere und fängt ab, was
sich durchdenken lässt: eine Einheit, die den falschen Code wählt, ein Datum, das aus der
falschen Zeile gelesen wird, eine Exportspalte an der falschen Stelle. [`FhirBundleParityTests`](../../clients/ios/Tests/SharedTests/FhirBundleParityTests.swift) bindet
das Bundle an das Referenz-Bundle, das `services/epa-ingest` schreibt, sodass beide Schreiber
für dasselbe Blatt dasselbe FHIR ausgeben.

**Die UI-Suite** ([`Tests/UITests/`](../../clients/ios/Tests/UITests/), [XCUITest](https://developer.apple.com/documentation/xctest/xcuiapplication)) existiert, weil die Unit-Suite keinen
der letzten Fehler gefunden hat: eine Karte, die am Rand des Diagramms abgeschnitten war, eine Auswahl,
die sich beim nächsten Rendern vergaß, `LOINC Optional("2093-3")` auf genau dem
Bildschirm, den eine Person mit ihrem eigenen Papier vergleicht. Jeder Test startet mit
`-MBDemoSeed` und erreicht seinen Bildschirm mit `-MBShot`, sodass er bricht, wenn sich das ändert, was er
prüft, und nicht, wenn sich eine Schaltfläche verschiebt. Drei auf die harte Tour gelernte Dinge
stehen in [`docs/gotchas.md`](../gotchas.md#2026-09-20--an-accessibilityidentifier-on-a-chart-renames-everything-inside-it): Ein `accessibilityIdentifier` auf einem Container benennt
alles darin um; ein `Button`, dessen Label `Color.clear` ist, ist nicht im
Accessibility-Baum; die Auswahl in [Swift Charts](https://developer.apple.com/documentation/charts) reagiert auf einen Finger und nicht auf einen
synthetischen Tipp, daher liegen echte Schaltflächen über den Markierungen.

### Der Selbsttest

Alles nach der Kamera läuft im App-Target und daher nicht in
`swift test`: der versiegelte Speicher, das PDF der Seiten, der Export. `-MBSelfTest`
führt einen synthetischen Befund durch die ganze Kette und protokolliert jede seiner 27
Prüfungen: Erkennung und Codierung, eine Quellenangabe je Wert, das aus dem
Kopf gelesene Labordatum, die Seiten als PDF, das Entschlüsseln der drei versiegelten Dateien, die Wiedergabe
des Diagnosedatensatzes, die die Extraktion exakt reproduziert, das Erstellen des Archivs
und den Export für die Praxis, der mit den angehängten Seiten in die 25 MB der ePA passt.

```bash
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest
xcrun simctl spawn <udid> log show --last 2m --predicate 'subsystem == "red.mabu.meinbefund"' --style compact
```

### Der Genauigkeits-Benchmark

[`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift) liest synthetische Blätter mit bekanntem Inhalt mit Vision und schreibt,
wenn `KLARBEFUND_BENCHMARK_OUT` gesetzt ist, die Genauigkeit auf Feldebene als JSON; die veröffentlichte Fassung ist
[`docs/klarbefund/accuracy-benchmark.json`](accuracy-benchmark.json), und [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift)
prüft das Maß selbst. Die Seite [Nachweise](evidence.md) zitiert sie, und [run-on-mac](run-on-mac.md)
reproduziert jede Zahl. Ein realer Befund wird auf dieselbe Weise gemessen, auf dem
eigenen Mac der Person und nie im Repository, mit `ScanReplay --truth`
gegen eine von Hand geschriebene `truth.json` neben dem Export: Es gibt aus, welche Felder
welcher Zeilen falsch waren, nie die Werte.

## Ein falsch gelesenes Blatt debuggen

Der Speicher liefert nur Chiffretext, daher verlässt das Beweismaterial das Telefon über die eigene Funktion
**Diagnosedaten exportieren** der App, die in Worten um Bestätigung bittet und eine
ZIP-Datei an das Teilen-Menü übergibt
([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)):

```
klarbefund-diagnostics-<date>/
  about.json                 build, device, dictionary size, counts
  log.txt                    this session's log lines: counts and codes only
  <title>-<id8>/
    report.json              the stored record: values, metadata, page text
    diagnostics.json         both Vision passes, the reconciled rows, the layout
    scan.pdf                 the pages as scanned
```

Mit dem Telefon an USB und einem installierten Debug-Build erledigt
`Scripts/pull-diagnostics.sh` den Export und das Entpacken in einem Schritt, unter
`~/Downloads`. Entpacken Sie **außerhalb dieses Repositorys**, dann:

```bash
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date>          # every report, with the current parser
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --ocr    # re-run Vision on scan.pdf
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --truth  # accuracy against truth.json
```

Die Wiedergabe gibt aus, was das Telefon codiert hat, was jetzt codiert wird, was neu codiert
oder verloren ist, und jede Zeile mit ihrem Grund. Fügen Sie einen Parameter in [`analytes.ts`](../../services/epa-ingest/src/analytes.ts) hinzu,
erzeugen Sie neu, spielen Sie erneut ab und sehen Sie zu, wie die Zeilen des echten Blatts von nicht zugeordnet zu
codiert wandern, ohne es erneut zu scannen. Beide Werkzeuge lehnen einen Pfad innerhalb von
`clients/ios/` ab.

## Die Verbindung zum EHDS-Hub

Der Patientenbildschirm des Hubs startet einen [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8628) Device Grant für den öffentlichen
[Keycloak](https://www.keycloak.org/docs/latest/server_admin/#device-authorization-grant)-Client `klarbefund-app` und zeigt ihn als QR-Code mit einem
`klarbefund://connect`-Link an; die App fragt Keycloak nach dem Token ab und
registriert sich beim Hub
([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)).

- [`Shared/EHDSConnect.swift`](../../clients/ios/Sources/Shared/EHDSConnect.swift): der Link, abgelehnt, sofern sein Hub und Aussteller nicht
  in `TrustedHub.production` (plus `.development` in einem Debug-Build) stehen, und der
  Poller mit seinen vier Antworten. [`EHDSConnectTests`](../../clients/ios/Tests/SharedTests/EHDSConnectTests.swift) deckt jede ab.
- [`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift): Tokens und eine Geräte-ID im Schlüsselbund als
  `ThisDeviceOnly`, Aktualisieren, Registrieren, Lesen der Akte, Trennen (das
  das Refresh-Token bei Keycloak widerruft) und die zwei Synchronisierungsschalter.
- [`ConnectView.swift`](../../clients/ios/Sources/MeinBefund/ConnectView.swift): das Sheet, der Datenscanner von [VisionKit](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller) nur für QR-Codes,
  ein Einfügefeld und „Ist das Ihr Konto?“.
- **EHDS-Konto anlegen** ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md))
  ruft die zwei Routen des Hubs auf, die ohne Sitzung antworten; das Konto
  wird nur für eine Anfrage angelegt, deren [Apple-App-Attest](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)-Attestierung sich verifizieren lässt,
  weshalb der Simulator die Schaltfläche deaktiviert mit Begründung zeigt.
- **Meine Befunde senden** und **Meine Geräte-Trends senden**
  ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) senden
  an die eigene Akte der Person; die Akte selbst enthält Befundberichte, Impfungen
  und den Medikationsplan ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)).
- [`ConnectUITests`](../../clients/ios/Tests/UITests/ConnectUITests.swift) und [`AccountUITests`](../../clients/ios/Tests/UITests/AccountUITests.swift) laufen gegen `DemoEHDSTransport` unter
  `-MBDemoSeed`; [`LiveConnectUITests`](../../clients/ios/Tests/UITests/LiveConnectUITests.swift) und [`LiveAccountUITests`](../../clients/ios/Tests/UITests/LiveAccountUITests.swift) laufen gegen einen
  echten Hub, wenn sie einen frischen Link erhalten
  ([`docs/knowledge/runbooks/klarbefund-connect.md`](../knowledge/runbooks/klarbefund-connect.md)).

## Exporte

| Aktion                               | Schreiber                                                                                                                                    | Inhalt                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Für meine Praxis teilen              | [`ReportExport`](../../clients/ios/Sources/MeinBefund/ReportExport.swift), [`FhirBundle`](../../clients/ios/Sources/Shared/FhirBundle.swift) | PDF-Zusammenfassung mit den angehängten Originalseiten sowie ein FHIR R4 Bundle                                                                                                                                                                                                 |
| Für die Forschung exportieren (OMOP) | [`OmopExport`](../../clients/ios/Sources/Shared/OmopExport.swift)                                                                            | OMOP CDM v5.4 [`measurement.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#measurement), [`person.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#person), [`observation_period.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#observation_period) |
| Alle meine Daten exportieren         | [`DataExport`](../../clients/ios/Sources/MeinBefund/DataExport.swift)                                                                        | jeder Befund, jede Seite, jeder Wert, jedes Profilfeld und jede Einwilligung, als JSON und PDFs                                                                                                                                                                                 |
| Diagnosedaten exportieren            | [`DiagnosticsBundle`](../../clients/ios/Sources/Shared/DiagnosticsBundle.swift)                                                              | der Datensatz, beide Vision-Durchläufe, die Seiten, das Sitzungsprotokoll                                                                                                                                                                                                       |

Die OMOP-Tabellen tragen durchgängig `measurement_concept_id = 0`, mit Absicht:
LOINC auf ein OMOP-Konzept abzubilden, erfordert das [Athena](https://athena.ohdsi.org/)-Vokabular, das nicht auf
einem Telefon liegt, und eine erfundene ID würde einen falschen Bezeichner an einen echten
Messwert hängen. Der gedruckte Bereich wird wörtlich in [`RawLabValue.referenceText`](../../clients/ios/Sources/Shared/Provenance.swift#L67) aufbewahrt
und reist als [`referenceRange.text`](https://hl7.org/fhir/R4/observation-definitions.html#Observation.referenceRange.text); ein Bereich ohne Zahl darin überlebt
nur dort, und [obs-3](https://hl7.org/fhir/R4/observation.html#invs) von FHIR erlaubt das: Ein Referenzbereich braucht mindestens einen unteren Wert, einen oberen Wert oder einen Text.

## Relate: der Graph auf dem Telefon und auf dem Mac

<img src="img/graph.png" width="300" alt="Gesundheitsgraph auf diesem iPhone, gebaut aus dem fiktiven Entwicklungsdatensatz: die Zahl der Befunde, Werte, LOINC-Codes und Werte ohne Code"> <img src="img/relatePaired.png" width="300" alt="An meinen Mac exportieren, gekoppelt mit dem fiktiven Demo-Mac, den die Screenshots verwenden">

Zwei Funktionen bringen die Werte einer Person in einen
[Relate](https://github.com/relatedb/relate)-Graphen (eine eingebettete
openCypher-Datenbank): einen auf dem Telefon, einen auf ihrem eigenen Mac.
Beide laufen über dieselbe Bibliothek, `HealthGraph`, aus
[ma3u/relate-hackathon-team](https://github.com/ma3u/relate-hackathon-team),
sodass ein Befund auf dem Telefon, auf dem Mac und in der Python-Referenz
dieses Repositorys zu denselben Knoten wird. Die Seite der Nutzerin oder des
Nutzers steht im [Benutzerhandbuch](user-guide.md#ihr-gesundheitsgraph-auf-diesem-iphone).

| Teil                      | Wo                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Die Bibliothek            | `HealthGraph` in [`project.yml`](../../clients/ios/project.yml), auf einen Commit festgelegt; sie bringt Relates `RelateFFI.xcframework` mit (iOS 16+, macOS 13+)                                                          |
| Graph auf diesem iPhone   | [`OnDeviceGraph`](../../clients/ios/Sources/MeinBefund/OnDeviceGraph.swift), [`OnDeviceGraphView`](../../clients/ios/Sources/MeinBefund/OnDeviceGraphView.swift)                                                           |
| An meinen Mac exportieren | [`LocalRelateExport`](../../clients/ios/Sources/MeinBefund/LocalRelateExport.swift), [`LocalRelateView`](../../clients/ios/Sources/MeinBefund/LocalRelateView.swift)                                                       |
| Der Kopplungslink         | [`LocalRelateLink`](../../clients/ios/Sources/Shared/LocalRelateLink.swift): `klarbefund://relate?url=…&token=…&fp=…&name=…&store=…`                                                                                       |
| Der Empfänger auf dem Mac | [`swift/mac`](https://github.com/ma3u/relate-hackathon-team/tree/main/swift/mac) und [`scripts/health_vault.sh`](https://github.com/ma3u/relate-hackathon-team/blob/main/scripts/health_vault.sh) in relate-hackathon-team |

<img src="img/klarbefund-relate-claude.gif" width="640" alt="Animation des ganzen Wegs: Klarbefund koppelt mit dem Empfänger, sendet 34 fiktive Befunde, der Relate-Graph auf dem Mac hält sie, und Claude Desktop liest ihn über MCP">

Die Animationen in diesem Abschnitt und im Benutzerhandbuch erzeugt
[`scripts/flow_gifs.py`](https://github.com/ma3u/relate-hackathon-team/blob/main/scripts/flow_gifs.py)
aus einer Simulator-Aufnahme mit `-MBDevData` und einem Wegwerf-Empfänger, gestartet mit
`--config <Wegwerf-Ordner> --name Demo-Mac`, sodass weder der Tresor noch die echte
Kopplung je beteiligt ist; der Docstring dort nennt die Schritte.

### Der Graph auf dem Telefon

[`OnDeviceGraph`](../../clients/ios/Sources/MeinBefund/OnDeviceGraph.swift) ist
eine Projektion, nie eine Quelle: Er wird bei jeder Änderung der Befunde von
Grund auf aus denselben FHIR-Bundles gebaut, die der Mac-Export sendet, und
Ausschalten löscht ihn. Der Speicher liegt in Application Support unter
`HealthGraph` (`HealthGraphDemo` bei einem Demostart, damit fiktive Daten nie
auf einen echten Graphen treffen), mit `FileProtectionType.complete` und von
der Sicherung ausgenommen. Jede Liste auf dem Bildschirm ist eine benannte
Cypher-Abfrage aus der Bibliothek, ausgeführt über einen nur lesenden Zugriff.
Relate erlaubt einen Zugriff pro Speicher und Prozess, deshalb wird der
schreibende geschlossen, bevor der lesende öffnet.

### Export über WLAN

1. Der Empfänger auf dem Mac (`health-graph receive`) erzeugt einmal ein
   P-256-Zertifikat und ein 256-Bit-Token und zeigt beides als QR-Code: den Kopplungslink.
2. Die App nimmt den Link nur mit `https`, einer privaten, Loopback- oder
   `.local`-Adresse und einem 64-stelligen Hex-Fingerabdruck an und legt ihn im Schlüsselbund ab.
3. Jede Anfrage prüft den SHA-256 des Empfängerzertifikats und sendet das
   Token als Bearer. `GET /v1/status` antwortet mit der Zahl der Werte;
   `POST /v1/record` nimmt das FHIR-Bundle eines Befunds (die Befund-ID in
   `X-Klarbefund-Report`, sodass erneutes Senden ihn ersetzt);
   `POST /v1/wearables` nimmt die Wochenmittel aus Apple Health.
4. Vor einem Stapel prüft ein Statusaufruf von 4 Sekunden, ob der Mac
   erreichbar ist, damit ein Telefon außerhalb des Mac-WLANs nicht für jeden
   Befund ein eigenes Zeitlimit abwartet.

### Export über ein USB-Kabel

```
Mac: health-graph usb ──usbmuxd──▶ iPhone 127.0.0.1:8788 / ::1:8788 (Klarbefund, während es wartet)
  Mac     → Telefon  {"token": "…"}                          zuerst das Kopplungstoken
  Telefon → Mac      {"type": "record", "report": "…", "bundle": {…}}   eines pro Befund
  Telefon → Mac      {"type": "wearables", "bundle": {…}}    wenn die Person sie sendet
  Telefon → Mac      {"type": "end"}
  Mac     → Telefon  {"stored": n, "reports": n, "weekly": n, "skipped": n}
```

Jeder Rahmen ist eine 4-Byte-Länge (Big Endian) und ein JSON-Objekt. Das
Telefon wartet erst nach **Über USB-Kabel senden**, nur auf seinen
Loopback-Adressen (die kein Netzwerk erreicht;
[usbmuxd](https://github.com/libimobiledevice/usbmuxd) tunnelt das Kabel
dorthin), vergleicht das Token in konstanter Zeit, bevor es etwas sendet,
bedient einen Mac und schließt den Port. Es beginnt zu warten, bevor es ein
Jahr Apple-Health-Daten sammelt, und hält eine Hintergrundaufgabe, damit ein
App-Wechsel die Übertragung nicht beendet.

### Ausprobieren, Schritt für Schritt

Im Simulator, mit fiktiven Daten und einem Wegwerf-Graphen:

1. In relate-hackathon-team: `swift test` (die Bibliothek) und `swift test --package-path swift/mac` (der Empfänger).
2. Starten Sie einen Empfänger auf einem Wegwerf-Speicher, nie auf dem Tresor (mit `--port 8799`, wenn der echte läuft):
   ```bash
   swift run --package-path swift/mac health-graph receive --db /tmp/dev-graph/health.rl --config /tmp/dev-graph/identity \
     --name Demo-Mac --host 127.0.0.1 --print-link
   ```
3. Starten Sie die App im Simulator mit `-MBDevData` und fügen Sie den
   ausgegebenen Link in **An meinen Mac exportieren (Relate)** ein. Ein
   Demostart hält seine Kopplung unter einem eigenen Schlüsselbund-Schlüssel
   und kann so nie an eine echte Kopplung senden.
4. Senden Sie über WLAN mit **Jetzt alles senden** und prüfen Sie dann den Wegwerf-Graphen:
   ```bash
   swift run --package-path swift/mac health-graph query --db /tmp/dev-graph/health.rl reports
   ```
5. Für den USB-Weg im Simulator (sein Loopback ist der des Macs): Tippen Sie
   auf **Über USB-Kabel senden**, dann
   `swift run --package-path swift/mac health-graph usb --simulator --config /tmp/dev-graph/identity --db /tmp/dev-graph/health.rl`.

Auf einem echten iPhone über das Kabel, ohne die Werte einer Person und ohne
Tippen: Ein Debug-Build, gestartet mit `-MBUSBSelfTest`, wartet mit einem
festen Testtoken und sendet nur den Endrahmen.

```bash
xcrun devicectl device process launch --device <udid> --console red.mabu.meinbefund -- -MBUSBSelfTest
swift run --package-path swift/mac health-graph usb --db /tmp/dev-graph/health.rl \
  --test-token usb-self-test-token-0000000000000000
```

### Die Bibliothek aktualisieren

Das Paket `HealthGraph` ist in [`project.yml`](../../clients/ios/project.yml)
auf eine `revision` festgelegt. Nachdem eine Änderung in relate-hackathon-team
gelandet ist, tragen Sie dort deren Commit ein, führen `xcodegen generate` aus
und bauen einmal in Xcode, damit SwiftPM sie auflöst. Das Relate-Binary ist
ein 311-MB-Zip, das SwiftPM einmal in seinen Cache lädt; die CI holt es im
Schritt "Resolve Swift packages", bevor CodeQL den Build verfolgt.

### Screenshots dieser Bildschirme

`graph`, `relate`, `relatePaired`, `relateUSB` und `relateUSBDone` sind
`-MBShot`-Bildschirme. Die gekoppelten verwenden einen fiktiven Mac namens
Demo-Mac auf einer [TEST-NET](https://www.rfc-editor.org/rfc/rfc5737)-Adresse,
nur im Speicher: Mit ihm wird nichts gesendet, nichts geprüft, nichts wartet.

## Sprachen

Englisch ist die Basis, Deutsch die Übersetzung, entsprechend der Sprache des Telefons.
[`Scripts/check-localization.sh`](../../clients/ios/Scripts/check-localization.sh) schlägt fehl, wenn ein für Nutzende sichtbarer String kein
Deutsch hat oder wenn ein deutscher Satz in der englischen Basis stehen geblieben ist; es verwendet
[`xcodebuild -exportLocalizations`](https://developer.apple.com/documentation/xcode/localization), denselben Extraktor, den der Editor von Xcode verwendet, und
sieht so SwiftUI-`Text`-Literale und `INFOPLIST_KEY_*`-Werte, die kein grep über
die Quellen finden würde. Die Kamera-Berechtigungsabfrage wurde einmal auf Deutsch an
jedes englische Telefon ausgeliefert, und deshalb gibt es das Skript.

## Statische Analyse und CI

```bash
Scripts/codeql-swift.sh                        # CodeQL on the app and Shared, about 15 minutes
```

[CodeQL](https://docs.github.com/en/code-security/codeql-cli) braucht einen echten Build, um Swift zu sehen, daher läuft es auf GitHub nur, wenn
sich `clients/ios/` ändert ([`.github/workflows/codeql-swift.yml`](../../.github/workflows/codeql-swift.yml)), auf einem macOS-Runner.
Der Pre-Push-Hook `codeql-swift` führt dieselbe Suite aus, wenn ein Push
die Swift-Quellen ändert; er endet mit 1 bei jedem Befund, der nicht mit seiner
Begründung in [`Scripts/codeql-accepted.txt`](../../clients/ios/Scripts/codeql-accepted.txt) aufgeführt ist. Swift braucht einen macOS-Runner, der
weniger Parallelität bietet als Linux, daher ist der iOS-Job per Pfad auf
`clients/ios/**` gefiltert und blockiert nie die Web- oder Dienst-Suiten; umgekehrt schließen die
Workflows für `ui/**` und `services/**` `clients/ios/**` aus.

Die Sicherheitslage der App, ihr Bedrohungsmodell und was ein unabhängiger
Test ergänzen würde, stehen im [Bedrohungsmodell](../security/threat-model-klarbefund.md),
im [Sicherheitstestbericht](../security/security-test-report-2026-10-15.md)
und in der [Selbstbewertung](self-assessment.md).

## Zwei Regeln, die nicht verhandelbar sind

1. **Keine Gesundheitsdaten in `clients/ios/`, niemals.** Keine Laborbefunde, keine Scans, keine
   exportierten HealthKit-Archive, keine Screenshots mit echten Werten, nicht
   einmal vorübergehend, nicht einmal per gitignore ausgeschlossen. Testfixtures sind synthetisch, so wie
   es [`services/epa-ingest/__tests__/fixtures/`](../../services/epa-ingest/__tests__/fixtures/) bereits ist. Die Werkzeuge lehnen aus demselben Grund
   einen Pfad innerhalb des Repositorys ab.
2. **Keine reale Organisation in Demoinhalten.** [`CLAUDE.md`](../../CLAUDE.md) verbietet das außerhalb
   des Flags `NEXT_PUBLIC_DEMO_TK`. Die Studie, für die diese App gebaut ist, ist real;
   das Demozentrum, das Labor und die Praxis im Entwicklungsdatensatz sind
   fiktiv.

## Wo die Entscheidungen stehen

| ADR                                                                                                  | Entscheidet                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)                                         | Die Extraktions-Pipeline und ihre Reihenfolge                           |
| [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                       | Diagnosedaten werden mit dem Scan aufbewahrt und auf Anfrage exportiert |
| [ADR-039](../ADRs/ADR-039-published-reference-ranges.md)                                             | Nur zitierbare veröffentlichte Bereiche, neben denen des Labors         |
| [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)                                    | Verbinden per OAuth Device Grant und QR-Code                            |
| [ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)                              | Die Beta über einen öffentlichen TestFlight-Link                        |
| [ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)                   | Kontoanlage, abgesichert durch App Attest                               |
| [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)                                   | Senden der wöchentlichen Gerätemittel, hinter einem eigenen Schalter    |
| [ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)          | Was die Akte enthält                                                    |
| [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) | Die App-Sperre; Pinning und Jailbreak-Erkennung abgelehnt               |
