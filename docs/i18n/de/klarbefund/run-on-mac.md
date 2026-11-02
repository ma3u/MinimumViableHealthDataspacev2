---
source: docs/klarbefund/run-on-mac.md
sourceHash: fd049dc9c178d6abd40839b357d6b7313f8fb4ffb89922fe7830e8b68f8df30a
language: de
summary: "Wie man jede Zahl aus den Belegen auf einem Mac mit Xcode nachvollzieht."
---

# Klarbefund: die Nachweise auf einem Mac erzeugen

Das Swift-Paket zielt auf macOS 26 und iOS 26, und die Scan- und
Benchmark-Tests brauchen Apples Vision-Framework; sie laufen daher nur auf
einem Mac. Dies ist die Checkliste, um die Nachweise in
[`evidence.md`](evidence.md) und [`self-assessment.md`](self-assessment.md)
auf einem Mac zu erzeugen.

## Voraussetzungen

| Was                        | Warum                                                             | Prüfung                              |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| macOS 26                   | `Package.swift` deklariert `.macOS("26.0")`                       | `sw_vers -productVersion`            |
| Xcode 26, ausgewählt       | Swift-6-Toolchain und das macOS-26-SDK mit Vision                 | `xcode-select -p`, `swift --version` |
| XcodeGen (nur für die App) | erzeugt `MeinBefund.xcodeproj` aus `project.yml`                  | `brew install xcodegen`              |
| CodeQL (optional)          | die statische Analyse, die der Pre-Push-Hook und die CI ausführen | `brew install --cask codeql`         |

Sonst nichts: Das Paket hat keine Abhängigkeiten von Drittanbietern, es gibt
also nichts aufzulösen oder herunterzuladen.

## 1. Bauen und testen

```bash
git fetch origin && git switch feat/186-klarbefund-accuracy-evidence
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` führt die gesamte Suite aus, 319 Tests in 54 Suiten. Die Scan-
und Benchmark-Suiten rendern A4-Blätter und lesen sie nacheinander mit
Vision; auf einem Mac mit Apple Silicon dauerte die gesamte Suite nach dem
Build etwa zehn Sekunden. Zwei Suiten sind auf diesem Branch neu:

- `ExtractionAccuracyTests`: das Genauigkeitsmaß selbst, ohne Vision;
- `AccuracyBenchmarkTests`: neun Scanbedingungen, unter jeder sind null
  stille Fehler gefordert, die Zählwerte werden in die oben genannte
  JSON-Datei geschrieben.

Nur dieses JSON ist ein Nachweis zur Veröffentlichung: synthetische Blätter,
Zählwerte und LOINC-Codes, keine Werte. Eine einzelne Suite ausführen:
`swift test --filter AccuracyBenchmarkTests`.

## 2. Pilot mit echten Befunden (außerhalb des Repositorys)

1. In der App: Menü → **Diagnosedaten exportieren**, die ZIP-Datei per AirDrop an den Mac senden.
2. Entpacken Sie sie **außerhalb des Repositorys**, zum Beispiel `~/Pilot/klarbefund-diagnostics-…`.
3. Schreiben Sie neben jede `diagnostics.json` eine `truth.json` nach dem
   Papierbefund (Format in [`evidence.md`](evidence.md#measuring-accuracy)).
4. Führen Sie aus:

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Beide Werkzeuge verweigern einen Pfad innerhalb von `clients/ios/`. Holen Sie
vor Schritt 1 die schriftliche Einwilligung jeder teilnehmenden Person ein,
und löschen Sie den Export, sobald die Zählwerte erhoben sind.

## 3. Optionale Prüfungen

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

## 4. Die Swift-Suite in die CI aufnehmen

Die CI baut heute nur das Target `Shared` (`ios-analyte-parity` in
`.github/workflows/test.yml`); `swift test` führt sie nie aus. Fügen Sie
diesen Job nach `ios-analyte-parity` hinzu und pushen Sie ihn mit einem
Konto, das Workflows ändern darf:

```yaml
ios-unit-tests:
  name: iOS Unit Tests + Accuracy Benchmark (Swift)
  runs-on: macos-26
  defaults:
    run:
      working-directory: ./clients/ios
  steps:
    - uses: actions/checkout@v7
    - name: Swift version
      run: swift --version
    - name: Run unit tests
      env:
        KLARBEFUND_BENCHMARK_OUT: ${{ runner.temp }}/klarbefund-accuracy-benchmark.json
      run: swift test
    - name: Upload accuracy benchmark
      if: always()
      uses: actions/upload-artifact@v7
      with:
        name: klarbefund-accuracy-benchmark
        path: ${{ runner.temp }}/klarbefund-accuracy-benchmark.json
        if-no-files-found: warn
```

Das Benchmark-JSON wird dann zu einem herunterladbaren Artefakt jedes Laufs,
der `clients/ios/` berührt; das ist die reproduzierbare Form, die eine
externe Prüfstelle kontrollieren kann.

## 5. Was Sie zurückbringen sollten

- die Zusammenfassungszeile von `swift test` und jeden Fehlschlag vollständig;
- `klarbefund-accuracy-benchmark.json`;
- für den Pilot die Ausgabe von `--truth --json` sowie die Anzahl der
  Teilnehmenden und der Blätter.
