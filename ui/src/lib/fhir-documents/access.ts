import { NextResponse } from "next/server";
import { refuseForeignRecord } from "@/lib/patient/own-record";
import { patientPseudonym, seesPatientIdentity } from "@/lib/patient-identity";
import type { IdentityView } from "./shared";

/**
 * Who may read a person's FHIR documents (#1171), and as whom the patient
 * appears in them.
 *
 * Primary use (EHDS Art. 3, Art. 7 portability), by the rules the record's
 * other routes keep (`/api/patient/profile`, `/api/patient/observations`):
 * the person, for their own record only (`refuseForeignRecord`), and the
 * operator (`EDC_ADMIN`); each route says so in its own
 * `requireAuth(["PATIENT", "EDC_ADMIN"])`, where the API spec check reads it.
 * Every other role gets 403; a researcher, an access body or a trust centre
 * works on secondary-use data, through the proxy, which drops every Art. 71
 * opt-out (ADR-062). A document names the patient only for a role that sees
 * identity (`seesPatientIdentity()`); the patient's own copy carries their
 * pseudonym, as every screen of the demo does (`ownRecordView()`).
 */

export interface DocumentScope {
  patientId: string;
  identity: IdentityView;
}

/**
 * The record a request names and how its patient is shown, for a session
 * `requireAuth()` admitted. A 400 without `patientId`, a 403
 * for a patient naming someone else's record.
 */
export async function documentScope(
  roles: readonly string[],
  url: URL,
): Promise<DocumentScope | NextResponse> {
  const patientId = url.searchParams.get("patientId");
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  const foreign = await refuseForeignRecord(roles, patientId);
  if (foreign) return foreign;
  return {
    patientId,
    identity: seesPatientIdentity(roles)
      ? { kind: "identified" }
      : { kind: "pseudonymous", pseudonym: patientPseudonym(patientId) },
  };
}

/** FHIR's own media type, so a FHIR client reads the answer as FHIR. */
export function fhirJson(body: unknown): NextResponse {
  return NextResponse.json(body, {
    headers: { "Content-Type": "application/fhir+json; charset=utf-8" },
  });
}

export function neo4jUnavailable(err: unknown): NextResponse {
  return NextResponse.json(
    {
      error: "Neo4j unavailable",
      detail: err instanceof Error ? err.message : String(err),
    },
    { status: 502 },
  );
}
