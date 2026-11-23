/**
 * API route tests for GET /api/eehrxf (#1144).
 *
 * The coverage figures are validation results written into the graph by
 * scripts/eehrxf/build.py; the route groups them and sums them without
 * counting a profile twice when it sits in several categories. Each category
 * names the annex of the EEHRxF implementing act that defines it (#1205).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/neo4j", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/lib/neo4j";
import { GET } from "@/app/api/eehrxf/route";

const mockRunQuery = vi.mocked(runQuery);

const category = (categoryId: string, tested: number, passed: number) => ({
  categoryId,
  name: categoryId,
  article: "Art. 14(1)(a)",
  annex: "Annex IV",
  description: "",
  ehdsDeadline: "2029-03",
  ehdsGroup: 1,
  status: passed > 0 ? "partial" : "none",
  totalResources: 0,
  profileCount: 1,
  tested,
  passed,
});

const profile = (
  profileId: string,
  categoryId: string,
  tested: number,
  passed: number,
  coverage: string,
) => ({
  profileId,
  name: profileId,
  igName: "HL7 Europe Base and Core",
  igPackage: "hl7.fhir.eu.base#2.0.1",
  fhirVersion: "R4",
  status: "STU 2",
  canonical: `http://hl7.eu/fhir/base/StructureDefinition/${profileId}`,
  url: "",
  baseResource: "Patient",
  coverage,
  tested,
  passed,
  failed: tested - passed,
  topIssues: tested > passed ? ["3x Patient.name: minimum required = 1"] : [],
  resourceCount: 5,
  categoryId,
});

const run = {
  validatorVersion: "7.0.5",
  terminology: "not checked",
  passRule: "no error",
  maxPerSource: 20,
  igs: ["hl7.fhir.eu.base#2.0.1"],
  sources: ["synthea: sample"],
  inputsDigest: "abc",
};

const act = {
  reference: "Ares(2026)10884928",
  title: "EEHRxF",
  status: "draft",
  legalBasis: "Art. 15(1), Regulation (EU) 2025/327",
  fhirVersion: "R4",
  feedbackFrom: "2026-11-23",
  feedbackUntil: "2026-12-21",
  implementationGuideDue: "2027-10-31",
  url: "https://ec.europa.eu/",
  actUrl: "https://ec.europa.eu/act",
  annexUrl: "https://ec.europa.eu/annex",
};

describe("GET /api/eehrxf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns categories with their profiles and validation results", async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        category("patient-summary", 10, 4),
        category("hospital-discharge", 10, 4),
      ])
      .mockResolvedValueOnce([
        profile("patient-eu-core", "patient-summary", 10, 4, "partial"),
        profile("patient-eu-core", "hospital-discharge", 10, 4, "partial"),
        profile("condition-eu-core", "patient-summary", 6, 6, "full"),
      ])
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ label: "Patient", count: 5 }])
      .mockResolvedValueOnce([act]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].profiles).toHaveLength(2);
    expect(data.categories[0].profiles[0]).not.toHaveProperty("categoryId");
    expect(data.categories[0].profiles[0].topIssues).toHaveLength(1);
    expect(data.validation.validatorVersion).toBe("7.0.5");
    expect(data.categories[0].annex).toBe("Annex IV");
    expect(data.implementingAct).toMatchObject({
      reference: "Ares(2026)10884928",
      status: "draft",
      fhirVersion: "R4",
    });
    expect(mockRunQuery).toHaveBeenCalledTimes(6);
  });

  it("counts a profile in several categories once", async () => {
    mockRunQuery
      .mockResolvedValueOnce([category("patient-summary", 10, 4)])
      .mockResolvedValueOnce([
        profile("patient-eu-core", "patient-summary", 10, 4, "partial"),
        profile("patient-eu-core", "hospital-discharge", 10, 4, "partial"),
        profile("condition-eu-core", "patient-summary", 6, 6, "full"),
        profile("composition-eps-eu", "patient-summary", 0, 0, "untested"),
      ])
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([act]);

    const data = await (await GET()).json();

    expect(data.summary).toMatchObject({
      totalProfiles: 3,
      testedProfiles: 2,
      passingProfiles: 1,
      resourcesTested: 16,
      resourcesPassed: 10,
      passRatePercent: 63,
    });
  });

  it("handles a graph without EEHRxF nodes", async () => {
    mockRunQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const data = await (await GET()).json();

    expect(data.categories).toEqual([]);
    expect(data.implementingAct).toBeNull();
    expect(data.summary.passRatePercent).toBe(0);
    expect(data.validation).toBeNull();
    expect(data.planned).toEqual([]);
  });

  it("has a static mock with the same shape, built from the validation report", () => {
    const mock = JSON.parse(
      readFileSync(path.resolve("public/mock/eehrxf.json"), "utf8"),
    );
    expect(
      mock.categories.map((c: { categoryId: string }) => c.categoryId),
    ).toEqual([
      "edispensation",
      "eprescription",
      "patient-summary",
      "hospital-discharge",
      "laboratory-results",
      "medical-imaging",
    ]);
    expect(mock.validation.validatorVersion).toMatch(/^\d+\.\d+\.\d+$/);
    // The Cancer Model is planned, and not one of the six categories.
    expect(mock.planned.map((g: { guideId: string }) => g.guideId)).toContain(
      "cancer-common",
    );
    // Annexes IV to IX of the draft implementing act (#1205).
    expect(mock.implementingAct.reference).toBe("Ares(2026)10884928");
    expect(
      mock.categories.map((c: { annex: string }) => c.annex).sort(),
    ).toEqual(
      [
        "Annex IV",
        "Annex V",
        "Annex VI",
        "Annex VII",
        "Annex VIII",
        "Annex IX",
      ].sort(),
    );
    for (const c of mock.categories) {
      for (const p of c.profiles) {
        expect(["full", "partial", "none", "untested"]).toContain(p.coverage);
        expect(p.passed + p.failed).toBe(p.tested);
        expect(p.canonical).toMatch(/^http:\/\/hl7\.eu\/fhir\//);
      }
    }
  });
});
