import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { appProgrammePatient } from "@/lib/patient/app-programme-patient";
import {
  joinProgramme,
  withdrawProgramme,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * Consent to one bonus program from the Klarbefund app (#934, step 4;
 * ADR-080, decision 6). The app's twin of /api/patient/programmes/consent.
 *
 * POST   { programmeId } → join (201); recorded with source "klarbefund"
 * DELETE ?programmeId=   → withdraw (200); transfers stop at once
 *
 * The app token and a connected device are the gate (ADR-049), and the
 * record is the login's own. Separate from study consent and from the
 * Art. 71 opt-out, exactly as on the portal.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    programmeId?: unknown;
  };
  if (typeof body.programmeId !== "string" || !body.programmeId) {
    return NextResponse.json(
      { error: "programmeId is required" },
      { status: 400 },
    );
  }
  const who = appProgrammePatient(auth.app);
  if (who instanceof NextResponse) return who;
  return joinProgramme(who.patientId, body.programmeId, "klarbefund");
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const programmeId = new URL(request.url).searchParams.get("programmeId");
  if (!programmeId) {
    return NextResponse.json(
      { error: "programmeId is required" },
      { status: 400 },
    );
  }
  const who = appProgrammePatient(auth.app);
  if (who instanceof NextResponse) return who;
  return withdrawProgramme(who.patientId, programmeId);
}
