import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { appProgrammePatient } from "@/lib/patient/app-programme-patient";
import {
  evaluateProgrammeYear,
  parseEvaluationRequest,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app/programmes/evaluation?programmeId=&year=
 *
 * The Klarbefund app's twin of /api/patient/programmes/evaluation (#934,
 * step 6; ADR-087): the member's own result for one program year, shown on
 * the phone before anything is sent. The app's token and a connected
 * device are the gate (ADR-049), and the record is the login's own.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const parsed = parseEvaluationRequest(new URL(request.url).searchParams);
  if (parsed instanceof NextResponse) return parsed;
  const who = appProgrammePatient(auth.app);
  if (who instanceof NextResponse) return who;
  return evaluateProgrammeYear(who.patientId, parsed.programmeId, parsed.year);
}
