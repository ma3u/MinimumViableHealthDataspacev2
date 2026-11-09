import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import type { BonusProgramme } from "@/lib/patient/bonus-programme";
import {
  PROGRAMME_CONSENTS_CYPHER,
  resolveProgrammePatient,
  type ProgrammeConsentRow,
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

  const programmes = await runQuery<BonusProgramme>(
    `MATCH (s:DataService:BonusProgramme)
     OPTIONAL MATCH (s)-[:PUBLISHED_BY]->(p:Participant)
     RETURN s.serviceId AS programmeId,
            s.title AS title,
            s.description AS description,
            coalesce(p.name, s.publisherName, s.publisherDid) AS publisherName,
            s.publisherDid AS publisherDid,
            p.dataSpace AS dataSpace,
            s.endpointUrl AS endpointUrl,
            s.ruleTitle AS ruleTitle,
            s.ruleDescription AS ruleDescription,
            s.ruleVersion AS ruleVersion,
            toString(s.lastSeenAt) AS lastSeenAt
     ORDER BY s.title`,
  );
  const consents = who.patientId
    ? await runQuery<ProgrammeConsentRow>(PROGRAMME_CONSENTS_CYPHER, {
        patientId: who.patientId,
      })
    : [];

  return NextResponse.json({
    programmes,
    consents,
    legalBasis:
      "Primary use the person directs, EHDS Art. 2(2)(d) and 7(3); explicit consent, GDPR Art. 9(2)(a) (ADR-080)",
  });
}
