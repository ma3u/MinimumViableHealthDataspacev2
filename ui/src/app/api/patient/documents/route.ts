import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { documentScope, neo4jUnavailable } from "@/lib/fhir-documents/access";
import { documentIndex } from "@/lib/fhir-documents/document-index";
import { documentProblems } from "@/lib/fhir-documents/document-shape";
import {
  DocumentRefusedError,
  parseDocument,
  type ParsedDocument,
} from "@/lib/fhir-documents/import";
import { importerFor } from "@/lib/fhir-documents/import-access";
import { loadDocumentPatient, loadLabReports } from "@/lib/fhir-documents/load";
import { foreignNodes, storeDocument } from "@/lib/fhir-documents/store";
import {
  ValidatorUnavailableError,
  validateDocument,
} from "@/lib/fhir-documents/validator";
import {
  recordRecordEvent,
  recordRecordEventAfter,
  type RecordAuditRecord,
} from "@/lib/record-audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/documents?patientId=<id>
 *
 * The FHIR documents one record yields (#1171, EHDS Art. 7 and Art. 14): its
 * Patient Summary and one laboratory report per report in the graph, each
 * with the profile it validates against and the address to fetch it from.
 * The documents themselves are built from the graph on request; no FHIR
 * server holds them (discussion #1169).
 *
 * PATIENT (own record only) or EDC_ADMIN.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const scope = await documentScope(auth.session.roles, new URL(req.url));
  if (scope instanceof NextResponse) return scope;
  try {
    const patient = await loadDocumentPatient(scope.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    const reports = await loadLabReports(scope.patientId);
    return NextResponse.json(documentIndex(scope.patientId, reports));
  } catch (err) {
    return neo4jUnavailable(err);
  }
}

/** A Patient Summary of a long life is large; a megabyte or two at most. */
const MAX_DOCUMENT_BYTES = 5_000_000;

/**
 * POST /api/patient/documents?patientId=<id>
 *
 * Reads a FHIR document into the record (#1173, EHDS Art. 15(4)): a
 * laboratory report (HL7 Europe Laboratory Report 2.1.0) or a Patient
 * Summary (HL7 Europe Patient Summary 1.0.0-ballot), from another EEHRxF
 * system or an ePA, as layer 3 nodes with their Provenance.
 *
 * In order: the document's shape (a document Bundle, Composition first,
 * every reference inside it), then the HL7 validator against the document's
 * profile (`FHIR_VALIDATOR_URL`; none configured is 503, never a pass), then
 * the record (a document naming another person's record or nodes is 409),
 * then the audit trail (fail closed, ADR-045), then one `MERGE` statement.
 * Importing the same document again writes nothing new; its DocumentReference
 * counts the imports and each gets its own Provenance. Every import, taken or
 * refused, is an event on the audit trail's record chain.
 *
 * PATIENT (own record), DATA_HOLDER (a patient it treats) or EDC_ADMIN.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(["PATIENT", "DATA_HOLDER", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  let importer;
  try {
    if (!(await loadDocumentPatient(patientId))) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    importer = await importerFor(auth.session, patientId);
  } catch (err) {
    return neo4jUnavailable(err);
  }
  if (importer instanceof NextResponse) return importer;

  const raw = await req.text();
  if (raw.length > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: "Too large", reason: "at most 5 MB per document" },
      { status: 413 },
    );
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Bad request", reason: "the body is not JSON" },
      { status: 400 },
    );
  }

  const event = (
    outcome: RecordAuditRecord["outcome"],
    extra: Partial<RecordAuditRecord> = {},
  ): RecordAuditRecord => ({
    event: "document-import",
    outcome,
    patientId,
    actorId: importer.id,
    actorRole: importer.role,
    ...extra,
  });
  const refuse = async (
    status: number,
    error: string,
    details: Record<string, unknown>,
    documentId?: string,
  ) => {
    await recordRecordEventAfter(
      event("refused", {
        reason: error,
        ...(documentId ? { documentId } : {}),
      }),
    );
    return NextResponse.json({ error, ...details }, { status });
  };

  let parsed: ParsedDocument;
  try {
    const problems = documentProblems(bundle);
    if (problems.length) {
      throw new DocumentRefusedError(
        "not a FHIR document Bundle",
        422,
        problems,
      );
    }
    parsed = parseDocument(bundle, patientId);
  } catch (err) {
    if (!(err instanceof DocumentRefusedError)) throw err;
    return refuse(err.status, err.message, { problems: err.problems });
  }
  const { documentId, typeCode } = parsed.meta;
  if (parsed.patientRecordId && parsed.patientRecordId !== patientId) {
    return refuse(
      409,
      "the document is about another record; two persons' records are never merged",
      { documentRecord: parsed.patientRecordId },
      documentId,
    );
  }

  let validation;
  try {
    validation = await validateDocument(bundle, parsed.profile);
  } catch (err) {
    if (!(err instanceof ValidatorUnavailableError)) throw err;
    await recordRecordEventAfter(
      event("failure", { reason: err.message, documentId }),
    );
    return NextResponse.json(
      { error: "The document could not be validated", reason: err.message },
      { status: 503 },
    );
  }
  if (!validation.valid) {
    return refuse(
      422,
      `the document does not validate against ${parsed.profile}`,
      { issues: validation.issues },
      documentId,
    );
  }

  try {
    const foreign = await foreignNodes(patientId, parsed.graphIds);
    if (foreign.length) {
      return refuse(
        409,
        "the document names entries of another record",
        { entries: foreign },
        documentId,
      );
    }
  } catch (err) {
    return neo4jUnavailable(err);
  }

  try {
    await recordRecordEvent(
      event("success", { documentId, documentType: typeCode }),
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Audit trail unavailable",
        reason: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
  try {
    const stored = await storeDocument(patientId, parsed, raw, importer);
    if (!stored) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        ...stored,
        kind: parsed.kind,
        profile: parsed.profile,
        skipped: parsed.skipped,
      },
      { status: 201 },
    );
  } catch (err) {
    await recordRecordEventAfter(
      event("failure", {
        reason: "the graph did not take the document",
        documentId,
      }),
    );
    return neo4jUnavailable(err);
  }
}
