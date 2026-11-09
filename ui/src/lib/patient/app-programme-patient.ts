import { NextResponse } from "next/server";
import type { AppIdentity } from "@/lib/app-auth";
import { ownPatientIdForSession } from "@/lib/overview/patient";

/**
 * The record a Klarbefund programme route acts on: the one the app's login
 * owns, and no other (#934, step 4). There is no patientId parameter, as on
 * /api/patient/app/record, so the phone cannot name someone else's record.
 */
export function appProgrammePatient(
  app: AppIdentity,
): { patientId: string } | NextResponse {
  const patientId = ownPatientIdForSession({
    preferredUsername: app.username,
  });
  if (!patientId) {
    return NextResponse.json(
      { error: "No record is assigned to this login" },
      { status: 404 },
    );
  }
  return { patientId };
}
