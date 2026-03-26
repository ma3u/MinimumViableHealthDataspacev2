import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  LABEL_LAYER,
  LAYER_COLORS,
  NODE_ROLE_COLORS,
  LABEL_SORT_ORDER,
  LABEL_GROUP,
} from "@/lib/graph-constants";

export const dynamic = "force-dynamic";

// Governance + catalog labels — always included in researcher overview
const GOVERNANCE_LABELS = [
  "Participant",
  "DataProduct",
  "OdrlPolicy",
  "Contract",
  "HDABApproval",
  "ContractNegotiation",
  "HealthDataset",
  "Distribution",
  "EEHRxFProfile",
  "VerifiableCredential",
  "TransferEvent",
  "EhdsPurpose",
  "Catalogue",
  "Organization",
  // Phase 18: Trust Center nodes (EHDS Art. 50/51)
  "TrustCenter",
  "SPESession",
];

function toNode(r: { id: string; labels: string[]; name: string }) {
  const label = r.labels[0] ?? "Node";
  const layer = r.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
  // Role-specific color takes precedence over layer color
  const color = NODE_ROLE_COLORS[label] ?? LAYER_COLORS[layer] ?? "#888";
  const group = LABEL_GROUP[label] ?? "other";
  const sortKey = LABEL_SORT_ORDER[label] ?? 99;
  return {
    id: r.id,
    name: r.name,
    label,
    layer,
    color,
    group,
    sortKey,
    expandable: true,
  };
}

/**
 * GET /api/graph
 *
 * Researcher overview — curated ~200 nodes answering:
 *   "Who holds data?"            → Participant nodes (amber)
 *   "What datasets exist?"       → HealthDataset / DataProduct
 *   "Who approved access?"       → HDABApproval (red)
 *   "How are pseudonyms linked?" → TrustCenter / SPESession (violet/gold)
 *   "What conditions?"           → top-50 Condition + SNOMED
 *
 * Nodes are sorted within each layer ring by LABEL_SORT_ORDER so that
 * related types cluster together (e.g. Participants appear together at
 * the top of L1 ring, Trust Centers at the bottom).
 */
export async function GET() {
  try {
    const [
      govNodes,
      patientNodes,
      conditionNodes,
      snomedNodes,
      loincNodes,
      rxnormNodes,
    ] = await Promise.all([
      // L1/L2: All governance + catalog nodes
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
         RETURN elementId(n) AS id, labels(n) AS labels,
                coalesce(n.name, n.title, n.display, n.participantId,
                         n.productId, n.credentialType, n.code, n.id, elementId(n)) AS name
         ORDER BY labels(n)[0], coalesce(n.name, n.id)`,
        { labels: GOVERNANCE_LABELS },
      ),
      // Top 20 patients by condition count (richest research records)
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (p:Patient)-[:HAS_CONDITION]->(:Condition)
         WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 20
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.id, elementId(p)) AS name`,
        {},
      ),
      // Top 50 conditions by patient frequency
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (c:Condition)<-[:HAS_CONDITION]-(:Patient)
         WITH c, count(*) AS freq ORDER BY freq DESC LIMIT 50
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.code, c.name, c.display, elementId(c)) AS name`,
        {},
      ),
      // Top 30 SNOMED concepts by relationship degree
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (s:SnomedConcept)
         WITH s, count{(s)-[]-()} AS deg ORDER BY deg DESC LIMIT 30
         RETURN elementId(s) AS id, labels(s) AS labels,
                coalesce(s.display, s.code, elementId(s)) AS name`,
        {},
      ),
      // Top 20 LOINC codes by degree
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (l:LoincCode)
         WITH l, count{(l)-[]-()} AS deg ORDER BY deg DESC LIMIT 20
         RETURN elementId(l) AS id, labels(l) AS labels,
                coalesce(l.display, l.code, elementId(l)) AS name`,
        {},
      ),
      // Top 20 RxNorm drug concepts by degree
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (r:RxNormConcept)
         WITH r, count{(r)-[]-()} AS deg ORDER BY deg DESC LIMIT 20
         RETURN elementId(r) AS id, labels(r) AS labels,
                coalesce(r.display, r.name, r.code, elementId(r)) AS name`,
        {},
      ),
    ]);

    const seen = new Set<string>();
    const nodes = [
      ...govNodes,
      ...patientNodes,
      ...conditionNodes,
      ...snomedNodes,
      ...loincNodes,
      ...rxnormNodes,
    ]
      .filter((r) => (seen.has(r.id) ? false : seen.add(r.id) && true))
      // Sort within each layer so ring positions cluster related types
      .sort((a, b) => {
        const layerA = a.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
        const layerB = b.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
        if (layerA !== layerB) return layerA - layerB;
        const sortA = LABEL_SORT_ORDER[a.labels[0] ?? ""] ?? 99;
        const sortB = LABEL_SORT_ORDER[b.labels[0] ?? ""] ?? 99;
        if (sortA !== sortB) return sortA - sortB;
        return (a.name ?? "").localeCompare(b.name ?? "");
      })
      .map(toNode);

    const links = await runQuery<{
      source: string;
      target: string;
      type: string;
    }>(
      `MATCH (a)-[r]->(b)
       WHERE elementId(a) IN $ids AND elementId(b) IN $ids
       RETURN DISTINCT elementId(a) AS source, elementId(b) AS target, type(r) AS type`,
      { ids: nodes.map((n) => n.id) },
    );

    return NextResponse.json({ nodes, links });
  } catch (err) {
    console.error("GET /api/graph error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
