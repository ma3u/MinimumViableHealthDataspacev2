# Klarbefund

The iPhone health-document scanner ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)).
Scan a paper lab report, get structured values with their provenance intact, keep
them encrypted on the device.

```bash
brew install xcodegen          # once
swift test                     # the parser and provenance model
swift run AnalyteParity        # generated table agrees with its TypeScript source
swift run IconGen              # re-render the app icon
xcodegen generate && open MeinBefund.xcodeproj
```

Simulator build from the command line, note the **ad-hoc signature**, without
which every Keychain call fails with `-34018` and the store cannot create its key:

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES build
```

TestFlight: `Scripts/archive-and-upload.sh`, see its header for the four things
that must exist in your Apple Developer account first.

## What works today

Scan (VisionKit) → on-device OCR (two Vision passes reconciled, German + English,
language correction **off** because "correcting" `Lp(a)` or a decimal comma is
actively harmful) → column roles inferred per table → parse → LOINC coding →
the sheet's own date and details read → review, with the lab date confirmed →
encrypted save of the values, the recognised text, the pages as a PDF and the
scan's diagnostics → list → export as a PDF with the original pages appended
plus a FHIR R4 bundle → on-device or cloud explanation on explicit consent.

Not yet: trends over time on screen.

## Three kinds of document

A **lab sheet**, scanned or imported, which is the main path.

A **body-composition scale's screen**, photographed in a gym. That is a
dashboard, not a report: a metric's name, the current value in large type, the
day it was measured, and a twelve-month chart. It has its own reader, tried
only when the ordinary parse finds nothing, and it deliberately reads only the
headline value. The chart's labelled points are real measurements whose dates
the screen does not give, and a value carrying a date we inferred is worse than
a value we did not take. The device's own verdict badges (`Niedrig`, `Normal`)
are ignored too: those are the manufacturer's bands, not a guideline's.

Cards photographed in one go can carry two measurement days, because a scale
updates its metrics at different times, so they become one report per day.
Provenance is `self-tracked`, which the enum defines as a value from a consumer
device.

## Two ways in

**Scan** (VisionKit) for paper, which is the starting condition for most
people. **Import** for a file they already have: a laboratory's PDF, a portal
download, a photograph in the library.

The document decides what its values are worth. A PDF carrying the
laboratory's own text layer is `lab-issued-digital`, so its Observations are
`final`; anything that has to go through the recogniser is `ocr-transcribed`
and `preliminary`. The test is on the file, never its extension, and it is
strict on purpose: marking a transcription `final` is the failure that matters.

The same `LabImport` runs on the phone and on a Mac, so a layout can be
debugged without a device:

```bash
swift run LabFile ~/Downloads/befund.pdf            # labels, codes, reasons
swift run LabFile ~/Downloads/befund.pdf --values   # with the numbers
```

It prints the provenance it decided, the laboratory and date it read, and every
row as coded, unmatched or unread. `--rows` adds what the recogniser produced:
the inferred column layout and each table row, or the reading order when no
table was found, which is the difference between "the recogniser lost the
column" and "the parser read the wrong one". Values are withheld unless asked for, so the
default output can be pasted into an issue. Like the replay tool it refuses a
path inside this repository, because a lab report is health data (rule 1 below).

## Testing on a real report

The store is sealed under a key that never leaves the phone, so a container
download yields ciphertext. The way to get evidence off the device is the
app's own **Export diagnostics** (menu, or per report), which asks for
confirmation in words and hands a zip to the share sheet ([ADR-038](../../docs/ADRs/ADR-038-scan-retained-diagnostics-export.md)):

```
klarbefund-diagnostics-2026-09-19/
  about.json                 build, device, dictionary size, counts
  log.txt                    this session's log lines, counts and codes only
  <title>-<id8>/
    report.json              the stored record: values, metadata, page text
    diagnostics.json         both Vision passes, the reconciled rows, the layout
    scan.pdf                 the pages as scanned
```

AirDrop it to the Mac, unzip it **outside this repository** (rule 1 below), and
replay it with the current parser and dictionary. With the phone on USB and a
Debug build installed, `Scripts/pull-diagnostics.sh` does the export and the
unzip in one go: it launches the app with `-MBExportDiagnostics`, which builds
the archive into the app's own temporary directory, fetches it with
`devicectl`, unzips it under `~/Downloads`, and relaunches the app, which
deletes the archive on the phone. The argument is compiled out of a release
build, and that file is the one deliberate downgrade of file protection in the
app, because the paired Mac's file service cannot open a file under complete
protection at all (measured: the sealed store answers `EPERM`).

```bash
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-2026-09-19        # every report
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-2026-09-19 --ocr  # re-run Vision on scan.pdf
```

The tool prints what the phone coded, what codes now, what is newly coded or
lost, and every row with its reason. A record written before diagnostics
existed has only `report.json`; for those it re-runs the refused rows through
the current parser and dictionary, which is less than a replay and enough to
grow the dictionary. Add an analyte to `analytes.ts`,
regenerate, replay, and see the real sheet's rows move from unmatched to coded
without scanning it again. It refuses a path inside `clients/ios/`.

## The self-test

Everything after the camera runs in the app target and therefore not in
`swift test`: the sealed store, the PDF of the pages, the environment record,
the export. Until there was a self-test, the only way to exercise that chain
was to scan a real lab report on a real phone, which means testing with a
person's health data and finding out afterwards what broke.

`-MBSelfTest` drives one synthetic report (invented values, a printed header
with dates and a laboratory) through the whole pipeline and asserts the result,
then logs each check:

```bash
xcrun simctl launch <device-udid> red.mabu.meinbefund -MBSelfTest
xcrun simctl spawn <device-udid> log show --last 2m \
  --predicate 'subsystem == "red.mabu.meinbefund"' --style compact
```

It writes to its own store directory, so it cannot touch real reports, and it
is compiled out of a release build. 27 checks: recognition and coding, a
citation per value, the lab date read from the header and preferred over the
receipt and issue dates, the pages as a PDF, the three sealed files decrypting,
the replay of the diagnostics record reproducing the extraction exactly, the
archive building, and the doctor export fitting the ePA's 25 MB with the
original pages appended.

The check that matters most is conservation: every measurement printed on the
sheet ends up coded, unmatched or unread. A row in none of the three is
indistinguishable from a row that was never printed, and that is exactly how an
HbA1c row went missing on iOS (see `docs/gotchas.md`, 2026-09-19).

Add `-MBShot detail` or `-MBShot scan` to open the saved report or its stored
pages, which is how the screenshots of a real stored scan are taken.

## Profile

Sex, date of birth and height, sealed in the store like a report rather than
kept in `UserDefaults`, where anything that can read the container could read
them. Each field is there because a published range needs it, and none of it
is part of the analysis request or any export but the OMOP `person` row, which
carries the year of birth the CDM asks for and not the day it does not.

Waist, weight and visceral fat area are entered there too and become an
ordinary report with `self-tracked` provenance, so they join the timeline and
the exports through the same path as a laboratory's values. Visceral fat is an
**area** in cm², as a body-composition device reports it; a consumer scale's
rating from 1 to 59 is a different quantity with no LOINC code, and is refused
rather than stored as if it were the same thing.

## Reference values and trends

The app shows two things beside your own numbers, and both are deliberately
limited ([ADR-039](../../docs/ADRs/ADR-039-published-reference-ranges.md)).

**Reference values** quotes published thresholds: a `guideline` column, what
the body states for adults, and an `optimal` column, the lowest-risk band the
same source names. Every one carries its source and a link, and an analyte with
no citable source is simply absent. That is the difference from the longevity
tables this was modelled on, which give numbers nobody can check.

**Trends** plots one analyte, in one unit, across every report. A point read by
the recogniser is drawn differently from one that came from a laboratory's own
document, because they are not the same evidence, and the range your laboratory
printed is named under each series alongside the published band.

Colour marks the bands: green for the optimal band, amber outside it, orange
outside the guideline range. It never appears alone, always beside the same
statement in words and a distinct symbol, and there is no red and no pass or
fail. Neither screen says normal or abnormal, scores anything, or advises. A value is
`withinOptimal`, `outsideOptimal`, `outsideGuideline` or `noRange`, which is a
comparison to a published number and not a finding. Interpretation is the IVDR
line that section 5 of #186 draws, and staying on this side of it is a product
decision, not an oversight.

The table is generated from `services/epa-ingest/src/reference-ranges.ts` by
the same command as the analyte dictionary, and the generator refuses to emit a
range whose analyte the dictionary does not know or whose unit that analyte is
not defined in.

## Exports

| Action                     | For             | Contents                                                                |
| -------------------------- | --------------- | ----------------------------------------------------------------------- |
| Share for my doctor        | a practice      | PDF summary with the original pages appended, plus a FHIR R4 bundle     |
| Export for research (OMOP) | analytics       | OMOP CDM v5.4 `measurement.csv`, `person.csv`, `observation_period.csv` |
| Export diagnostics         | this repository | the record, both Vision passes, the pages, the session log              |

The OMOP tables carry `measurement_concept_id = 0` throughout, deliberately.
Mapping LOINC to an OMOP concept needs the Athena vocabulary, which is not on a
phone, and inventing an id would put a wrong identifier on a real measurement.
OMOP's convention for that is concept id 0 with the original code in
`measurement_source_value`, which is exactly what `neo4j/fhir-to-omop-transform.cypher`
already does. Mapping belongs where the vocabulary is; doing it twice is how
two mappings drift apart.

`range_low` and `range_high` carry the range **your laboratory printed**, which
is what those columns mean in the CDM.

## Reading a report again

A report keeps its pages, so it can be read again after the parser improves:
the action is on the report itself. Two rules make that safe rather than
destructive. A re-read reproduces the resolution the pages were first
recognised at, because rasterising a stored PDF at a fixed density upsamples a
phone photograph and reads worse. And a re-read that finds fewer values than
are stored is discarded, never saved over the better reading.

## Store layout

Three sealed files per report under `Application Support/Reports`, each
AES-GCM under the same Keychain key, complete file protection, excluded from
backup:

```
<id>.sealed         the record (LabReport)
<id>.scan.sealed    the pages as one PDF
<id>.diag.sealed    the scan's diagnostics (ScanDiagnostics)
```

Records written before a field existed still decode; every later field is
optional or defaulted.

## Why in-repo

The app and [`services/epa-ingest`](../../services/epa-ingest) do the same job on
different devices: paper → structured, provenance-stamped FHIR. They share the
analyte dictionary, the parsing rules, the provenance model and the export
format. Two repositories would mean two copies of all four, and the one failure
mode worth designing against here is **two divergent analyte dictionaries**:
where an iPhone codes Lp(a) one way and the CLI another, and nobody notices until
a value reaches a doctor.

The cost is a polyglot repository: TypeScript, Swift, Python, Cypher, Bash. That
is already true (`services/catalog-crawler` is Python), so this adds a language
rather than a category.

## The shared dictionary is generated, never copied

`Sources/Shared/Analytes.generated.swift` is produced from
`services/epa-ingest/src/analytes.ts`:

```bash
cd services/epa-ingest && npm run generate:swift
```

Do not hand-edit it. Add an analyte to `analytes.ts`, regenerate, commit both.
CI fails if the generated file is out of date with its source, a check that
exists because a stale copy is exactly the silent divergence the monorepo was
chosen to prevent.

## Layout

```
clients/ios/
  project.yml                    XcodeGen spec; the .xcodeproj is generated, not committed
  Package.swift                  SwiftPM: Shared + the two tools + tests
  Sources/
    Shared/                      parser, provenance model, generated analyte table
      Analytes.generated.swift   GENERATED from analytes.ts, do not edit
    MeinBefund/                  the app
      Assets.xcassets/           GENERATED by IconGen
  Tools/
    AnalyteParity/               generated table behaves like its source
    ScanReplay/                  replays a diagnostics export on a Mac
    LabFile/                     imports a PDF or image on a Mac, as the app would
    IconGen/                     draws the app icon with CoreGraphics
  Tests/SharedTests/             parser and provenance tests
  Scripts/archive-and-upload.sh  archive → App Store Connect → TestFlight
```

The icon is drawn in code rather than shipped as a binary blob, so it is
reviewable in a diff and regenerates at any size: a document whose printed lines
resolve into one rising trend. The upward line is the passage of time, not a
"good result", this app reports, it does not judge.

## Two rules that are not negotiable here

1. **No health data in this directory, ever.** No lab reports, no scans, no
   exported HealthKit archives, no screenshots containing real values, not even
   temporarily, not even gitignored. Test fixtures are synthetic, the way
   `services/epa-ingest/__tests__/fixtures/` already is.
2. **No real organisation in demo content.** `CLAUDE.md` forbids it outside the
   `NEXT_PUBLIC_DEMO_TK` flag, and names Charité explicitly. The study this app
   is built for is real; the demo centre is fictional.

## CI

Swift needs a macOS runner. GitHub-hosted macOS runners are free for public
repositories but have lower concurrency than Linux, so the iOS job is
path-filtered to `clients/ios/**` and must not gate the web or service suites.
Conversely, `ui/**` and `services/**` workflows exclude `clients/ios/**` so an
app change does not rebuild the dataspace.
