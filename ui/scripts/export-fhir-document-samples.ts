/**
 * Write the FHIR document samples scripts/eehrxf/validate.py validates
 * (#1171): read a few seeded patients from a running graph, keep their rows
 * in scripts/eehrxf/samples/documents/graph-rows.json and write the document
 * each gives beside it, and P1's documents as the static-export mocks
 * (ui/public/mock/patient_document*.json). Run from ui/ with Neo4j up
 * (docker compose up -d):
 *
 *   npx --yes tsx scripts/export-fhir-document-samples.ts
 *
 * Then run python3 scripts/eehrxf/validate.py and python3 scripts/eehrxf/build.py.
 * Read-only on the graph. Fictional and synthetic patients only.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadDocumentPatient,
  loadLabReports,
  loadPatientSummaryInput,
} from "../src/lib/fhir-documents/load";
import type { LabReportInput } from "../src/lib/fhir-documents/lab-report";
import {
  SAMPLE_TIMESTAMP,
  buildSample,
  sampleText,
  type DocumentSample,
  type SampleSet,
} from "../src/lib/fhir-documents/samples";
import { getDriver } from "../src/lib/neo4j";
import { documentIndex } from "../src/lib/fhir-documents/document-index";

const MOCK = join(__dirname, "..", "public", "mock");
const OUT = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "eehrxf",
  "samples",
  "documents",
);

/** Seeded demo personas and Synthea patients with the most to show. */
const SUMMARY_PATIENTS = ["P1", "P2", "fhir-pat-1002", "patient-2000"];
const LAB_PATIENTS = ["P1", "P2"];

/**
 * A report as the Klarbefund app sends one (ADR-033): values read off paper,
 * so `preliminary`, each with the line it was read from. No sandbox record
 * is on a seeded stack, so its rows are written here, fictional, in the shape
 * storeReportRows keeps.
 */
const KLARBEFUND_REPORT: LabReportInput = {
  reportId: "klarbefund-0d3c6a52-6a3e-4c55-9d0e-8f1b2a7c4e19",
  title: "Laboratory report 2026-06-02, Praxislabor Musterstadt (fictional)",
  effective: "2026-06-02",
  issued: null,
  performer: "Praxislabor Musterstadt (fictional)",
  conclusion: null,
  sourceReport: "0d3c6a52-6a3e-4c55-9d0e-8f1b2a7c4e19",
  results: [
    {
      id: "sandbox-demo-0d3c6a52-1",
      code: "4548-4",
      display: "HbA1c",
      value: 5.6,
      unit: "%",
      low: 4,
      high: 6,
      rangeText: "4,0 - 6,0",
      effective: "2026-06-02",
      status: "preliminary",
      performer: "Praxislabor Musterstadt (fictional)",
      sourceKind: "ocr-transcribed",
      sourceLine: "HbA1c 5,6 % 4,0 - 6,0",
      sourceRegion: "1@0.08,0.41,0.84,0.02",
    },
    {
      id: "sandbox-demo-0d3c6a52-2",
      code: "2093-3",
      display: "Cholesterin gesamt",
      value: 212,
      unit: "mg/dL",
      low: null,
      high: 200,
      rangeText: "< 200",
      effective: "2026-06-02",
      status: "preliminary",
      performer: "Praxislabor Musterstadt (fictional)",
      sourceKind: "ocr-transcribed",
      sourceLine: "Cholesterin gesamt 212 mg/dl < 200",
      sourceRegion: "1@0.08,0.44,0.84,0.02",
    },
  ],
};

async function main() {
  const samples: DocumentSample[] = [];
  for (const id of SUMMARY_PATIENTS) {
    const patient = await loadDocumentPatient(id);
    if (!patient) throw new Error(`patient ${id} is not in the graph`);
    samples.push({
      file: `${id}-patient-summary.json`,
      kind: "patient-summary",
      identity: { kind: "identified" },
      patient,
      input: await loadPatientSummaryInput(id),
    });
  }
  // The patient's own copy: pseudonym, birth date masked (ownRecordView).
  const p1 = samples[0];
  samples.push({
    ...p1,
    file: "P1-patient-summary-own-copy.json",
    // patientPseudonym() is keyed by a secret, so the sample uses a fixed label.
    identity: { kind: "pseudonymous", pseudonym: "Patient 0a1b2c3d" },
  });
  for (const id of LAB_PATIENTS) {
    const patient = await loadDocumentPatient(id);
    if (!patient) throw new Error(`patient ${id} is not in the graph`);
    const [newest] = await loadLabReports(id);
    if (!newest) throw new Error(`patient ${id} has no laboratory report`);
    samples.push({
      file: `${id}-lab-report.json`,
      kind: "lab-report",
      identity: { kind: "identified" },
      patient,
      report: newest,
    });
  }
  samples.push({
    file: "sandbox-klarbefund-lab-report.json",
    kind: "lab-report",
    identity: { kind: "identified" },
    patient: {
      id: "sandbox-demo",
      name: "Klarbefund sandbox (fictional)",
      gender: "female",
      birthDate: "1984-05-17",
    },
    report: KLARBEFUND_REPORT,
  });

  mkdirSync(OUT, { recursive: true });
  for (const name of readdirSync(OUT)) rmSync(join(OUT, name));
  const set: SampleSet = {
    $comment:
      "Written by ui/scripts/export-fhir-document-samples.ts from the seeded graph (#1171); do not edit. Each sample's document is the file it names.",
    timestamp: SAMPLE_TIMESTAMP,
    samples,
  };
  writeFileSync(
    join(OUT, "graph-rows.json"),
    `${JSON.stringify(set, null, 1)}\n`,
  );
  for (const sample of samples) {
    writeFileSync(
      join(OUT, sample.file),
      sampleText(buildSample(sample, SAMPLE_TIMESTAMP)),
    );
    console.log(`wrote ${sample.file}`);
  }

  // The static GitHub Pages build serves P1's documents (CLAUDE.md gotcha 3).
  const mock = (name: string, body: unknown) => {
    writeFileSync(join(MOCK, name), `${JSON.stringify(body, null, 2)}\n`);
    console.log(`wrote ui/public/mock/${name}`);
  };
  mock(
    "patient_documents.json",
    documentIndex("P1", await loadLabReports("P1")),
  );
  mock(
    "patient_document_patient_summary.json",
    buildSample(samples[0], SAMPLE_TIMESTAMP),
  );
  mock(
    "patient_document_lab_report.json",
    buildSample(
      samples.find((s) => s.file === "P1-lab-report.json")!,
      SAMPLE_TIMESTAMP,
    ),
  );
  await getDriver().close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
