import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  documentScope,
  fhirJson,
  neo4jUnavailable,
} from "@/lib/fhir-documents/access";
import {
  loadDocumentPatient,
  loadPatientSummaryInput,
} from "@/lib/fhir-documents/load";
import { buildPatientSummaryDocument } from "@/lib/fhir-documents/patient-summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/documents/patient-summary?patientId=<id>
 *
 * The record's Patient Summary as a FHIR R4 `document` Bundle (#1171), HL7
 * Europe Patient Summary 1.0.0-ballot: problems, allergies, medications,
 * immunisations and procedures from layer 3 of the graph. A section the
 * graph has nothing for is there, empty, with the reason. EHDS Art. 14(1)(a)
 * and the Art. 7 copy in the European exchange format.
 *
 * PATIENT (own record only, shown under their pseudonym) or EDC_ADMIN.
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
    const input = await loadPatientSummaryInput(scope.patientId);
    return fhirJson(
      buildPatientSummaryDocument(patient, input, {
        timestamp: new Date().toISOString(),
        identity: scope.identity,
      }),
    );
  } catch (err) {
    return neo4jUnavailable(err);
  }
}
