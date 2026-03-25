import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

// Map Neo4j node labels → layer index (1-5) for colour assignment
const LABEL_LAYER: Record<string, number> = {
  // L1: Dataspace Marketplace
  Participant: 1,
  DataProduct: 1,
  OdrlPolicy: 1,
  Contract: 1,
  AccessApplication: 1,
  HDABApproval: 1,
  ContractNegotiation: 1,
  DataTransfer: 1,
  Catalog: 1,
  Organization: 1,
  // L2: HealthDCAT-AP Metadata
  HealthDataset: 2,
  Distribution: 2,
  ContactPoint: 2,
  EhdsPurpose: 2,
  EEHRxFProfile: 2,
  EEHRxFCategory: 2,
  // L3: FHIR Clinical
  Patient: 3,
  Encounter: 3,
  Condition: 3,
  Observation: 3,
  MedicationRequest: 3,
  Procedure: 3,
  // L4: OMOP Analytics
  OMOPPerson: 4,
  OMOPVisitOccurrence: 4,
  OMOPConditionOccurrence: 4,
  OMOPMeasurement: 4,
  OMOPDrugExposure: 4,
  OMOPProcedureOccurrence: 4,
  // L5: Ontology + Credentials
  SnomedConcept: 5,
  LoincCode: 5,
  ICD10Code: 5,
  RxNormConcept: 5,
  VerifiableCredential: 5,
};

const LAYER_COLORS: Record<number, string> = {
  1: "#2471A3",
  2: "#148F77",
  3: "#1E8449",
  4: "#CA6F1E",
  5: "#7D3C98",
};

const PAGE_SIZE_DEFAULT = 200;
const PAGE_SIZE_MAX = 500;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit = Math.min(
      PAGE_SIZE_MAX,
      Math.max(
        1,
        parseInt(searchParams.get("limit") ?? String(PAGE_SIZE_DEFAULT), 10),
      ),
    );
    const skip = page * limit;

    // ── Count total known nodes (cheap, cached by Neo4j) ────────────────────
    const countRows = await runQuery<{ total: number }>(
      `MATCH (n)
       WHERE any(l IN labels(n) WHERE l IN $knownLabels)
       RETURN count(n) AS total`,
      { knownLabels: Object.keys(LABEL_LAYER) },
    );
    const total = countRows[0]?.total ?? 0;

    // ── Paginated node fetch ─────────────────────────────────────────────────
    const allNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `MATCH (n)
       WHERE any(l IN labels(n) WHERE l IN $knownLabels)
       RETURN elementId(n) AS id, labels(n) AS labels,
              coalesce(n.name, n.title, n.display, n.profileName,
                       n.categoryName, n.credentialType,
                       n.participantId, n.productId,
                       n.negotiationId, n.transferId,
                       n.code, n.id, elementId(n)) AS name
       ORDER BY elementId(n)
       SKIP $skip LIMIT $limit`,
      { knownLabels: Object.keys(LABEL_LAYER), skip, limit },
    );

    const nodeIdSet = new Set(allNodes.map((n) => n.id));
    const nodeIds = Array.from(nodeIdSet);

    // ── Fetch edges between nodes on this page only ──────────────────────────
    const relRows = await runQuery<{
      source: string;
      target: string;
      type: string;
    }>(
      `MATCH (a)-[r]->(b)
       WHERE elementId(a) IN $ids AND elementId(b) IN $ids
       RETURN DISTINCT elementId(a) AS source, elementId(b) AS target, type(r) AS type`,
      { ids: nodeIds },
    );

    // ── Build response ───────────────────────────────────────────────────────
    const nodes = allNodes.map((r) => {
      const layer =
        r.labels.map((l: string) => LABEL_LAYER[l]).find(Boolean) ?? 0;
      return {
        id: r.id,
        name: r.name,
        label: r.labels[0] ?? "Node",
        layer,
        color: LAYER_COLORS[layer] ?? "#888",
      };
    });

    return NextResponse.json({
      nodes,
      links: relRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (err) {
    console.error("GET /api/graph error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
