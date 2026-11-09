import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  PROGRAMME_CONSENT_SOURCES,
  joinProgramme,
  resolveProgrammePatient,
  withdrawProgramme,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * Consent to one bonus program (#934, step 4; ADR-080, decision 6).
 *
 * POST   { programmeId, patientId?, source? } → join; idempotent while a
 *        consent is open. source is one of PROGRAMME_CONSENT_SOURCES
 *        (default "patient-portal").
 * DELETE ?programmeId=&patientId=     → withdraw; transfers stop at once
 *
 * A PATIENT acts on their own record; EDC_ADMIN names one. Separate from
 * study consent (/api/patient/research) and from the Art. 71 opt-out
 * (/api/patient/opt-out): joining never enrolls anyone in research.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    programmeId?: string;
    patientId?: string;
    source?: string;
  };
  const source = body.source ?? "patient-portal";
  if (!(PROGRAMME_CONSENT_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json(
      {
        error: `source must be one of ${PROGRAMME_CONSENT_SOURCES.join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (!body.programmeId) {
    return NextResponse.json(
      { error: "programmeId is required" },
      { status: 400 },
    );
  }
  const who = await resolveProgrammePatient(
    auth.session.roles,
    body.patientId ?? null,
  );
  if (who instanceof NextResponse) return who;
  return joinProgramme(
    who.patientId as string,
    body.programmeId,
    source as (typeof PROGRAMME_CONSENT_SOURCES)[number],
  );
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const programmeId = req.nextUrl.searchParams.get("programmeId");
  if (!programmeId) {
    return NextResponse.json(
      { error: "programmeId is required" },
      { status: 400 },
    );
  }
  const who = await resolveProgrammePatient(
    auth.session.roles,
    req.nextUrl.searchParams.get("patientId"),
  );
  if (who instanceof NextResponse) return who;
  return withdrawProgramme(who.patientId as string, programmeId);
}
