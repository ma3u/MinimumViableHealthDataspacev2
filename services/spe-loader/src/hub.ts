import type { Session } from "neo4j-driver";
import { encodeProps } from "./codec.js";
import {
  APP_CONTRIBUTION,
  CLINICAL_LABELS,
  EXTRACT_FORMAT,
  OMOP_LABELS,
  isAppContribution,
  nodeKey,
  primaryLabel,
  type Extract,
  type ExtractNode,
  type ExtractRel,
} from "./extract.js";
import { selectHalf, type SpeDefinition } from "./spes.js";

// ---------------------------------------------------------------------------
// export: the hub graph to one SPE's extract (read only)
// ---------------------------------------------------------------------------
//
// For each patient of the SPE's half it takes
//   - the Patient,
//   - its clinical records one hop away (CLINICAL_LABELS),
//   - its OMOPPerson (MAPPED_TO) and the OMOP records one hop from that,
//   - the terminology concepts those records are CODED_BY (shared reference
//     data, not anybody's record),
//   - every relationship between two exported nodes.
// Never exported: a patient the Klarbefund app or a PID created or connected
// to (`sandbox`, `appAccount`, HAS_APP_CONNECTION) and any node the app
// contributed. Those hold a real person's data, which belongs on the hub that
// person chose and nowhere else. Labels travel as they are, so an Art. 71
// opt-out (the `OptedOut` label, ADR-062) reaches the workspace with the
// extract. The logic is scripts/seed-spe2.py's, which this replaces.

const BATCH = 500;

const SELECT_PATIENTS = `
MATCH (p:Patient)
WHERE coalesce(p.sandbox, false) = false
  AND p.appAccount IS NULL
  AND NOT (p)-[:HAS_APP_CONNECTION]->()
WITH p ORDER BY coalesce(p.resourceId, p.id, elementId(p))
RETURN collect(elementId(p)) AS ids`;

const NEIGHBOURS = `
UNWIND $ids AS id
MATCH (p) WHERE elementId(p) = id
MATCH (p)--(n)
WHERE any(l IN labels(n) WHERE l IN $labels)
  AND coalesce(n.contributedBy, '') <> $app
RETURN DISTINCT elementId(n) AS id`;

const OMOP_PERSONS = `
UNWIND $ids AS id
MATCH (p) WHERE elementId(p) = id
MATCH (p)-[:MAPPED_TO]->(op:OMOPPerson)
RETURN DISTINCT elementId(op) AS id`;

const CODED_BY = `
UNWIND $ids AS id
MATCH (n) WHERE elementId(n) = id
MATCH (n)-[:CODED_BY]->(c)
RETURN DISTINCT elementId(c) AS id`;

const READ_NODES = `
UNWIND $ids AS id
MATCH (n) WHERE elementId(n) = id
RETURN id, labels(n) AS labels, properties(n) AS props`;

const READ_RELATIONSHIPS = `
UNWIND $ids AS id
MATCH (a) WHERE elementId(a) = id
MATCH (a)-[r]->(b)
RETURN id AS start, type(r) AS type, properties(r) AS props, elementId(b) AS end`;

function* chunks<T>(items: T[], size = BATCH): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

async function collectIds(
  session: Session,
  query: string,
  ids: string[],
  params: Record<string, unknown> = {},
): Promise<string[]> {
  const found: string[] = [];
  for (const chunk of chunks(ids)) {
    const res = await session.run(query, { ids: chunk, ...params });
    for (const r of res.records) found.push(String(r.get("id")));
  }
  return found;
}

const unique = (xs: string[]) => [...new Set(xs)];

export async function exportExtract(
  session: Session,
  spe: SpeDefinition,
  meta: { permitId: string; policyHash: string | null; now?: Date },
): Promise<Extract> {
  const all = (await session.run(SELECT_PATIENTS)).records[0]?.get("ids") as
    | string[]
    | undefined;
  const eligible = all ?? [];
  const patients = selectHalf(eligible, spe.half);
  if (patients.length === 0) {
    throw new Error(
      "the hub has no synthetic patients to export; is it seeded?",
    );
  }
  const clinical = await collectIds(session, NEIGHBOURS, patients, {
    labels: [...CLINICAL_LABELS],
    app: APP_CONTRIBUTION,
  });
  const persons = await collectIds(session, OMOP_PERSONS, patients);
  const omop = await collectIds(session, NEIGHBOURS, persons, {
    labels: [...OMOP_LABELS],
    app: APP_CONTRIBUTION,
  });
  const records = unique([...clinical, ...omop]);
  const concepts = await collectIds(session, CODED_BY, records);
  const ids = unique([...patients, ...persons, ...records, ...concepts]);

  const byElement = new Map<string, ExtractNode>();
  for (const chunk of chunks(ids)) {
    const res = await session.run(READ_NODES, { ids: chunk });
    for (const r of res.records) {
      const props = r.get("props") as Record<string, unknown>;
      if (isAppContribution(props)) continue;
      const labels = r.get("labels") as string[];
      const id = String(r.get("id"));
      byElement.set(id, {
        k: "node",
        primary: primaryLabel(labels),
        key: nodeKey(id, props),
        labels: [...labels].sort(),
        props: encodeProps(props),
      });
    }
  }

  const rels: ExtractRel[] = [];
  for (const chunk of chunks([...byElement.keys()])) {
    const res = await session.run(READ_RELATIONSHIPS, { ids: chunk });
    for (const r of res.records) {
      const s = byElement.get(String(r.get("start")));
      const e = byElement.get(String(r.get("end")));
      if (!s || !e) continue;
      rels.push({
        k: "rel",
        type: String(r.get("type")),
        s: { primary: s.primary, key: s.key },
        e: { primary: e.primary, key: e.key },
        props: encodeProps(r.get("props") as Record<string, unknown>),
      });
    }
  }

  const nodes = [...byElement.values()];
  return {
    header: {
      k: "header",
      format: EXTRACT_FORMAT,
      speId: spe.id,
      holder: spe.holder,
      permitId: meta.permitId,
      policyHash: meta.policyHash,
      createdAt: (meta.now ?? new Date()).toISOString(),
      eligible: eligible.length,
      patients: nodes.filter((n) => n.primary === "Patient").length,
      nodes: nodes.length,
      relationships: rels.length,
    },
    nodes,
    rels,
  };
}

/**
 * Records on the permit what the access body bound its key to: the policy
 * hash and the Trustee resource (ADR-068 decision 2). An existing permit
 * keeps every other field; a missing one is created as the demo's SPE permit.
 */
export async function recordPermit(
  session: Session,
  p: {
    permitId: string;
    policyHash: string;
    speId: string;
    keyPath: string;
    holder: string;
  },
): Promise<void> {
  await session.run(
    `MERGE (a:HDABApproval {approvalId: $permitId})
       ON CREATE SET a.status = 'APPROVED',
                     a.name = 'Data permit for the SPE workspaces (PharmaCo Research AG)',
                     a.permittedPurpose = 'Scientific research (EHDS Art. 53(1)(e))',
                     a.ehdsArticle = 'Art. 68',
                     a.hdabOfficer = 'MedReg DE',
                     a.approvedAt = datetime(),
                     a.createdBy = 'spe-loader'
       ON MATCH SET a.policyHashRecordedBy = 'spe-loader'
     SET a.policyHash = $policyHash,
         a.policyHashRecordedAt = datetime(),
         a.policyCheckedByHardware = false,
         a.trusteeResources = [r IN coalesce(a.trusteeResources, []) WHERE r <> $keyPath] + $keyPath,
         a.speWorkspaces = [s IN coalesce(a.speWorkspaces, []) WHERE s <> $speId] + $speId`,
    p,
  );
}
