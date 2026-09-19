# ADR-038: The scan is kept, as a sealed PDF, and diagnostics leave the phone only as a deliberate export

**Status:** Proposed
**Date:** 2026-09-19
**Relates to:** [ADR-033](ADR-033-lab-report-extraction-pipeline.md), [ADR-031](ADR-031-checks-must-assert.md)
**Tracks:** [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

The first real lab report scanned with Klarbefund on 2026-09-13 coded 2 rows of 41. The other 39 were reported as unmatched or unread, which is the behaviour
the pipeline is built for: a row refused is better than a row mis-coded. But
nothing could be learned from the refusal. The app had consumed the recognised
text, discarded the photographs, and kept only the outcome. The paper was the
sole copy of the evidence, and the only way to find out why 26 lines were
"unread" was to scan the sheet again on a phone with a debugger attached.

Three facts shape what can be done about that:

1. **The store is sealed under a key that never leaves the device**
   (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). Xcode's container
   download and `devicectl` therefore yield ciphertext. There is no developer
   back door, and there must not be one.
2. **Acceptance criterion 8 of #186 forbids any path by which another app reads
   the store.** `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`
   were verified absent on the installed binary. Turning either on to get files
   off the phone would open the container to every app on the paired Mac.
3. **The report was filed under the day it was photographed.** Nothing read the
   dates printed on the sheet, and a stack of paper going back years is not a
   stack of results from this month. A value on the wrong date is a wrong
   point on a trend, which is the one artefact this app exists to produce.

## Decision

1. **The scanned pages are kept, as one PDF per report, sealed like the record.**
   AES-GCM under the store key, `NSFileProtectionComplete`, in the directory
   excluded from iCloud Backup. PDF because it is what the ePA takes, what a
   person can open anywhere, and what the recogniser can be run on again.
   Pages are JPEG-recompressed and capped at 300 dpi of A4, so a multi-page
   scan stays a few megabytes. The export for a doctor appends the original
   pages to the summary, subject to the 25 MB limit.

2. **A diagnostics record is kept per scan, sealed the same way.** It holds
   what both Vision passes saw (cells and fragments with their regions), what
   the reconciler produced, the column layout the parser inferred, the reading
   order text, timings, and the build and device. It is enough to run
   everything after OCR again on a Mac (`swift run ScanReplay`), with a newer
   dictionary or parser, without the phone and without the paper.

3. **The report's own date and details are read from the sheet and confirmed
   by the person.** Collection date first, then receipt, then issue, then the
   latest unlabelled date; a birth date never, a future date never. The date
   carries its provenance (`printed-on-report`, `confirmed-by-user`,
   `scan-date-fallback`) and every date found on the page is kept as evidence.
   The laboratory, order number and referrer are read the same way. The full
   recognised text of every page is stored with the record, so nothing that
   was on the sheet is lost between scanning and review.

4. **Diagnostics leave the phone only as an archive the person builds and
   sends.** A menu action, behind a dialog that says in words that the archive
   holds their scanned pages and every value unencrypted. The app decrypts,
   writes plain files to the temporary directory, zips them with
   `NSFileCoordinator`'s upload representation, hands the zip to the share
   sheet, and deletes it when the sheet closes. The archive contains one folder
   per report (record, diagnostics, PDF), the session's log, and a note about
   the build. No file sharing, no debug endpoint, no automatic upload.

5. **Logs never carry a health value.** `Logger` under one subsystem, counts,
   codes, durations and error descriptions only, so the log can be included in
   the archive and read in Console without care.

6. **A file the person already holds can be imported, and the document itself
   decides its provenance.** A PDF with the laboratory's own text layer is
   `lab-issued-digital`, so its values are `final`; a PDF of photographed pages,
   or an image, goes through the recogniser and stays `ocr-transcribed` and
   `preliminary` (ADR-033 rule 4). The two are told apart by looking at the
   file, never by its extension, and the test is deliberately strict: text on
   most pages, enough of it, and digits. Erring towards "lab-issued" would mark
   a transcription final, which is the one direction that matters. The original
   file is what gets stored and what the doctor export carries.

## Consequences

- The app now holds the whole document, including whatever identifiers the lab
  printed on it. The privacy summary and the published policy say so. The
  cloud path is unchanged: only selected values travel, never a page.
- A record from before this decision still decodes; new fields default. The
  list shows such a record under its scan date, labelled as scanned.
- The parser's table path reports a row whose unit it does not know as
  `unknown-unit` instead of dropping it. Before, a row printed in `fl`, `pg`
  or `/pl` vanished without a trace because the "does this look like a
  measurement" check relied on the same unit map.
- The Swift analyte table is generated from the dictionary's exports, not from
  a scrape of its source. Prettier unquoted two keys, the scrape missed them,
  and `--check` reported a wrong table current. Data cannot be reformatted.
- A diagnostics archive is health data in full. It lives outside this
  repository, always; the replay tool refuses a path inside `clients/ios/`.
- Import makes the good case cheap: a laboratory PDF yields `final` values with
  no recogniser in the path at all, and on a real German SI-unit report it maps
  45 of 46 measurements. The one it refuses is a row where the text layer merged
  two analytes onto one line, which is refused rather than assigned.

## Alternatives considered

- **iTunes file sharing.** Rejected: opens the container to every app on the
  Mac and breaks acceptance criterion 8.
- **Xcode container download alone.** Insufficient: the store is sealed and
  the key is not in the container. Also unavailable for TestFlight builds.
- **Uploading diagnostics to the operator's service.** Rejected: a cloud path
  for whole reports is exactly what §4.3 of #186 rules out without a per-call
  consent naming the destination.
- **Keeping the pages as images rather than a PDF.** Rejected: one file per
  page, no page order, and not what the ePA or a practice takes.
- **Reading the lab date but not the rest of the header.** Rejected: the
  laboratory is the FHIR `performer`, and the order number is what a lab
  answers a query with. Reading them costs nothing once the text is kept.
