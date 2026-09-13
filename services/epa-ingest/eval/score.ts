/**
 * Scorer, is on-device extraction good enough to keep the report on the phone?
 *
 * Compares one or more extraction arms against a ground truth the owner of the
 * report labelled by hand, and prints metrics that are safe to share: counts and
 * rates, never values.
 *
 * The headline number is NOT overall accuracy. It is the **critical error rate**:
 * rows where the extracted value is off by an order of magnitude, or carries the
 * wrong unit, or was never on the page at all. A run at 98% overall accuracy with
 * a 2% order-of-magnitude error rate is not a good extractor. It is one that
 * turns 1240 pg/mL NT-proBNP into 1.24 twice per hundred rows.
 *
 * Hallucination is the asymmetry that decides the architecture: the deterministic
 * parser structurally cannot invent a row. A language model can. So the question
 * is not "which is more accurate" but "does the model's invention rate stay at
 * zero, and does it earn its keep on the rows the parser misses".
 *
 *   npx tsx eval/score.ts --truth truth.json --arm fm.json --report report.txt
 */
import { readFile } from "node:fs/promises";
import { normaliseLabel, normaliseUnit } from "../src/analytes.js";
import { parseLabReport } from "../src/parse-lab.js";
import { codeValues } from "../src/code-values.js";

/** One row, in the shape every arm and the ground truth share. */
export interface EvalRow {
  label: string;
  value: number;
  unit: string;
  referenceRange?: string;
}

export interface ArmFile {
  arm?: string;
  rows: EvalRow[];
  elapsedSeconds?: number;
  failedChunks?: string[];
}

/**
 * The hand-labelled reference.
 *
 * `complete` is not a formality. **Hallucination cannot be measured against a
 * partial truth**: a row the arm extracted correctly but the labeller did not
 * list is indistinguishable from a row the arm invented. So a truth file that
 * does not declare itself complete gets its extra rows counted as `unlabelled`
 * and kept out of the critical error rate, and the report says the invention
 * rate is unknown rather than printing a number that is not one.
 */
export interface TruthFile {
  /** True only when every measured row on the report is listed below. */
  complete?: boolean;
  rows: EvalRow[];
}

export interface Metrics {
  arm: string;
  truthRows: number;
  extractedRows: number;
  /** Truth rows the arm found, matched on the normalised analyte label. */
  matched: number;
  /** Truth rows the arm did not produce at all. */
  missed: number;
  /**
   * Rows the arm produced that are not in the truth, counted ONLY when the truth
   * is complete. For a deterministic parser this is a label-normalisation gap;
   * for a model it is invention.
   */
  hallucinated: number;
  /**
   * Extra rows under a partial truth, unjudgeable, so reported separately and
   * excluded from the critical error rate.
   */
  unlabelled: number;
  /** False when the truth is partial, i.e. `hallucinated` is not measurable. */
  hallucinationMeasurable: boolean;
  /** Matched rows whose value equals the truth (within float tolerance). */
  valueExact: number;
  /**
   * Matched rows off by a factor of 10 or more, the decimal-separator failure.
   * Clinically the most dangerous outcome and the one that decides the verdict.
   */
  valueOrderOfMagnitude: number;
  /** Matched rows with some other numeric disagreement. */
  valueOtherWrong: number;
  /** Matched rows whose unit does not normalise to the truth's UCUM unit. */
  unitWrong: number;
  /**
   * hallucinated + valueOrderOfMagnitude + unitWrong, as a rate over truth rows.
   * Under a partial truth the hallucination term is absent, so this is a LOWER
   * BOUND on the real rate.
   */
  criticalErrorRate: number;
  elapsedSeconds?: number;
  failedChunks: number;
}

const EPS = 1e-9;

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS + 1e-6 * Math.max(Math.abs(a), Math.abs(b));
}

/** True when two values differ by a factor of ten or more in either direction. */
export function isOrderOfMagnitudeError(got: number, want: number): boolean {
  if (want === 0 || got === 0) return got !== want;
  const ratio = Math.abs(got / want);
  return ratio >= 10 - EPS || ratio <= 0.1 + EPS;
}

/** Units agree if they normalise to the same UCUM code, or match textually. */
export function sameUnit(got: string, want: string): boolean {
  const g = normaliseUnit(got);
  const w = normaliseUnit(want);
  if (g !== null && w !== null) return g === w;
  return got.trim().toLowerCase() === want.trim().toLowerCase();
}

export function score(
  truth: EvalRow[],
  arm: ArmFile,
  armName: string,
  complete = false,
): Metrics {
  const remaining = new Map<string, EvalRow>();
  for (const row of truth) remaining.set(normaliseLabel(row.label), row);
  const seen = new Set<string>();

  let matched = 0;
  let hallucinated = 0;
  let unlabelled = 0;
  let valueExact = 0;
  let valueOrderOfMagnitude = 0;
  let valueOtherWrong = 0;
  let unitWrong = 0;

  for (const got of arm.rows) {
    const key = normaliseLabel(got.label);
    const want = remaining.get(key);
    if (!want) {
      // A duplicate of a row already matched is a defect under any truth: the
      // arm emitted the same measurement twice.
      if (seen.has(key)) {
        hallucinated++;
      } else if (complete) {
        // The truth lists every row, so this one is not on the page.
        hallucinated++;
      } else {
        // The labeller may simply not have listed it. Unjudgeable.
        unlabelled++;
      }
      continue;
    }
    remaining.delete(key);
    seen.add(key);
    matched++;

    if (sameNumber(got.value, want.value)) {
      valueExact++;
    } else if (isOrderOfMagnitudeError(got.value, want.value)) {
      valueOrderOfMagnitude++;
    } else {
      valueOtherWrong++;
    }

    if (!sameUnit(got.unit, want.unit)) unitWrong++;
  }

  const critical = hallucinated + valueOrderOfMagnitude + unitWrong;

  return {
    arm: armName,
    truthRows: truth.length,
    extractedRows: arm.rows.length,
    matched,
    missed: remaining.size,
    hallucinated,
    unlabelled,
    hallucinationMeasurable: complete,
    valueExact,
    valueOrderOfMagnitude,
    valueOtherWrong,
    unitWrong,
    criticalErrorRate: truth.length === 0 ? 0 : critical / truth.length,
    ...(arm.elapsedSeconds !== undefined
      ? { elapsedSeconds: arm.elapsedSeconds }
      : {}),
    failedChunks: arm.failedChunks?.length ?? 0,
  };
}

/** Runs the deterministic parser as a baseline arm over the same report text. */
export function baselineArm(reportText: string): ArmFile {
  const parsed = parseLabReport(reportText);
  const { coded } = codeValues(parsed.values);
  return {
    arm: "epa-ingest-parser",
    rows: coded.map((v) => ({
      label: v.label,
      value: v.value,
      unit: v.unitRaw,
    })),
  };
}

export function formatMetrics(all: Metrics[]): string {
  const pct = (n: number, d: number) =>
    d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(1)}%`;
  const lines: string[] = [""];
  for (const m of all) {
    lines.push(`── ${m.arm} ${"─".repeat(Math.max(0, 52 - m.arm.length))}`);
    lines.push(`   truth rows            ${m.truthRows}`);
    lines.push(`   extracted rows        ${m.extractedRows}`);
    lines.push(
      `   matched               ${m.matched}  (${pct(
        m.matched,
        m.truthRows,
      )} recall)`,
    );
    lines.push(`   missed                ${m.missed}`);
    if (!m.hallucinationMeasurable && m.unlabelled) {
      lines.push(
        `   unlabelled            ${m.unlabelled}  (not in the truth; unjudgeable)`,
      );
    }
    lines.push(
      `   value exact           ${m.valueExact}  (${pct(
        m.valueExact,
        m.matched,
      )} of matched)`,
    );
    lines.push(`   value wrong (other)   ${m.valueOtherWrong}`);
    lines.push("");
    lines.push(
      "   critical: each one of these could change a clinical decision",
    );
    lines.push(
      m.hallucinationMeasurable
        ? `     hallucinated rows   ${m.hallucinated}`
        : `     hallucinated rows   not measurable, truth is not marked complete`,
    );
    lines.push(`     order-of-magnitude  ${m.valueOrderOfMagnitude}`);
    lines.push(`     wrong unit          ${m.unitWrong}`);
    lines.push(
      `   CRITICAL ERROR RATE   ${(100 * m.criticalErrorRate).toFixed(1)}%` +
        (m.hallucinationMeasurable ? "" : "  (lower bound)"),
    );
    if (m.failedChunks)
      lines.push(`   failed chunks         ${m.failedChunks}`);
    if (m.elapsedSeconds !== undefined) {
      lines.push(`   elapsed               ${m.elapsedSeconds.toFixed(1)}s`);
    }
    lines.push("");
  }
  lines.push(
    "A deterministic parser cannot hallucinate. A model can. Read the critical",
    "error rate first, and treat any non-zero hallucination count as a finding",
    "rather than a rounding error.",
    "",
  );
  if (all.some((m) => !m.hallucinationMeasurable)) {
    lines.push(
      'The truth file is not marked `"complete": true`, so invented rows cannot be',
      "told apart from rows you simply did not label. Label every measured row and",
      "set the flag before drawing a conclusion about hallucination.",
      "",
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let truthPath: string | undefined;
  let reportPath: string | undefined;
  const armPaths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--truth":
        truthPath = value;
        i++;
        break;
      case "--report":
        reportPath = value;
        i++;
        break;
      case "--arm":
        if (value) armPaths.push(value);
        i++;
        break;
      default:
        process.stderr.write(
          "Usage: npx tsx eval/score.ts --truth truth.json [--report report.txt] [--arm fm.json ...]\n",
        );
        process.exitCode = 2;
        return;
    }
  }

  if (!truthPath) {
    process.stderr.write("--truth is required\n");
    process.exitCode = 2;
    return;
  }

  const truth = JSON.parse(await readFile(truthPath, "utf8")) as TruthFile;
  const complete = truth.complete === true;
  const metrics: Metrics[] = [];

  if (reportPath) {
    const text = await readFile(reportPath, "utf8");
    metrics.push(
      score(
        truth.rows,
        baselineArm(text),
        "epa-ingest parser (deterministic)",
        complete,
      ),
    );
  }

  for (const path of armPaths) {
    const arm = JSON.parse(await readFile(path, "utf8")) as ArmFile;
    metrics.push(score(truth.rows, arm, arm.arm ?? path, complete));
  }

  process.stdout.write(formatMetrics(metrics));
}

const invoked = process.argv[1] ?? "";
if (invoked.endsWith("score.ts") || invoked.endsWith("score.js")) {
  main().catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 1;
  });
}
