/**
 * Tests for ui/src/lib/overview/completeness.ts (issue #271 M6).
 *
 * The Art. 77 description completeness of a catalogue entry: the presence
 * of the nine fields the catalogue carries, scored 0 to 1, with the missing
 * ones named in the catalogue's words.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMPLETENESS_BAND,
  completenessFact,
  descriptionCompleteness,
} from "@/lib/overview/completeness";

const catalog = JSON.parse(
  readFileSync(join(__dirname, "../../../public/mock/catalog.json"), "utf-8"),
) as Record<string, unknown>[];

describe("descriptionCompleteness", () => {
  it("scores a full entry 1 and an empty one 0", () => {
    const full = descriptionCompleteness({
      title: "Synthea Synthetic FHIR R4 Patient Cohort",
      description:
        "A synthetic cohort of 127 patients generated with Synthea, FHIR R4, for the demo.",
      publisher: "AlphaKlinik Berlin",
      license: "CC-BY-4.0",
      conformsTo: ["http://hl7.org/fhir/R4"],
      theme: "health",
      datasetType: "EHR",
      legalBasis: "Art. 53(1)(e)",
      recordCount: 127,
    });
    expect(full).toEqual({ score: 1, filled: 9, total: 9, missing: [] });
    const empty = descriptionCompleteness({});
    expect(empty.score).toBe(0);
    expect(empty.missing).toHaveLength(9);
    expect(descriptionCompleteness(null).score).toBe(0);
  });

  it("names what is missing, in the catalogue's words", () => {
    const c = descriptionCompleteness({
      title: "Registry",
      description: "Too short",
      publisher: "Limburg Medical Centre",
      license: "CC-BY-4.0",
      conformsTo: [],
      theme: "",
      datasetType: "registry",
      legalBasis: "Art. 53(1)(a)",
      recordCount: 0,
    });
    expect(c.filled).toBe(5);
    expect(c.score).toBe(0.56);
    expect(c.missing).toEqual([
      "description of at least forty characters",
      "standard it conforms to",
      "theme",
      "record count",
    ]);
    expect(c.score).toBeLessThan(COMPLETENESS_BAND.low);
  });

  it("accepts conformsTo as a string too", () => {
    expect(
      descriptionCompleteness({ conformsTo: "http://hl7.org/fhir/R4" }).missing,
    ).not.toContain("standard it conforms to");
  });

  it("reads the catalogue fixture's entries", () => {
    for (const entry of catalog) {
      const c = descriptionCompleteness(entry);
      expect(c.total).toBe(9);
      expect(c.filled).toBeGreaterThanOrEqual(0);
      expect(c.filled).toBeLessThanOrEqual(9);
    }
    // at least one entry of the demo catalogue is fully described
    expect(catalog.some((e) => descriptionCompleteness(e).score === 1)).toBe(
      true,
    );
  });

  it("writes the fact line a dataset node carries", () => {
    expect(
      completenessFact({ score: 1, filled: 9, total: 9, missing: [] }),
    ).toEqual(["description (Art. 77)", "9 of 9 fields"]);
    expect(
      completenessFact({
        score: 0.78,
        filled: 7,
        total: 9,
        missing: ["theme", "legal basis"],
      })[1],
    ).toBe("7 of 9 fields, missing: theme, legal basis");
  });
});
