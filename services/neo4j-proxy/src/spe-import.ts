import neo4j, { type Session } from "neo4j-driver";

// ---------------------------------------------------------------------------
// A transfer's data into an SPE workspace (#876)
// ---------------------------------------------------------------------------
//
// A data user's transfer ends in the secure processing environment, not in
// the browser (EHDS Art. 73). The hub pulls the data of a STARTED transfer
// (ui/src/lib/transfer-data.ts), pseudonymised for the roles that do not see
// identity (#475), and posts it here with the SPE the user chose. It is
// written into that workspace's Neo4j as one dataset:
//
//   (:ImportedDataset {datasetId})-[:LOADED_INTO]->(:SpeWorkspace {speId})
//   (:ImportedDataset)-[:CONTAINS]->(:ImportedRecord {recordKey})
//   (:ImportedRecord)-[:REFERS_TO {path}]->(:ImportedRecord)
//
// Records get their own labels on purpose. On compose SPE-1 is the hub graph
// itself (db.ts), and an imported Patient under the Patient label would be
// counted, exported to the other SPE and offered again as the hub's own.
// A second import of the same transfer merges onto the first and changes
// nothing.

/** Larger bundles are refused rather than half written. */
export const MAX_RECORDS = 5_000;
/** The graph view of one dataset shows at most this many records. */
export const GRAPH_RECORD_LIMIT = 500;

const RESOURCE_TYPE = /^[A-Z][A-Za-z]{1,63}$/;
const RESOURCE_ID = /^[A-Za-z0-9\-.]{1,64}$/;

export interface ImportRecord {
  recordKey: string;
  resourceType: string;
  resourceId: string;
  name: string;
  /** The FHIR resource as JSON, so the workspace keeps all of it. */
  resource: string;
}

export interface ImportReference {
  from: string;
  to: string;
  path: string;
}

export class ImportShapeError extends Error {}

/** What a person reads on a record's node. */
function displayName(r: Record<string, unknown>, id: string): string {
  const code = r.code as
    | { text?: string; coding?: Array<{ display?: string; code?: string }> }
    | undefined;
  const coded =
    code?.text || code?.coding?.[0]?.display || code?.coding?.[0]?.code;
  const type = String(r.resourceType);
  if (coded) return `${type}: ${coded}`;
  // The hub's records carry a display text of their own.
  if (type !== "Patient" && typeof r.display === "string") {
    return `${type}: ${r.display}`;
  }
  if (type === "Patient") {
    const year = typeof r.birthDate === "string" ? r.birthDate.slice(0, 4) : "";
    return [`Patient ${id}`, r.gender, year].filter(Boolean).join(", ");
  }
  return `${type}/${r.id}`;
}

/** Every "Type/id" reference inside a resource, with where it was found. */
function references(
  node: unknown,
  path: string,
  out: Array<{ ref: string; path: string }>,
): void {
  if (Array.isArray(node)) {
    node.forEach((v) => references(v, path, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "reference" && typeof v === "string") out.push({ ref: v, path });
    else references(v, path ? `${path}.${k}` : k, out);
  }
}

/**
 * A FHIR Bundle (a searchset, a collection, an $everything answer) as the
 * records and references of one dataset. A reference to a resource outside
 * the bundle is dropped: the workspace holds no node for it.
 */
export function bundleToRecords(
  datasetId: string,
  bundle: unknown,
): { records: ImportRecord[]; references: ImportReference[] } {
  const b = bundle as { resourceType?: unknown; entry?: unknown } | null;
  if (!b || b.resourceType !== "Bundle" || !Array.isArray(b.entry)) {
    throw new ImportShapeError(
      "Only a FHIR Bundle can be imported; this transfer's data is not one",
    );
  }
  const records = new Map<string, ImportRecord>();
  const resources: Array<[string, Record<string, unknown>]> = [];
  for (const e of b.entry as Array<{ resource?: unknown }>) {
    const r = e?.resource as Record<string, unknown> | undefined;
    if (!r) continue;
    const type = String(r.resourceType ?? "");
    // Older proxies answered graph properties without a FHIR id.
    const id = String(r.id ?? r.fhirId ?? r.resourceId ?? "");
    if (!RESOURCE_TYPE.test(type) || !RESOURCE_ID.test(id)) continue;
    const local = `${type}/${id}`;
    if (records.has(local)) continue;
    records.set(local, {
      recordKey: `${datasetId}/${local}`,
      resourceType: type,
      resourceId: id,
      name: displayName(r, id),
      resource: JSON.stringify(r),
    });
    resources.push([local, r]);
  }
  if (records.size > MAX_RECORDS) {
    throw new ImportShapeError(
      `The bundle holds ${records.size} records; at most ${MAX_RECORDS} are imported at once`,
    );
  }

  const refs: ImportReference[] = [];
  const seen = new Set<string>();
  for (const [local, r] of resources) {
    const found: Array<{ ref: string; path: string }> = [];
    references(r, "", found);
    for (const { ref, path } of found) {
      const target = /([A-Z][A-Za-z]+\/[A-Za-z0-9\-.]+)$/.exec(ref)?.[1];
      if (!target || target === local || !records.has(target)) continue;
      const key = `${local}>${target}>${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        from: records.get(local)!.recordKey,
        to: records.get(target)!.recordKey,
        path,
      });
    }
  }
  return { records: [...records.values()], references: refs };
}

export interface ImportRequest {
  datasetId: string;
  speId: string;
  transferId: string;
  agreementId: string;
  assetId: string;
  provider: string;
  consumer: string;
  importedBy: string;
  pseudonymised: boolean;
}

export interface ImportOutcome {
  datasetId: string;
  speId: string;
  records: number;
  relationships: number;
  byType: Record<string, number>;
  importedAt: string;
}

const WRITE_DATASET = `
MERGE (w:SpeWorkspace {speId: $meta.speId})
MERGE (d:ImportedDataset {datasetId: $meta.datasetId})
SET d.name = 'Transfer of ' + $meta.assetId,
    d.speId = $meta.speId,
    d.transferId = $meta.transferId,
    d.agreementId = $meta.agreementId,
    d.assetId = $meta.assetId,
    d.provider = $meta.provider,
    d.consumer = $meta.consumer,
    d.importedBy = $meta.importedBy,
    d.pseudonymised = $meta.pseudonymised,
    d.importedAt = $importedAt,
    d.records = $count
MERGE (d)-[:LOADED_INTO]->(w)`;

const WRITE_RECORDS = `
MATCH (d:ImportedDataset {datasetId: $datasetId})
UNWIND $records AS r
MERGE (x:ImportedRecord {recordKey: r.recordKey})
SET x.resourceType = r.resourceType,
    x.resourceId = r.resourceId,
    x.name = r.name,
    x.resource = r.resource,
    x.datasetId = $datasetId
MERGE (d)-[:CONTAINS]->(x)`;

const WRITE_REFERENCES = `
UNWIND $refs AS ref
MATCH (a:ImportedRecord {recordKey: ref.from})
MATCH (b:ImportedRecord {recordKey: ref.to})
MERGE (a)-[:REFERS_TO {path: ref.path}]->(b)`;

/** A dataset this workspace already holds, as the duplicate check reports it. */
export interface ExistingImport {
  datasetId: string;
  speId: string;
  records: number;
  importedAt: string;
}

/** The import is in this workspace already and the caller did not ask to overwrite it. */
export class AlreadyImportedError extends Error {
  constructor(readonly existing: ExistingImport) {
    super(
      `${existing.speId} holds this transfer already (${existing.records} records, imported ${existing.importedAt})`,
    );
  }
}

const READ_EXISTING = `
MATCH (d:ImportedDataset)
WHERE d.datasetId IN $datasetIds
RETURN d.datasetId AS datasetId, d.records AS records, d.importedAt AS importedAt`;

const toNumber = (v: unknown) =>
  neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v ?? 0);

/** Which of these datasets the workspace holds, with when and how many records. */
export async function readExisting(
  session: Session,
  speId: string,
  datasetIds: string[],
): Promise<ExistingImport[]> {
  const res = await session.run(READ_EXISTING, { datasetIds });
  return res.records.map((r) => ({
    datasetId: String(r.get("datasetId")),
    speId,
    records: toNumber(r.get("records")),
    importedAt: String(r.get("importedAt") ?? ""),
  }));
}

/** An overwrite starts from nothing: the dataset's old records go first. */
const DELETE_RECORDS = `
MATCH (:ImportedDataset {datasetId: $datasetId})-[:CONTAINS]->(x:ImportedRecord)
DETACH DELETE x`;

/**
 * Writes the dataset in one transaction: all of it or none. A dataset the
 * workspace holds already is refused unless `overwrite` is set; then its
 * records are replaced, not merged, so records the new data lacks are gone.
 */
export async function writeImport(
  session: Session,
  meta: ImportRequest,
  bundle: unknown,
  now: () => Date = () => new Date(),
  overwrite = false,
): Promise<ImportOutcome> {
  const { records, references: refs } = bundleToRecords(meta.datasetId, bundle);
  const importedAt = now().toISOString();
  await session.executeWrite(async (tx) => {
    const held = await tx.run(READ_EXISTING, { datasetIds: [meta.datasetId] });
    if (held.records.length) {
      if (!overwrite) {
        const r = held.records[0];
        throw new AlreadyImportedError({
          datasetId: meta.datasetId,
          speId: meta.speId,
          records: toNumber(r.get("records")),
          importedAt: String(r.get("importedAt") ?? ""),
        });
      }
      await tx.run(DELETE_RECORDS, { datasetId: meta.datasetId });
    }
    await tx.run(WRITE_DATASET, {
      meta,
      importedAt,
      count: neo4j.int(records.length),
    });
    for (let i = 0; i < records.length; i += 500) {
      await tx.run(WRITE_RECORDS, {
        datasetId: meta.datasetId,
        records: records.slice(i, i + 500),
      });
    }
    for (let i = 0; i < refs.length; i += 500) {
      await tx.run(WRITE_REFERENCES, { refs: refs.slice(i, i + 500) });
    }
  });
  const byType: Record<string, number> = {};
  for (const r of records)
    byType[r.resourceType] = (byType[r.resourceType] ?? 0) + 1;
  return {
    datasetId: meta.datasetId,
    speId: meta.speId,
    records: records.length,
    relationships: refs.length,
    byType,
    importedAt,
  };
}

type Shown = Record<string, string | number | boolean>;

export interface ImportGraph {
  dataset: Record<string, unknown>;
  nodes: Array<{
    id: string;
    label: string;
    name: string;
    resourceType?: string;
    /** What the viewer's inspector lists for the node. */
    properties: Shown;
  }>;
  links: Array<{ source: string; target: string; type: string }>;
  truncated: boolean;
}

const READ_DATASET = `
MATCH (d:ImportedDataset {datasetId: $datasetId})
OPTIONAL MATCH (d)-[:LOADED_INTO]->(w:SpeWorkspace)
RETURN properties(d) AS d, w.speId AS speId`;

const READ_RECORDS = `
MATCH (:ImportedDataset {datasetId: $datasetId})-[:CONTAINS]->(x:ImportedRecord)
WITH x ORDER BY x.resourceType, x.resourceId LIMIT $limit
RETURN x.recordKey AS key, x.resourceType AS type, x.name AS name`;

const READ_REFERENCES = `
MATCH (a:ImportedRecord)-[r:REFERS_TO]->(b:ImportedRecord)
WHERE a.recordKey IN $keys AND b.recordKey IN $keys
RETURN a.recordKey AS from, b.recordKey AS to, r.path AS path`;

/** The dataset, its workspace, its records and how they refer to each other. */
export async function readImportGraph(
  session: Session,
  datasetId: string,
): Promise<ImportGraph | null> {
  const head = await session.run(READ_DATASET, { datasetId });
  if (head.records.length === 0) return null;
  const dataset = Object.fromEntries(
    Object.entries(head.records[0].get("d") as Record<string, unknown>).map(
      ([k, v]) => [
        k,
        neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : v,
      ],
    ),
  );
  const speId = String(head.records[0].get("speId") ?? dataset.speId ?? "");
  const rows = await session.run(READ_RECORDS, {
    datasetId,
    limit: neo4j.int(GRAPH_RECORD_LIMIT + 1),
  });
  const recs = rows.records.slice(0, GRAPH_RECORD_LIMIT);
  const keys = recs.map((r) => String(r.get("key")));
  const refs = await session.run(READ_REFERENCES, { keys });

  const datasetNode = `import:${datasetId}`;
  const workspaceNode = `spe:${speId}`;
  const shown: Shown = {};
  for (const k of [
    "assetId",
    "transferId",
    "agreementId",
    "provider",
    "consumer",
    "importedAt",
    "records",
    "pseudonymised",
  ]) {
    const v = dataset[k];
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    )
      shown[k] = v;
  }
  const nodes: ImportGraph["nodes"] = [
    {
      id: datasetNode,
      label: "ImportedDataset",
      name: String(dataset.name ?? datasetId),
      properties: shown,
    },
    {
      id: workspaceNode,
      label: "SpeWorkspace",
      name: speId,
      properties: { speId },
    },
  ];
  const links: ImportGraph["links"] = [
    { source: datasetNode, target: workspaceNode, type: "LOADED_INTO" },
  ];
  // Where the data came from and under which contract: kept on the dataset,
  // drawn as nodes so the import shows its whole chain.
  if (typeof dataset.provider === "string" && dataset.provider) {
    const id = `import-provider:${dataset.provider}`;
    nodes.push({
      id,
      label: "Participant",
      name: dataset.provider,
      properties: { did: dataset.provider },
    });
    links.push({ source: datasetNode, target: id, type: "PROVIDED_BY" });
  }
  if (typeof dataset.agreementId === "string" && dataset.agreementId) {
    const id = `import-agreement:${dataset.agreementId}`;
    nodes.push({
      id,
      label: "Contract",
      name: dataset.agreementId,
      properties: { agreementId: dataset.agreementId },
    });
    links.push({ source: datasetNode, target: id, type: "UNDER_AGREEMENT" });
  }
  for (const r of recs) {
    const id = `import:${r.get("key")}`;
    const key = String(r.get("key"));
    nodes.push({
      id,
      label: "ImportedRecord",
      name: String(r.get("name")),
      resourceType: String(r.get("type")),
      properties: {
        resourceType: String(r.get("type")),
        resourceId: key.slice(key.lastIndexOf("/") + 1),
      },
    });
    links.push({ source: datasetNode, target: id, type: "CONTAINS" });
  }
  for (const r of refs.records) {
    links.push({
      source: `import:${r.get("from")}`,
      target: `import:${r.get("to")}`,
      type: "REFERS_TO",
    });
  }
  return {
    dataset: { ...dataset, speId },
    nodes,
    links,
    truncated: rows.records.length > GRAPH_RECORD_LIMIT,
  };
}
