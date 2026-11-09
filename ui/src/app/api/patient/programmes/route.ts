import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  listProgrammes,
  resolveProgrammePatient,
} from "@/lib/patient/programme-consent";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/programmes
 *
 * The bonus programmes the hub's catalogue crawler found in other data
 * spaces (#934, step 3): DCAT-AP dcat:DataService entries typed
 * ehds:BonusProgramme, written by the catalog enricher as
 * (:DataService:BonusProgramme). Today that is AlphaKasse DE's "Active year
 * bonus" in the insurance and wellbeing data space.
 *
 * A programme is primary, person-directed sharing (ADR-080): it receives a
 * yes or no per year, never the data behind it, under the person's own
 * consent (GDPR Art. 9(2)(a); EHDS Art. 2(2)(d) and 7(3)). It is neither
 * research nor the Art. 71 opt-out, so it is listed apart from both.
 *
 * Next to the offer, the person's own consents to programmes (step 4): every
 * join and withdrawal, newest first. A PATIENT sees their own; EDC_ADMIN
 * names a record with ?patientId= or gets none.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  const who = await resolveProgrammePatient(
    auth.session.roles,
    req.nextUrl.searchParams.get("patientId"),
    false,
  );
  if (who instanceof NextResponse) return who;

  return NextResponse.json(await listProgrammes(who.patientId));
}
