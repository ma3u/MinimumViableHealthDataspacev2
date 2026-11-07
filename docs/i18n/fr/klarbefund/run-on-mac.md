---
source: docs/klarbefund/run-on-mac.md
sourceHash: 5945fc0f1639b17de5eb5b9d93a3cbba997f38fa0306a80883c9b3d08c778881
language: fr
summary: Comment reproduire chaque chiffre des preuves sur un Mac avec Xcode.
---

# Klarbefund : produire les preuves sur un Mac

Le paquet Swift cible macOS 26 et iOS 26, et les tests de numérisation et de
benchmark nécessitent le framework [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) d’Apple ; ils ne s’exécutent donc
que sur un Mac. Voici la liste de contrôle pour produire sur un Mac les
preuves de [`evidence.md`](evidence.md) et de
[`self-assessment.md`](self-assessment.md).

## Prérequis

| Quoi                                                                                   | Pourquoi                                                                                 | Vérification                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| macOS 26                                                                               | [`Package.swift`](../../clients/ios/Package.swift) déclare `.macOS("26.0")`              | `sw_vers -productVersion`            |
| [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes), sélectionné | La chaîne d’outils Swift 6 et le SDK macOS 26 avec Vision                                | `xcode-select -p`, `swift --version` |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) (application uniquement)             | génère `MeinBefund.xcodeproj` à partir de [`project.yml`](../../clients/ios/project.yml) | `brew install xcodegen`              |
| [CodeQL](https://docs.github.com/en/code-security/codeql-cli) (facultatif)             | l’analyse statique qu’exécutent le hook de pre-push et la CI                             | `brew install --cask codeql`         |

Rien d’autre : le paquet n’a aucune dépendance tierce, il n’y a donc rien à
résoudre ni à télécharger.

## 1. Compiler et tester

```bash
git switch main && git pull --ff-only     # the published state; clone the repository first if you have none
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` exécute toute la suite ; l’[exécution du 2026-10-15](evidence.md#run-record) comptait 319 tests répartis en 54 suites, et la suite a grandi depuis. Les
suites de numérisation et de benchmark génèrent des feuilles A4 et les lisent
avec Vision, l’une après l’autre ; sur un Mac à puce Apple, toute la suite a
pris une dizaine de secondes après la compilation. Deux suites mesurent
la précision :

- [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift) : la mesure de précision elle-même, sans Vision ;
- [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift) : neuf conditions de numérisation, zéro erreur
  silencieuse exigée pour chacune, comptages écrits dans le fichier JSON
  indiqué ci-dessus.

Seul ce JSON constitue une preuve à publier : des feuilles synthétiques, des
comptages et des codes LOINC, aucune valeur. Pour exécuter une seule suite :
`swift test --filter AccuracyBenchmarkTests`.

## 2. Pilote sur de vrais comptes rendus (en dehors du dépôt)

1. Dans l’application : menu → **Export diagnostics** ([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)), envoyez le zip au Mac par AirDrop.
2. Décompressez-le **en dehors du dépôt**, par exemple `~/Pilot/klarbefund-diagnostics-…`.
3. À côté de chaque `diagnostics.json`, rédigez un `truth.json` d’après le
   papier (format dans [`evidence.md`](evidence.md#measuring-accuracy)).
4. Exécutez :

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Les deux outils refusent un chemin situé dans [`clients/ios/`](../../clients/ios/). Obtenez le
consentement écrit de chaque participant avant l’étape 1, et supprimez
l’export une fois les comptages relevés.

## 3. Contrôles facultatifs

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

Les scripts sont [`Scripts/codeql-swift.sh`](../../clients/ios/Scripts/codeql-swift.sh) et [`Scripts/run-ui-tests.sh`](../../clients/ios/Scripts/run-ui-tests.sh) ; l’autotest est décrit dans le [guide du développeur](developer-guide.md#the-self-test) et dans [`clients/ios/README.md`](../../clients/ios/README.md).

## 4. Intégrer la suite Swift à la CI

Aujourd’hui, la CI ne compile que la cible `Shared` (`ios-analyte-parity`
dans [`.github/workflows/test.yml`](../../.github/workflows/test.yml)) ; elle n’exécute jamais `swift test`.
Ajoutez ce job après `ios-analyte-parity` et poussez-le avec un compte
autorisé à modifier les workflows :

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

`macos-26` est le [runner macOS 26 hébergé par GitHub](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), dont le Xcode par défaut est la version 26.6 au 2026-11-07 ; les deux actions sont [`actions/checkout` v7](https://github.com/actions/checkout/releases/tag/v7.0.0) et [`actions/upload-artifact` v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0).

Le JSON du benchmark devient alors un artefact téléchargeable de chaque
exécution qui touche `clients/ios/`, ce qui est la forme reproductible qu’un
relecteur externe peut vérifier.

## 5. Ce qu’il faut rapporter

- la ligne de synthèse de `swift test`, et tout échec en intégralité ;
- `klarbefund-accuracy-benchmark.json` ;
- pour le pilote, la sortie de `--truth --json` ainsi que le nombre de
  participants et de feuilles.
