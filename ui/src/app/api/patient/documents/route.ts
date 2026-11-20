import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { documentScope, neo4jUnavailable } from "@/lib/fhir-documents/access";
import { documentIndex } from "@/lib/fhir-documents/document-index";
import { loadDocumentPatient, loadLabReports } from "@/lib/fhir-documents/load";

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
