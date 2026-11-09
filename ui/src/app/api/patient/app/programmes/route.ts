import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { appProgrammePatient } from "@/lib/patient/app-programme-patient";
import { listProgrammes } from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app/programmes
 *
 * The bonus programs on offer and the person's own consents to them, for
 * the Klarbefund app (#934, step 4; ADR-080, decision 6). The same answer
 * as /api/patient/programmes, from the same queries; this route only swaps
 * the browser session for the app's token and a connected device (ADR-049).
 * The record is the one the login owns.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const who = appProgrammePatient(auth.app);
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await listProgrammes(who.patientId));
}
