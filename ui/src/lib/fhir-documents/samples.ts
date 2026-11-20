import { buildLabReportDocument, type LabReportInput } from "./lab-report";
import {
  buildPatientSummaryDocument,
  type PatientSummaryInput,
} from "./patient-summary";
import type { DocumentBundle, DocumentPatient, IdentityView } from "./shared";

/**
 * The documents scripts/eehrxf/validate.py validates (#1171): graph rows of
 * a few seeded patients, kept in scripts/eehrxf/samples/documents/graph-rows.json
 * with the document each one gives. ui/scripts/export-fhir-document-samples.ts
 * reads the rows from a running graph and writes both; the unit test
 * fhir-documents.test.ts rebuilds every document from its rows and fails when
 * the committed one differs, so a change to a builder cannot leave the
 * validated samples behind.
 */

export const SAMPLE_TIMESTAMP = "2026-11-20T09:00:00Z";

export type DocumentSample =
  | {
      file: string;
      kind: "patient-summary";
      identity: IdentityView;
      patient: DocumentPatient;
      input: PatientSummaryInput;
    }
  | {
      file: string;
      kind: "lab-report";
      identity: IdentityView;
      patient: DocumentPatient;
      report: LabReportInput;
    };

export interface SampleSet {
  $comment: string;
  timestamp: string;
  samples: DocumentSample[];
}

export function buildSample(
  sample: DocumentSample,
  timestamp: string,
): DocumentBundle {
  const options = { timestamp, identity: sample.identity };
  return sample.kind === "patient-summary"
    ? buildPatientSummaryDocument(sample.patient, sample.input, options)
    : buildLabReportDocument(sample.patient, sample.report, options);
}

/** A document as the file holds it: JSON indented by one space, a final newline. */
export function sampleText(bundle: DocumentBundle): string {
  return `${JSON.stringify(bundle, null, 1)}\n`;
}
