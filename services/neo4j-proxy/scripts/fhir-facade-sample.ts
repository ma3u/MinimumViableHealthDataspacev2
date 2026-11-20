/**
 * The sample of what the FHIR facade serves (#1144), built from fixed graph
 * rows (scripts/eehrxf/samples/facade/graph-rows.json) by the mapper the
 * routes use. scripts/eehrxf/validate.py validates its entries as the source
 * `facade`; __tests__/fhir-facade-sample.test.ts keeps the committed sample
 * equal to what this builds, so a change to the mapper without a new
 * validation run fails a test.
 */
import { fhirIdOf, toFhirEntry, toFhirResource } from "../src/fhir-resource.js";

type Props = Record<string, unknown>;

export interface GraphRows {
  $comment?: string;
  patients: Array<{
    patient: Props;
    records: Array<{ type: string; properties: Props }>;
  }>;
}

/** The base the data plane calls the facade at on compose. */
export const SAMPLE_BASE = "http://neo4j-proxy:9090/fhir";

/** A collection Bundle of every resource the rows give, patient by patient. */
export function facadeSample(rows: GraphRows) {
  const entry = rows.patients.flatMap(({ patient, records }) => {
    const pid = fhirIdOf(patient);
    return [
      toFhirEntry(toFhirResource("Patient", patient), SAMPLE_BASE),
      ...records.map((r) =>
        toFhirEntry(toFhirResource(r.type, r.properties, pid), SAMPLE_BASE),
      ),
    ];
  });
  return {
    resourceType: "Bundle",
    type: "collection",
    entry,
  };
}

/** The file as written: two-space JSON with a final newline. */
export function sampleText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
