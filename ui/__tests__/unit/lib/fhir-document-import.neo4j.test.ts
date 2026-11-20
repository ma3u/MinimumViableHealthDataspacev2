/**
 * Importing FHIR documents into a real graph (#1173), inside one transaction
 * that is rolled back, so the graph is left as it was.
 *
 * Skipped unless FHIR_IMPORT_IT_BOLT points at a seeded Neo4j (P1 and P2 of
 * neo4j/seed-patient-overview.cypher, at least one opted-out patient):
 *
 *   FHIR_IMPORT_IT_BOLT=bolt://localhost:7687 npx vitest run __tests__/unit/lib/fhir-document-import.neo4j.test.ts
 */
import neo4j, { type Transaction } from "neo4j-driver";
import { readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLabReportDocument } from "@/lib/fhir-documents/lab-report";
import { buildPatientSummaryDocument } from "@/lib/fhir-documents/patient-summary";
import { parseDocument } from "@/lib/fhir-documents/import";
import {
  loadDocumentPatient,
  loadLabReports,
  loadPatientSummaryInput,
} from "@/lib/fhir-documents/load";
import { foreignNodes, storeDocument } from "@/lib/fhir-documents/store";
import { OPT_OUT_CYPHER, PERSON_LABELS } from "@/lib/opt-out";
import type { DocumentPatient, Run } from "@/lib/fhir-documents/shared";
import { omopTransformStatements } from "../../fixtures/omop-transform";

const BOLT = process.env.FHIR_IMPORT_IT_BOLT;
const T = "2026-11-20T09:00:00Z";
const IDENTIFIED = { kind: "identified" as const };
const ADMIN = { role: "EDC_ADMIN" as const, id: "did:web:ci.test:it" };
const LAB = JSON.parse(
  readFileSync(
    path.join(
      __dirname,
      "fixtures/fhir-documents/hl7-eu-lab-simple-chemistry.json",
    ),
    "utf8",
  ),
);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe.skipIf(!BOLT)("importing FHIR documents into the graph", () => {
  const driver = neo4j.driver(
    BOLT ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
    { disableLosslessIntegers: true },
  );
  const session = driver.session();
  let tx: Transaction;
  const run: Run = async <R>(q: string, p: Record<string, unknown>) =>
    (await tx.run(q, p)).records.map((r) => r.toObject() as R);
  const one = async (q: string, p: Record<string, unknown> = {}) =>
    (await tx.run(q, p)).records[0]?.get(0);
  let p1: DocumentPatient;

  beforeAll(async () => {
    tx = session.beginTransaction();
    p1 = (await loadDocumentPatient("P1", run))!;
  });

  afterAll(async () => {
    await tx.rollback();
    await session.close();
    await driver.close();
  });

  it("round trip: P1's newest lab report, imported and exported again, is the same document", async () => {
    const [report] = await loadLabReports("P1", run);
    const exported = buildLabReportDocument(p1, report, {
      timestamp: T,
      identity: IDENTIFIED,
    });
    const parsed = parseDocument(clone(exported), "P1");
    expect(await foreignNodes("P1", parsed.graphIds, run)).toEqual([]);
    const stored = await storeDocument(
      "P1",
      parsed,
      JSON.stringify(exported),
      ADMIN,
      run,
    );
    // The values were the record's already: linked, not written again.
    expect(stored!.created.observations).toBe(0);
    expect(stored!.linked.observations).toBe(report.results.length);
    expect(stored!.created.reports).toBe(1);

    const again = (await loadLabReports("P1", run)).find(
      (r) => r.reportId === report.reportId,
    )!;
    expect(
      buildLabReportDocument(p1, again, { timestamp: T, identity: IDENTIFIED }),
    ).toEqual(exported);
  });

  it("round trip: P1's Patient Summary comes back the same, with nothing written twice", async () => {
    const input = await loadPatientSummaryInput("P1", run);
    const exported = buildPatientSummaryDocument(p1, input, {
      timestamp: T,
      identity: IDENTIFIED,
    });
    const stored = await storeDocument(
      "P1",
      parseDocument(clone(exported), "P1"),
      JSON.stringify(exported),
      ADMIN,
      run,
    );
    expect(Object.values(stored!.created).every((n) => n === 0)).toBe(true);
    const after = await loadPatientSummaryInput("P1", run);
    expect(
      buildPatientSummaryDocument(p1, after, {
        timestamp: T,
        identity: IDENTIFIED,
      }),
    ).toEqual(exported);
  });

  it("an HL7 Europe lab report becomes a report with its Observations and a Provenance naming the source", async () => {
    const raw = JSON.stringify(LAB);
    const first = await storeDocument(
      "P1",
      parseDocument(LAB, "P1"),
      raw,
      ADMIN,
      run,
    );
    expect(first!.created).toMatchObject({ reports: 1, observations: 2 });
    const coded = await one(
      `MATCH (:Provenance {provenanceId: $id})-[:TARGET]->(o:Observation)-[:CODED_BY]->(l:LoincCode)
       RETURN count(DISTINCT o)`,
      { id: first!.provenanceId },
    );
    expect(coded).toBe(2);
    const source = await one(
      `MATCH (:Provenance {provenanceId: $id})-[:SOURCE]->(d:DocumentReference)
       RETURN d {.identifierValue, .custodian, .contentSha256, .content}`,
      { id: first!.provenanceId },
    );
    expect(source.identifierValue).toBe("8ccab76a-82ed-403e-b974-6b28022b0997");
    expect(source.custodian).toMatch(/fictional/);
    expect(source.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // The content names the patient; the graph keeps its hash only.
    expect(source.content).toBeNull();

    // The same document again: nothing new, two imports, two Provenance.
    const second = await storeDocument(
      "P1",
      parseDocument(LAB, "P1"),
      raw,
      ADMIN,
      run,
    );
    expect(Object.values(second!.created).every((n) => n === 0)).toBe(true);
    expect(second!.imports).toBe(2);
    expect(
      await one(
        `MATCH (d:DocumentReference {documentId: $doc})<-[:SOURCE]-(pv:Provenance)
         RETURN count(pv)`,
        { doc: second!.documentId },
      ),
    ).toBe(2);
  });

  it("refuses a document naming another record's entries", async () => {
    const [p2report] = await loadLabReports("P2", run);
    const p2 = (await loadDocumentPatient("P2", run))!;
    const theirs = buildLabReportDocument(p2, p2report, {
      timestamp: T,
      identity: IDENTIFIED,
    });
    const parsed = parseDocument(theirs, "P1");
    expect(await foreignNodes("P1", parsed.graphIds, run)).not.toEqual([]);
  });

  it("keeps an opted-out person out of secondary use (ADR-062)", async () => {
    // P2 opts out, with the hub's own statement, inside the transaction.
    await tx.run(OPT_OUT_CYPHER, {
      patientId: "P2",
      personLabels: [...PERSON_LABELS],
      source: "test",
    });
    const optedOut = "P2";
    const stored = await storeDocument(
      optedOut,
      parseDocument(LAB, optedOut),
      JSON.stringify(LAB),
      ADMIN,
      run,
    );
    const labels = await one(
      `MATCH (:Provenance {provenanceId: $id})-[:TARGET]->(n)
       RETURN collect(DISTINCT n:OptedOut)`,
      { id: stored!.provenanceId },
    );
    expect(labels).toEqual([true]);
  });

  it("reaches OMOP through neo4j/fhir-to-omop-transform.cypher, unchanged", async () => {
    // The graph as the seeds left it: P1 is keyed by resourceId only and has
    // a Neo4j date of birth, which the transform reads as they are.
    for (const statement of omopTransformStatements()) await tx.run(statement);
    const mapped = await one(
      `MATCH (p:Patient)-[:HAS_OBSERVATION]->(o:Observation {imported: true})-[:MAPPED_TO]->(om:OMOPMeasurement)
       WHERE coalesce(p.id, p.resourceId) = 'P1'
       RETURN count(DISTINCT om)`,
    );
    expect(mapped).toBe(2);
  });
});
