import { randomUUID } from "node:crypto";
import neo4j, { type Session } from "neo4j-driver";
import {
  AlreadyImportedError,
  bundleToRecords,
  readExisting,
  writeImport,
  type ImportOutcome,
  type ImportRequest,
} from "./spe-import.js";

// ---- Staging: an import waits for the access body (#1236) --------------------
//
// Draft implementing act on secure processing environments, Art. 4: data a
// user imports goes into a staging area of the secure processing
// environment, where the access body checks it against the permit before it
// is placed in the instance. Here the staging area is a (:StagedImport) node
// in the target workspace itself: the data never leaves the SPE, and it is
// not part of the workspace's graph (no :ImportedRecord, nothing a query
// reads) until the access body approves it. Approval writes it as an
// ordinary import and removes the staged copy; a refusal removes it.

export interface StagedSummary {
  importId: string;
  speId: string;
  datasetId: string;
  transferId: string;
  agreementId: string;
  assetId: string;
  provider: string;
  consumer: string;
  importedBy: string;
  pseudonymised: boolean;
  overwrite: boolean;
  records: number;
  byType: Record<string, number>;
  stagedAt: string;
}

export class AlreadyStagedError extends Error {
  constructor(public existing: { importId: string; stagedAt: string }) {
    super(
      `This transfer waits for the access body's review already (${existing.importId})`,
    );
  }
}

export class NotStagedError extends Error {}

const STAGE = `
CREATE (s:StagedImport {
  importId: $importId,
  speId: $meta.speId,
  datasetId: $meta.datasetId,
  transferId: $meta.transferId,
  agreementId: $meta.agreementId,
  assetId: $meta.assetId,
  provider: $meta.provider,
  consumer: $meta.consumer,
  importedBy: $meta.importedBy,
  pseudonymised: $meta.pseudonymised,
  overwrite: $overwrite,
  records: $records,
  byType: $byType,
  bundle: $bundle,
  stagedAt: $stagedAt,
  status: 'PENDING'
})`;

const PENDING_FOR = `
MATCH (s:StagedImport {datasetId: $datasetId, status: 'PENDING'})
RETURN s.importId AS importId, s.stagedAt AS stagedAt LIMIT 1`;

const LIST = `
MATCH (s:StagedImport {status: 'PENDING'})
RETURN s {.importId, .speId, .datasetId, .transferId, .agreementId, .assetId,
          .provider, .consumer, .importedBy, .pseudonymised, .overwrite,
          .records, .byType, .stagedAt} AS s
ORDER BY s.stagedAt`;

const TAKE = `
MATCH (s:StagedImport {importId: $importId, status: 'PENDING'})
RETURN s {.*} AS s`;

const DROP = `
MATCH (s:StagedImport {importId: $importId})
DELETE s`;

const num = (v: unknown) =>
  neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v ?? 0);

function summary(s: Record<string, unknown>): StagedSummary {
  let byType: Record<string, number> = {};
  try {
    byType = JSON.parse(String(s.byType ?? "{}"));
  } catch {
    byType = {};
  }
  return {
    importId: String(s.importId),
    speId: String(s.speId ?? ""),
    datasetId: String(s.datasetId ?? ""),
    transferId: String(s.transferId ?? ""),
    agreementId: String(s.agreementId ?? ""),
    assetId: String(s.assetId ?? ""),
    provider: String(s.provider ?? ""),
    consumer: String(s.consumer ?? ""),
    importedBy: String(s.importedBy ?? ""),
    pseudonymised: s.pseudonymised === true,
    overwrite: s.overwrite === true,
    records: num(s.records),
    byType,
    stagedAt: String(s.stagedAt ?? ""),
  };
}

/**
 * Checks the bundle as an import would (shape, size) and keeps it in the
 * workspace's staging area. Refuses a transfer the workspace holds already
 * (unless `overwrite`) or one that waits for review already.
 */
export async function stageImport(
  session: Session,
  meta: ImportRequest,
  bundle: unknown,
  overwrite: boolean,
  now: () => Date = () => new Date(),
  importId: string = randomUUID(),
): Promise<StagedSummary> {
  const { records } = bundleToRecords(meta.datasetId, bundle);
  const byType: Record<string, number> = {};
  for (const r of records)
    byType[r.resourceType] = (byType[r.resourceType] ?? 0) + 1;
  if (!overwrite) {
    const held = await readExisting(session, meta.speId, [meta.datasetId]);
    if (held.length) throw new AlreadyImportedError(held[0]);
  }
  const pending = await session.run(PENDING_FOR, {
    datasetId: meta.datasetId,
  });
  if (pending.records.length) {
    throw new AlreadyStagedError({
      importId: String(pending.records[0].get("importId")),
      stagedAt: String(pending.records[0].get("stagedAt")),
    });
  }
  const stagedAt = now().toISOString();
  await session.executeWrite((tx) =>
    tx.run(STAGE, {
      importId,
      meta,
      overwrite,
      records: neo4j.int(records.length),
      byType: JSON.stringify(byType),
      bundle: JSON.stringify(bundle),
      stagedAt,
    }),
  );
  return summary({
    importId,
    ...meta,
    overwrite,
    records: records.length,
    byType: JSON.stringify(byType),
    stagedAt,
  });
}

/** The imports that wait for the access body in this workspace. */
export async function listStaged(session: Session): Promise<StagedSummary[]> {
  const res = await session.run(LIST);
  return res.records.map((r) => summary(r.get("s") as Record<string, unknown>));
}

/** Approves a staged import: writes it into the workspace, removes the staged copy. */
export async function approveStaged(
  session: Session,
  importId: string,
  now: () => Date = () => new Date(),
): Promise<ImportOutcome & { importId: string }> {
  const res = await session.run(TAKE, { importId });
  if (!res.records.length) throw new NotStagedError(importId);
  const s = res.records[0].get("s") as Record<string, unknown>;
  const meta: ImportRequest = {
    datasetId: String(s.datasetId),
    speId: String(s.speId),
    transferId: String(s.transferId ?? ""),
    agreementId: String(s.agreementId ?? ""),
    assetId: String(s.assetId ?? ""),
    provider: String(s.provider ?? ""),
    consumer: String(s.consumer ?? ""),
    importedBy: String(s.importedBy ?? ""),
    pseudonymised: s.pseudonymised === true,
  };
  const outcome = await writeImport(
    session,
    meta,
    JSON.parse(String(s.bundle)),
    now,
    s.overwrite === true,
  );
  await session.executeWrite((tx) => tx.run(DROP, { importId }));
  return { ...outcome, importId };
}

/** Refuses a staged import: its data is removed from the workspace. */
export async function rejectStaged(
  session: Session,
  importId: string,
): Promise<void> {
  const res = await session.run(TAKE, { importId });
  if (!res.records.length) throw new NotStagedError(importId);
  await session.executeWrite((tx) => tx.run(DROP, { importId }));
}
