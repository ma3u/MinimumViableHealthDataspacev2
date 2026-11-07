---
source: docs/klarbefund/run-on-mac.md
sourceHash: 5945fc0f1639b17de5eb5b9d93a3cbba997f38fa0306a80883c9b3d08c778881
language: es
summary: Cómo reproducir cada cifra de las evidencias en un Mac con Xcode.
---

# Klarbefund: generar la evidencia en un Mac

El paquete Swift está dirigido a macOS 26 e iOS 26, y las pruebas de
escaneo y de benchmark necesitan el framework [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) de Apple, por lo que
solo se ejecutan en un Mac. Esta es la lista de comprobación para generar en
un Mac la evidencia de [`evidence.md`](evidence.md) y
[`self-assessment.md`](self-assessment.md).

## Requisitos previos

| Qué                                                                                     | Por qué                                                                                  | Comprobación                         |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| macOS 26                                                                                | [`Package.swift`](../../clients/ios/Package.swift) declara `.macOS("26.0")`              | `sw_vers -productVersion`            |
| [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes), seleccionado | La cadena de herramientas de Swift 6 y el SDK de macOS 26 con Vision                     | `xcode-select -p`, `swift --version` |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) (solo la aplicación)                  | genera `MeinBefund.xcodeproj` a partir de [`project.yml`](../../clients/ios/project.yml) | `brew install xcodegen`              |
| [CodeQL](https://docs.github.com/en/code-security/codeql-cli) (opcional)                | el análisis estático que ejecutan el hook de pre-push y la CI                            | `brew install --cask codeql`         |

Nada más: el paquete no tiene dependencias de terceros, así que no hay nada
que resolver ni que descargar.

## 1. Compilar y probar

```bash
git switch main && git pull --ff-only     # the published state; clone the repository first if you have none
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` ejecuta la suite completa; la [ejecución del 2026-10-15](evidence.md#run-record) contó 319 pruebas en 54 suites, y la suite ha crecido desde entonces. Las suites
de escaneo y de benchmark renderizan hojas A4 y las leen con Vision, una tras
otra; en un Mac con Apple silicon la suite completa tardó unos diez segundos
después de la compilación. Dos suites miden la precisión:

- [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift): la propia medida de exactitud, sin necesidad de
  Vision;
- [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift): nueve condiciones de escaneo, cero errores
  silenciosos exigidos en cada una, recuentos escritos en el archivo JSON
  indicado arriba.

Solo ese JSON es evidencia para publicar: hojas sintéticas, recuentos y
códigos LOINC, ningún valor. Para ejecutar una sola suite:
`swift test --filter AccuracyBenchmarkTests`.

## 2. Piloto con informes reales (fuera del repositorio)

1. En la aplicación: menú → **Export diagnostics** ([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)), envíe el zip al Mac por AirDrop.
2. Descomprímalo **fuera del repositorio**, por ejemplo `~/Pilot/klarbefund-diagnostics-…`.
3. Junto a cada `diagnostics.json`, escriba un `truth.json` a partir del
   papel (formato en [`evidence.md`](evidence.md#measuring-accuracy)).
4. Ejecute:

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Ambas herramientas rechazan una ruta dentro de [`clients/ios/`](../../clients/ios/). Obtenga el
consentimiento por escrito de cada participante antes del paso 1, y elimine
la exportación cuando se hayan tomado los recuentos.

## 3. Comprobaciones opcionales

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

Los scripts son [`Scripts/codeql-swift.sh`](../../clients/ios/Scripts/codeql-swift.sh) y [`Scripts/run-ui-tests.sh`](../../clients/ios/Scripts/run-ui-tests.sh); la autoprueba se describe en la [guía para desarrolladores](developer-guide.md#the-self-test) y en [`clients/ios/README.md`](../../clients/ios/README.md).

## 4. Incorporar la suite de Swift a la CI

Hoy la CI solo compila el target `Shared` (`ios-analyte-parity` en
[`.github/workflows/test.yml`](../../.github/workflows/test.yml)); nunca ejecuta `swift test`. Añada este job
después de `ios-analyte-parity` y súbalo con una cuenta autorizada a
modificar workflows:

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

`macos-26` es el [runner de macOS 26 alojado por GitHub](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), cuyo Xcode predeterminado es la versión 26.6 a 2026-11-07; las dos actions son [`actions/checkout` v7](https://github.com/actions/checkout/releases/tag/v7.0.0) y [`actions/upload-artifact` v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0).

El JSON del benchmark pasa entonces a ser un artefacto descargable de cada
ejecución que afecte a `clients/ios/`, que es la forma reproducible que un
revisor externo puede comprobar.

## 5. Qué traer de vuelta

- la línea de resumen de `swift test`, y cualquier fallo completo;
- `klarbefund-accuracy-benchmark.json`;
- para el piloto, la salida de `--truth --json` y el número de participantes
  y de hojas.
