# Klarbefund: running the evidence on a Mac

The Swift package targets macOS 26 and iOS 26, and the scanning and benchmark
tests need Apple's [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) framework, so they run only on a Mac. This is the
checklist for producing the evidence in [`evidence.md`](evidence.md) and
[`self-assessment.md`](self-assessment.md) on one.

## Prerequisites

| What                                                                                | Why                                                                                  | Check                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| macOS 26                                                                            | [`Package.swift`](../../clients/ios/Package.swift) declares `.macOS("26.0")`         | `sw_vers -productVersion`            |
| [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes), selected | Swift 6 toolchain and the macOS 26 SDK with Vision                                   | `xcode-select -p`, `swift --version` |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) (app only)                        | generates `MeinBefund.xcodeproj` from [`project.yml`](../../clients/ios/project.yml) | `brew install xcodegen`              |
| [CodeQL](https://docs.github.com/en/code-security/codeql-cli) (optional)            | the static analysis the pre-push hook and CI run                                     | `brew install --cask codeql`         |

Nothing else: the package has no third-party dependencies, so there is nothing
to resolve or download.

## 1. Build and test

```bash
git switch main && git pull --ff-only     # the published state; clone the repository first if you have none
cd clients/ios

swift build                       # Shared, ScanReplay, LabFile, AnalyteParity
swift run AnalyteParity           # the Swift dictionary matches its TypeScript source
KLARBEFUND_BENCHMARK_OUT=$HOME/Desktop/klarbefund-accuracy-benchmark.json swift test
```

`swift test` runs the whole suite; the [run of 2026-10-15](evidence.md#run-record) counted 319 tests in 54 suites, and the suite has grown since. The scanning and
benchmark suites render A4 sheets and read them with Vision, serially; on an
Apple-silicon Mac the whole suite took about ten seconds after the build. Two suites measure accuracy:

- [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift): the accuracy measure itself, no Vision needed;
- [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift): nine scan conditions, zero silent errors required
  under each, counts written to the JSON file named above.

Only that JSON is evidence to publish: synthetic sheets, counts and LOINC codes,
no values. To run one suite: `swift test --filter AccuracyBenchmarkTests`.

## 2. Pilot on real reports (outside the repository)

1. In the app: menu → **Export diagnostics** ([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)), AirDrop the zip to the Mac.
2. Unzip it **outside the repository**, for example `~/Pilot/klarbefund-diagnostics-…`.
3. Next to each `diagnostics.json`, write a `truth.json` from the paper (format
   in [`evidence.md`](evidence.md#measuring-accuracy)).
4. Run:

   ```bash
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth          # per row, no values
   swift run ScanReplay ~/Pilot/klarbefund-diagnostics-2026-10-20 --truth --json   # counts only
   ```

Both tools refuse a path inside [`clients/ios/`](../../clients/ios/). Get each participant's written
consent before step 1, and delete the export when the counts are taken.

## 3. Optional checks

```bash
Scripts/codeql-swift.sh           # CodeQL on the app, ~15 minutes, exits 1 on a new finding
Scripts/run-ui-tests.sh           # XCUITest on a simulator, demo data only
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest   # 27-check self-test, see clients/ios/README.md
```

The scripts are [`Scripts/codeql-swift.sh`](../../clients/ios/Scripts/codeql-swift.sh) and [`Scripts/run-ui-tests.sh`](../../clients/ios/Scripts/run-ui-tests.sh); the self-test is described in the [developer guide](developer-guide.md#the-self-test) and in [`clients/ios/README.md`](../../clients/ios/README.md).

## 4. Put the Swift suite into CI

CI today builds only the `Shared` target (`ios-analyte-parity` in
[`.github/workflows/test.yml`](../../.github/workflows/test.yml)); it never runs `swift test`. Add this job after
`ios-analyte-parity` and push it with an account allowed to change workflows:

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

`macos-26` is the [GitHub-hosted macOS 26 runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), whose default Xcode is 26.6 as of 2026-11-07; the two actions are [`actions/checkout` v7](https://github.com/actions/checkout/releases/tag/v7.0.0) and [`actions/upload-artifact` v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0).

The benchmark JSON then becomes a downloadable artifact of every run that
touches `clients/ios/`, which is the reproducible form an outside reviewer can
check.

## 5. What to bring back

- the `swift test` summary line, and any failure in full;
- `klarbefund-accuracy-benchmark.json`;
- for the pilot, the `--truth --json` output and the number of participants and
  sheets.
