# Can the Apple on-device model do the structured extraction?

An open question in [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186),
and the one that decides the app's whole privacy posture. If Apple's on-device model extracts
lab values well enough, **no lab report ever has to leave the phone** — the data-minimisation
tension in §4 disappears, and no data processing agreement with a cloud LLM provider is needed
for the extraction path at all.

That is worth answering with numbers rather than opinion. This harness produces them.

> ## Your health data never enters this repository
>
> Keep the report outside the working tree — a scratch directory, or anywhere you would keep a
> medical document. `eval/.gitignore` blocks `data/`, `out/` and loose `.txt` / `.pdf` /
> image files as a second line of defence, not the first.
>
> The scorer prints **counts and rates only, never values**, so its output is safe to paste
> into an issue. The extraction JSON is not — it contains your results.

## Prerequisites

- macOS 26+ on Apple silicon, Xcode 26+
- **Apple Intelligence enabled**: System Settings → Apple Intelligence & Siri. Without it the
  harness exits with `appleIntelligenceNotEnabled` and tells you the same thing.

## The three arms

| Arm                            | What it is                                     | Can it invent a row?                                                 |
| ------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------- |
| **`epa-ingest` parser**        | The deterministic parser in `src/parse-lab.ts` | **No** — structurally impossible; it only emits what it read         |
| **Apple on-device**            | `SystemLanguageModel` with guided generation   | Yes                                                                  |
| **Cloud LLM** _(not included)_ | Upper bound, if you choose to measure it       | Yes — and it sends the report off the device, so decide deliberately |

The cloud arm is deliberately absent from this harness. Adding it means transmitting a real lab
report to a third party; that should be an explicit act, not something a README makes easy.

## Procedure

**1. Get the report as text.** A digital PDF is preferable — it exercises the same text the app
would get from a `pdf-text-layer` extraction:

```bash
npx tsx src/index.ts ~/reports/befund.pdf --out /tmp/ignore.json 2>/dev/null
# or, for the text itself:
pdftotext -layout ~/reports/befund.pdf ~/reports/befund.txt
```

For a scan, produce the text the way the app would — OCR — so you are measuring the model on
the input it will actually see.

**2. Label the ground truth, once.** Start from the deterministic parser's output, which gets
most rows right, then correct it by hand against the paper:

```bash
npx tsx src/index.ts ~/reports/befund.txt --source-kind lab-issued-digital --out ~/reports/bundle.json
```

Write `~/reports/truth.json`:

```json
{
  "complete": true,
  "rows": [
    { "label": "LDL-Cholesterin", "value": 141, "unit": "mg/dl" },
    { "label": "Lp(a)", "value": 87.3, "unit": "mg/dl" }
  ]
}
```

> **`"complete": true` is load-bearing.** Hallucination cannot be measured against a partial
> truth: a row the model extracted correctly but you did not list is indistinguishable from a
> row it invented. Without the flag the scorer reports extra rows as `unlabelled`, says the
> invention rate is **not measurable**, and marks the critical error rate a lower bound.
> Set it only when you have listed **every** measured row on the sheet.

**3. Run the on-device model.**

```bash
cd eval/fm-extract && swift run fm-extract --in ~/reports/befund.txt --out ~/reports/fm.json
```

**4. Score both arms.**

```bash
npm run eval:score -- \
  --truth ~/reports/truth.json \
  --report ~/reports/befund.txt \
  --arm ~/reports/fm.json
```

## Reading the result

The headline number is **not** overall accuracy. It is the **critical error rate** — rows that
are hallucinated, off by an order of magnitude, or carrying the wrong unit:

```
   critical — each one of these could change a clinical decision
     hallucinated rows   0
     order-of-magnitude  1
     wrong unit          0
   CRITICAL ERROR RATE   25.0%
```

A run at 98% overall accuracy with a 2% order-of-magnitude rate is not a good extractor. It is
one that turns 1240 pg/mL NT-proBNP into 1.24 twice per hundred rows — a normal result and a
cardiology referral, swapped.

Three things to weigh, in order:

1. **Hallucination must be zero.** Not low — zero. The deterministic parser cannot invent a row;
   a model that does, even rarely, cannot be the sole extraction path for something a doctor
   will read. A non-zero count is a finding, not noise.
2. **Order-of-magnitude errors** are the German-decimal-separator failure (`1.240` → 1.24). This
   is the specific weakness a general-purpose model has on German lab sheets and the parser does
   not, because the parser encodes the convention explicitly.
3. **Recall on rows the parser missed** is where the model can genuinely earn its place. If it
   reads the analytes the dictionary has no entry for, or the layouts the regex cannot follow,
   the answer may be _both_: deterministic parse first, model only on the leftovers.

The likely outcome is not a winner but a division of labour — and the honest failure mode to
watch for is a model that scores well on the tidy rows the parser already handles and adds
nothing on the messy ones.

## Files

```
eval/fm-extract/    Swift package — the on-device model arm (no network)
eval/score.ts       scorer + metrics; `npm run eval:score`
__tests__/score.test.ts   unit tests for the metric logic itself
```
