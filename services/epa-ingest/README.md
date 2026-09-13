# epa-ingest — lab report → FHIR R4, with provenance

Part of the **pre-ePA workbench** (issue [#182](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182), W9).
Takes a lab report as the citizen actually holds it — a digital PDF, a scan, or typed text —
and produces a FHIR R4 bundle in which every value says **where it came from**.

It prepares. **The citizen uploads.** See "There is no API" below.

```bash
npm install          # optional deps: pdfjs-dist (PDF text layer), tesseract.js (OCR)
npm test             # 62 unit tests, no network, no native toolchain

npx tsx src/index.ts befund.pdf \
  --date 2026-08-14 --performer "FS-CPC" --title "Kardiovaskuläres Risikoprofil" \
  --out bundle.json
```

```
source     befund.pdf (pdf-text-layer)
provenance lab-issued-digital -> Observation.status "final"
coded      21
unmapped   1 - not dropped, listed below:
           line 31: Omega-3-Index = 4.1 % - unknown-analyte
unparsed   1 line(s) looked like measurements but did not parse:
           line 30: Troponin T hs  n.b.  ng/l  < 14
written    bundle.json
```

## Apple Health trends

```bash
npx tsx src/index.ts --health-export ~/export.xml --trends-out trends.txt
```

The Health app's `export.xml` is routinely **hundreds of megabytes** — one `<Record>` per
heart-rate reading — against the ePA's **25 MB** ceiling, and no GP reads 400,000 XML rows. So
the samples are never loaded and never emitted: the file is streamed, only running aggregates
per metric per month are kept, and the output is a summary measured in kilobytes.

Measured on a synthetic export: **175 MB and 1,061,826 records in → 1,035 bytes out, in 1.5 s.**

Everything it produces is `self-tracked`, and the summary says so on its first line. Resting
heart rate, HRV, VO2 max, cuff blood pressure, weight, steps and walking steadiness are
summarised; every other HealthKit type present is counted and reported rather than silently
dropped. A sample in an unexpected unit is skipped and counted — averaging 78.4 kg with
172.8 lb would produce a number that is not a weight.

## Why provenance is the whole point

The ePA marks every document, **tamper-proofly**, as uploaded by a practice, by the insurer, or
by the insured — and a Hausarzt is under no obligation to adopt what the insured uploaded. An
artefact that flattens a lab-issued value, an OCR guess and a smartwatch reading into one
undifferentiated "result" is **weaker than the record it feeds**. So this tool refuses to.

| Input                    | Extractor        | Provenance               | `Observation.status` |
| ------------------------ | ---------------- | ------------------------ | -------------------- |
| PDF with a text layer    | `pdf-text-layer` | `lab-issued-digital`     | `final`              |
| PNG / JPEG / TIFF / WebP | `tesseract`      | `ocr-transcribed`        | **`preliminary`**    |
| `.txt`                   | `plain-text`     | `self-tracked` (default) | **`preliminary`**    |

Only the lab's own characters produce `final`. A value recognised from pixels is
`preliminary` — the lab finalised the result, but the transcription in this bundle is ours and
unverified, and a receiving system must be able to see that **without reading an extension**.
Plain text defaults to the least-trust option; `--source-kind` lets the citizen assert
otherwise, deliberately as an explicit act.

Each Observation additionally carries three extensions under
`https://ehds.mabu.red/fhir/StructureDefinition/`:

- `epa-ingest-source-kind` — the provenance above
- `epa-ingest-source-line` — **the source line verbatim**, so a reviewer can check the parse
  against the paper without trusting the dictionary
- `epa-ingest-ocr-confidence` — mean OCR confidence, when OCR ran

A `Provenance` resource ties every Observation and the DiagnosticReport to a
`DocumentReference` standing for the original.

## Nothing is dropped

Three outcomes, all reported:

- **coded** — label and unit both resolved to a LOINC code
- **unmapped** — parsed, but not coded: `unknown-analyte`, `unknown-unit`, or `unit-mismatch`
  (with the units the analyte _is_ defined for)
- **unparsed** — the line carried a number and a unit but did not parse, e.g. a result of
  `n.b.` (nicht bestimmt)

A silently dropped value is indistinguishable from a value that was never on the sheet, and the
citizen holding the paper is the only one who can tell the difference.

## The unit picks the LOINC code, never the label

Lp(a) in mg/dL (`10835-7`) and Lp(a) in nmol/L (`43583-4`) are different measurements.
HbA1c in % (`4548-4`) and in mmol/mol IFCC (`59261-8`) likewise. Coding on the label alone would
put a wrong code on a real measurement, so a unit we do not recognise **for that analyte** is an
error, not a fallback.

The same care applies to the numbers. German convention rules: `,` is decimal, `.` groups
thousands — so `1.240` pg/mL NT-proBNP parses as **1240**, not 1.24. The one concession to
English-formatted digital reports is that a lone `.` before one or two digits (`0.92`) is read
as a decimal point, since no German grouping produces that.

## Coverage

~30 analytes, cardiovascular-first: the lipid panel (total/LDL/HDL, triglycerides, **Lp(a)**,
**ApoB**, ApoA1), inflammation and cardiac (**hs-CRP** distinct from CRP, NT-proBNP,
homocysteine), glucose metabolism (HbA1c both scales, glucose), renal (creatinine, eGFR,
urate), liver (ALT/AST/GGT), TSH, ferritin, B12, vitamin D, electrolytes and basic haematology.

`src/analytes.ts` is a plain table — adding an analyte is one entry.

## There is no API into the ePA

A third-party application can write to the ePA **only as a listed DiGA**, with a productive
**SMC-B DiGA**, over gematik's `gemSST_CS_ePA_DiGA` interface, after the insured authorises it
in their ePA frontend (§ 6 DiGAV). That is regulated market access, not an integration.

So this pipeline ends in a **file**. The citizen uploads it through their insurer's ePA app or
desktop client (AOK, BARMER eCare, TK-Safe, DAK; Windows/macOS/Ubuntu; eGK + PIN + card reader,
or the Web2App QR flow). The ePA accepts PDF, JPEG, PNG and TIFF, converts them to PDF, and caps
each file at **25 MB**.

## What this is not

- **Not a KBV MIO Laborbefund document.** MIO conformance needs a `document` bundle with a
  Composition and the KBV profiles. The resource shapes here are chosen so that step is
  additive, but claiming conformance we have not validated would be worse than not claiming it.
  MIO Laborbefund 1.0.0 is a FHIR bundle; manufacturer-mandatory is expected autumn 2026.
- **Not validated LOINC.** The codes in `src/analytes.ts` are the widely used ones for these
  measurements. Validate the table against an official LOINC release before anyone treats the
  output as a clinical document.
- **Not a clinical device.** It transcribes and codes; it does not interpret, flag or advise.
- **Not fully covered by tests.** ~78% lines. The uncovered remainder is the external-tool
  boundary — `pdfjs-dist`, `tesseract.js` and the CLI's process shell. The parser, the analyte
  dictionary and the FHIR writer are at 94–100%.
- **Not able to rasterise a scanned PDF.** That needs a native toolchain this package
  deliberately does not depend on. A scanned PDF is refused with instructions
  (`pdftoppm -r 300 -png ...`) rather than silently parsed as empty.

## Layout

```
src/analytes.ts      German label + unit → LOINC + UCUM (the table)
src/parse-lab.ts     "Analyt  Wert  Einheit  Referenz" → RawLabValue[]   (no deps)
src/code-values.ts   RawLabValue[] → coded + unmapped                     (no deps)
src/to-fhir.ts       CodedLabValue[] → FHIR R4 collection bundle          (no deps)
src/extract-text.ts  PDF text layer · OCR · plain text (optional deps, dynamically imported)
src/index.ts         CLI; `run()` is the pipeline without a process around it
```

The parser, dictionary, coder and FHIR writer have **zero runtime dependencies**, so the unit
suite runs with nothing installed.
