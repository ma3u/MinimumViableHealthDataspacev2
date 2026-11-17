# Klarbefund developer guide

How to build, run, test and change the iPhone app in
[`clients/ios/`](../../clients/ios/). The [user guide](user-guide.md) shows
what a person sees; this guide shows what makes it so. The short command card
is [`clients/ios/README.md`](../../clients/ios/README.md); the work is tracked
in [issue #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Every screenshot and every number in this guide comes from the app's own
fictional development dataset. No real report is involved anywhere in the
repository, and [the two rules at the end](#two-rules-that-are-not-negotiable)
say why that is not negotiable.

## What you need

| Tool                                                                     | Version                                                                                                                                                                                                                                               | Why                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS with Xcode                                                         | [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes) or later, iOS 26 SDK or later; CI builds with Xcode 26.6 on the [macOS 26 runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) | The app targets iOS 26; the Swift package declares macOS 26 for the tools                                                                                                                                                            |
| Swift                                                                    | 6.0, [strict concurrency](https://www.swift.org/documentation/concurrency/)                                                                                                                                                                           | [`Package.swift`](../../clients/ios/Package.swift) and [`project.yml`](../../clients/ios/project.yml) both pin it                                                                                                                    |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen)                        | `brew install xcodegen`                                                                                                                                                                                                                               | The `.xcodeproj` is generated from `project.yml` and never committed                                                                                                                                                                 |
| Node                                                                     | as for `ui/`                                                                                                                                                                                                                                          | Only to regenerate the dictionary from [`services/epa-ingest`](../../services/epa-ingest)                                                                                                                                            |
| [PlantUML](https://www.plantuml.com/), [Graphviz](https://graphviz.org/) | `brew install plantuml`                                                                                                                                                                                                                               | Only to re-render the diagrams in this guide                                                                                                                                                                                         |
| An iPhone                                                                | iOS 26 or later                                                                                                                                                                                                                                       | Only for the camera, Face ID, [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) and [TestFlight](https://developer.apple.com/testflight/); everything else runs in the simulator |

## How it is put together

![Klarbefund as an ArchiMate layered view: the business layer with the person, the doctor and the research team and the six things a person does; the application layer with the four services, the app, the Shared package, the tools, the hub and the generator; the technology layer with the iPhone's frameworks, the Mac and Azure Container Apps](img/klarbefund-architecture.svg)

Source: [`diagrams/klarbefund-architecture.puml`](diagrams/klarbefund-architecture.puml),
rendered with [`scripts/render-plantuml.sh`](../../scripts/render-plantuml.sh) `docs/klarbefund/diagrams/*.puml`.

The view follows [ArchiMate 3.2](https://pubs.opengroup.org/architecture/archimate32-doc/): the business layer (yellow) holds who does
what, the application layer (blue) the services the software provides and
the components that realise them, the technology layer (green) what it all
runs on. An arrow from a lower band to an upper one means "serves"; a dotted
arrow with a hollow head means "realises". Three things to read off it:

- **[`Sources/Shared`](../../clients/ios/Sources/Shared/)** is a Swift package that compiles for iOS and macOS. It
  holds the parser, the recogniser's post-processing, the generated analyte
  dictionary and reference ranges, the record model with its provenance, and
  the export formats ([FHIR R4](https://hl7.org/fhir/R4/), [OMOP CDM](https://ohdsi.github.io/CommonDataModel/cdm54.html), the diagnostics bundle). Nothing in
  it touches the network, the Keychain or the store, which is why every
  number the app computes can be reproduced on a Mac with `swift test`.
- **[`Sources/MeinBefund`](../../clients/ios/Sources/MeinBefund/)** is the app: SwiftUI views, [VisionKit](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller) scanning, the
  sealed store, the exports' share sheet, the EHDS connection, the app lock,
  the analysis providers, and the debug-only demo data and self-test.
- **[`Tools/`](../../clients/ios/Tools)** are four command-line programs over the Shared package:
  [`LabFile`](../../clients/ios/Tools/LabFile) imports a PDF or image exactly as the app would, [`ScanReplay`](../../clients/ios/Tools/ScanReplay)
  re-runs a diagnostics export through the current parser, [`AnalyteParity`](../../clients/ios/Tools/AnalyteParity)
  proves the generated dictionary equals its TypeScript source, and [`IconGen`](../../clients/ios/Tools/IconGen)
  draws the app icon.

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

## Build and run

```bash
cd clients/ios
brew install xcodegen                          # once
swift test                                     # the Shared package, on the Mac
swift run AnalyteParity                        # the generated table agrees with its source
xcodegen generate && open MeinBefund.xcodeproj # then run the MeinBefund scheme in Xcode
```

From the command line into a simulator, note the **ad-hoc signature**:
without it every Keychain call fails with [`-34018`](https://developer.apple.com/documentation/security/errsecmissingentitlement) and the store cannot
create its key.

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES build
```

Onto a connected iPhone: [`Scripts/install-device.sh`](../../clients/ios/Scripts/install-device.sh). The generated project
carries no signing team, so a plain `xcodebuild` for a device fails; the
script supplies one from `TEAM_ID` or from the keychain, and installs what it
built. TestFlight: [`Scripts/archive-and-upload.sh`](../../clients/ios/Scripts/archive-and-upload.sh); its header names the four
things that must exist in the Apple Developer account first. The version is
pinned in `project.yml`: `MARKETING_VERSION` matches the [App Store Connect](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
record and `CURRENT_PROJECT_VERSION` rises with every upload, because App
Store Connect refuses a build number it has already seen, after the upload.

## Demo data and launch arguments

<img src="img/list.png" width="300" alt="The report list filled by the development dataset: seven fictional reports from a laboratory, a practice and a study centre over three years"> <img src="img/detail.png" width="300" alt="A fictional report from the development dataset, with values to review and the lists of unmatched and unread rows">

Every launch argument below exists only in a Debug build. The checks are
`#if DEBUG`, not a flag alone: a flag can be discovered, code that is not
compiled cannot.

| Argument               | What it does                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-MBDemoSeed`          | Two fictional reports, in memory only. Enough for a screenshot; what every UI test launches with.                                                                                                                |
| `-MBDevData`           | Seven fictional reports across three years and four sources, built in code: a trend has shape, the unmatched list has rows, every report has pages.                                                              |
| `-MBShot <screen>`     | Opens a screen directly once the reports are loaded: `list detail scan trends reference history profile consent settings privacy consents connect programmes graph relate relatePaired relateUSB relateUSBDone`. |
| `-MBSelfTest`          | Drives one synthetic report through the whole pipeline in the app target and logs 27 checks (see [The self-test](#the-self-test)).                                                                               |
| `-MBUSBSelfTest`       | Listens for the Mac over the USB cable with a fixed test token and sends only the end frame ([Relate](#relate-the-graph-on-the-phone-and-on-the-mac)).                                                           |
| `-MBExportDiagnostics` | Builds the diagnostics archive into the app's temporary directory for [`Scripts/pull-diagnostics.sh`](../../clients/ios/Scripts/pull-diagnostics.sh).                                                            |

The dev dataset is **built, not stored**. A row states the label, the value,
the unit and the range the laboratory printed, and [`Analytes.lookup`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) codes it
exactly as it codes a scan. No code in the dataset can be wrong, a row the
dictionary cannot code lands in the unmatched list of its own accord, and the
dataset follows the dictionary when the dictionary changes. The pages are
drawn by [`SyntheticSheet`](../../clients/ios/Sources/Shared/SyntheticSheet.swift), the same renderer the tests read.

A demo launch never locks: the app lock reads the seed flag and stays open,
so the UI tests and the screenshot script run where nobody can answer a
passcode prompt. On a release build neither the flag nor the exception exists.

Screenshots for the documentation and the App Store come from one script,
which launches each screen by argument rather than by scripted taps, so a
re-shoot after a layout change needs no new coordinates:

```bash
SEED=-MBDevData OUT=/tmp/shots SCREENS="list detail trends" Scripts/capture-screenshots.sh
Scripts/capture-screenshots.sh                 # the App Store set, size-checked, into appstore/screenshots/en
```

## From the camera to the store

![The scan pipeline as a sequence: the app's scanner hands the pages to LabImport, which decides the provenance, recognises or reads the text, reconciles the passes, infers the column roles, parses every row against the generated dictionary, reads the header, and hands the result to the review screen and then to the sealed store](img/klarbefund-scan-pipeline.svg)

Source: [`diagrams/klarbefund-scan-pipeline.puml`](diagrams/klarbefund-scan-pipeline.puml).

The order is fixed and each step has one owner
([ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)):

1. **Provenance first.** [`LabImport`](../../clients/ios/Sources/Shared/LabImport.swift) decides on the file, never its
   extension: a PDF carrying the laboratory's own text layer is
   `lab-issued-digital` and its Observations are `final`; anything that has to
   go through the recogniser is `ocr-transcribed` and `preliminary`. It is
   strict on purpose, because marking a transcription `final` is the failure
   that matters.
2. **Recognition.** [`VisionDocumentReader`](../../clients/ios/Sources/Shared/VisionDocumentReader.swift) runs two [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) passes, German and
   English, with language correction **off**: "correcting" `Lp(a)` or a
   decimal comma is actively harmful. [`DocumentReconciler`](../../clients/ios/Sources/Shared/DocumentReconciler.swift) merges the passes
   and [`TableRoles`](../../clients/ios/Sources/Shared/TableRoles.swift) infers which column holds the label, the value, the unit
   and the range, per table.
3. **Parsing.** [`LabLineParser`](../../clients/ios/Sources/Shared/LabLineParser.swift) reads every row. When the ordinary parse finds
   nothing, the sheet readers take their turn: ambulatory blood pressure,
   resting and exercise ECG, Holter, cardiopulmonary exercise test, lactate,
   CGM glucose profile, DXA, and a body-composition scale's screen, which is
   a dashboard and not a report and is read for its headline value only.
4. **Coding.** [`Analytes.lookup(label, unit)`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) picks the LOINC code. The unit
   decides, never the name alone. A quantity LOINC does not code (visceral fat
   as a mass, a water ratio) is carried with its unit, no code and a required
   reason; an organism from a stool report carries its [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) id,
   because LOINC names tests and not organisms.
5. **The header.** [`ReportMetadata`](../../clients/ios/Sources/Shared/ReportMetadata.swift) and [`PrintedFields`](../../clients/ios/Sources/Shared/PrintedFields.swift) read the laboratory,
   the lab date, the issue date and the report number from the sheet; the lab
   date is preferred over the receipt and issue dates and the person confirms
   it before saving.
6. **Conservation.** Every row that looks like a measurement ends up coded,
   unmatched or unread. A row in none of the three is indistinguishable from
   a row that was never printed, and that is exactly how an HbA1c row went
   missing once ([`docs/gotchas.md`](../gotchas.md#2026-09-19-the-measurement-that-justified-the-ocr-hybrid-was-taken-on-the-wrong-os), 2026-09-19). The self-test asserts it.
7. **Review and save.** [`ReviewViews`](../../clients/ios/Sources/MeinBefund/ReviewViews.swift) shows what was read; [`ReportStore`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)
   seals it.

`swift run LabFile ~/Downloads/befund.pdf` runs steps 1 to 6 on a Mac and
prints the provenance, the header, and every row as coded, unmatched or
unread; `--values` adds the numbers, `--rows` adds the recogniser's layout.
It refuses a path inside this repository.

## The store and the lock

Three sealed files per report under `Application Support/Reports`, each
[AES-GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm) under the same Keychain key, [complete file protection](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete), [excluded from
backup](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup):

```
<id>.sealed         the record (LabReport)
<id>.scan.sealed    the pages as one PDF
<id>.diag.sealed    the scan's diagnostics (ScanDiagnostics)
profile.sealed      sex, date of birth, height (Profile)
consents.sealed     the three consent decisions (ConsentLedger)
```

The key is [`ThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) and unavailable while the phone is locked, so a
container copy yields ciphertext and the system's own snapshot of the app
fails with `EPERM`; [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) pins the build settings and the
[self-assessment](self-assessment.md) records the measurement. Records
written before a field existed still decode: every later field is optional or
defaulted.

The app lock ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))
is two types. [`AppLockPolicy`](../../clients/ios/Sources/Shared/AppLockPolicy.swift) in Shared decides _whether_ a challenge is due
and is pure, so [`AppLockPolicyTests`](../../clients/ios/Tests/SharedTests/AppLockPolicyTests.swift) runs on a Mac; [`AppLock`](../../clients/ios/Sources/MeinBefund/AppLock.swift) in the app asks
[LocalAuthentication](https://developer.apple.com/documentation/localauthentication) _how_, Face ID, Touch ID or the passcode, and
[`PrivacyCover`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) draws the cover the app switcher sees. The same ADR says why
certificate pinning and jailbreak detection were declined.

## The dictionary is generated, never copied

[`Sources/Shared/Analytes.generated.swift`](../../clients/ios/Sources/Shared/Analytes.generated.swift), [`ReferenceRanges.generated.swift`](../../clients/ios/Sources/Shared/ReferenceRanges.generated.swift)
and [`PromptText.generated.swift`](../../clients/ios/Sources/Shared/PromptText.generated.swift) are produced from
[`services/epa-ingest`](../../services/epa-ingest):

```bash
cd services/epa-ingest && npm run generate:swift
cd clients/ios && swift run AnalyteParity      # 1760 codings, 96 units on 2026-11-07
```

Do not hand-edit them. Add an analyte to [`analytes.ts`](../../services/epa-ingest/src/analytes.ts) or a range to
[`reference-ranges.ts`](../../services/epa-ingest/src/reference-ranges.ts), regenerate, commit both. CI fails when a generated file
is out of date with its source, because a stale copy is exactly the silent
divergence the monorepo was chosen to prevent: an iPhone coding Lp(a) one way
and the ingest service another, noticed when a value reaches a doctor.

The reference-range generator refuses a range whose analyte the dictionary
does not know or whose unit that analyte is not defined in. Only analytes with
a citable published source get a band
([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)); for every other
analyte the Trends screen draws the range the person's own laboratory printed.

## Tests, and what each is for

```bash
swift test                                     # Swift Testing: what the app computes
Scripts/run-ui-tests.sh                        # XCUITest: what it shows, and what a tap does
swift test --filter AccuracyBenchmarkTests     # the accuracy benchmark; KLARBEFUND_BENCHMARK_OUT=<file> writes its JSON
swift test --filter SecurityPostureTests       # the build settings the self-assessment relies on
```

**The unit suite** ([`Tests/SharedTests/`](../../clients/ios/Tests/SharedTests/), [Swift Testing](https://developer.apple.com/documentation/testing)) is the larger one and catches what
can be reasoned about: a unit that picks the wrong code, a date read from the
wrong line, an export column in the wrong place. [`FhirBundleParityTests`](../../clients/ios/Tests/SharedTests/FhirBundleParityTests.swift) pins
the bundle to the golden bundle `services/epa-ingest` writes, so both writers
emit the same FHIR for the same sheet.

**The UI suite** ([`Tests/UITests/`](../../clients/ios/Tests/UITests/), [XCUITest](https://developer.apple.com/documentation/xctest/xcuiapplication)) exists because the unit suite caught none
of the last several defects: a card clipped at the chart's edge, a selection
that forgot itself on the next render, `LOINC Optional("2093-3")` on the one
screen a person compares with their own paper. Every test launches with
`-MBDemoSeed` and reaches its screen with `-MBShot`, so it breaks when what it
checks changes and not when a button moves. Three things learned the hard way
are in [`docs/gotchas.md`](../gotchas.md#2026-09-20--an-accessibilityidentifier-on-a-chart-renames-everything-inside-it): an `accessibilityIdentifier` on a container renames
everything inside it; a `Button` whose label is `Color.clear` is not in the
accessibility tree; [Swift Charts](https://developer.apple.com/documentation/charts)' selection answers a finger and not a
synthesised tap, so real buttons sit over the marks.

### The self-test

Everything after the camera runs in the app target and therefore not in
`swift test`: the sealed store, the PDF of the pages, the export. `-MBSelfTest`
drives one synthetic report through the whole chain and logs each of its 27
checks: recognition and coding, a citation per value, the lab date read from
the header, the pages as a PDF, the three sealed files decrypting, the replay
of the diagnostics record reproducing the extraction exactly, the archive
building, and the doctor export fitting the ePA's 25 MB with the pages
appended.

```bash
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest
xcrun simctl spawn <udid> log show --last 2m --predicate 'subsystem == "red.mabu.meinbefund"' --style compact
```

### The accuracy benchmark

[`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift) reads synthetic sheets of known content with Vision and, with
`KLARBEFUND_BENCHMARK_OUT` set, writes field-level accuracy as JSON; the published copy is
[`docs/klarbefund/accuracy-benchmark.json`](accuracy-benchmark.json), and [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift)
tests the measure itself. The [evidence](evidence.md) page quotes it and [run-on-mac](run-on-mac.md)
reproduces every number. A real report is measured the same way, on the
person's own Mac and never in the repository, with `ScanReplay --truth`
against a hand-written `truth.json` beside the export: it prints which fields
of which rows were wrong, never the values.

## Debugging a misread sheet

The store yields ciphertext, so evidence leaves the phone through the app's
own **Export diagnostics**, which asks for confirmation in words and hands a
zip to the share sheet
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

With the phone on USB and a Debug build installed,
`Scripts/pull-diagnostics.sh` does the export and the unzip in one go, under
`~/Downloads`. Unzip **outside this repository**, then:

```bash
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date>          # every report, with the current parser
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --ocr    # re-run Vision on scan.pdf
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --truth  # accuracy against truth.json
```

The replay prints what the phone coded, what codes now, what is newly coded
or lost, and every row with its reason. Add an analyte to [`analytes.ts`](../../services/epa-ingest/src/analytes.ts),
regenerate, replay, and watch the real sheet's rows move from unmatched to
coded without scanning it again. Both tools refuse a path inside
`clients/ios/`.

## The connection to the EHDS hub

The patient screen of the hub starts an [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8628) device grant for the public
[Keycloak](https://www.keycloak.org/docs/latest/server_admin/#device-authorization-grant) client `klarbefund-app` and shows it as a QR code carrying a
`klarbefund://connect` link; the app polls Keycloak for the token and
registers with the hub
([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)).

- [`Shared/EHDSConnect.swift`](../../clients/ios/Sources/Shared/EHDSConnect.swift): the link, refused unless its hub and issuer are
  on `TrustedHub.production` (plus `.development` in a debug build), and the
  poller with its four answers. [`EHDSConnectTests`](../../clients/ios/Tests/SharedTests/EHDSConnectTests.swift) covers each.
- [`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift): tokens and a device id in the Keychain as
  `ThisDeviceOnly`, refresh, register, read the record, disconnect (which
  revokes the refresh token at Keycloak), and the two sync switches.
- [`ConnectView.swift`](../../clients/ios/Sources/MeinBefund/ConnectView.swift): the sheet, [VisionKit](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller)'s data scanner for QR codes only,
  a paste field, and "Is this your account?".
- **Create an EHDS account** ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md))
  calls the two routes on the hub that answer without a session; the account
  is created only for a request whose Apple [App Attest](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) attestation verifies,
  which is why the simulator shows the button disabled with its reason.
- **Send my reports** and **Send my device trends**
  ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) post
  to the person's own record; the record itself holds reports, vaccinations
  and the medication plan ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)).
- [`ConnectUITests`](../../clients/ios/Tests/UITests/ConnectUITests.swift) and [`AccountUITests`](../../clients/ios/Tests/UITests/AccountUITests.swift) run against `DemoEHDSTransport` under
  `-MBDemoSeed`; [`LiveConnectUITests`](../../clients/ios/Tests/UITests/LiveConnectUITests.swift) and [`LiveAccountUITests`](../../clients/ios/Tests/UITests/LiveAccountUITests.swift) run against a
  real hub when given a fresh link
  ([`docs/knowledge/runbooks/klarbefund-connect.md`](../knowledge/runbooks/klarbefund-connect.md)).

## Exports

| Action                     | Writer                                                                                                                                       | Contents                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Share for my doctor        | [`ReportExport`](../../clients/ios/Sources/MeinBefund/ReportExport.swift), [`FhirBundle`](../../clients/ios/Sources/Shared/FhirBundle.swift) | PDF summary with the original pages appended, plus a FHIR R4 bundle                                                                                                                                                                                                             |
| Export for research (OMOP) | [`OmopExport`](../../clients/ios/Sources/Shared/OmopExport.swift)                                                                            | OMOP CDM v5.4 [`measurement.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#measurement), [`person.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#person), [`observation_period.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#observation_period) |
| Export all my data         | [`DataExport`](../../clients/ios/Sources/MeinBefund/DataExport.swift)                                                                        | every report, page, value, profile field and consent, as JSON and PDFs                                                                                                                                                                                                          |
| Export diagnostics         | [`DiagnosticsBundle`](../../clients/ios/Sources/Shared/DiagnosticsBundle.swift)                                                              | the record, both Vision passes, the pages, the session log                                                                                                                                                                                                                      |

The OMOP tables carry `measurement_concept_id = 0` throughout, deliberately:
mapping LOINC to an OMOP concept needs the [Athena](https://athena.ohdsi.org/) vocabulary, which is not on
a phone, and inventing an id would put a wrong identifier on a real
measurement. The printed range is kept verbatim in [`RawLabValue.referenceText`](../../clients/ios/Sources/Shared/Provenance.swift#L67)
and travels as [`referenceRange.text`](https://hl7.org/fhir/R4/observation-definitions.html#Observation.referenceRange.text); a range with no number in it survives
only there, and FHIR's [obs-3](https://hl7.org/fhir/R4/observation.html#invs) allows that: a reference range needs at least a low, a high or a text.

## Relate: the graph on the phone and on the Mac

<img src="img/graph.png" width="300" alt="Health graph on this iPhone, built from the fictional development dataset: the counts of reports, values, LOINC codes and uncoded values"> <img src="img/relatePaired.png" width="300" alt="Export to my Mac, paired with the fictional Demo-Mac that screenshots use">

Two features put the person's values into a [Relate](https://github.com/relatedb/relate)
graph (an embedded openCypher database): one on the phone, one on the
person's own Mac. Both go through the same library, `HealthGraph`, from
[ma3u/relate-hackathon-team](https://github.com/ma3u/relate-hackathon-team),
so a report becomes the same nodes on the phone, on the Mac, and in that
repository's Python reference. The user's side is in the
[user guide](user-guide.md#your-health-graph-on-this-iphone).

| Piece                   | Where                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The library             | `HealthGraph` in [`project.yml`](../../clients/ios/project.yml), pinned to a commit; it brings Relate's `RelateFFI.xcframework` (iOS 16+, macOS 13+)                                                                       |
| Graph on this iPhone    | [`OnDeviceGraph`](../../clients/ios/Sources/MeinBefund/OnDeviceGraph.swift), [`OnDeviceGraphView`](../../clients/ios/Sources/MeinBefund/OnDeviceGraphView.swift)                                                           |
| Export to my Mac        | [`LocalRelateExport`](../../clients/ios/Sources/MeinBefund/LocalRelateExport.swift), [`LocalRelateView`](../../clients/ios/Sources/MeinBefund/LocalRelateView.swift)                                                       |
| The pairing link        | [`LocalRelateLink`](../../clients/ios/Sources/Shared/LocalRelateLink.swift): `klarbefund://relate?url=…&token=…&fp=…&name=…&store=…`                                                                                       |
| The receiver on the Mac | [`swift/mac`](https://github.com/ma3u/relate-hackathon-team/tree/main/swift/mac) and [`scripts/health_vault.sh`](https://github.com/ma3u/relate-hackathon-team/blob/main/scripts/health_vault.sh) in relate-hackathon-team |

<img src="img/klarbefund-relate-claude.gif" width="640" alt="Animation of the whole way: Klarbefund pairs with the receiver, sends 34 fictional reports, the Mac's Relate graph holds them, and Claude Desktop reads it over MCP">

The animations in this section and in the user guide are made by
[`scripts/flow_gifs.py`](https://github.com/ma3u/relate-hackathon-team/blob/main/scripts/flow_gifs.py)
from a Simulator recording with `-MBDevData` and a scratch receiver started with
`--config <scratch folder> --name Demo-Mac`, so neither the vault nor the real
pairing is ever involved; the docstring there lists the steps.

### The graph on the phone

[`OnDeviceGraph`](../../clients/ios/Sources/MeinBefund/OnDeviceGraph.swift) is
a projection, never a source: it is rebuilt from scratch from the same FHIR
bundles the Mac export sends, whenever the reports change, and switching it
off deletes it. The store sits in Application Support under `HealthGraph`
(`HealthGraphDemo` for a demo launch, so fictional data never meets a real
graph), with `FileProtectionType.complete` and excluded from backup. Every
list on the screen is a named Cypher query from the library, run on a
read-only handle. Relate allows one handle per store per process, so the
writer is closed before the reader opens.

### Export over Wi-Fi

1. The Mac's receiver (`health-graph receive`) makes a P-256 certificate and
   a 256-bit token once and prints them as a QR code: the pairing link.
2. The app accepts the link only with `https`, a private, loopback or `.local`
   address and a 64-hex fingerprint, and keeps it in the Keychain.
3. Each request pins the receiver certificate's SHA-256 and sends the token as
   a bearer. `GET /v1/status` answers the count of values; `POST /v1/record`
   takes one report's FHIR bundle (the report id in `X-Klarbefund-Report`, so
   sending again replaces it); `POST /v1/wearables` takes the Apple Health weekly means.
4. Before a batch, one 4-second status call checks that the Mac is reachable,
   so a phone off the Mac's Wi-Fi does not wait out one timeout per report.

### Export over a USB cable

```
Mac: health-graph usb ──usbmuxd──▶ iPhone 127.0.0.1:8788 / ::1:8788 (Klarbefund, while waiting)
  Mac   → phone   {"token": "…"}                          the pairing token, first
  phone → Mac     {"type": "record", "report": "…", "bundle": {…}}   one per report
  phone → Mac     {"type": "wearables", "bundle": {…}}    if the person sends them
  phone → Mac     {"type": "end"}
  Mac   → phone   {"stored": n, "reports": n, "weekly": n, "skipped": n}
```

Every frame is a 4-byte big-endian length and a JSON object. The phone listens
only after **Send over USB cable**, only on its loopback addresses (which no
network can reach; [usbmuxd](https://github.com/libimobiledevice/usbmuxd)
tunnels the cable to them), compares the token in constant time before it
sends anything, serves one Mac, and closes the port. It starts listening
before it gathers a year of Apple Health data, and it holds a background task,
so switching apps does not end the transfer.

### Try it, step by step

In the Simulator, with fictional data and a scratch graph:

1. In relate-hackathon-team: `swift test` (the library) and `swift test --package-path swift/mac` (the receiver).
2. Start a receiver on a scratch store, never the vault (add `--port 8799` when the real one is running):
   ```bash
   swift run --package-path swift/mac health-graph receive --db /tmp/dev-graph/health.rl --config /tmp/dev-graph/identity \
     --name Demo-Mac --host 127.0.0.1 --print-link
   ```
3. Launch the app in the Simulator with `-MBDevData` and paste the printed
   link into **Export to my Mac (Relate)**. A demo launch keeps
   its pairing under its own Keychain key, so it can never send to a real pairing.
4. Send over Wi-Fi with **Send everything now**, then check the scratch graph:
   ```bash
   swift run --package-path swift/mac health-graph query --db /tmp/dev-graph/health.rl reports
   ```
5. For the USB path in the Simulator (its loopback is the Mac's): tap
   **Send over USB cable**, then
   `swift run --package-path swift/mac health-graph usb --simulator --config /tmp/dev-graph/identity --db /tmp/dev-graph/health.rl`.

On a real iPhone over the cable, without a person's values or a tap: a Debug
build launched with `-MBUSBSelfTest` listens with a fixed test token and sends
only the end frame.

```bash
xcrun devicectl device process launch --device <udid> --console red.mabu.meinbefund -- -MBUSBSelfTest
swift run --package-path swift/mac health-graph usb --db /tmp/dev-graph/health.rl \
  --test-token usb-self-test-token-0000000000000000
```

### Updating the library

The `HealthGraph` package is pinned to a `revision` in
[`project.yml`](../../clients/ios/project.yml). After a change lands in
relate-hackathon-team, put its commit there, run `xcodegen generate`, and build
once in Xcode so SwiftPM resolves it. The Relate binary is a 311 MB zip that
SwiftPM downloads once into its cache; CI fetches it in the
"Resolve Swift packages" step before CodeQL traces the build.

### Screenshots of these screens

`graph`, `relate`, `relatePaired`, `relateUSB` and `relateUSBDone` are
`-MBShot` screens. The paired ones use a fictional Mac called Demo-Mac on a
[TEST-NET](https://www.rfc-editor.org/rfc/rfc5737) address, in memory only:
with it nothing is sent, nothing is checked, nothing listens.

## Languages

English is the base, German the translation, following the phone's language.
[`Scripts/check-localization.sh`](../../clients/ios/Scripts/check-localization.sh) fails when a user-visible string has no
German or when a German sentence was left in the English base; it uses
[`xcodebuild -exportLocalizations`](https://developer.apple.com/documentation/xcode/localization), the same extractor Xcode's editor uses, so
it sees SwiftUI `Text` literals and `INFOPLIST_KEY_*` values that no grep of
the sources would find. The camera permission prompt once shipped in German to
every English phone, which is why the script exists.

## Static analysis and CI

```bash
Scripts/codeql-swift.sh                        # CodeQL on the app and Shared, about 15 minutes
```

[CodeQL](https://docs.github.com/en/code-security/codeql-cli) needs a real build to see Swift, so on GitHub it runs only when
`clients/ios/` changes ([`.github/workflows/codeql-swift.yml`](../../.github/workflows/codeql-swift.yml)), on a macOS
runner. The `codeql-swift` pre-push hook runs the same suite when a push
changes the Swift sources; it exits 1 on any finding not listed, with its
reason, in [`Scripts/codeql-accepted.txt`](../../clients/ios/Scripts/codeql-accepted.txt). Swift needs a macOS runner, which
has lower concurrency than Linux, so the iOS job is path-filtered to
`clients/ios/**` and never gates the web or service suites; conversely, the
`ui/**` and `services/**` workflows exclude `clients/ios/**`.

The security posture of the app, its threat model and what an independent
test would add are in the [threat model](../security/threat-model-klarbefund.md),
the [security test report](../security/security-test-report-2026-10-15.md)
and the [self-assessment](self-assessment.md).

## Two rules that are not negotiable

1. **No health data in `clients/ios/`, ever.** No lab reports, no scans, no
   exported HealthKit archives, no screenshots containing real values, not
   even temporarily, not even gitignored. Test fixtures are synthetic, the way
   [`services/epa-ingest/__tests__/fixtures/`](../../services/epa-ingest/__tests__/fixtures/) already is. The tools refuse a
   path inside the repository for the same reason.
2. **No real organisation in demo content.** [`CLAUDE.md`](../../CLAUDE.md) forbids it outside
   the `NEXT_PUBLIC_DEMO_TK` flag. The study this app is built for is real;
   the demo centre, the laboratory and the practice in the dev dataset are
   fictional.

## Where the decisions are

| ADR                                                                                                  | Decides                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)                                         | The extraction pipeline and its order                      |
| [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                       | Diagnostics kept with the scan, exported on request        |
| [ADR-039](../ADRs/ADR-039-published-reference-ranges.md)                                             | Only citable published ranges, beside the laboratory's own |
| [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)                                    | Connecting by OAuth device grant and QR code               |
| [ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)                              | The beta by public TestFlight link                         |
| [ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)                   | Creating an account, gated by App Attest                   |
| [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)                                   | Sending weekly device means, behind a switch of its own    |
| [ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)          | What the record holds                                      |
| [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) | The app lock; pinning and jailbreak detection declined     |
