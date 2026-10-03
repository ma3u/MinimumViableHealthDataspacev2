import { NextResponse } from "next/server";
import { requireAppToken, isAppAuthError } from "@/lib/app-auth";
import { ownPatientIdForSession } from "@/lib/overview/patient";
import { loadObservationBundle } from "@/lib/patient/observation-bundle";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/app/record
 *
 * The connected patient's own record for the Klarbefund app (#473 phase 2,
 * EHDS Art. 3): their Observations as a FHIR R4 searchset Bundle, each with
 * the range the laboratory printed. The same Bundle the browser reads from
 * /api/patient/observations, so the two never disagree.
 *
 * App token and a connected device only (ADR-049). The record is the one the
 * login owns; there is no patientId parameter to try someone else's. Every
 * record on this hub is synthetic, and the Bundle's meta tag says so.
 */
export async function GET(request: Request) {
  const auth = await requireAppToken(request, { device: true });
  if (isAppAuthError(auth)) return auth;
  const patientId = ownPatientIdForSession({
    preferredUsername: auth.app.username,
  });
  if (!patientId) {
    return NextResponse.json(
      { error: "No record is assigned to this login" },
      { status: 404 },
    );
  }
  try {
    const bundle = await loadObservationBundle(
      patientId,
      new URL(request.url).pathname,
    );
    if (!bundle) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
