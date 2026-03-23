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

export async function GET() {
  try {
    // ── Step 1: curated node collection ────────────────────────────────────────
    // L1: Marketplace + DCP + EHDS governance
    const coreNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `MATCH (n)
     WHERE n:Participant OR n:DataProduct OR n:OdrlPolicy OR n:Contract
        OR n:AccessApplication OR n:HDABApproval
        OR n:ContractNegotiation OR n:DataTransfer
        OR n:Catalog OR n:Organization
     RETURN elementId(n) AS id, labels(n) AS labels,
            coalesce(n.name, n.title, n.participantId, n.productId,
                     n.negotiationId, n.transferId, n.id, elementId(n)) AS name`,
    );

    // L2: HealthDCAT-AP metadata + EEHRxF profiles
    const metadataNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `MATCH (n)
     WHERE n:HealthDataset OR n:Distribution OR n:ContactPoint
        OR n:EhdsPurpose OR n:EEHRxFProfile OR n:EEHRxFCategory
     RETURN elementId(n) AS id, labels(n) AS labels,
            coalesce(n.name, n.title, n.profileName, n.categoryName,
                     n.id, elementId(n)) AS name`,
    );

    // L5: Verifiable Credentials (trust layer)
    const credentialNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `MATCH (n:VerifiableCredential)
     RETURN elementId(n) AS id, labels(n) AS labels,
            coalesce(n.name, n.credentialType, n.type, n.id, elementId(n)) AS name`,
    );

    // L3: 8 representative patients
    const patientNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `MATCH (p:Patient)
     RETURN elementId(p) AS id, labels(p) AS labels,
            coalesce(p.name, p.id, elementId(p)) AS name
     ORDER BY p.name LIMIT 8`,
    );

    // L3: FHIR clinical events for those 8 patients (≤5 events each = ≤40)
    const patientEIds = patientNodes.map((p) => p.id);
    const fhirNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `UNWIND $ids AS eid
     MATCH (p) WHERE elementId(p) = eid
     MATCH (p)-[:HAS_ENCOUNTER|HAS_CONDITION|HAS_OBSERVATION|HAS_MEDICATION|HAS_MEDICATION_REQUEST|HAS_PROCEDURE]->(e)
     RETURN elementId(e) AS id, labels(e) AS labels,
            coalesce(e.display, e.name, e.code, elementId(e)) AS name
     LIMIT 40`,
      { ids: patientEIds },
    );

    // L4: OMOP nodes — persons mapped from patients + clinical events from FHIR
    const fhirEIds = fhirNodes.map((e) => e.id);
    const omopNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `UNWIND $patIds AS pid
     MATCH (p) WHERE elementId(p) = pid
     MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
     OPTIONAL MATCH (op)-[:HAS_VISIT_OCCURRENCE|HAS_CONDITION_OCCURRENCE|HAS_MEASUREMENT|HAS_DRUG_EXPOSURE]->(child)
     WITH collect(op {.*, id: elementId(op), labels: labels(op)}) +
          collect(child {.*, id: elementId(child), labels: labels(child)}) AS rows
     UNWIND rows AS r
     RETURN DISTINCT r.id AS id, r.labels AS labels,
            coalesce(r.name, r.id, '') AS name`,
      { patIds: patientEIds },
    );

    // L5: ontology codes linked to FHIR events + parent concepts (IS_A)
    const ontologyNodes = await runQuery<{
      id: string;
      labels: string[];
      name: string;
    }>(
      `UNWIND $ids AS eid
     MATCH (fhir) WHERE elementId(fhir) = eid
     MATCH (fhir)-[:CODED_BY]->(ont)
     OPTIONAL MATCH (ont)-[:IS_A]->(parent)
     WITH collect(ont) + collect(parent) AS all
     UNWIND all AS o
     WITH DISTINCT o WHERE o IS NOT NULL
     RETURN elementId(o) AS id, labels(o) AS labels,
            coalesce(o.display, o.name, o.code, o.id, elementId(o)) AS name`,
      { ids: fhirEIds },
    );

    // ── Step 2: deduplicate nodes ───────────────────────────────────────────────
    const allRaw = [
      ...coreNodes,
      ...metadataNodes,
      ...credentialNodes,
      ...patientNodes,
      ...fhirNodes,
      ...omopNodes,
      ...ontologyNodes,
    ];
    const nodeMap = new Map<string, (typeof allRaw)[0]>();
    for (const n of allRaw) nodeMap.set(n.id, n);
    const uniqueNodes = Array.from(nodeMap.values());
    const nodeIdSet = new Set(uniqueNodes.map((n) => n.id));
    const nodeIds = Array.from(nodeIdSet);

    // ── Step 3: fetch ONLY edges where both endpoints are in the node set ───────
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

    // ── Step 4: build response ──────────────────────────────────────────────────
    const nodes = uniqueNodes.map((r) => {
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

    return NextResponse.json({ nodes, links: relRows });
  } catch (err) {
    console.error("GET /api/graph error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
