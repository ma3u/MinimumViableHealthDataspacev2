import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLabReport } from "../src/parse-lab.js";
import { codeValues } from "../src/code-values.js";
import { looksLikeScannedPdf } from "../src/extract-text.js";
import { formatReport, parseArgs, run } from "../src/index.js";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/lab-report-de.txt"),
  "utf8",
);

describe("end to end over the fixture", () => {
  const parsed = parseLabReport(FIXTURE);
  const { coded, unmapped } = codeValues(parsed.values);

  it("codes the cardiovascular panel", () => {
    const keys = coded.map((c) => c.analyteKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "cholesterol-total",
        "cholesterol-ldl",
        "cholesterol-hdl",
        "triglycerides",
        "lipoprotein-a",
        "apolipoprotein-b",
        "crp-hs",
        "hba1c",
        "nt-probnp",
      ]),
    );
  });

  it("reads NT-proBNP as 1240, not 1.24", () => {
    const bnp = coded.find((c) => c.analyteKey === "nt-probnp");
    expect(bnp?.value).toBe(1240);
  });

  it("reports the Omega-3-Index as unmapped rather than dropping or guessing it", () => {
    const omega = unmapped.find((u) => u.label.startsWith("Omega-3"));
    expect(omega).toBeDefined();
    expect(omega?.reason).toBe("unknown-analyte");
  });

  it("accounts for every parsed value exactly once", () => {
    expect(coded.length + unmapped.length).toBe(parsed.values.length);
  });
});

describe("looksLikeScannedPdf", () => {
  it("flags a PDF whose text layer is effectively empty", () => {
    expect(looksLikeScannedPdf("   \n \n ")).toBe(true);
    expect(looksLikeScannedPdf(FIXTURE)).toBe(false);
  });
});

describe("parseArgs", () => {
  it("takes one input file and defaults the patient id", () => {
    expect(parseArgs(["befund.pdf"])).toMatchObject({
      input: "befund.pdf",
      patientId: "self",
    });
  });

  it("reads the options", () => {
    expect(
      parseArgs(["a.png", "--out", "b.json", "--date", "2026-08-14"]),
    ).toMatchObject({
      out: "b.json",
      date: "2026-08-14",
    });
  });

  it("returns null for --help", () => {
    expect(parseArgs(["--help"])).toBeNull();
  });

  it("rejects a source kind that is not one of the three", () => {
    expect(() => parseArgs(["a.txt", "--source-kind", "trusted"])).toThrow(
      /source-kind/,
    );
  });

  it("rejects an unknown option and a missing input", () => {
    expect(() => parseArgs(["a.txt", "--nope", "x"])).toThrow(/Unknown option/);
    expect(() => parseArgs([])).toThrow(/exactly one input file/);
  });
});

describe("formatReport", () => {
  it("lists what could not be coded", () => {
    const out = formatReport(
      {
        sourceDocument: "scan.png",
        extractor: "tesseract",
        kind: "ocr-transcribed",
        ocrConfidence: 0.87,
      },
      12,
      [
        {
          lineNumber: 30,
          label: "Omega-3-Index",
          value: 4.1,
          unitRaw: "%",
          reason: "unknown-analyte",
        },
      ],
      [{ lineNumber: 31, line: "LDL/HDL-Quotient 2,9" }],
    );
    expect(out).toContain("mean OCR confidence 87%");
    expect(out).toContain(
      'ocr-transcribed -> Observation.status "preliminary"',
    );
    expect(out).toContain("Omega-3-Index");
    expect(out).toContain("LDL/HDL-Quotient");
  });
});

describe("run", () => {
  const input = join(__dirname, "fixtures/lab-report-de.txt");

  it("produces a bundle, a coded set and everything it could not code", async () => {
    const result = await run(
      {
        input,
        patientId: "self",
        date: "2026-08-14",
        plainTextSourceKind: "lab-issued-digital",
      },
      "2026-09-12T00:00:00.000Z",
    );
    expect(result.bundle.resourceType).toBe("Bundle");
    expect(result.coded.length).toBeGreaterThan(15);
    expect(result.unmapped.length).toBeGreaterThan(0);
    expect(result.suspiciousLines.length).toBeGreaterThan(0);
    expect(result.source.kind).toBe("lab-issued-digital");
  });

  it("defaults the collection date to today rather than leaving it absent", async () => {
    const result = await run({ input, patientId: "self" });
    const report = result.bundle.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === "DiagnosticReport");
    expect(report?.effectiveDateTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseArgs, Apple Health path", () => {
  it("takes --health-export with no positional file", () => {
    expect(parseArgs(["--health-export", "export.xml"])).toMatchObject({
      healthExport: "export.xml",
      input: "",
    });
  });

  it("accepts --trends-out alongside it", () => {
    expect(
      parseArgs(["--health-export", "e.xml", "--trends-out", "t.txt"]),
    ).toMatchObject({
      trendsOut: "t.txt",
    });
  });

  it("rejects a positional file with --health-export, rather than ignoring it", () => {
    expect(() => parseArgs(["befund.pdf", "--health-export", "e.xml"])).toThrow(
      /takes no positional input/,
    );
  });
});
