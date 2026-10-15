# Klarbefund: evidence

What a reviewer outside this project can check about Klarbefund, the iPhone
lab-report scanner ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)),
and what is still missing. Written for an insurer's, a hospital's or an
auditor's first question: _is the extraction right, is the data safe, and is
this a medical device?_ Data protection, BSI TR-03161 and regulation are
assessed in [`self-assessment.md`](self-assessment.md); how to run all of this
on a Mac is in [`run-on-mac.md`](run-on-mac.md). The person-facing description is in
[`README.md`](README.md), the developer side in
[`clients/ios/README.md`](../../clients/ios/README.md).

Klarbefund is open source under the [Apache License 2.0](../../LICENSE). The
project is not a vendor: there is no company behind it, no support contract and
no warranty. Whoever deploys the app, or a fork of it, operates it and carries
the data protection and security duties that come with that.

## Status

- At the HL7 AI Challenge 2026 submission (deadline 2026-06-30) Klarbefund
  was a prototype. The award ("Open Solution") went to the EHDS platform in
  this repository.
- In the winner presentation the app was shown as a live demo.
- It is in TestFlight, approved by Apple's beta review for external testers
  ([ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)).
- It reads Apple Health (HealthKit, read only) and connects to the demo hub,
  whose secondary use runs in the hub's Secure Processing Environment
  ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).

## What is already evidenced

| Claim                                                        | Evidence                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A degraded scan loses rows, it never invents values          | `Tests/SharedTests/ScanningTests.swift`: synthetic sheets under skew, glare, dim light, blur and low resolution, read with Vision; any coded value not on the sheet fails |
| German number rules (decimal comma, `1.240` = 1240, `0.300`) | `Tests/SharedTests/LabLineParserTests.swift`                                                                                                                              |
| The unit selects the LOINC code; urine is never serum        | `LabLineParserTests.swift`, `RealScanLessonsTests.swift` (layouts of 19 real scans, every value invented)                                                                 |
| Nothing is dropped silently                                  | Self-test (`-MBSelfTest`, 27 checks): every printed row ends up coded, unmapped or unread                                                                                 |
| OCR values stay preliminary                                  | Provenance model (`Sources/Shared/Provenance.swift`): only a laboratory's own PDF text layer yields FHIR `final`                                                          |
| A real scan can be replayed without the phone or the image   | `swift run ScanReplay`, `swift run LabFile`; both refuse paths inside this repository                                                                                     |
| Exports are standard                                         | FHIR R4 bundle with LOINC and UCUM (`FhirBundleParityTests.swift`), OMOP CDM v5.4 (`OmopExportTests.swift`)                                                               |
| Data stays on the device by default                          | On-device OCR and analysis, per-item encryption, no iCloud backup, separate consents, export and deletion ([README](README.md#privacy-and-safety))                        |

## Measuring accuracy

`ExtractionAccuracy` (`clients/ios/Sources/Shared/ExtractionAccuracy.swift`)
compares an extraction with a hand-checked truth, field by field: value with
its comparator, unit, LOINC code (or the expected refusal), printed reference
range and laboratory date. Its headline numbers:

- **exact**: rows right in every checked field;
- **silent errors**: rows that were coded, so shown as a value, and wrong in
  value, unit or code. This is the number that matters clinically; the target
  is zero;
- **spurious**: coded values with no row on the sheet behind them;
- **missed** and **unread**: rows lost, and lines handed to the reviewer.

Two ways to run it:

1. **Synthetic benchmark, in CI.** `AccuracyBenchmarkTests` renders the
   synthetic panel under nine scan conditions, reads it with Vision and asserts
   zero silent errors under each. Locally: `cd clients/ios && swift test`; with
   `KLARBEFUND_BENCHMARK_OUT=<file>` set, the counts are written there as JSON.
   An `ios-unit-tests` job for `.github/workflows/test.yml` (pending, YAML in
   [`run-on-mac.md`](run-on-mac.md#4-put-the-swift-suite-into-ci)) runs the
   whole Swift suite on `macos-26` and keeps that JSON as the
   `klarbefund-accuracy-benchmark` artifact; until it lands, CI builds only the
   `Shared` target. No real data is involved, so the JSON can be published as
   it is.
2. **Pilot on real reports, never in the repository.** A participant exports
   diagnostics from the app (ADR-038), and a `truth.json` is written beside each
   `diagnostics.json` from the paper:

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

   Only the counts leave the participant's folder. Before a report is used:
   written consent from the participant (purpose, retention, withdrawal, and
   whether values go to an explanation service), and a check that the study the
   report comes from does not restrict sharing its results.

Target values per field are fixed before a pilot is measured, and the pilot's
sample size is stated next to every number.

## Open

| Topic                             | What is missing                                                                                                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intended purpose (MDR)            | A written qualification under MDCG 2019-11 Rev.1. The borderline is the trends screen, which colours values against published bands (ADR-039); the project's position is that a comparison with a quoted number is not a finding. An external opinion.                                        |
| Operator of the cloud explanation | The app offers a project-run explanation service in the EU besides on-device, own Azure OpenAI and own Anthropic key. Whoever runs it processes health data: either document that role (records of processing, processor agreement) or remove it from a distribution that claims no operator. |
| Data protection                   | Data-flow diagram and a data protection impact assessment template for an operator.                                                                                                                                                                                                           |
| Security                          | Threat model, SBOM, an independent penetration test, and a gap list against BSI TR-03161 part 1 (mobile apps). CodeQL already runs on every iOS change (`codeql-swift.yml`).                                                                                                                  |
| Pilot accuracy                    | Truth files and aggregate counts from real reports, as above.                                                                                                                                                                                                                                 |
