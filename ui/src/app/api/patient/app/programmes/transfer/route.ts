import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { appProgrammePatient } from "@/lib/patient/app-programme-patient";
import {
  parseTransferRequest,
  requestProgrammeTransfer,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * POST /api/patient/app/programmes/transfer  { programmeId, year }
 *
 * "Send my answer for <year>" from the Klarbefund app (ADR-080, decision 4,
 * second path; #934, step 4). The app's twin of
 * /api/patient/programmes/transfer: 202 under an open consent, 403 without
 * one, and after a withdrawal nothing is recorded (GDPR Art. 7(3)).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    programmeId?: unknown;
    year?: unknown;
  };
  const parsed = parseTransferRequest(body);
  if (parsed instanceof NextResponse) return parsed;
  const who = appProgrammePatient(auth.app);
  if (who instanceof NextResponse) return who;
  return requestProgrammeTransfer(
    who.patientId,
    parsed.programmeId,
    parsed.year,
  );
}
