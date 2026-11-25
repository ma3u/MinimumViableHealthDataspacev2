import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * The EEHRxF priority categories (EHDS Art. 14(1)), the HL7 Europe profiles
 * the hub tracks, and how the hub's FHIR resources fare against them (#1144).
 *
 * `coverage` is a validation result, written by scripts/eehrxf/build.py from
 * the HL7 FHIR Validator's report: full = every tested resource passes,
 * partial = some do, none = none do, untested = the hub ingests nothing of
 * that type. It is readiness evidence against the guides, not EHDS
 * conformity. `resourceCount` is the number of graph nodes of the base type,
 * shown for context only.
 */

interface EEHRxFProfile {
  profileId: string;
  name: string;
  igName: string;
  igPackage: string;
  fhirVersion: string;
  status: string;
  canonical: string;
  url: string;
  baseResource: string;
  coverage: string;
  tested: number;
  passed: number;
  failed: number;
  topIssues: string[];
  /** Reference examples (scripts/eehrxf/reference_examples.py): shown, never counted. */
  referenceTested: number;
  referencePassed: number;
  resourceCount: number;
}

interface EEHRxFCategory {
  categoryId: string;
  name: string;
  article: string;
  annex: string;
  description: string;
  ehdsDeadline: string;
  ehdsGroup: number;
  status: string;
  totalResources: number;
  profileCount: number;
  tested: number;
  passed: number;
  profiles: EEHRxFProfile[];
}

interface PlannedGuide {
  guideId: string;
  name: string;
  igPackage: string;
  status: string;
  url: string;
  issue: number | null;
  scope: string;
}

// The Commission implementing act that lays down the EEHRxF (#1205).
interface ImplementingAct {
  reference: string;
  title: string;
  status: string;
  legalBasis: string;
  fhirVersion: string;
  feedbackFrom: string;
  feedbackUntil: string;
  implementationGuideDue: string;
  url: string;
  actUrl: string;
  annexUrl: string;
}

interface ValidationRun {
  validatorVersion: string;
  terminology: string;
  passRule: string;
  maxPerSource: number;
  igs: string[];
  igUrls: string[];
  validatorUrl: string;
  sources: string[];
  inputsDigest: string;
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const [categories, profiles, runs, planned, resourceCounts, acts] =
    await Promise.all([
      runQuery<Omit<EEHRxFCategory, "profiles">>(
        `MATCH (c:EEHRxFCategory) WHERE c.categoryId IS NOT NULL
       RETURN c.categoryId AS categoryId,
              c.name AS name,
              coalesce(c.article, '') AS article,
              coalesce(c.annex, '') AS annex,
              c.description AS description,
              c.ehdsDeadline AS ehdsDeadline,
              c.ehdsGroup AS ehdsGroup,
              c.status AS status,
              coalesce(c.totalResources, 0) AS totalResources,
              coalesce(c.profileCount, 0) AS profileCount,
              coalesce(c.tested, 0) AS tested,
              coalesce(c.passed, 0) AS passed
       ORDER BY c.ehdsGroup, c.categoryId`,
      ),

      runQuery<EEHRxFProfile & { categoryId: string }>(
        `MATCH (p:EEHRxFProfile)-[:PART_OF_CATEGORY]->(c:EEHRxFCategory)
       WHERE p.profileId IS NOT NULL
       RETURN p.profileId AS profileId,
              p.name AS name,
              p.igName AS igName,
              coalesce(p.igPackage, '') AS igPackage,
              p.fhirVersion AS fhirVersion,
              p.status AS status,
              coalesce(p.canonical, '') AS canonical,
              coalesce(p.url, '') AS url,
              p.baseResource AS baseResource,
              coalesce(p.coverage, 'untested') AS coverage,
              coalesce(p.tested, 0) AS tested,
              coalesce(p.passed, 0) AS passed,
              coalesce(p.failed, 0) AS failed,
              coalesce(p.topIssues, []) AS topIssues,
              coalesce(p.referenceTested, 0) AS referenceTested,
              coalesce(p.referencePassed, 0) AS referencePassed,
              coalesce(p.resourceCount, 0) AS resourceCount,
              c.categoryId AS categoryId
       ORDER BY c.ehdsGroup, c.categoryId, p.profileId`,
      ),

      runQuery<ValidationRun>(
        `MATCH (v:EEHRxFValidationRun {runId: 'current'})
       RETURN v.validatorVersion AS validatorVersion,
              v.terminology AS terminology,
              v.passRule AS passRule,
              v.maxPerSource AS maxPerSource,
              v.igs AS igs,
              coalesce(v.igUrls, []) AS igUrls,
              coalesce(v.validatorUrl, '') AS validatorUrl,
              v.sources AS sources,
              v.inputsDigest AS inputsDigest`,
      ),

      // HL7 Europe drafts the hub plans to track, not validated yet (#1145).
      runQuery<PlannedGuide>(
        `MATCH (g:EEHRxFPlannedGuide)
       RETURN g.guideId AS guideId,
              g.name AS name,
              g.igPackage AS igPackage,
              g.status AS status,
              g.url AS url,
              g.issue AS issue,
              g.scope AS scope
       ORDER BY g.guideId`,
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

      runQuery<ImplementingAct>(
        `MATCH (a:EEHRxFImplementingAct)
       RETURN a.reference AS reference,
              a.title AS title,
              a.status AS status,
              a.legalBasis AS legalBasis,
              a.fhirVersion AS fhirVersion,
              a.feedbackFrom AS feedbackFrom,
              a.feedbackUntil AS feedbackUntil,
              a.implementationGuideDue AS implementationGuideDue,
              a.url AS url,
              a.actUrl AS actUrl,
              a.annexUrl AS annexUrl
       ORDER BY a.reference
       LIMIT 1`,
      ),
    ]);

  const countMap: Record<string, number> = {};
  for (const rc of resourceCounts) {
    countMap[rc.label] = rc.count;
  }

  const profilesByCategory: Record<string, EEHRxFProfile[]> = {};
  const distinct = new Map<string, EEHRxFProfile>();
  for (const { categoryId, ...p } of profiles) {
    (profilesByCategory[categoryId] ??= []).push(p);
    distinct.set(p.profileId, p);
  }

  const result: EEHRxFCategory[] = categories.map((c) => ({
    ...c,
    profiles: profilesByCategory[c.categoryId] ?? [],
  }));

  // A profile belongs to up to three categories; count each once.
  const unique = [...distinct.values()];
  const resourcesTested = unique.reduce((n, p) => n + p.tested, 0);
  const resourcesPassed = unique.reduce((n, p) => n + p.passed, 0);

  return NextResponse.json({
    categories: result,
    summary: {
      totalCategories: categories.length,
      totalProfiles: unique.length,
      testedProfiles: unique.filter((p) => p.tested > 0).length,
      passingProfiles: unique.filter((p) => p.coverage === "full").length,
      resourcesTested,
      resourcesPassed,
      passRatePercent:
        resourcesTested > 0
          ? Math.round((resourcesPassed / resourcesTested) * 100)
          : 0,
      resourceCounts: countMap,
    },
    validation: runs[0] ?? null,
    planned,
    implementingAct: acts[0] ?? null,
  });
}
