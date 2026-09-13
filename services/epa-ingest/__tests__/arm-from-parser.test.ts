import { describe, expect, it } from "vitest";
import {
  flattenTableRow,
  jsonToLines,
  markdownToLines,
  stripInlineMarkdown,
  toArm,
} from "../eval/arm-from-parser.js";

describe("flattenTableRow", () => {
  it("turns a markdown table row into spaced columns", () => {
    expect(flattenTableRow("| LDL-Cholesterin | 141 | mg/dl | < 116 |")).toBe(
      "LDL-Cholesterin  141  mg/dl  < 116",
    );
  });

  it("ignores the separator row", () => {
    expect(flattenTableRow("|---|:--:|---|")).toBeNull();
    expect(flattenTableRow("| --- | --- |")).toBeNull();
  });

  it("ignores a line that is not a table row", () => {
    expect(flattenTableRow("Laborbefund")).toBeNull();
  });

  it("drops empty cells rather than emitting blank columns", () => {
    expect(flattenTableRow("| Ferritin |  | <10 | ug/l |")).toBe(
      "Ferritin  <10  ug/l",
    );
  });
});

describe("stripInlineMarkdown", () => {
  it("removes emphasis, code and html without touching digits", () => {
    expect(stripInlineMarkdown("**LDL** `141` <br/> mg/dl")).toBe(
      "LDL 141   mg/dl",
    );
  });
});

describe("markdownToLines", () => {
  const md = `# Laborbefund

| Analyt | Wert | Einheit | Referenz |
|---|---|---|---|
| LDL-Cholesterin | 141 | mg/dl | < 116 |
| **Lp(a)** | 87,3 | mg/dl | < 30 |
| NT-proBNP | 1.240 | pg/ml | < 125 |
`;

  it("produces lines the deterministic parser can read", () => {
    const text = markdownToLines(md);
    expect(text).toContain("LDL-Cholesterin  141  mg/dl  < 116");
    expect(text).toContain("Lp(a)  87,3  mg/dl  < 30");
  });

  it("strips the heading marker but keeps the heading text", () => {
    expect(markdownToLines("# Laborbefund")).toBe("Laborbefund");
  });

  it("never drops a digit", () => {
    const digitsIn = (md.match(/\d/g) ?? []).length;
    const digitsOut = (markdownToLines(md).match(/\d/g) ?? []).length;
    expect(digitsOut).toBe(digitsIn);
  });
});

describe("jsonToLines", () => {
  it("walks a nested block tree without binding to one vendor's schema", () => {
    const blocks = {
      pages: [
        {
          blocks: [
            { type: "text", text: "Laborbefund" },
            { type: "table", md: "| LDL | 141 |" },
          ],
        },
        { blocks: [{ content: "Ferritin <10 ug/l" }] },
      ],
    };
    expect(jsonToLines(blocks)).toEqual([
      "Laborbefund",
      "| LDL | 141 |",
      "Ferritin <10 ug/l",
    ]);
  });

  it("ignores empty strings and non-string fields", () => {
    expect(jsonToLines({ text: "   ", bbox: [0, 0, 1, 1], page: 2 })).toEqual(
      [],
    );
  });
});

describe("toArm", () => {
  it("runs the same deterministic extraction so a score difference is a parse difference", () => {
    const text = markdownToLines(
      "| LDL-Cholesterin | 141 | mg/dl | < 116 |\n| NT-proBNP | 1.240 | pg/ml | < 125 |",
    );
    const arm = toArm(text, "marker-v2");
    expect(arm.arm).toBe("marker-v2");
    expect(arm.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "LDL-Cholesterin",
          value: 141,
          unit: "mg/dl",
        }),
        // Still 1240, not 1.24 — the parse route changed, the number rules did not.
        expect.objectContaining({ label: "NT-proBNP", value: 1240 }),
      ]),
    );
  });

  it("produces an empty arm rather than throwing on a page with no measurements", () => {
    expect(
      toArm("Sehr geehrte Frau Kollegin,\n\nmit freundlichen Grüßen", "empty")
        .rows,
    ).toEqual([]);
  });
});
