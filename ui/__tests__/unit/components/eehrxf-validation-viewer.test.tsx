/**
 * The resource viewer on /eehrxf: each validator issue lands on the JSON line
 * it is about, and the viewer files build.py writes match what it reads.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ValidationViewer, {
  jsonLines,
  lineForIssue,
  normalizeExpression,
  type ViewerProfile,
} from "@/components/eehrxf/ValidationViewer";

const DIR = path.resolve(__dirname, "../../../public/eehrxf/validation");

const observation = {
  resourceType: "Observation",
  id: "obs-1",
  category: [{ coding: [{ system: "x", code: "laboratory" }] }],
  valueQuantity: { value: 6.4, unit: "%" },
  effectivePeriod: { start: "2024-01-01" },
};

describe("normalizeExpression", () => {
  it("turns ofType() into the JSON element name", () => {
    expect(normalizeExpression("Observation.value.ofType(Quantity).code")).toBe(
      "Observation.valueQuantity.code",
    );
    expect(normalizeExpression("Observation.effective.ofType(Period)")).toBe(
      "Observation.effectivePeriod",
    );
  });
});

describe("lineForIssue", () => {
  const lines = jsonLines(observation);
  const lineOf = (expression: string) =>
    lines[lineForIssue(lines, { severity: "error", expression, message: "" })]
      .text;

  it("finds the deepest element the expression names", () => {
    expect(lineOf("Observation.category[0].coding")).toBe('"coding": [');
    expect(lineOf("Observation.value.ofType(Quantity).code")).toBe(
      '"valueQuantity": {',
    );
  });

  it("puts an issue about the whole resource on the first line", () => {
    expect(lineOf("Observation")).toBe("{");
    expect(lineOf("")).toBe("{");
  });
});

describe("the viewer files", () => {
  const files = readdirSync(DIR).filter((f) => f !== "index.json");
  const index = JSON.parse(readFileSync(path.join(DIR, "index.json"), "utf8"));

  it("say what was validated, and every source is described", () => {
    expect(index.sources.length).toBeGreaterThanOrEqual(4);
    for (const s of index.sources) {
      expect(s.label, s.sourceId).toBeTruthy();
      expect(s.data, s.sourceId).toBeTruthy();
    }
    expect(files.length).toBe(index.profiles.length);
  });

  it("carry one entry per tested resource, with the result the report has", () => {
    for (const f of files) {
      const p: ViewerProfile = JSON.parse(
        readFileSync(path.join(DIR, f), "utf8"),
      );
      // Reference examples are shown but never counted.
      const counted = p.resources.filter((r) => r.counted !== false);
      expect(counted.length, f).toBe(p.tested);
      expect(counted.filter((r) => r.passed).length, f).toBe(p.passed);
      for (const r of p.resources.filter((x) => x.counted === false)) {
        expect(r.source, f).toBe("reference");
      }
      for (const r of p.resources) {
        expect(r.resource.meta, f).toMatchObject({ profile: [p.canonical] });
        const blocking = r.issues.filter(
          (i) => i.severity !== "warning" && !i.ignored,
        );
        expect(r.passed, `${f} ${r.origin}`).toBe(blocking.length === 0);
      }
    }
  });

  it("name no real organisation of the flag policy", () => {
    for (const f of readdirSync(DIR)) {
      expect(
        readFileSync(path.join(DIR, f), "utf8").toLowerCase(),
        f,
      ).not.toContain("gematik");
    }
  });
});

describe("<ValidationViewer>", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a resource with its errors and warnings", async () => {
    const profile: ViewerProfile = {
      profileId: "patient-eu-core",
      name: "Patient (EU core)",
      canonical: "http://hl7.eu/fhir/base/StructureDefinition/patient-eu-core",
      igPackage: "hl7.fhir.eu.base#2.0.1",
      tested: 1,
      passed: 0,
      resources: [
        {
          source: "klarbefund",
          origin: "golden.json#entry[0]",
          passed: false,
          issues: [
            {
              severity: "error",
              expression: "Patient",
              message: "Patient.name: minimum required = 1",
            },
            {
              severity: "warning",
              expression: "Patient",
              message: "dom-6: should have narrative",
            },
          ],
          resource: { resourceType: "Patient", id: "p" },
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(profile), { status: 200 }),
    );
    render(<ValidationViewer profileId="patient-eu-core" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId("validation-viewer-json")).toBeInTheDocument(),
    );
    const issues = screen.getByTestId("validation-viewer-issues");
    expect(issues).toHaveTextContent("Patient.name: minimum required = 1");
    expect(issues).toHaveTextContent("dom-6");
    expect(screen.getByText("1 errors")).toBeInTheDocument();
    expect(screen.getByText("1 warnings")).toBeInTheDocument();
  });
});
