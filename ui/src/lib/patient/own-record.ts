import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ownPatientIdForSession } from "@/lib/overview/patient";

/** True for a session that is a patient and nothing broader. */
export function isPatientOnly(roles: readonly string[]): boolean {
  return roles.includes("PATIENT") && !roles.includes("EDC_ADMIN");
}

/**
 * A patient reads and changes their own record only (EHDS Art. 3, GDPR
 * Art. 15; #271 for observations, #475 for the rest).
 *
 * Returns a 403 to send back when a PATIENT names a record that is not theirs,
 * or null when the call may go on. Any other role passes: what it may see is
 * decided by the route's own role gate.
 */
export async function refuseForeignRecord(
  roles: readonly string[],
  patientId: string | null,
): Promise<NextResponse | null> {
  if (!isPatientOnly(roles)) return null;
  const own = ownPatientIdForSession(await getServerSession(authOptions));
  if (own && patientId === own) return null;
  return NextResponse.json(
    {
      error: "Forbidden",
      reason: "Art. 3: a patient reads their own record only",
    },
    { status: 403 },
  );
}

/** The record a patient-only session owns, or null. */
export async function ownRecordId(): Promise<string | null> {
  return ownPatientIdForSession(await getServerSession(authOptions));
}
