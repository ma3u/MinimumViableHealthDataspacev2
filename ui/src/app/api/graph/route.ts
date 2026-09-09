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

/** Hospital / Data Holder: their datasets, data products, active contracts, who has access */
async function buildHospitalGraph() {
  const [
    participantNodes,
    datasetNodes,
    productNodes,
    contractNodes,
    credNodes,
  ] = await Promise.all([
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
                coalesce(d.name, d.title, d.format, d.distributionId, elementId(d)) AS name
         LIMIT 20
         UNION
         MATCH (ep:EEHRxFProfile)
         RETURN elementId(ep) AS id, labels(ep) AS labels,
                coalesce(ep.title, ep.profileId, elementId(ep)) AS name
         LIMIT 15`,
    ),
    // DataProduct — the offerings participants publish
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (dp:DataProduct)
         RETURN elementId(dp) AS id, labels(dp) AS labels,
                coalesce(dp.name, dp.title, dp.productId, elementId(dp)) AS name
         LIMIT 20`,
    ),
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (c:Contract)
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.name, c.contractId, elementId(c)) AS name
         UNION
         MATCH (ha:HDABApproval)
         RETURN elementId(ha) AS id, labels(ha) AS labels,
                coalesce(ha.name, ha.approvalId, elementId(ha)) AS name
         UNION
         MATCH (aa:AccessApplication)
         RETURN elementId(aa) AS id, labels(aa) AS labels,
                coalesce(aa.name, aa.applicationId, elementId(aa)) AS name`,
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
    ...productNodes,
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
                coalesce(op.name, toString(op.personId), elementId(op)) AS name
         UNION
         MATCH (oc:OMOPConditionOccurrence)<-[:HAS_CONDITION_OCCURRENCE]-(:OMOPPerson)
         WITH oc, count(*) AS freq ORDER BY freq DESC LIMIT 30
         RETURN elementId(oc) AS id, labels(oc) AS labels,
                coalesce(oc.name, toString(oc.conditionConceptId), elementId(oc)) AS name
         UNION
         MATCH (om:OMOPMeasurement)
         RETURN elementId(om) AS id, labels(om) AS labels,
                coalesce(om.name, toString(om.measurementConceptId), elementId(om)) AS name
         LIMIT 10`,
      ),
      runQuery<{ id: string; labels: string[]; name: string }>(
        `MATCH (c:Condition)<-[:HAS_CONDITION]-(:Patient)
         WITH c, count(*) AS freq ORDER BY freq DESC LIMIT 30
         RETURN elementId(c) AS id, labels(c) AS labels,
                coalesce(c.display, c.name, c.code, elementId(c)) AS name`,
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
            coalesce(n.name, n.title, n.display, n.participantId, n.productId,
                     n.contractId, n.credentialType, n.transferId,
                     n.endpoint + ' ' + n.method, n.endpoint,
                     n.eventId, n.id, elementId(n)) AS name
     ORDER BY labels(n)[0], coalesce(n.name, n.display, n.id)`,
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
              coalesce(n.name, n.display, n.title, n.approvalId, n.applicationId,
                       n.contractId, n.productId, n.participantId, elementId(n)) AS name
       ORDER BY labels(n)[0]`,
      {
        labels: [
          "HDABApproval",
          "AccessApplication",
          "OdrlPolicy",
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

/** Patient: own FHIR data + governance chain showing who uses it (EHDS Art. 3-12) */
async function buildPatientGraph() {
  // Anchor every slice to ONE set of patients.
  //
  // This previously ran five independent top-N queries: top-20 patients by
  // condition count, the globally top-30 conditions, and 15 arbitrary
  // OMOPPersons. Because each slice was ranked by its own criterion, the
  // selected conditions were mostly not the selected patients' conditions and
  // the OMOPPersons belonged to neither — so 66 of 95 returned nodes had no
  // edge to anything else in the payload (measured 2026-09-09). The link query
  // below is correct; it simply had nothing to join. The graph rendered as a
  // dense hub surrounded by ~30 orphans, and clicking an orphan reported
  // "0 connections loaded", which is computed from the loaded links.
  //
  // Ten patients rather than twenty, and their conditions capped per patient,
  // because the old view also stacked ~50 condition labels into an unreadable
  // arc around a single hub.
  const anchors = await runQuery<{ id: string }>(
    `MATCH (p:Patient)-[:HAS_CONDITION]->(:Condition)
     WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 10
     RETURN elementId(p) AS id`,
    {},
  );
  const anchorIds = anchors.map((a) => a.id);

  const [
    patientNodes,
    conditionNodes,
    omopNodes,
    datasetNodes,
    speNodes,
    govNodes,
  ] = await Promise.all([
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Patient) WHERE elementId(p) IN $anchorIds
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.id, elementId(p)) AS name`,
      { anchorIds },
    ),
    // THEIR conditions, capped per patient so one rich record cannot flood
    // the view. Previously the global top-30 by frequency.
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Patient)-[:HAS_CONDITION]->(c:Condition)
         WHERE elementId(p) IN $anchorIds
         WITH p, c ORDER BY coalesce(c.display, c.code)
         WITH p, collect(c)[0..4] AS cs
         UNWIND cs AS c
         RETURN DISTINCT elementId(c) AS id, labels(c) AS labels,
                coalesce(c.display, c.code, elementId(c)) AS name`,
      { anchorIds },
    ),
    // THEIR OMOP twins, via Patient-[:MAPPED_TO]->OMOPPerson. Previously an
    // unanchored `MATCH (op:OMOPPerson) LIMIT 15`, which is why every OMOP
    // node floated free.
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Patient)-[:MAPPED_TO]->(op:OMOPPerson)
         WHERE elementId(p) IN $anchorIds
         RETURN DISTINCT elementId(op) AS id, labels(op) AS labels,
                coalesce(op.name, toString(op.personId), elementId(op)) AS name`,
      { anchorIds },
    ),
    // The datasets those patients belong to — the bridge from the clinical
    // layer to the catalog/governance layer, so the two halves of the graph
    // are actually joined rather than sitting side by side.
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Patient)-[:FROM_DATASET]->(ds:HealthDataset)
         WHERE elementId(p) IN $anchorIds
         RETURN DISTINCT elementId(ds) AS id, labels(ds) AS labels,
                coalesce(ds.title, ds.datasetId, elementId(ds)) AS name`,
      { anchorIds },
    ),
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
    runQuery<{ id: string; labels: string[]; name: string }>(
      `MATCH (p:Participant)
         RETURN elementId(p) AS id, labels(p) AS labels,
                coalesce(p.name, p.participantId, elementId(p)) AS name
         ORDER BY p.name
         UNION
         MATCH (dp:DataProduct)
         RETURN elementId(dp) AS id, labels(dp) AS labels,
                coalesce(dp.name, dp.productId, elementId(dp)) AS name
         LIMIT 15
         UNION
         MATCH (ha:HDABApproval)
         RETURN elementId(ha) AS id, labels(ha) AS labels,
                coalesce(ha.approvalId, elementId(ha)) AS name
         LIMIT 10`,
      {},
    ),
  ]);
  return sortAndDedup([
    ...govNodes,
    ...patientNodes,
    ...conditionNodes,
    ...omopNodes,
    ...datasetNodes,
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
                         n.productId, n.credentialType, n.transferId,
                         n.endpoint + ' ' + n.method, n.endpoint,
                         n.eventId, n.code, n.id, elementId(n)) AS name
         ORDER BY labels(n)[0], coalesce(n.name, n.display, n.id)`,
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
                coalesce(c.display, c.name, c.code, elementId(c)) AS name`,
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
// Public endpoint — the /graph page is the demo landing view and must
// work without authentication. Data is fully synthetic (127 fictional
// patients seeded from Synthea).
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

    // Drop nodes that ended up with no edge in this payload.
    //
    // A persona builder selects nodes label-by-label, so it can pick a node
    // whose neighbours it did not pick — and the link query above, which only
    // joins nodes already in the set, then finds nothing for it. The result is
    // a node rendered floating in space with "0 connections loaded" in the
    // detail panel, which reads as missing data rather than a narrow query.
    //
    // The patient view was measured at 66 isolated of 95 nodes on 2026-09-09,
    // while the same labels average degree 2-13 in Neo4j — none of those nodes
    // is isolated in the database. This is a presentation artefact, so it is
    // corrected in presentation. `isolatedRemoved` is returned so a persona
    // that starts shedding nodes is visible rather than silently thinner.
    const connected = new Set<string>();
    for (const l of links) {
      connected.add(l.source);
      connected.add(l.target);
    }
    const linked = nodes.filter((n) => connected.has(n.id));
    // Never prune the view down to nothing. A persona whose data is not seeded
    // (locally, `trust-center` has no TrustCenter nodes at all) would otherwise
    // render an empty canvas with no explanation, which is a worse answer than
    // showing the disconnected nodes that do exist and letting the caller see
    // isolatedRemoved.
    const visibleNodes = linked.length > 0 ? linked : nodes;
    const isolatedRemoved = nodes.length - visibleNodes.length;

    const personaMeta = PERSONA_VIEWS.find((p) => p.id === safePersona);
    return NextResponse.json({
      nodes: visibleNodes,
      links,
      persona: safePersona,
      question: personaMeta?.question,
      isolatedRemoved,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    console.error("GET /api/graph error:", {
      message: msg,
      code,
      uri: process.env.NEO4J_URI ?? "(unset)",
    });
    return NextResponse.json(
      {
        error: "Neo4j unavailable",
        detail: msg,
        code,
      },
      { status: 502 },
    );
  }
}
