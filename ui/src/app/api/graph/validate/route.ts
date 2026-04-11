import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { LABEL_LAYER } from "@/lib/graph-constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/graph/validate
 *
 * Validates the Neo4j knowledge graph and returns a structured report:
 *
 *  nodeCounts    — count of nodes per label
 *  edgeCounts    — count of edges per relationship type
 *  orphans       — nodes with no relationships at all
 *  missingProps  — nodes missing required identifying properties
 *  unknownLabels — labels present in Neo4j but not in LABEL_LAYER mapping
 *  edgeRules     — edge type validation against allowed source→target pairs
 *  summary       — { totalNodes, totalEdges, issueCount }
 */

// Required identifying property per node label.
// A node is flagged if ALL listed properties are null/missing.
const REQUIRED_PROPS: Record<string, string[]> = {
  Participant: ["participantId", "name"],
  DataProduct: ["productId", "name"],
  Contract: ["contractId"],
  HDABApproval: ["approvalId"],
  HealthDataset: ["datasetId", "title"],
  Patient: ["resourceId"],
  Condition: ["resourceId", "code"],
  Observation: ["resourceId", "code"],
  OMOPPerson: ["personId"],
  SnomedConcept: ["conceptId"],
  LoincCode: ["loincNumber"],
  TrustCenter: ["name", "did"],
  SPESession: ["sessionId", "studyId"],
  ResearchPseudonym: ["rpsnId", "studyId"],
  VerifiableCredential: ["credentialId", "credentialType"],
};

// Valid edge types between label pairs (source → target).
// Only the most critical cross-layer relationships are listed here.
const VALID_EDGES: Array<{
  type: string;
  from: string;
  to: string;
}> = [
  // L1 Governance
  { type: "OFFERS", from: "Participant", to: "DataProduct" },
  { type: "GOVERNED_BY", from: "DataProduct", to: "OdrlPolicy" },
  { type: "HAS_CONTRACT", from: "DataProduct", to: "Contract" },
  { type: "APPROVED_BY", from: "Contract", to: "HDABApproval" },
  { type: "APPLIED_BY", from: "AccessApplication", to: "Participant" },
  // L1 → L2
  { type: "DESCRIBES", from: "DataProduct", to: "HealthDataset" },
  // L2 HealthDCAT-AP
  { type: "HAS_DISTRIBUTION", from: "HealthDataset", to: "Distribution" },
  { type: "CONFORMS_TO", from: "HealthDataset", to: "EEHRxFProfile" },
  // L3 FHIR
  { type: "HAS_CONDITION", from: "Patient", to: "Condition" },
  { type: "HAS_OBSERVATION", from: "Patient", to: "Observation" },
  { type: "HAS_ENCOUNTER", from: "Patient", to: "Encounter" },
  { type: "HAS_MEDICATION_REQUEST", from: "Patient", to: "MedicationRequest" },
  { type: "HAS_PROCEDURE", from: "Patient", to: "Procedure" },
  // L3 → L4 (FHIR to OMOP CDM)
  { type: "MAPS_TO", from: "Patient", to: "OMOPPerson" },
  { type: "MAPS_TO", from: "Condition", to: "OMOPConditionOccurrence" },
  // L3 → L5 (FHIR coding)
  { type: "CODED_BY", from: "Condition", to: "SnomedConcept" },
  { type: "CODED_BY", from: "Condition", to: "ICD10Code" },
  { type: "CODED_BY", from: "Observation", to: "LoincCode" },
  { type: "CODED_BY", from: "MedicationRequest", to: "RxNormConcept" },
  // Phase 18: Trust Center
  { type: "GOVERNED_BY", from: "TrustCenter", to: "HDABApproval" },
  { type: "RESOLVES_PSEUDONYMS_FOR", from: "TrustCenter", to: "HealthDataset" },
  { type: "MUTUALLY_RECOGNISES", from: "TrustCenter", to: "TrustCenter" },
  { type: "MANAGES", from: "TrustCenter", to: "SPESession" },
  { type: "LINKED_FROM", from: "ResearchPseudonym", to: "ProviderPseudonym" },
  { type: "USED_IN", from: "ResearchPseudonym", to: "SPESession" },
];

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const [
      nodeLabelRows,
      edgeTypeRows,
      orphanRows,
      missingPropResults,
      unknownLabelRows,
      edgeValidationRows,
    ] = await Promise.all([
      // 1. Count nodes per label
      runQuery<{ label: string; count: number }>(
        `MATCH (n)
         UNWIND labels(n) AS lbl
         WITH lbl, count(*) AS cnt
         ORDER BY cnt DESC
         RETURN lbl AS label, cnt AS count`,
      ),

      // 2. Count edges per relationship type
      runQuery<{ type: string; count: number }>(
        `MATCH ()-[r]->()
         WITH type(r) AS t, count(*) AS cnt
         ORDER BY cnt DESC
         RETURN t AS type, cnt AS count`,
      ),

      // 3. Find orphan nodes (no relationships at all)
      runQuery<{ label: string; name: string; id: string }>(
        `MATCH (n)
         WHERE NOT (n)--()
           AND any(l IN labels(n) WHERE l IN $knownLabels)
         RETURN labels(n)[0] AS label,
                coalesce(n.name, n.id, elementId(n)) AS name,
                elementId(n) AS id
         LIMIT 50`,
        { knownLabels: Object.keys(LABEL_LAYER) },
      ),

      // 4. Missing required properties — one query per label
      Promise.all(
        Object.entries(REQUIRED_PROPS).map(async ([label, props]) => {
          const rows = await runQuery<{ id: string; name: string }>(
            `MATCH (n:\`${label}\`)
             WHERE all(p IN $props WHERE n[p] IS NULL)
             RETURN elementId(n) AS id,
                    coalesce(n.name, n.id, elementId(n)) AS name
             LIMIT 20`,
            { props },
          );
          return { label, missing: rows, requiredProps: props };
        }),
      ),

      // 5. Labels in Neo4j that are NOT in our LABEL_LAYER mapping
      runQuery<{ label: string; count: number }>(
        `MATCH (n)
         UNWIND labels(n) AS lbl
         WITH lbl, count(*) AS cnt
         WHERE NOT lbl IN $knownLabels
         RETURN lbl AS label, cnt AS count
         ORDER BY cnt DESC`,
        { knownLabels: Object.keys(LABEL_LAYER) },
      ),

      // 6. Check edge validity: count edges whose types are in VALID_EDGES
      //    and report any edge type NOT in our expected set
      runQuery<{ type: string; count: number }>(
        `MATCH (a)-[r]->(b)
         WHERE any(l IN labels(a) WHERE l IN $knownLabels)
           AND any(l IN labels(b) WHERE l IN $knownLabels)
           AND NOT type(r) IN $validTypes
         WITH type(r) AS t, count(*) AS cnt
         ORDER BY cnt DESC
         RETURN t AS type, cnt AS count
         LIMIT 30`,
        {
          knownLabels: Object.keys(LABEL_LAYER),
          validTypes: VALID_EDGES.map((e) => e.type),
        },
      ),
    ]);

    // Summarise
    const totalNodes = nodeLabelRows.reduce((s, r) => s + Number(r.count), 0);
    const totalEdges = edgeTypeRows.reduce((s, r) => s + Number(r.count), 0);

    const missingPropIssues = missingPropResults.filter(
      (r) => r.missing.length > 0,
    );
    const issueCount =
      orphanRows.length + missingPropIssues.length + edgeValidationRows.length;

    return NextResponse.json({
      summary: { totalNodes, totalEdges, issueCount },
      nodeCounts: nodeLabelRows.map((r) => ({
        label: r.label,
        count: Number(r.count),
        known: r.label in LABEL_LAYER,
      })),
      edgeCounts: edgeTypeRows.map((r) => ({
        type: r.type,
        count: Number(r.count),
        defined: VALID_EDGES.some((e) => e.type === r.type),
      })),
      orphans: orphanRows,
      missingProps: missingPropIssues.map((r) => ({
        label: r.label,
        requiredProps: r.requiredProps,
        count: r.missing.length,
        sample: r.missing.slice(0, 5),
      })),
      unknownLabels: unknownLabelRows.map((r) => ({
        label: r.label,
        count: Number(r.count),
      })),
      unexpectedEdgeTypes: edgeValidationRows.map((r) => ({
        type: r.type,
        count: Number(r.count),
      })),
      validEdgeRules: VALID_EDGES,
    });
  } catch (err) {
    console.error("GET /api/graph/validate error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
