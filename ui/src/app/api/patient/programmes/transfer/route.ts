import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  PROGRAMME_CONSENT_BASIS,
  RECORD_TRANSFER_CYPHER,
  programmeTransferAllowed,
  resolveProgrammePatient,
  type ProgrammeTransferRow,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * POST /api/patient/programmes/transfer  { programmeId, year, patientId? }
 *
 * The person tells the hub to send a program their answer for one year
 * (ADR-080, decision 4, second path; #934, step 4). Only under an open
 * consent: without one, never joined or withdrawn, the answer is 403 and
 * nothing is recorded (GDPR Art. 7(3)). What goes out is the program, the
 * year and goal met, nothing else (decision 2); the hub computes goal met in
 * step 6, so until then the transfer is recorded as awaiting evaluation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const body = (await req.json().catch(() => ({}))) as {
    programmeId?: string;
    year?: number;
    patientId?: string;
  };
  const year = Number(body.year);
  if (
    !body.programmeId ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "programmeId and a calendar year are required" },
      { status: 400 },
    );
  }
  const who = await resolveProgrammePatient(
    auth.session.roles,
    body.patientId ?? null,
  );
  if (who instanceof NextResponse) return who;
  const patientId = who.patientId as string;

  const consentId = await programmeTransferAllowed(patientId, body.programmeId);
  if (!consentId) {
    return NextResponse.json(
      {
        error:
          "No open consent to this program: join it first. After a withdrawal nothing is sent.",
      },
      { status: 403 },
    );
  }
  const [transfer] = await runQuery<ProgrammeTransferRow>(
    RECORD_TRANSFER_CYPHER,
    {
      consentId,
      transferId: randomUUID(),
      patientId,
      programmeId: body.programmeId,
      year,
    },
  );
  return NextResponse.json(
    { transfer, legalBasis: PROGRAMME_CONSENT_BASIS },
    { status: 202 },
  );
}
