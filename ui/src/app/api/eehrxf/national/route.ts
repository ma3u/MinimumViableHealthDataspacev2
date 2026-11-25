import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/eehrxf/national: the German FHIR profiles of the MII
 * Kerndatensatz the hub validates its data against, with the result of the
 * HL7 FHIR Validator run and the EEHRxF profile each one corresponds to.
 *
 * Kept apart from GET /api/eehrxf on purpose (#1172): a German result is
 * never counted as EEHRxF coverage. The nodes come from
 * neo4j/register-national-profiles.cypher, which scripts/eehrxf/build.py
 * writes from the committed validation report.
 */

interface Counterpart {
  profileId: string;
  name: string;
}

interface NationalProfile {
  profileId: string;
  name: string;
  canonical: string;
  baseResource: string;
  tested: number;
  passed: number;
  failed: number;
  coverage: string;
  topIssues: string[];
  eehrxfCounterpart: Counterpart | null;
}

interface NationalGuide {
  guideId: string;
  name: string;
  publisher: string;
  igPackage: string;
  status: string;
  home: string;
  gate: boolean;
  checkedOn: string;
  profiles: NationalProfile[];
}

interface Row {
  guideId: string;
  guideName: string;
  publisher: string;
  igPackage: string;
  status: string;
  home: string;
  gate: boolean;
  checkedOn: string;
  profileId: string | null;
  name: string | null;
  canonical: string | null;
  baseResource: string | null;
  tested: number | null;
  passed: number | null;
  failed: number | null;
  coverage: string | null;
  topIssues: string[] | null;
  counterpartId: string | null;
  counterpartName: string | null;
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const rows = await runQuery<Row>(
    `MATCH (g:NationalProfileGuide)
     OPTIONAL MATCH (p:NationalProfile)-[:PUBLISHED_IN]->(g)
     OPTIONAL MATCH (p)-[:CORRESPONDS_TO]->(e:EEHRxFProfile)
     RETURN g.guideId AS guideId, g.name AS guideName, g.publisher AS publisher,
            g.igPackage AS igPackage, g.status AS status, g.home AS home,
            coalesce(g.gate, false) AS gate, g.checkedOn AS checkedOn,
            p.profileId AS profileId, p.name AS name, p.canonical AS canonical,
            p.baseResource AS baseResource, p.tested AS tested,
            p.passed AS passed, p.failed AS failed, p.coverage AS coverage,
            coalesce(p.topIssues, []) AS topIssues,
            e.profileId AS counterpartId, e.name AS counterpartName
     ORDER BY guideId, profileId`,
  );

  const guides = new Map<string, NationalGuide>();
  for (const r of rows) {
    let guide = guides.get(r.guideId);
    if (!guide) {
      guide = {
        guideId: r.guideId,
        name: r.guideName,
        publisher: r.publisher,
        igPackage: r.igPackage,
        status: r.status,
        home: r.home,
        gate: r.gate,
        checkedOn: r.checkedOn,
        profiles: [],
      };
      guides.set(r.guideId, guide);
    }
    if (r.profileId === null) continue;
    guide.profiles.push({
      profileId: r.profileId,
      name: r.name ?? r.profileId,
      canonical: r.canonical ?? "",
      baseResource: r.baseResource ?? "",
      tested: Number(r.tested ?? 0),
      passed: Number(r.passed ?? 0),
      failed: Number(r.failed ?? 0),
      coverage: r.coverage ?? "untested",
      topIssues: r.topIssues ?? [],
      eehrxfCounterpart:
        r.counterpartId !== null
          ? { profileId: r.counterpartId, name: r.counterpartName ?? "" }
          : null,
    });
  }

  const list = [...guides.values()];
  const profiles = list.flatMap((g) => g.profiles);
  const resourcesTested = profiles.reduce((n, p) => n + p.tested, 0);
  const resourcesPassed = profiles.reduce((n, p) => n + p.passed, 0);

  return NextResponse.json({
    guides: list,
    summary: {
      guides: list.length,
      profiles: profiles.length,
      resourcesTested,
      resourcesPassed,
      passRatePercent:
        resourcesTested > 0
          ? Math.round((100 * resourcesPassed) / resourcesTested)
          : 0,
    },
  });
}
