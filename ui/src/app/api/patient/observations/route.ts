import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { loadObservationBundle } from "@/lib/patient/observation-bundle";
import { ownPatientIdForSession } from "@/lib/overview/patient";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/observations?patientId=<id>[&code=<loinc>]
 *
 * Regulation (EU) 2025/327 Art. 3 (access to one's own electronic health
 * data) and Art. 14 (priority category: laboratory results). Returns the
 * patient's Observations as a FHIR R4 searchset Bundle, each with the
 * reference range the laboratory printed, grouped by nothing: one entry per
 * measurement, oldest first per code.
 *
 * Requires PATIENT or EDC_ADMIN. A PATIENT reads their own record only
 * (issue #271 M1); the demo users patient1 and patient2 own P1 and P2.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const code = url.searchParams.get("code");
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 },
    );
  }
  const { roles } = auth.session;
  if (roles.includes("PATIENT") && !roles.includes("EDC_ADMIN")) {
    // ownPatientIdForSession needs preferredUsername, which AuthSession does
    // not carry, so read the full session as well (as /api/patient does).
    const own = ownPatientIdForSession(await getServerSession(authOptions));
    if (!own || own !== patientId) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: "Art. 3: a patient reads their own record only",
        },
        { status: 403 },
      );
    }
  }

  try {
    const bundle = await loadObservationBundle(
      patientId,
      `${url.pathname}${url.search}`,
      code,
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
