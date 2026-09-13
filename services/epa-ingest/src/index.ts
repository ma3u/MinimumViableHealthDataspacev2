#!/usr/bin/env node
/**
 * epa-ingest, turn a lab report into FHIR R4 Observations you can take to your
 * Hausarzt, with provenance the receiving side can check.
 *
 * Part of the pre-ePA workbench (issue #182, W9). It prepares; the citizen
 * uploads. There is no API into the ePA for us, a third-party application can
 * only write there as a listed DiGA with a productive SMC-B DiGA, so the end
 * of this pipeline is a file, not a transfer.
 *
 *   epa-ingest befund.pdf --date 2026-08-14 --performer "FS-CPC Charite" \
 *     --out bundle.json
 */
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractText } from "./extract-text.js";
import { parseLabReport } from "./parse-lab.js";
import { codeValues } from "./code-values.js";
import { buildBundle, statusForSource } from "./to-fhir.js";
import { formatTrendSummary, summariseExportFile } from "./apple-health.js";
import type { CodingResult, ExtractedText, SourceKind } from "./types.js";
import type { ParseResult } from "./parse-lab.js";

export interface CliOptions {
  input: string;
  healthExport?: string;
  trendsOut?: string;
  out?: string;
  patientId: string;
  date?: string;
  performer?: string;
  title?: string;
  plainTextSourceKind?: SourceKind;
}

const SOURCE_KINDS: readonly SourceKind[] = [
  "lab-issued-digital",
  "ocr-transcribed",
  "self-tracked",
];

const USAGE = `epa-ingest: lab report to FHIR R4 Observations (pre-ePA workbench)

Usage:
  epa-ingest <file> [options]

  <file>   .pdf (with a text layer) - .png .jpg .tif .webp (OCR) - .txt

Options:
  --out <path>          write the FHIR bundle here (default: stdout)
  --patient-id <id>     logical id used in the bundle (default: "self")
  --date <ISO date>     specimen/collection date (default: today)
  --performer <name>    issuing lab, study centre or hospital
  --title <text>        title for the DiagnosticReport
  --source-kind <kind>  provenance for .txt input: ${SOURCE_KINDS.join(" | ")}
                        (default: self-tracked, the least-trust option)
  -h, --help            this text

Apple Health:
  epa-ingest --health-export <export.xml> [--trends-out <summary.txt>]

  Streams the Health app export and writes a monthly trend summary. The raw
  export routinely exceeds the ePA's 25 MB ceiling and no GP reads 400,000 XML
  rows, so the samples are never emitted, only the aggregates. Everything it
  produces is self-tracked, and the summary says so.
`;

export function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  const opts: Partial<CliOptions> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return null;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    switch (arg) {
      case "--out":
        opts.out = value;
        break;
      case "--patient-id":
        opts.patientId = value;
        break;
      case "--date":
        opts.date = value;
        break;
      case "--performer":
        opts.performer = value;
        break;
      case "--title":
        opts.title = value;
        break;
      case "--health-export":
        opts.healthExport = value;
        break;
      case "--trends-out":
        opts.trendsOut = value;
        break;
      case "--source-kind":
        if (!SOURCE_KINDS.includes(value as SourceKind)) {
          throw new Error(
            `--source-kind must be one of: ${SOURCE_KINDS.join(", ")}`,
          );
        }
        opts.plainTextSourceKind = value as SourceKind;
        break;
      default:
        throw new Error(`Unknown option ${arg}`);
    }
  }

  // The Apple Health path takes no positional input: there is no document to
  // code, only an export to aggregate.
  if (opts.healthExport !== undefined) {
    if (positional.length > 0) {
      throw new Error("--health-export takes no positional input file");
    }
    return {
      input: "",
      patientId: opts.patientId ?? "self",
      healthExport: opts.healthExport,
      ...(opts.trendsOut !== undefined ? { trendsOut: opts.trendsOut } : {}),
    };
  }

  if (positional.length !== 1) {
    throw new Error("Expected exactly one input file");
  }

  return {
    input: positional[0],
    patientId: opts.patientId ?? "self",
    ...(opts.out !== undefined ? { out: opts.out } : {}),
    ...(opts.date !== undefined ? { date: opts.date } : {}),
    ...(opts.performer !== undefined ? { performer: opts.performer } : {}),
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(opts.plainTextSourceKind !== undefined
      ? { plainTextSourceKind: opts.plainTextSourceKind }
      : {}),
  };
}

/**
 * Human-readable run report.
 *
 * Everything the pipeline could not code appears here. A value silently
 * dropped is indistinguishable from a value that was never on the sheet, and
 * the citizen holding the paper is the only one who can tell the difference.
 */
export function formatReport(
  source: {
    sourceDocument: string;
    extractor: string;
    kind: SourceKind;
    ocrConfidence?: number;
  },
  coded: number,
  unmapped: {
    lineNumber: number;
    label: string;
    value: number;
    unitRaw: string;
    reason: string;
    expectedUnits?: string[];
  }[],
  suspicious: { lineNumber: number; line: string }[],
  out?: string,
): string {
  const conf =
    source.ocrConfidence !== undefined
      ? ` - mean OCR confidence ${(source.ocrConfidence * 100).toFixed(0)}%`
      : "";
  const lines = [
    "",
    `source     ${source.sourceDocument} (${source.extractor})${conf}`,
    `provenance ${source.kind} -> Observation.status "${statusForSource(
      source.kind,
    )}"`,
    `coded      ${coded}`,
  ];
  if (unmapped.length) {
    lines.push(`unmapped   ${unmapped.length} - not dropped, listed below:`);
    for (const u of unmapped) {
      const expected = u.expectedUnits
        ? ` (expected ${u.expectedUnits.join(", ")})`
        : "";
      lines.push(
        `           line ${u.lineNumber}: ${u.label} = ${u.value} ${u.unitRaw} - ${u.reason}${expected}`,
      );
    }
  }
  if (suspicious.length) {
    lines.push(
      `unparsed   ${suspicious.length} line(s) looked like measurements but did not parse:`,
    );
    for (const s of suspicious) {
      lines.push(`           line ${s.lineNumber}: ${s.line.trim()}`);
    }
  }
  if (out) lines.push(`written    ${out}`);
  lines.push("", "");
  return lines.join("\n");
}

export interface RunResult {
  bundle: ReturnType<typeof buildBundle>;
  source: ExtractedText["source"];
  coded: CodingResult["coded"];
  unmapped: CodingResult["unmapped"];
  suspiciousLines: ParseResult["suspiciousLines"];
}

/**
 * The whole pipeline, with no I/O beyond reading the input.
 *
 * Kept separate from `main` so the interesting half is testable and so a UI can
 * call it without a process around it.
 */
export async function run(
  options: CliOptions,
  now?: string,
): Promise<RunResult> {
  const extracted = await extractText(options.input, {
    ...(options.plainTextSourceKind !== undefined
      ? { plainTextSourceKind: options.plainTextSourceKind }
      : {}),
  });
  const parsed = parseLabReport(extracted.text);
  const { coded, unmapped } = codeValues(parsed.values);

  const bundle = buildBundle(coded, {
    meta: {
      patientId: options.patientId,
      effectiveDateTime: options.date ?? new Date().toISOString().slice(0, 10),
      ...(options.performer !== undefined
        ? { performer: options.performer }
        : {}),
      ...(options.title !== undefined ? { title: options.title } : {}),
    },
    source: extracted.source,
    ...(now !== undefined ? { now } : {}),
  });

  return {
    bundle,
    source: extracted.source,
    coded,
    unmapped,
    suspiciousLines: parsed.suspiciousLines,
  };
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (!options) {
    process.stdout.write(USAGE);
    return;
  }

  if (options.healthExport) {
    const summary = await summariseExportFile(options.healthExport);
    const rendered = formatTrendSummary(summary);
    if (options.trendsOut) {
      await writeFile(options.trendsOut, rendered, "utf8");
      process.stderr.write(
        `scanned ${summary.recordsScanned.toLocaleString("en-GB")} records, ` +
          `${summary.trends.length} metric(s) -> ${options.trendsOut}\n`,
      );
    } else {
      process.stdout.write(rendered);
    }
    return;
  }

  const { bundle, source, coded, unmapped, suspiciousLines } =
    await run(options);

  const json = JSON.stringify(bundle, null, 2);
  if (options.out) {
    await writeFile(options.out, `${json}\n`, "utf8");
  } else {
    process.stdout.write(`${json}\n`);
  }

  // The report goes to stderr so an --out-less run can be piped as pure JSON.
  process.stderr.write(
    formatReport(source, coded.length, unmapped, suspiciousLines, options.out),
  );
}

// Only run when invoked as a program, so the module stays importable in tests.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url.endsWith(basename(invokedPath))) {
  main().catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 1;
  });
}
