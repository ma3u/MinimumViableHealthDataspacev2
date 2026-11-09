import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface BonusProgramme {
  programmeId: string;
  title: string;
  description: string | null;
  publisherName: string;
  publisherDid: string;
  dataSpace: string | null;
  endpointUrl: string | null;
  ruleTitle: string | null;
  ruleDescription: string | null;
  ruleVersion: string | null;
  lastSeenAt: string | null;
}

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
 * research nor the Art. 71 opt-out, so it is listed apart from both. Joining
 * comes with step 4; this route only lists what is on offer, the same for
 * every patient, so it takes no patientId.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth(["PATIENT", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;

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

  return NextResponse.json({
    programmes,
    legalBasis:
      "Primary use the person directs, EHDS Art. 2(2)(d) and 7(3); explicit consent, GDPR Art. 9(2)(a) (ADR-080)",
  });
}
