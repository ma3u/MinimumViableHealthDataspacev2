import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractText } from "../src/extract-text.js";
import { codeValues } from "../src/code-values.js";
import type { RawLabValue } from "../src/types.js";

const dir = mkdtempSync(join(tmpdir(), "epa-ingest-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function tmp(name: string, contents: string): string {
  const path = join(dir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("extractText", () => {
  it("reads plain text and defaults its provenance to the least-trust option", () => {
    // Text handed to us with no document behind it is the citizen's own
    // assertion until they say otherwise.
    return extractText(tmp("notes.txt", "Ferritin 42 ug/l")).then((res) => {
      expect(res.text).toContain("Ferritin");
      expect(res.source).toMatchObject({
        kind: "self-tracked",
        extractor: "plain-text",
        sourceDocument: "notes.txt",
      });
      expect(res.source.ocrConfidence).toBeUndefined();
    });
  });

  it("lets the caller assert a stronger provenance for plain text", async () => {
    const res = await extractText(tmp("copy.txt", "Ferritin 42 ug/l"), {
      plainTextSourceKind: "lab-issued-digital",
    });
    expect(res.source.kind).toBe("lab-issued-digital");
  });

  it("refuses a file type it cannot read, naming what it accepts", async () => {
    await expect(extractText(tmp("scan.docx", "x"))).rejects.toThrow(
      /Unsupported input/,
    );
  });

  it("refuses a file with no extension", async () => {
    await expect(extractText(tmp("befund", "x"))).rejects.toThrow(
      /Unsupported input/,
    );
  });

  it("fails loudly on a .pdf that is not a PDF rather than returning nothing", async () => {
    await expect(
      extractText(tmp("broken.pdf", "not a pdf at all")),
    ).rejects.toThrow();
  });
});

describe("codeValues", () => {
  const row = (label: string, unitRaw: string): RawLabValue => ({
    label,
    value: 1,
    unitRaw,
    line: `${label} 1 ${unitRaw}`,
    lineNumber: 1,
  });

  it("separates coded from unmapped without losing a row", () => {
    const result = codeValues([
      row("LDL-Cholesterin", "mg/dl"),
      row("Omega-3-Index", "%"),
      row("HbA1c", "mg/dl"),
      row("Ferritin", "Titer"),
    ]);
    expect(result.coded).toHaveLength(1);
    expect(result.unmapped).toHaveLength(3);
  });

  it("says why each row could not be coded", () => {
    const { unmapped } = codeValues([
      row("Omega-3-Index", "%"),
      row("HbA1c", "mg/dl"),
      row("Ferritin", "Titer"),
    ]);
    expect(unmapped.map((u) => u.reason)).toEqual([
      "unknown-analyte",
      "unit-mismatch",
      "unknown-unit",
    ]);
  });

  it("names the units it expected when the unit does not fit the analyte", () => {
    const { unmapped } = codeValues([row("HbA1c", "mg/dl")]);
    expect(unmapped[0].expectedUnits).toEqual(
      expect.arrayContaining(["%", "mmol/mol"]),
    );
  });

  it("keeps the source line on an unmapped row so it can be checked against the paper", () => {
    const { unmapped } = codeValues([row("Omega-3-Index", "%")]);
    expect(unmapped[0].line).toContain("Omega-3-Index");
  });
});
