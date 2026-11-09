import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  parseTransferRequest,
  requestProgrammeTransfer,
  resolveProgrammePatient,
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
    programmeId?: unknown;
    year?: unknown;
    patientId?: string;
  };
  const parsed = parseTransferRequest(body);
  if (parsed instanceof NextResponse) return parsed;
  const who = await resolveProgrammePatient(
    auth.session.roles,
    body.patientId ?? null,
  );
  if (who instanceof NextResponse) return who;
  return requestProgrammeTransfer(
    who.patientId as string,
    parsed.programmeId,
    parsed.year,
  );
}
