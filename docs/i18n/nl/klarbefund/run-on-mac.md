---
source: docs/klarbefund/run-on-mac.md
sourceHash: 5945fc0f1639b17de5eb5b9d93a3cbba997f38fa0306a80883c9b3d08c778881
language: nl
summary: Hoe u elk getal uit het bewijs op een Mac met Xcode reproduceert.
---

# Klarbefund: het bewijs op een Mac genereren

Het Swift-pakket richt zich op macOS 26 en iOS 26, en de scan- en
benchmarktests hebben het [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images)-framework van Apple nodig, dus ze draaien
alleen op een Mac. Dit is de checklist om het bewijs in
[`evidence.md`](evidence.md) en [`self-assessment.md`](self-assessment.md) op
een Mac te produceren.

## Vereisten

| Wat                                                                                     | Waarom                                                                              | Controle                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| macOS 26                                                                                | [`Package.swift`](../../clients/ios/Package.swift) declareert `.macOS("26.0")`      | `sw_vers -productVersion`            |
| [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes), geselecteerd | Swift 6-toolchain en de macOS 26-SDK met Vision                                     | `xcode-select -p`, `swift --version` |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) (alleen app)                          | genereert `MeinBefund.xcodeproj` uit [`project.yml`](../../clients/ios/project.yml) | `brew install xcodegen`              |
| [CodeQL](https://docs.github.com/en/code-security/codeql-cli) (optioneel)               | de statische analyse die de pre-push-hook en de CI uitvoeren                        | `brew install --cask codeql`         |

Verder niets: het pakket heeft geen afhankelijkheden van derden, dus er is
niets op te lossen of te downloaden.

## 1. Bouwen en testen

```bash
git switch main && git pull --ff-only     # the published state; clone the repository first if you have none
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` voert de hele suite uit; de [run van 2026-10-15](evidence.md#run-record) telde 319 tests in 54 suites, en sindsdien is de suite gegroeid. De scan- en
benchmarksuites renderen A4-vellen en lezen ze een voor een met Vision; op een
Mac met Apple silicon duurde de hele suite na de build ongeveer tien
seconden. Twee suites meten de nauwkeurigheid:

- [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift): de nauwkeurigheidsmaat zelf, zonder Vision;
- [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift): negen scanomstandigheden, onder elk ervan nul
  stille fouten vereist, tellingen geschreven naar het hierboven genoemde
  JSON-bestand.

Alleen die JSON is bewijs om te publiceren: synthetische vellen, tellingen en
LOINC-codes, geen waarden. Eén suite uitvoeren:
`swift test --filter AccuracyBenchmarkTests`.

## 2. Pilot met echte uitslagen (buiten de repository)

1. In de app: menu → **Export diagnostics** ([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)), stuur de zip via AirDrop naar de Mac.
2. Pak hem uit **buiten de repository**, bijvoorbeeld `~/Pilot/klarbefund-diagnostics-…`.
3. Schrijf naast elke `diagnostics.json` een `truth.json` op basis van het
   papier (formaat in [`evidence.md`](evidence.md#measuring-accuracy)).
4. Voer uit:

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Beide tools weigeren een pad binnen [`clients/ios/`](../../clients/ios/). Vraag vóór stap 1 de
schriftelijke toestemming van elke deelnemer, en verwijder de export zodra
de tellingen zijn verzameld.

## 3. Optionele controles

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

De scripts zijn [`Scripts/codeql-swift.sh`](../../clients/ios/Scripts/codeql-swift.sh) en [`Scripts/run-ui-tests.sh`](../../clients/ios/Scripts/run-ui-tests.sh); de zelftest staat beschreven in de [ontwikkelaarsgids](developer-guide.md#the-self-test) en in [`clients/ios/README.md`](../../clients/ios/README.md).

## 4. De Swift-suite in de CI opnemen

De CI bouwt vandaag alleen het target `Shared` (`ios-analyte-parity` in
[`.github/workflows/test.yml`](../../.github/workflows/test.yml)); `swift test` voert ze nooit uit. Voeg deze job
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

`macos-26` is de [door GitHub gehoste macOS 26-runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), met op 2026-11-07 Xcode 26.6 als standaard; de twee actions zijn [`actions/checkout` v7](https://github.com/actions/checkout/releases/tag/v7.0.0) en [`actions/upload-artifact` v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0).

De benchmark-JSON wordt dan een downloadbaar artefact van elke run die
`clients/ios/` raakt, en dat is de reproduceerbare vorm die een externe
beoordelaar kan controleren.

## 5. Wat u moet terugbrengen

- de samenvattingsregel van `swift test`, en elke fout volledig;
- `klarbefund-accuracy-benchmark.json`;
- voor de pilot de uitvoer van `--truth --json` en het aantal deelnemers en
  vellen.
