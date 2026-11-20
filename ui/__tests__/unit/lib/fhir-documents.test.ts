// @vitest-environment node
/**
 * FHIR documents from the graph (#1171): the Patient Summary (HL7 Europe
 * Patient Summary 1.0.0-ballot) and the laboratory report (HL7 Europe
 * Laboratory Report 2.1.0) as `document` Bundles.
 *
 * Whether they conform is the HL7 validator's call (scripts/eehrxf/validate.py
 * over scripts/eehrxf/samples/documents/). This test keeps those samples
 * equal to what the builders produce, so the validated files are the ones
 * the routes serve, and checks the document shape every one of them must
 * have: Composition first, every reference resolvable inside the Bundle.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  buildSample,
  sampleText,
  type SampleSet,
} from "@/lib/fhir-documents/samples";
import { documentProblems } from "@/lib/fhir-documents/document-shape";
import {
  buildLabReportDocument,
  groupLabReports,
  type LabObservationRow,
} from "@/lib/fhir-documents/lab-report";
import { buildPatientSummaryDocument } from "@/lib/fhir-documents/patient-summary";
import {
  documentUuid,
  type DocumentBundle,
  type FhirResource,
} from "@/lib/fhir-documents/shared";

const SAMPLES = path.resolve(
  __dirname,
  "../../../../scripts/eehrxf/samples/documents",
);
const set: SampleSet = JSON.parse(
  readFileSync(path.join(SAMPLES, "graph-rows.json"), "utf8"),
);

const resources = (b: DocumentBundle, type: string) =>
  b.entry.map((e) => e.resource).filter((r) => r.resourceType === type);
const composition = (b: DocumentBundle) =>
  b.entry[0].resource as FhirResource & {
    section: {
      code: { coding: { code: string }[] };
      entry?: unknown[];
      emptyReason?: unknown;
    }[];
  };
const sectionByCode = (b: DocumentBundle, code: string) =>
  composition(b).section.find((s) => s.code.coding[0].code === code);

const PATIENT = {
  id: "P9",
  name: "Erika Beispiel",
  gender: "female",
  birthDate: "1971-02-03",
};
const T = "2026-11-20T09:00:00Z";

function labRow(over: Partial<LabObservationRow> = {}): LabObservationRow {
  return {
    id: "obs-1",
    code: "4548-4",
    display: "HbA1c",
    value: 6.1,
    unit: "%",
    low: 4,
    high: 6,
    rangeText: "4.0 - 6.0 %",
    effective: "2026-03-01T08:30:00Z",
    status: "final",
    performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
    sourceKind: null,
    sourceLine: null,
    sourceRegion: null,
    reportNodeId: null,
    reportTitle: null,
    reportIssued: null,
    reportConclusion: null,
    sourceReport: null,
    ...over,
  };
}

describe("the validated samples are what the builders produce", () => {
  it("holds Patient Summaries and lab reports, a patient's own copy among them", () => {
    const kinds = set.samples.map((s) => s.kind);
    expect(kinds).toContain("patient-summary");
    expect(kinds).toContain("lab-report");
    expect(set.samples.some((s) => s.identity.kind === "pseudonymous")).toBe(
      true,
    );
  });

  it.each(set.samples.map((s) => [s.file, s] as const))(
    "%s is current",
    (file, sample) => {
      const committed = readFileSync(path.join(SAMPLES, file), "utf8");
      // A difference means: run ui/scripts/export-fhir-document-samples.ts,
      // then scripts/eehrxf/validate.py and build.py.
      expect(sampleText(buildSample(sample, set.timestamp))).toBe(committed);
    },
  );

  it("has no document file that no sample writes", () => {
    const files = readdirSync(SAMPLES).filter((f) => f !== "graph-rows.json");
    expect(files.sort()).toEqual(set.samples.map((s) => s.file).sort());
  });
});

describe("document shape", () => {
  it.each(set.samples.map((s) => [s.file, s] as const))(
    "%s: Composition first, every reference resolves, nothing unreachable",
    (_file, sample) => {
      const doc = buildSample(sample, set.timestamp);
      expect(documentProblems(doc)).toEqual([]);
      expect(doc.type).toBe("document");
      expect(doc.identifier.value).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
      expect(doc.timestamp).toBe(set.timestamp);
      expect(doc.entry[0].resource.resourceType).toBe("Composition");
      for (const e of doc.entry) {
        expect(e.fullUrl).toBe(`urn:uuid:${e.resource.id}`);
      }
    },
  );

  it("finds what a broken document gets wrong", () => {
    const doc = buildSample(set.samples[0], T);
    const broken = {
      ...doc,
      type: "collection",
      entry: [...doc.entry.slice(1), doc.entry[0]].filter(
        (e) => e.resource.resourceType !== "Organization",
      ),
    };
    const problems = documentProblems(broken);
    expect(problems).toContain("Bundle.type is collection, not document");
    expect(problems).toContain("the first entry is not a Composition");
    expect(problems.some((p) => p.includes("which is not in the Bundle"))).toBe(
      true,
    );
  });

  it("names the same document the same way and a new export differently", () => {
    expect(documentUuid("a")).toBe(documentUuid("a"));
    expect(documentUuid("a")).not.toBe(documentUuid("b"));
    expect(documentUuid("a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const sample = set.samples[0];
    const a = buildSample(sample, "2026-01-01T00:00:00Z");
    const b = buildSample(sample, "2026-01-02T00:00:00Z");
    expect(a.identifier.value).not.toBe(b.identifier.value);
    expect(a.entry.map((e) => e.fullUrl)).toEqual(
      b.entry.map((e) => e.fullUrl),
    );
  });
});

describe("Patient Summary", () => {
  const input = {
    conditions: [
      {
        id: "cond-1",
        code: "44054006",
        system: null,
        display: "Diabetes mellitus type 2",
        clinicalStatus: "active",
        onset: "2018-04-10",
      },
    ],
    medications: [
      {
        id: "ms-1",
        kind: "statement" as const,
        code: "A10BA02",
        system: "http://www.whocc.no/atc",
        display: "Metformin 500 mg",
        status: "active",
        date: "2018-04-10",
        dosage: "1-0-1",
        reason: "Diabetes mellitus type 2",
      },
      {
        id: "rx-1",
        kind: "request" as const,
        code: "197381",
        system: null,
        display: "Levothyroxine 50 mcg Tab",
        status: "active",
        date: null,
        dosage: null,
        reason: null,
      },
    ],
    immunizations: [],
    procedures: [],
  };
  const doc = buildPatientSummaryDocument(PATIENT, input, {
    timestamp: T,
    identity: { kind: "identified" },
  });

  it("is a Patient Summary with the required sections", () => {
    expect(doc.meta?.profile).toEqual([
      "http://hl7.eu/fhir/eps/StructureDefinition/bundle-eu-eps",
    ]);
    expect(composition(doc).type).toEqual({
      coding: [
        {
          system: "http://loinc.org",
          code: "60591-5",
          display: "Patient summary Document",
        },
      ],
    });
    for (const code of [
      "11450-4",
      "48765-2",
      "10160-0",
      "47519-4",
      "46264-8",
    ]) {
      expect(sectionByCode(doc, code), code).toBeDefined();
    }
  });

  it("says allergies are unknown to the record, not absent", () => {
    const allergies = sectionByCode(doc, "48765-2");
    expect(allergies?.entry).toBeUndefined();
    expect(allergies?.emptyReason).toEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/list-empty-reason",
          code: "unavailable",
          display: "Unavailable",
        },
      ],
    });
  });

  it("lists problems and both kinds of medication, each naming its graph node", () => {
    expect(sectionByCode(doc, "11450-4")?.entry).toHaveLength(1);
    expect(sectionByCode(doc, "10160-0")?.entry).toHaveLength(2);
    const [condition] = resources(doc, "Condition");
    expect(condition.code).toEqual({
      coding: [
        {
          system: "http://snomed.info/sct",
          code: "44054006",
          display: "Diabetes mellitus type 2",
        },
      ],
      text: "Diabetes mellitus type 2",
    });
    expect(condition.identifier).toEqual([
      { system: "https://ehds.mabu.red/fhir/sid/graph-node", value: "cond-1" },
    ]);
    const [request] = resources(doc, "MedicationRequest");
    expect(
      (request.medicationCodeableConcept as { coding: { system: string }[] })
        .coding[0].system,
    ).toBe("http://www.nlm.nih.gov/research/umls/rxnorm");
    expect(resources(doc, "MedicationStatement")[0].dosage).toEqual([
      { text: "1-0-1" },
    ]);
  });

  it("names the patient for a role that sees identity", () => {
    const [patient] = resources(doc, "Patient");
    expect(patient.name).toEqual([{ text: "Erika Beispiel" }]);
    expect(patient.birthDate).toBe("1971-02-03");
    expect(patient.identifier).toEqual([
      { system: "https://ehds.mabu.red/fhir/sid/patient-record", value: "P9" },
    ]);
  });

  it("gives the patient's own copy the pseudonym and masks the birth date", () => {
    const own = buildPatientSummaryDocument(PATIENT, input, {
      timestamp: T,
      identity: { kind: "pseudonymous", pseudonym: "Patient 1234abcd" },
    });
    const [patient] = resources(own, "Patient");
    expect(patient.name).toEqual([{ text: "Patient 1234abcd" }]);
    expect(patient.birthDate).toBeUndefined();
    expect(patient.identifier).toBeUndefined();
    expect(patient._birthDate).toEqual({
      extension: [
        {
          url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
          valueCode: "masked",
        },
      ],
    });
    expect(JSON.stringify(own)).not.toContain("Erika");
    expect(JSON.stringify(own)).not.toContain("1971-02-03");
  });

  it("escapes what the graph says before it goes into the narrative", () => {
    const odd = buildPatientSummaryDocument(
      PATIENT,
      {
        ...input,
        conditions: [{ ...input.conditions[0], display: "<b>&x</b>" }],
      },
      { timestamp: T, identity: { kind: "identified" } },
    );
    const text = (
      composition(odd).section[0] as unknown as { text: { div: string } }
    ).text.div;
    expect(text).toContain("&lt;b&gt;&amp;x&lt;/b&gt;");
  });
});

describe("laboratory report", () => {
  it("groups values by their report node, their Klarbefund report, or the lab and day", () => {
    const reports = groupLabReports([
      labRow({ id: "a", reportNodeId: "dr-lab-1", reportTitle: "Lipid panel" }),
      labRow({ id: "b", sourceReport: "1f0e" }),
      labRow({ id: "c" }),
      labRow({ id: "d", code: "2093-3" }),
      labRow({ id: "e", effective: "2026-03-02" }),
    ]);
    expect(
      reports.map((r) => [r.reportId, r.results.map((x) => x.id)]),
    ).toEqual([
      ["lab-2026-03-02-alphaklinik-berlin-zentrallabor-fictional", ["e"]],
      ["dr-lab-1", ["a"]],
      ["klarbefund-1f0e", ["b"]],
      ["lab-2026-03-01-alphaklinik-berlin-zentrallabor-fictional", ["d", "c"]],
    ]);
    expect(reports[1].title).toBe("Lipid panel");
  });

  const [report] = groupLabReports([
    labRow({
      id: "kb-1",
      status: "preliminary",
      sourceKind: "ocr-transcribed",
      sourceLine: "HbA1c 6,1 % 4,0 - 6,0",
      sourceRegion: "1@0.1,0.4,0.8,0.02",
      sourceReport: "1f0e",
    }),
  ]);
  const doc = buildLabReportDocument(PATIENT, report, {
    timestamp: T,
    identity: { kind: "identified" },
  });

  it("is one DiagnosticReport whose identifier is the Composition's", () => {
    const [dr] = resources(doc, "DiagnosticReport");
    expect(resources(doc, "DiagnosticReport")).toHaveLength(1);
    expect(dr.identifier).toEqual([composition(doc).identifier]);
    expect(dr.extension).toEqual([
      {
        url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition",
        valueReference: { reference: `urn:uuid:${composition(doc).id}` },
      },
    ]);
    expect(dr.status).toBe("preliminary");
  });

  it("keeps where on the paper a Klarbefund value was read, and says so in the Provenance", () => {
    const [obs] = resources(doc, "Observation");
    expect(obs.status).toBe("preliminary");
    expect(obs.extension).toEqual([
      {
        url: "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind",
        valueCode: "ocr-transcribed",
      },
      {
        url: "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-line",
        valueString: "HbA1c 6,1 % 4,0 - 6,0",
      },
      {
        url: "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-region",
        valueString: "1@0.1,0.4,0.8,0.02",
      },
    ]);
    const [provenance] = resources(doc, "Provenance");
    expect((provenance.target as unknown[]).length).toBe(2);
    expect(provenance.entity).toEqual([
      expect.objectContaining({
        role: "source",
        what: expect.objectContaining({
          identifier: {
            system: "https://ehds.mabu.red/fhir/sid/klarbefund-report",
            value: "1f0e",
          },
        }),
      }),
    ]);
  });

  it("names the performing laboratory on every result", () => {
    for (const obs of resources(doc, "Observation")) {
      expect(obs.performer).toEqual([
        expect.objectContaining({
          display: "AlphaKlinik Berlin, Zentrallabor (fictional)",
        }),
      ]);
    }
  });

  it("refuses a report with no results", () => {
    expect(() =>
      buildLabReportDocument(
        PATIENT,
        { ...report, results: [] },
        {
          timestamp: T,
          identity: { kind: "identified" },
        },
      ),
    ).toThrow(/no results/);
  });
});
