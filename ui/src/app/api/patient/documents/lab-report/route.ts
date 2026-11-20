import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  documentScope,
  fhirJson,
  neo4jUnavailable,
} from "@/lib/fhir-documents/access";
import { buildLabReportDocument } from "@/lib/fhir-documents/lab-report";
import { loadDocumentPatient, loadLabReports } from "@/lib/fhir-documents/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/documents/lab-report?patientId=<id>[&reportId=<id>]
 *
 * One laboratory report as a FHIR R4 `document` Bundle (#1171), HL7 Europe
 * Laboratory Report 2.1.0: Composition, DiagnosticReport, its Observations,
 * the performing laboratory and a Provenance; a value the Klarbefund app read
 * off paper keeps the page and line it came from. Without `reportId`, the
 * newest report. `/api/patient/documents` lists the report ids. EHDS
 * Art. 14(1)(e).
 *
 * PATIENT (own record only, shown under their pseudonym) or EDC_ADMIN.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const url = new URL(req.url);
  const scope = await documentScope(auth.session.roles, url);
  if (scope instanceof NextResponse) return scope;
  const reportId = url.searchParams.get("reportId");
  try {
    const patient = await loadDocumentPatient(scope.patientId);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    const reports = await loadLabReports(scope.patientId);
    const report = reportId
      ? reports.find((r) => r.reportId === reportId)
      : reports[0];
    if (!report) {
      return NextResponse.json(
        { error: "Not found", reason: "no such laboratory report" },
        { status: 404 },
      );
    }
    return fhirJson(
      buildLabReportDocument(patient, report, {
        timestamp: new Date().toISOString(),
        identity: scope.identity,
      }),
    );
  } catch (err) {
    return neo4jUnavailable(err);
  }
}
