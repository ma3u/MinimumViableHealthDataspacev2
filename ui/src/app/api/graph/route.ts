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
  // L1 Phase 18: Trust Center (EHDS Art. 50/51)
  TrustCenter: 1,
  SPESession: 1,
  ResearchPseudonym: 1,
  ProviderPseudonym: 1,
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

// Governance + catalog labels — always included in overview
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
  const layer = r.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
  return {
    id: r.id,
    name: r.name,
    label: r.labels[0] ?? "Node",
    layer,
    color: LAYER_COLORS[layer] ?? "#888",
    expandable: true,
  };
}

// Researcher overview — curated ~200 nodes that answer the key questions:
//   "What datasets exist?"  "Who approved them?"  "What conditions are covered?"
//   "Which Trust Centers govern pseudonym resolution?" (Phase 18)
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
      // L1/L2: All governance + catalog nodes (includes TrustCenter + SPESession via GOVERNANCE_LABELS)
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
           RETURN elementId(n) AS id, labels(n) AS labels,
                  coalesce(n.name, n.title, n.display, n.participantId,
                           n.productId, n.credentialType, n.code, n.id, elementId(n)) AS name`,
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
