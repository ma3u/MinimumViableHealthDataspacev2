import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

// Map Neo4j node labels → layer index (1-5) for colour assignment
const LABEL_LAYER: Record<string, number> = {
  Participant: 1,
  DataProduct: 1,
  Contract: 1,
  AccessApplication: 1,
  HDABApproval: 1,
  HealthDataset: 2,
  Distribution: 2,
  Patient: 3,
  Encounter: 3,
  Condition: 3,
  Observation: 3,
  MedicationRequest: 3,
  OMOPPerson: 4,
  OMOPVisitOccurrence: 4,
  OMOPConditionOccurrence: 4,
  OMOPMeasurement: 4,
  OMOPDrugExposure: 4,
  SnomedConcept: 5,
  LoincCode: 5,
  ICD10Code: 5,
  RxNormConcept: 5,
};

const LAYER_COLORS: Record<number, string> = {
  1: "#2471A3",
  2: "#148F77",
  3: "#1E8449",
  4: "#CA6F1E",
  5: "#7D3C98",
};

export async function GET() {
  const nodeRows = await runQuery<{
    id: string;
    labels: string[];
    name: string;
  }>(
    `MATCH (n) RETURN elementId(n) AS id, labels(n) AS labels,
     coalesce(n.name, n.id, elementId(n)) AS name LIMIT 300`,
  );

  const relRows = await runQuery<{
    source: string;
    target: string;
    type: string;
  }>(
    `MATCH (a)-[r]->(b) RETURN elementId(a) AS source,
     elementId(b) AS target, type(r) AS type LIMIT 600`,
  );

  const nodes = nodeRows.map((r) => {
    const layer = r.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
    return {
      id: r.id,
      name: r.name,
      label: r.labels[0] ?? "Node",
      layer,
      color: LAYER_COLORS[layer] ?? "#888",
    };
  });

  const links = relRows.map((r) => ({
    source: r.source,
    target: r.target,
    type: r.type,
  }));

  return NextResponse.json({ nodes, links });
}
