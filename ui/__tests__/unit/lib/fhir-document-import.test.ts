// @vitest-environment node
/**
 * Reading FHIR documents back (#1173): an HL7 Europe laboratory report or
 * Patient Summary as the rows the record holds, and a round trip: every
 * document the hub exports (the validated samples of #1171) parses back into
 * rows that export the same document again.
 *
 * The two HL7 Europe examples are the IG's own (hl7.fhir.eu.laboratory 2.1.0,
 * hl7.fhir.eu.eps 1.0.0-ballot) with every organisation renamed to a
 * fictional one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildSample, type SampleSet } from "@/lib/fhir-documents/samples";
import { buildLabReportDocument } from "@/lib/fhir-documents/lab-report";
import { buildPatientSummaryDocument } from "@/lib/fhir-documents/patient-summary";
import {
  DocumentRefusedError,
  documentKind,
  parseDocument,
} from "@/lib/fhir-documents/import";
import { STORE_DOCUMENT_CYPHER, storeParams } from "@/lib/fhir-documents/store";

const SAMPLES = path.resolve(
  __dirname,
  "../../../../scripts/eehrxf/samples/documents",
);
const set: SampleSet = JSON.parse(
  readFileSync(path.join(SAMPLES, "graph-rows.json"), "utf8"),
);
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(path.join(__dirname, "fixtures/fhir-documents", name), "utf8"),
  );
const LAB = fixture("hl7-eu-lab-simple-chemistry.json");
const EPS = fixture("hl7-eu-eps-example.json");

describe("round trip: export, import, export again", () => {
  it.each(set.samples.map((s) => [s.file, s] as const))(
    "%s comes back as the same document",
    (_file, sample) => {
      const exported = buildSample(sample, set.timestamp);
      const parsed = parseDocument(
        JSON.parse(JSON.stringify(exported)),
        sample.patient.id,
      );
      expect(parsed.skipped).toEqual([]);
      const options = { timestamp: set.timestamp, identity: sample.identity };
      const again =
        parsed.kind === "lab-report"
          ? buildLabReportDocument(sample.patient, parsed.lab!, options)
          : buildPatientSummaryDocument(
              sample.patient,
              parsed.summary!,
              options,
            );
      expect(again).toEqual(exported);
    },
  );

  it("names the hub's own nodes, so an import writes back to them", () => {
    const sample = set.samples.find((s) => s.file === "P1-lab-report.json")!;
    const parsed = parseDocument(
      buildSample(sample, set.timestamp),
      sample.patient.id,
    );
    expect(sample.kind).toBe("lab-report");
    const report = sample.kind === "lab-report" ? sample.report : null;
    expect(parsed.graphIds.sort()).toEqual(
      [report!.reportId, ...report!.results.map((r) => r.id)].sort(),
    );
    expect(parsed.patientRecordId).toBe("P1");
  });
});

describe("an HL7 Europe laboratory report", () => {
  const parsed = parseDocument(LAB, "P1");

  it("is a lab report checked against the lab Bundle profile", () => {
    expect(parsed.kind).toBe("lab-report");
    expect(parsed.profile).toBe(
      "http://hl7.eu/fhir/laboratory/StructureDefinition/Bundle-eu-lab",
    );
    expect(parsed.meta.documentId).toBe(
      "urn:oid:2.16.840.1.113883.2.51.1.1|8ccab76a-82ed-403e-b974-6b28022b0997",
    );
    expect(parsed.meta.timestamp).toBe("2023-03-27T13:13:19+02:00");
  });

  it("keeps who wrote it and who keeps it", () => {
    expect(parsed.meta.authors.length).toBeGreaterThan(0);
    expect(parsed.meta.custodian).toMatch(/\(fictional\)$/);
  });

  it("reads both results with code, value, unit and range", () => {
    expect(parsed.lab!.results).toEqual([
      expect.objectContaining({
        code: "22700-9",
        value: 310,
        unit: "mmol/L",
        low: 67,
        high: 580,
        status: "final",
        performer: "Jan Laborant",
      }),
      expect.objectContaining({
        code: "2947-0",
        value: 156,
        unit: "umol/L",
        low: 136,
        high: 144,
        performer: "Laboratorní Technik",
      }),
    ]);
    expect(parsed.graphIds).toEqual([]);
    expect(parsed.patientRecordId).toBeNull();
  });

  it("gives the same entry the same key on a second import, and another record another key", () => {
    const again = parseDocument(LAB, "P1");
    const other = parseDocument(LAB, "P2");
    const keys = (p: typeof parsed) => p.lab!.results.map((r) => r.id);
    expect(keys(again)).toEqual(keys(parsed));
    expect(keys(other)).not.toEqual(keys(parsed));
    expect(keys(parsed).every((k) => /^imp-[0-9a-f-]{36}$/.test(k))).toBe(true);
  });
});

describe("an HL7 Europe Patient Summary", () => {
  const parsed = parseDocument(EPS, "P1");

  it("reads problems, allergies, medications and immunisations", () => {
    const s = parsed.summary!;
    expect(s.conditions).toHaveLength(6);
    expect(s.allergies).toHaveLength(2);
    expect(s.medications).toHaveLength(11);
    expect(s.immunizations).toHaveLength(3);
    expect(s.procedures).toEqual([]);
    expect(s.conditions[0]).toMatchObject({
      code: "55822004",
      system: "http://snomed.info/sct",
      display: "Hyperlipidemia",
      clinicalStatus: "active",
      onset: "2020-06-15",
    });
    // A MedicationStatement names its Medication by reference.
    expect(s.medications[0]).toMatchObject({
      kind: "statement",
      code: "314231",
      display: "Simvastatin 10 mg oral tablet",
      date: "2025-07-15",
    });
  });

  it("lists what the record does not hold, with the reason", () => {
    const types = new Set(parsed.skipped.map((s) => s.resourceType));
    expect([...types].sort()).toEqual([
      "CarePlan",
      "DeviceUseStatement",
      "Observation",
    ]);
    expect(parsed.skipped[0].reason).toMatch(/does not hold/);
  });
});

describe("what is refused before anything is read", () => {
  it("a Bundle that is not a document", () => {
    expect(() => documentKind({ ...LAB, type: "collection" })).toThrow(
      DocumentRefusedError,
    );
  });

  it("a document of another type, such as a discharge report", () => {
    const discharge = structuredClone(LAB);
    discharge.entry[0].resource.type.coding[0].code = "34105-7";
    try {
      documentKind(discharge);
      expect.unreachable();
    } catch (err) {
      expect((err as DocumentRefusedError).status).toBe(415);
    }
  });

  it("a lab report without its DiagnosticReport", () => {
    const bare = structuredClone(LAB);
    bare.entry = bare.entry.filter(
      (e: { resource: { resourceType: string } }) =>
        e.resource.resourceType !== "DiagnosticReport",
    );
    expect(() => parseDocument(bare, "P1")).toThrow(/exactly one/);
  });
});

describe("the statement that writes it", () => {
  it("merges, never creates", () => {
    expect(STORE_DOCUMENT_CYPHER).toMatch(/MERGE \(doc:DocumentReference/);
    expect(STORE_DOCUMENT_CYPHER).not.toMatch(/(?<!ON )\bCREATE\b/);
  });

  it("keeps the document's hash and metadata, not its content", () => {
    const raw = JSON.stringify(LAB);
    const params = storeParams(
      "P1",
      parseDocument(LAB, "P1"),
      raw,
      { role: "PATIENT", id: "patient-record:P1" },
      "prov-1",
    );
    const doc = params.doc as Record<string, unknown>;
    expect(doc.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.size).toBe(Buffer.byteLength(raw));
    expect(JSON.stringify(params)).not.toContain("František");
    expect(params.observations).toHaveLength(2);
    expect(params.reports).toHaveLength(1);
  });
});
