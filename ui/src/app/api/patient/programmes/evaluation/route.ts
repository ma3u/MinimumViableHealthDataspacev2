import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  evaluateProgrammeYear,
  parseEvaluationRequest,
  resolveProgrammePatient,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/programmes/evaluation?programmeId=&year=&patientId=
 *
 * The member's own result for one program year, worked out inside their
 * record before anything is sent (#934, step 6; ADR-080, decision 3;
 * ADR-087). An ended year answers goal met, yes or no, with the breakdown
 * for the member to read; a year not yet over says when it can be
 * evaluated. Nothing here is sent or stored. Without year, the year the
 * program's rule names. A PATIENT reads their own record; EDC_ADMIN names
 * one.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const parsed = parseEvaluationRequest(req.nextUrl.searchParams);
  if (parsed instanceof NextResponse) return parsed;
  const who = await resolveProgrammePatient(
    auth.session.roles,
    req.nextUrl.searchParams.get("patientId"),
  );
  if (who instanceof NextResponse) return who;
  return evaluateProgrammeYear(
    who.patientId as string,
    parsed.programmeId,
    parsed.year,
  );
}
