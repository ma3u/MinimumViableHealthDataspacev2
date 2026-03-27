import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import {
  LABEL_LAYER,
  LAYER_COLORS,
  NODE_ROLE_COLORS,
  LABEL_SORT_ORDER,
  LABEL_GROUP,
  PERSONA_VIEWS,
  type PersonaId,
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
  "TrustCenter",
  "SPESession",
];

function toNode(r: { id: string; labels: string[]; name: string }) {
  const label = r.labels[0] ?? "Node";
  const layer = r.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
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

function sortAndDedup(rows: { id: string; labels: string[]; name: string }[]) {
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : seen.add(r.id) && true))
    .sort((a, b) => {
      const la = a.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
      const lb = b.labels.map((l) => LABEL_LAYER[l]).find(Boolean) ?? 0;
      if (la !== lb) return la - lb;
      const sa = LABEL_SORT_ORDER[a.labels[0] ?? ""] ?? 99;
      const sb = LABEL_SORT_ORDER[b.labels[0] ?? ""] ?? 99;
      if (sa !== sb) return sa - sb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    })
    .map(toNode);
}

// ── Persona-specific subgraph builders ───────────────────────────────────────

/** Trust Center: pseudonym resolution chains + governed datasets + cross-border */
async function buildTrustCenterGraph() {
  const [tcNodes, speNodes, rpsnNodes, datasetNodes] = await Promise.all([
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (tc:TrustCenter)
       OPTIONAL MATCH (tc)-[:GOVERNED_BY]->(ha:HDABApproval)
       WITH tc, ha
       RETURN elementId(tc) AS id, labels(tc) AS labels, tc.name AS name
       UNION
       MATCH (ha:HDABApproval)
       RETURN elementId(ha) AS id, labels(ha) AS labels,
              coalesce(ha.approvalId, elementId(ha)) AS name`,
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (ss:SPESession)
       RETURN elementId(ss) AS id, labels(ss) AS labels,
              coalesce(ss.studyId, ss.sessionId, elementId(ss)) AS name
       ORDER BY ss.createdAt DESC LIMIT 20`,
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (rp:ResearchPseudonym {revoked: false})
       RETURN elementId(rp) AS id, labels(rp) AS labels,
              coalesce(rp.studyId, rp.rpsnId, elementId(rp)) AS name
       LIMIT 20
       UNION
       MATCH (pp:ProviderPseudonym)
       RETURN elementId(pp) AS id, labels(pp) AS labels,
              coalesce(pp.providerId, pp.psnId, elementId(pp)) AS name
       LIMIT 20`,
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (tc:TrustCenter)-[:RESOLVES_PSEUDONYMS_FOR]->(ds:HealthDataset)
       RETURN elementId(ds) AS id, labels(ds) AS labels,
              coalesce(ds.title, ds.datasetId, elementId(ds)) AS name`,
    ),
  ]);
  return sortAndDedup([...tcNodes, ...speNodes, ...rpsnNodes, ...datasetNodes]);
}

/** Hospital / Data Holder: their datasets, active contracts, who has access */
async function buildHospitalGraph() {
  const [participantNodes, datasetNodes, contractNodes, credNodes] =
    await Promise.all([
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (p:Participant)
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.participantId, elementId(p)) AS name
         ORDER BY p.name`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (ds:HealthDataset)
         RETURN elementId(ds) AS id, labels(ds) AS labels,
                coalesce(ds.title, ds.datasetId, elementId(ds)) AS name
         ORDER BY ds.title LIMIT 30
         UNION
         MATCH (d:Distribution)
         RETURN elementId(d) AS id, labels(d) AS labels,
                coalesce(d.title, d.distributionId, elementId(d)) AS name
         LIMIT 20
         UNION
         MATCH (ep:EEHRxFProfile)
         RETURN elementId(ep) AS id, labels(ep) AS labels,
                coalesce(ep.title, ep.profileId, elementId(ep)) AS name
         LIMIT 15`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (c:Contract)
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.contractId, elementId(c)) AS name
         UNION
         MATCH (ha:HDABApproval)
         RETURN elementId(ha) AS id, labels(ha) AS labels,
                coalesce(ha.approvalId, elementId(ha)) AS name
         UNION
         MATCH (aa:AccessApplication)
         RETURN elementId(aa) AS id, labels(aa) AS labels,
                coalesce(aa.applicationId, elementId(aa)) AS name`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (vc:VerifiableCredential)
         RETURN elementId(vc) AS id, labels(vc) AS labels,
                coalesce(vc.credentialType, vc.credentialId, elementId(vc)) AS name
         ORDER BY vc.credentialType LIMIT 20`,
      ),
    ]);
  return sortAndDedup([
    ...participantNodes,
    ...datasetNodes,
    ...contractNodes,
    ...credNodes,
  ]);
}

/** Researcher: datasets + OMOP analytics + pseudonym chain + clinical conditions */
async function buildResearcherGraph() {
  const [datasetNodes, omopNodes, conditionNodes, ontologyNodes, speNodes] =
    await Promise.all([
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (ds:HealthDataset)
         RETURN elementId(ds) AS id, labels(ds) AS labels,
                coalesce(ds.title, ds.datasetId, elementId(ds)) AS name
         ORDER BY ds.title LIMIT 20
         UNION
         MATCH (dp:DataProduct)
         RETURN elementId(dp) AS id, labels(dp) AS labels,
                coalesce(dp.name, dp.productId, elementId(dp)) AS name
         LIMIT 15
         UNION
         MATCH (ep:EEHRxFProfile)
         RETURN elementId(ep) AS id, labels(ep) AS labels,
                coalesce(ep.title, ep.profileId, elementId(ep)) AS name
         LIMIT 10`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (op:OMOPPerson)-[:HAS_CONDITION_OCCURRENCE]->(:OMOPConditionOccurrence)
         WITH op, count(*) AS cnt ORDER BY cnt DESC LIMIT 15
         RETURN elementId(op) AS id, labels(op) AS labels,
                coalesce(toString(op.personId), elementId(op)) AS name
         UNION
         MATCH (oc:OMOPConditionOccurrence)<-[:HAS_CONDITION_OCCURRENCE]-(:OMOPPerson)
         WITH oc, count(*) AS freq ORDER BY freq DESC LIMIT 30
         RETURN elementId(oc) AS id, labels(oc) AS labels,
                coalesce(toString(oc.conditionConceptId), elementId(oc)) AS name
         UNION
         MATCH (om:OMOPMeasurement)
         RETURN elementId(om) AS id, labels(om) AS labels,
                coalesce(toString(om.measurementConceptId), elementId(om)) AS name
         LIMIT 10`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (c:Condition)<-[:HAS_CONDITION]-(:Patient)
         WITH c, count(*) AS freq ORDER BY freq DESC LIMIT 30
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.code, c.display, elementId(c)) AS name`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (s:SnomedConcept)
         WITH s, count{(s)-[]-()} AS deg ORDER BY deg DESC LIMIT 20
         RETURN elementId(s) AS id, labels(s) AS labels,
                coalesce(s.display, s.code, elementId(s)) AS name
         UNION
         MATCH (l:LoincCode)
         WITH l, count{(l)-[]-()} AS deg ORDER BY deg DESC LIMIT 10
         RETURN elementId(l) AS id, labels(l) AS labels,
                coalesce(l.display, l.code, elementId(l)) AS name
         UNION
         MATCH (rx:RxNormConcept)
         WITH rx, count{(rx)-[]-()} AS deg ORDER BY deg DESC LIMIT 10
         RETURN elementId(rx) AS id, labels(rx) AS labels,
                coalesce(rx.display, rx.name, rx.code, elementId(rx)) AS name`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (rp:ResearchPseudonym {revoked: false})
         RETURN elementId(rp) AS id, labels(rp) AS labels,
                coalesce(rp.studyId, rp.rpsnId, elementId(rp)) AS name
         LIMIT 10
         UNION
         MATCH (ss:SPESession {status: "active"})
         RETURN elementId(ss) AS id, labels(ss) AS labels,
                coalesce(ss.studyId, ss.sessionId, elementId(ss)) AS name
         LIMIT 10`,
      ),
    ]);
  return sortAndDedup([
    ...datasetNodes,
    ...omopNodes,
    ...conditionNodes,
    ...ontologyNodes,
    ...speNodes,
  ]);
}

/** EDC Admin: all participants, products, contracts, negotiations, transfers */
async function buildEdcAdminGraph() {
  const rows = await runQuery<{ id: string; labels: string[]; name: string }>(
    `MATCH (n)
     WHERE any(l IN labels(n) WHERE l IN $labels)
     RETURN elementId(n) AS id, labels(n) AS labels,
            coalesce(n.name, n.title, n.participantId, n.productId,
                     n.contractId, n.credentialType, n.id, elementId(n)) AS name
     ORDER BY labels(n)[0], coalesce(n.name, n.id)`,
    {
      labels: [
        "Participant",
        "Organization",
        "DataProduct",
        "OdrlPolicy",
        "Contract",
        "ContractNegotiation",
        "DataTransfer",
        "TransferEvent",
        "VerifiableCredential",
      ],
    },
  );
  return sortAndDedup(rows);
}

/** HDAB Authority: approval chains, credentials, trust center governance */
async function buildHdabGraph() {
  const [govNodes, tcNodes, vcNodes] = await Promise.all([
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (n)
       WHERE any(l IN labels(n) WHERE l IN $labels)
       RETURN elementId(n) AS id, labels(n) AS labels,
              coalesce(n.name, n.approvalId, n.applicationId,
                       n.contractId, n.productId, n.participantId, elementId(n)) AS name
       ORDER BY labels(n)[0]`,
      {
        labels: [
          "HDABApproval",
          "AccessApplication",
          "Participant",
          "DataProduct",
          "Contract",
        ],
      },
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (tc:TrustCenter)
       RETURN elementId(tc) AS id, labels(tc) AS labels, tc.name AS name
       UNION
       MATCH (ss:SPESession)
       RETURN elementId(ss) AS id, labels(ss) AS labels,
              coalesce(ss.studyId, ss.sessionId, elementId(ss)) AS name
       LIMIT 15`,
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (vc:VerifiableCredential)
       RETURN elementId(vc) AS id, labels(vc) AS labels,
              coalesce(vc.credentialType, vc.credentialId, elementId(vc)) AS name
       ORDER BY vc.credentialType LIMIT 30`,
    ),
  ]);
  return sortAndDedup([...govNodes, ...tcNodes, ...vcNodes]);
}

/** Patient: own FHIR data + conditions + research pseudonym chain (EHDS Art. 3-12) */
async function buildPatientGraph() {
  const [patientNodes, conditionNodes, omopNodes, speNodes] = await Promise.all(
    [
      // Top 20 patients with richest records (GDPR Art. 15 — access own data)
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (p:Patient)-[:HAS_CONDITION]->(:Condition)
         WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 20
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.id, elementId(p)) AS name`,
        {},
      ),
      // Their top conditions
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (c:Condition)<-[:HAS_CONDITION]-(:Patient)
         WITH c, count(*) AS freq ORDER BY freq DESC LIMIT 30
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.code, c.display, elementId(c)) AS name`,
        {},
      ),
      // OMOP CDM mapping (pseudonymised research representation)
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (op:OMOPPerson)
         RETURN elementId(op) AS id, labels(op) AS labels,
                coalesce(toString(op.personId), elementId(op)) AS name
         LIMIT 15
         UNION
         MATCH (oc:OMOPConditionOccurrence)
         RETURN elementId(oc) AS id, labels(oc) AS labels,
                coalesce(toString(oc.conditionConceptId), elementId(oc)) AS name
         LIMIT 20`,
        {},
      ),
      // Research pseudonyms and SPE sessions (EHDS Art. 10 — consent for secondary use)
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (rp:ResearchPseudonym {revoked: false})
         RETURN elementId(rp) AS id, labels(rp) AS labels,
                coalesce(rp.studyId, rp.rpsnId, elementId(rp)) AS name
         LIMIT 10
         UNION
         MATCH (ss:SPESession)
         RETURN elementId(ss) AS id, labels(ss) AS labels,
                coalesce(ss.studyId, ss.sessionId, elementId(ss)) AS name
         LIMIT 5
         UNION
         MATCH (pc:PatientConsent {revoked: false})
         RETURN elementId(pc) AS id, labels(pc) AS labels,
                coalesce(pc.studyId, pc.consentId, elementId(pc)) AS name
         LIMIT 10`,
        {},
      ),
    ],
  );
  return sortAndDedup([
    ...patientNodes,
    ...conditionNodes,
    ...omopNodes,
    ...speNodes,
  ]);
}

// ── Default overview (unchanged from before) ─────────────────────────────────

async function buildDefaultGraph() {
  const [
    govNodes,
    patientNodes,
    conditionNodes,
    snomedNodes,
    loincNodes,
    rxnormNodes,
  ] = await Promise.all([
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
         RETURN elementId(n) AS id, labels(n) AS labels,
                coalesce(n.name, n.title, n.display, n.participantId,
                         n.productId, n.credentialType, n.code, n.id, elementId(n)) AS name
         ORDER BY labels(n)[0], coalesce(n.name, n.id)`,
      { labels: GOVERNANCE_LABELS },
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Patient)-[:HAS_CONDITION]->(:Condition)
         WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 20
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.id, elementId(p)) AS name`,
      {},
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (c:Condition)<-[:HAS_CONDITION]-(:Patient)
         WITH c, count(*) AS freq ORDER BY freq DESC LIMIT 50
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.code, c.name, c.display, elementId(c)) AS name`,
      {},
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (s:SnomedConcept)
         WITH s, count{(s)-[]-()} AS deg ORDER BY deg DESC LIMIT 30
         RETURN elementId(s) AS id, labels(s) AS labels,
                coalesce(s.display, s.code, elementId(s)) AS name`,
      {},
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (l:LoincCode)
         WITH l, count{(l)-[]-()} AS deg ORDER BY deg DESC LIMIT 20
         RETURN elementId(l) AS id, labels(l) AS labels,
                coalesce(l.display, l.code, elementId(l)) AS name`,
      {},
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (r:RxNormConcept)
         WITH r, count{(r)-[]-()} AS deg ORDER BY deg DESC LIMIT 20
         RETURN elementId(r) AS id, labels(r) AS labels,
                coalesce(r.display, r.name, r.code, elementId(r)) AS name`,
      {},
    ),
  ]);
  return sortAndDedup([
    ...govNodes,
    ...patientNodes,
    ...conditionNodes,
    ...snomedNodes,
    ...loincNodes,
    ...rxnormNodes,
  ]);
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/graph?persona=<id>
 *
 * Returns a persona-specific subgraph. Supported personas:
 *   default        — full researcher overview (~200 nodes)
 *   trust-center   — TC operator: pseudonym chains + governed datasets
 *   hospital       — data holder: datasets + contracts + credentials
 *   researcher     — data user: OMOP + datasets + clinical conditions
 *   edc-admin      — operator: participants + products + transfers
 *   hdab           — authority: approvals + credentials + TC governance
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const persona = (searchParams.get("persona") ?? "default") as PersonaId;

  // Validate persona
  const validPersonas = PERSONA_VIEWS.map((p) => p.id);
  const safePersona = validPersonas.includes(persona) ? persona : "default";

  try {
    let nodes;
    switch (safePersona) {
      case "trust-center":
        nodes = await buildTrustCenterGraph();
        break;
      case "hospital":
        nodes = await buildHospitalGraph();
        break;
      case "researcher":
        nodes = await buildResearcherGraph();
        break;
      case "edc-admin":
        nodes = await buildEdcAdminGraph();
        break;
      case "hdab":
        nodes = await buildHdabGraph();
        break;
      case "patient":
        nodes = await buildPatientGraph();
        break;
      default:
        nodes = await buildDefaultGraph();
    }

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

    const personaMeta = PERSONA_VIEWS.find((p) => p.id === safePersona);
    return NextResponse.json({
      nodes,
      links,
      persona: safePersona,
      question: personaMeta?.question,
    });
  } catch (err) {
    console.error("GET /api/graph error:", err);
    return NextResponse.json({ error: "Neo4j unavailable" }, { status: 502 });
  }
}
