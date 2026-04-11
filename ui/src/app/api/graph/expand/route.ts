import { NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  LABEL_LAYER,
  LAYER_COLORS,
  NODE_ROLE_COLORS,
  LABEL_GROUP,
} from "@/lib/graph-constants";

export const dynamic = "force-dynamic";

// How many neighbours to return per expand click
const NEIGHBOUR_LIMIT = 50;

// Smarter neighbour limit per label type — avoid flooding the graph with
// 37k Observations when clicking a Patient
const LABEL_LIMIT: Record<string, number> = {
  Observation: 10,
  OMOPMeasurement: 10,
  OMOPProcedureOccurrence: 10,
  Procedure: 10,
  OMOPVisitOccurrence: 10,
  Encounter: 10,
  MedicationRequest: 15,
  OMOPDrugExposure: 15,
};

function toExpandNode(r: { nId: string; nLabels: string[]; nName: string }) {
  const label = r.nLabels[0] ?? "Node";
  const layer = r.nLabels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
  const color = NODE_ROLE_COLORS[label] ?? LAYER_COLORS[layer] ?? "#888";
  const group = LABEL_GROUP[label] ?? "other";
  return {
    id: r.nId,
    name: r.nName,
    label,
    layer,
    color,
    group,
    expandable: true,
  };
}

/**
 * GET /api/graph/expand?id=<elementId>
 *
 * Returns the immediate neighbours of a node plus the edges connecting them.
 * Nodes the client already has (existingIds) are included in the edge list
 * but not duplicated in the node list.
 *
 * Role-specific colors (Participant=amber, TrustCenter=violet, etc.) are
 * applied so expanded nodes match the main overview palette.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("id");
  if (!nodeId) {
    return NextResponse.json(
      { error: "Missing ?id= parameter" },
      { status: 400 },
    );
  }

  try {
    // Fetch outgoing neighbours
    const outRows = await runQuery<{
      nId: string;
      nLabels: string[];
      nName: string;
      relType: string;
    }>(
      `MATCH (src)-[r]->(nbr)
       WHERE elementId(src) = $nodeId
         AND any(l IN labels(nbr) WHERE l IN $knownLabels)
       RETURN elementId(nbr) AS nId, labels(nbr) AS nLabels,
              coalesce(nbr.name, nbr.display, nbr.title, nbr.credentialType,
                     nbr.studyId, nbr.transferId,
                     nbr.endpoint + ' ' + nbr.method, nbr.endpoint,
                     nbr.approvalId, nbr.applicationId,
                     nbr.contractId, nbr.participantId, nbr.productId,
                     nbr.sessionId, nbr.consentId, nbr.rpsnId, nbr.eventId,
                     nbr.code, nbr.id, elementId(nbr)) AS nName,
              type(r) AS relType
       LIMIT $limit`,
      {
        nodeId,
        knownLabels: Object.keys(LABEL_LAYER),
        limit: neo4j.int(NEIGHBOUR_LIMIT),
      },
    );

    // Fetch incoming neighbours
    const inRows = await runQuery<{
      nId: string;
      nLabels: string[];
      nName: string;
      relType: string;
    }>(
      `MATCH (src)<-[r]-(nbr)
       WHERE elementId(src) = $nodeId
         AND any(l IN labels(nbr) WHERE l IN $knownLabels)
       RETURN elementId(nbr) AS nId, labels(nbr) AS nLabels,
              coalesce(nbr.name, nbr.display, nbr.title, nbr.credentialType,
                     nbr.studyId, nbr.transferId,
                     nbr.endpoint + ' ' + nbr.method, nbr.endpoint,
                     nbr.approvalId, nbr.applicationId,
                     nbr.contractId, nbr.participantId, nbr.productId,
                     nbr.sessionId, nbr.consentId, nbr.rpsnId, nbr.eventId,
                     nbr.code, nbr.id, elementId(nbr)) AS nName,
              type(r) AS relType
       LIMIT $limit`,
      {
        nodeId,
        knownLabels: Object.keys(LABEL_LAYER),
        limit: neo4j.int(NEIGHBOUR_LIMIT),
      },
    );

    const rows = [
      ...outRows.map((r) => ({ ...r, direction: "out" as const })),
      ...inRows.map((r) => ({ ...r, direction: "in" as const })),
    ];

    // Apply per-label caps to avoid flooding the graph (e.g. 37k Observations)
    const labelCounts: Record<string, number> = {};
    const seen = new Set<string>();
    const filtered = rows.filter((r) => {
      if (seen.has(r.nId)) return false;
      seen.add(r.nId);
      const lbl = r.nLabels[0] ?? "";
      const cap = LABEL_LIMIT[lbl] ?? NEIGHBOUR_LIMIT;
      labelCounts[lbl] = (labelCounts[lbl] ?? 0) + 1;
      return labelCounts[lbl] <= cap;
    });

    const nodes = filtered.map(toExpandNode);

    // Edges: from the source node to each new neighbour
    const links = filtered.map((r) => ({
      source: r.direction === "out" ? nodeId : r.nId,
      target: r.direction === "out" ? r.nId : nodeId,
      type: r.relType,
    }));

    return NextResponse.json({ nodes, links });
  } catch (err) {
    console.error("GET /api/graph/expand error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
