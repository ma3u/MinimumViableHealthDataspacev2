---
source: docs/klarbefund/run-on-mac.md
sourceHash: fd049dc9c178d6abd40839b357d6b7313f8fb4ffb89922fe7830e8b68f8df30a
language: nl
---

# Klarbefund: het bewijs op een Mac genereren

Het Swift-pakket richt zich op macOS 26 en iOS 26, en de scan- en
benchmarktests hebben het Vision-framework van Apple nodig, dus ze draaien
alleen op een Mac. Dit is de checklist om het bewijs in
[`evidence.md`](evidence.md) en [`self-assessment.md`](self-assessment.md) op
een Mac te produceren.

## Vereisten

| Wat                    | Waarom                                                       | Controle                             |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------ |
| macOS 26               | `Package.swift` declareert `.macOS("26.0")`                  | `sw_vers -productVersion`            |
| Xcode 26, geselecteerd | Swift 6-toolchain en de macOS 26-SDK met Vision              | `xcode-select -p`, `swift --version` |
| XcodeGen (alleen app)  | genereert `MeinBefund.xcodeproj` uit `project.yml`           | `brew install xcodegen`              |
| CodeQL (optioneel)     | de statische analyse die de pre-push-hook en de CI uitvoeren | `brew install --cask codeql`         |

Verder niets: het pakket heeft geen afhankelijkheden van derden, dus er is
niets op te lossen of te downloaden.

## 1. Bouwen en testen

```bash
git fetch origin && git switch feat/186-klarbefund-accuracy-evidence
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` voert de hele suite uit, 319 tests in 54 suites. De scan- en
benchmarksuites renderen A4-vellen en lezen ze een voor een met Vision; op een
Mac met Apple silicon duurde de hele suite na de build ongeveer tien
seconden. Twee suites zijn nieuw op deze branch:

- `ExtractionAccuracyTests`: de nauwkeurigheidsmaat zelf, zonder Vision;
- `AccuracyBenchmarkTests`: negen scanomstandigheden, onder elk ervan nul
  stille fouten vereist, tellingen geschreven naar het hierboven genoemde
  JSON-bestand.

Alleen die JSON is bewijs om te publiceren: synthetische vellen, tellingen en
LOINC-codes, geen waarden. Eén suite uitvoeren:
`swift test --filter AccuracyBenchmarkTests`.

## 2. Pilot met echte uitslagen (buiten de repository)

1. In de app: menu → **Export diagnostics**, stuur de zip via AirDrop naar de Mac.
2. Pak hem uit **buiten de repository**, bijvoorbeeld `~/Pilot/klarbefund-diagnostics-…`.
3. Schrijf naast elke `diagnostics.json` een `truth.json` op basis van het
   papier (formaat in [`evidence.md`](evidence.md#measuring-accuracy)).
4. Voer uit:

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Beide tools weigeren een pad binnen `clients/ios/`. Vraag vóór stap 1 de
schriftelijke toestemming van elke deelnemer, en verwijder de export zodra
de tellingen zijn verzameld.

## 3. Optionele controles

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

## 4. De Swift-suite in de CI opnemen

De CI bouwt vandaag alleen het target `Shared` (`ios-analyte-parity` in
`.github/workflows/test.yml`); `swift test` voert ze nooit uit. Voeg deze job
toe na `ios-analyte-parity` en push hem met een account dat workflows mag
wijzigen:

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

De benchmark-JSON wordt dan een downloadbaar artefact van elke run die
`clients/ios/` raakt, en dat is de reproduceerbare vorm die een externe
beoordelaar kan controleren.

## 5. Wat u moet terugbrengen

- de samenvattingsregel van `swift test`, en elke fout volledig;
- `klarbefund-accuracy-benchmark.json`;
- voor de pilot de uitvoer van `--truth --json` en het aantal deelnemers en
  vellen.
