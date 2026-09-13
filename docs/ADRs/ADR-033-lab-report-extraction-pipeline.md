# ADR-033: Two-stage lab-report extraction — self-hosted parse, schema extraction, EU-resident models

**Status:** Proposed
**Date:** 2026-09-13
**Relates to:** [ADR-026](ADR-026-token-efficient-planning-structure.md), [ADR-028](ADR-028-patient-qr-login-eudi-wallet.md)
**Tracks:** [#182](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/182) (W9), [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

The pre-ePA workbench (#182 W9) turns a lab report the citizen holds into FHIR R4
Observations. `services/epa-ingest` does this today with a deterministic line
parser over `pdftotext`-quality text. That works on a clean digital PDF and is
brittle on anything else — multi-column layouts, tables split across pages, and
scans.

A lab report's real structure is **nested**: panel → analyte →
result / unit / reference range / flag. Generic PDF-to-Markdown tools do not know
that shape; they recover the page, not the meaning. So the pipeline splits in
two, and the decisions below are about which component fills each half.

Two constraints come from the clinical side rather than the engineering side, and
they are not negotiable:

1. **Never normalise away the printed reference range.** It is lab- and
   assay-specific. A standardised value may be carried _alongside_ it, never
   instead of it.
2. **Every analyte carries a source citation** — page and bounding box — so a
   clinician can verify the value against the document rather than trusting the
   extractor.

Two more come from building `epa-ingest` and cost real debugging:

3. **The unit selects the code, not the label.** Lp(a) in mg/dL is LOINC
   `10835-7`; in nmol/L it is `43583-4`. HbA1c in % is `4548-4`, in mmol/mol
   `59261-8`. Coding on the label alone silently mis-codes a real measurement.
4. **Provenance decides status.** A value recognised from pixels is
   `preliminary`, never `final`, and that must be visible without parsing an
   extension.

And one from the data-protection side: the reports are **GDPR Art. 9 special
category data**, processed by a Berlin-based controller.

## Decision

### 1. A two-stage pipeline, with LOINC mapping downstream of both

```
stage 1  parse / OCR        → text + layout + bounding boxes
stage 2  structured extract → nested schema, per-field citation + confidence
stage 3  LOINC mapping      → separate, deterministic-first
```

LOINC mapping does **not** happen during extraction. Extraction records what the
page says; mapping decides what it means. Fusing them makes a coding error
indistinguishable from a reading error, and rule 3 above makes the mapping
unit-dependent in a way a general extractor will get wrong.

### 2. Stage 1: self-hosted parsing, evaluated rather than assumed

Marker v2 and MinerU are both credible and both self-hostable, which is the
property that matters most here — a self-hosted parser means no page of a lab
report ever leaves the process.

|                     | **Marker 2.0**                                                                              | **MinerU 2.5**                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Code licence        | Apache-2.0                                                                                  | Custom "MinerU Open Source License" — Apache-2.0 base **plus additional terms** |
| **Weights licence** | Modified AI Pubs Open-RAIL-M — **free under $5M revenue/funding**, commercial licence above | governed by the custom terms                                                    |
| Bounding boxes      | JSON / debug output                                                                         | per block, normalised `[xmin,ymin,xmax,ymax]` in `[0,1]`                        |
| LLM assist          | `--use_llm`, **supports Azure directly**                                                    | VLM-based pipeline                                                              |
| olmOCR-Bench        | ~76–83% (varies by mode and source)                                                         | ~72.7%                                                                          |
| OmniDocBench        | —                                                                                           | MinerU2.5-Pro among the top three (95.7–96.6)                                   |

**The benchmarks disagree** — Marker leads on one, MinerU on the other — which is
reason enough not to pick from a leaderboard. Neither is chosen here. Both are
wired as arms in `services/epa-ingest/eval` and the choice is made on real
German lab sheets, scored on critical error rate.

The licence line is the one to settle before anything commercial ships: Marker's
_code_ is Apache-2.0 but its _weights_ carry a revenue threshold, and MinerU's
additional terms need reading rather than assuming from the Apache-2.0 base.

### 3. Stage 2: schema extraction inside our own tenancy

**Azure AI Content Understanding** (West Europe) for the nested schema: custom
field schemas, per-field confidence, and grounding with page number and bounding
box — which is exactly constraint 2, satisfied by the platform rather than bolted
on. Fallback: our own `gpt-5.1` deployment with JSON-schema structured output,
with citations carried from stage 1 by span matching.

**Rejected: SaaS extraction vendors.** Reducto Deep Extract is purpose-built for
the panel/analyte schema and LlamaParse/LlamaExtract offer field-level citations,
which is genuinely the closest fit to this problem. They are rejected on data
protection, not capability: both are SaaS-first, on-premise or VPC deployment
sits on the enterprise tier, and routing Art. 9 data to a US-controlled processor
raises transfer questions the self-hosted path never has. Revisit only with EU
hosting or on-premise contractually confirmed.

### 4. Stage 3: deterministic dictionary first, embeddings to extend it

`src/analytes.ts` maps German label + unit → LOINC + UCUM for ~30 analytes and
returns `unknown-analyte` rather than guessing. That stays the primary path.

Embeddings (`text-embedding-3-small`, already deployed) extend coverage to labels
the dictionary does not hold, as **candidate retrieval feeding an adjudication
step** — never as the coder. Short, abbreviation-heavy German labels ("GPT",
"Lp(a)", "hs-CRP") are where pure vector retrieval is weakest, so the design is
lexical + vector hybrid, then a decision, with the unit constraint from rule 3
narrowing the candidates before anything is chosen.

`text-embedding-3-large` is **not** deployed: ~5× the cost for a step that is not
yet the bottleneck. Move only if recall@10 on real labels says so.

> **Embeddings do neither OCR nor extraction.** They map text to vectors for
> similarity search. No embedding model can read a PDF or emit a nested schema,
> and asking which is "best for OCR" has no answer. Stage 1 needs a vision and
> layout model, stage 2 a schema-constrained generative model, stage 3 an
> embedding model. Three different classes.

### 5. EU data residency is a property of the deployment

Azure OpenAI deployments default to **DataZoneStandard** (EU data zone), falling
back to regional **Standard** where a model is not offered on that SKU in
`westeurope` — never to a Global SKU.

`GlobalStandard` routes inference to global capacity and carries **no EU-only
processing guarantee**. It was the previous default in
`scripts/azure/07-ai-foundry.sh`, which was defensible for the synthetic demo
data it was provisioned for and is wrong the moment a real report goes through
it. Existing deployments are **not** recreated by the script — changing a SKU is
delete-and-create, which drops capacity — but every deployment's SKU is now
audited and printed, any `Global*` one is called out with the exact remediation
commands, and `STRICT_RESIDENCY=true` turns that into a hard failure.

## Consequences

**Good**

- No page of a lab report needs to leave the controller's infrastructure. With a
  self-hosted stage 1 and an EU-resident stage 2, there is no third-party
  processor in the extraction path and no transfer-impact assessment to write.
- Citations are structural. Stage 1 produces boxes, stage 2 grounds fields in
  them, and constraint 2 is satisfied by construction rather than by convention.
- The parser choice is measurable. `eval/` scores any arm on critical error
  rate, so Marker vs MinerU vs the status quo is a number on real documents.
- Stage 3 stays auditable: a deterministic dictionary that refuses to guess,
  with retrieval only widening what it can be asked about.

**Bad, and accepted**

- More moving parts than a single SaaS call, and Reducto would likely be
  better at the nested schema today. Data protection outranks that.
- A self-hosted parser is a large ML dependency to run and keep current.
- Both parsers' licences carry thresholds or additional terms that must be
  re-read before commercial use; neither is a plain Apache-2.0 grant end to end.
- DataZoneStandard is not offered for every model in every region, so the
  fallback path will be exercised and deployments may be region-pinned rather
  than zone-wide.
- The bounding-box contract is specified here but not yet implemented: today's
  `epa-ingest` carries the **source line** per Observation, not a box. That is
  the gap between this ADR and the code, and it is named rather than hidden.

**Neutral**

- Nothing in this ADR changes the ePA hand-off: there is still no API into the
  ePA for a third party that is not a listed DiGA, so the pipeline still ends in
  a file the citizen uploads.

## Verification

- [ ] Marker and MinerU arms scored against a complete hand-labelled truth on at
      least one real German lab report; critical error rate recorded per arm
- [ ] Hallucination measured only against a truth marked `"complete": true`
- [ ] Reference ranges present verbatim in stage-2 output, not normalised
- [ ] Every extracted analyte carries page + bounding box
- [ ] `07-ai-foundry.sh` reports a non-Global SKU for every deployment in
      `oai-mvhd-5f53b7` before any real report is processed
- [ ] Licence review recorded for whichever parser is chosen

## References

- `services/epa-ingest/eval/README.md` — the harness and how to read its output
- Marker — <https://github.com/datalab-to/marker> · MinerU — <https://github.com/opendatalab/MinerU>
- Azure AI Content Understanding — document field extraction, confidence and grounding
- Azure OpenAI deployment types and data zones
