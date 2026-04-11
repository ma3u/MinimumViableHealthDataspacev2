import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface EEHRxFProfile {
  profileId: string;
  name: string;
  igName: string;
  igPackage: string;
  fhirVersion: string;
  status: string;
  url: string;
  baseResource: string;
  description: string;
  coverage: string;
  resourceCount: number;
}

interface EEHRxFCategory {
  categoryId: string;
  name: string;
  description: string;
  ehdsDeadline: string;
  ehdsGroup: number;
  status: string;
  totalResources: number;
  profileCount: number;
  profiles: EEHRxFProfile[];
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const [categories, profiles, resourceCounts] = await Promise.all([
    runQuery<{
      categoryId: string;
      name: string;
      description: string;
      ehdsDeadline: string;
      ehdsGroup: number;
      status: string;
      totalResources: number;
      profileCount: number;
    }>(
      `MATCH (c:EEHRxFCategory)
       RETURN c.categoryId AS categoryId,
              c.name AS name,
              c.description AS description,
              c.ehdsDeadline AS ehdsDeadline,
              c.ehdsGroup AS ehdsGroup,
              c.status AS status,
              coalesce(c.totalResources, 0) AS totalResources,
              coalesce(c.profileCount, 0) AS profileCount
       ORDER BY c.ehdsGroup, c.categoryId`,
    ),

    runQuery<{
      profileId: string;
      name: string;
      igName: string;
      igPackage: string;
      fhirVersion: string;
      status: string;
      url: string;
      baseResource: string;
      description: string;
      coverage: string;
      resourceCount: number;
      categoryId: string;
    }>(
      `MATCH (p:EEHRxFProfile)-[:PART_OF_CATEGORY]->(c:EEHRxFCategory)
       RETURN p.profileId AS profileId,
              p.name AS name,
              p.igName AS igName,
              coalesce(p.igPackage, '') AS igPackage,
              p.fhirVersion AS fhirVersion,
              p.status AS status,
              coalesce(p.url, '') AS url,
              p.baseResource AS baseResource,
              coalesce(p.description, '') AS description,
              coalesce(p.coverage, 'none') AS coverage,
              coalesce(p.resourceCount, 0) AS resourceCount,
              c.categoryId AS categoryId
       ORDER BY c.ehdsGroup, c.categoryId, p.profileId`,
    ),

    runQuery<{ label: string; count: number }>(
      `MATCH (p:Patient) WITH 'Patient' AS label, count(p) AS count RETURN label, count
       UNION ALL
       MATCH (e:Encounter) WITH 'Encounter' AS label, count(e) AS count RETURN label, count
       UNION ALL
       MATCH (o:Observation) WITH 'Observation' AS label, count(o) AS count RETURN label, count
       UNION ALL
       MATCH (mr:MedicationRequest) WITH 'MedicationRequest' AS label, count(mr) AS count RETURN label, count
       UNION ALL
       MATCH (pr:Procedure) WITH 'Procedure' AS label, count(pr) AS count RETURN label, count
       UNION ALL
       MATCH (c:Condition) WITH 'Condition' AS label, count(c) AS count RETURN label, count`,
    ),
  ]);

  // Build resource count map
  const countMap: Record<string, number> = {};
  for (const rc of resourceCounts) {
    countMap[rc.label] = rc.count;
  }

  // Group profiles by category
  const profilesByCategory: Record<string, EEHRxFProfile[]> = {};
  for (const p of profiles) {
    if (!profilesByCategory[p.categoryId]) {
      profilesByCategory[p.categoryId] = [];
    }
    profilesByCategory[p.categoryId].push({
      profileId: p.profileId,
      name: p.name,
      igName: p.igName,
      igPackage: p.igPackage,
      fhirVersion: p.fhirVersion,
      status: p.status,
      url: p.url,
      baseResource: p.baseResource,
      description: p.description,
      coverage: p.coverage,
      resourceCount: p.resourceCount,
    });
  }

  // Assemble categories with profiles
  const result: EEHRxFCategory[] = categories.map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    description: c.description,
    ehdsDeadline: c.ehdsDeadline,
    ehdsGroup: c.ehdsGroup,
    status: c.status,
    totalResources: c.totalResources,
    profileCount: c.profileCount,
    profiles: profilesByCategory[c.categoryId] ?? [],
  }));

  // Summary stats
  const totalProfiles = profiles.length;
  const coveredProfiles = profiles.filter(
    (p) => p.coverage === "full" || p.coverage === "partial",
  ).length;
  const coveragePercent =
    totalProfiles > 0 ? Math.round((coveredProfiles / totalProfiles) * 100) : 0;

  return NextResponse.json({
    categories: result,
    summary: {
      totalCategories: categories.length,
      totalProfiles,
      coveredProfiles,
      coveragePercent,
      resourceCounts: countMap,
    },
  });
}
