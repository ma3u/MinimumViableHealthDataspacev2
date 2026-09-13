/**
 * Adapter — turn a stage-1 parser's output into a scoreable arm.
 *
 * Marker and MinerU both emit Markdown (plus JSON with layout boxes). Neither
 * knows what a lab panel is; they recover the *page*. So the question they are
 * being asked here is the stage-1 question and only that:
 *
 *   **does this parser hand our extractor a better page than pdftotext does?**
 *
 * Both arms therefore run the same deterministic extraction afterwards. Any
 * difference in the score is a difference in the parse, not in the coding — the
 * only way to attribute a win to the parser rather than to a second variable.
 *
 *   npx tsx eval/arm-from-parser.ts --in marker/befund.md --arm marker-v2 --out marker.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseLabReport } from "../src/parse-lab.js";
import { codeValues } from "../src/code-values.js";
import type { ArmFile, EvalRow } from "./score.js";

/**
 * Flattens a Markdown table row into the column layout the parser expects.
 *
 * `| LDL-Cholesterin | 141 | mg/dl | < 116 |` becomes
 * `LDL-Cholesterin  141  mg/dl  < 116`. Two spaces, because the parser's line
 * grammar needs whitespace between the label and the value and a single space
 * would let a multi-word label swallow the number.
 */
export function flattenTableRow(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;

  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

  // A separator row (|---|:--:|) carries no data.
  if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) return null;
  if (cells.every((c) => c === "")) return null;

  return cells.filter((c) => c !== "").join("  ");
}

/** Strips Markdown emphasis and inline code that would corrupt a label. */
export function stripInlineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/<[^>]+>/g, " ");
}

/**
 * Converts a Markdown document into the plain line layout the parser reads.
 *
 * Deliberately lossy in one direction only: it drops decoration, never digits.
 */
export function markdownToLines(markdown: string): string {
  const out: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = stripInlineMarkdown(raw);
    const table = flattenTableRow(line);
    if (table !== null) {
      out.push(table);
      continue;
    }
    if (/^\s*\|/.test(line)) continue; // separator row
    out.push(line.replace(/^#{1,6}\s*/, ""));
  }
  return out.join("\n");
}

/**
 * Pulls text out of a MinerU/Marker JSON block tree.
 *
 * Both emit nested blocks with a text field under varying key names; we walk
 * for any string-valued `text`/`content`/`md` rather than binding to one
 * vendor's schema, and keep block order.
 */
export function jsonToLines(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) jsonToLines(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "md", "markdown"]) {
      const v = record[key];
      if (typeof v === "string" && v.trim()) out.push(v);
    }
    for (const [key, v] of Object.entries(record)) {
      if (["text", "content", "md", "markdown"].includes(key)) continue;
      jsonToLines(v, out);
    }
  }
  return out;
}

export function toArm(text: string, armName: string): ArmFile {
  const parsed = parseLabReport(text);
  const { coded } = codeValues(parsed.values);
  const rows: EvalRow[] = coded.map((v) => ({
    label: v.label,
    value: v.value,
    unit: v.unitRaw,
    ...(v.referenceLow !== undefined || v.referenceHigh !== undefined
      ? {
          referenceRange: `${v.referenceLow ?? ""}-${v.referenceHigh ?? ""}`,
        }
      : {}),
  }));
  return { arm: armName, rows };
}

/** Reads a stage-1 output file and normalises it to parser-ready text. */
export async function textFromParserOutput(path: string): Promise<string> {
  const raw = await readFile(path, "utf8");
  const ext = extname(path).toLowerCase();
  if (ext === ".json") {
    const lines = jsonToLines(JSON.parse(raw));
    return markdownToLines(lines.join("\n"));
  }
  return markdownToLines(raw);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let input: string | undefined;
  let out: string | undefined;
  let armName = "stage-1 parser";

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--in":
        input = value;
        i++;
        break;
      case "--out":
        out = value;
        i++;
        break;
      case "--arm":
        if (value) armName = value;
        i++;
        break;
      default:
        process.stderr.write(
          "Usage: npx tsx eval/arm-from-parser.ts --in <file.md|file.json> --arm <name> [--out arm.json]\n",
        );
        process.exitCode = 2;
        return;
    }
  }

  if (!input) {
    process.stderr.write("--in is required\n");
    process.exitCode = 2;
    return;
  }

  const text = await textFromParserOutput(input);
  const arm = toArm(text, armName);
  const json = JSON.stringify(arm, null, 2);

  if (out) {
    await writeFile(out, `${json}\n`, "utf8");
    process.stderr.write(`${arm.rows.length} coded rows → ${out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

const invoked = process.argv[1] ?? "";
if (
  invoked.endsWith("arm-from-parser.ts") ||
  invoked.endsWith("arm-from-parser.js")
) {
  main().catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 1;
  });
}
