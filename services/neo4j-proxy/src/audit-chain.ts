import { createHash, randomUUID } from "node:crypto";
import type { Response } from "express";
import neo4j from "neo4j-driver";
import { driver } from "./db.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Tamper-evident query audit (ADR-045, plane 2; #418)
// ---------------------------------------------------------------------------
//
// Every NLQ and federated query leaves a FHIR R4 AuditEvent in the IHE BALP
// "Query" shape, chained to the one before it: each record carries the hash
// of its predecessor, and its own hash is SHA-256 over the RFC 8785 canonical
// JSON of {chain, seq, prevHash, resource}. Changing, removing or reordering
// any record breaks every hash after it, which verifyChain() reports.
//
// Decided 2026-10-04 on #418:
//   - fail closed: a query whose record cannot be written is not answered;
//   - no plaintext: the question and the generated Cypher are stored as
//     SHA-256 only (Cypher can carry values from the question, such as a
//     name), so the trail itself holds no health or identifying data;
//   - first slice: NLQ and federated queries.
//
// The chain is serialised on one (:AuditChain) head node: the write
// transaction locks it before reading seq and head, so two concurrent queries
// cannot both extend the same predecessor.
//
// Records are written in batches (#519). One lock and one transaction per
// query made the chain the ceiling for every audited query: one Neo4j write
// at a time, platform-wide. Now a call enqueues its record and the writer
// takes everything queued while the previous transaction ran, locks each
// chain once, numbers and hashes the records in queue order, and writes them
// in one transaction. Each caller still resolves only once its own record is
// committed, and rejects if the transaction fails, so nothing about fail
// closed changes; the chain in the database is the same single chain.

export const QUERY_CHAIN = "query";
export const GENESIS_HASH = "0".repeat(64);
const PROXY = "mvhd-neo4j-proxy";

/**
 * RFC 8785 (JCS) canonical JSON for the values an audit record holds:
 * objects (keys sorted by UTF-16 code units, which is what Array.sort does),
 * arrays, strings, finite numbers, booleans and null. JSON.stringify already
 * serialises strings and numbers the way JCS requires (ECMAScript rules).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface QueryAuditInput {
  participantId?: string;
  question: string;
  cypher: string | null;
  method: string;
  resultCount: number;
  odrlEnforced: boolean;
  /** "refused" for a query the proxy blocked; reason says which guard. */
  outcome: "success" | "refused";
  reason?: string;
  federated?: {
    contributors: string[];
    aggregateSuppressed: boolean;
    suppressionReason: string | null;
  };
}

/** FHIR R4 AuditEvent, BALP Query pattern, with no plaintext query. */
export function buildQueryAuditEvent(
  input: QueryAuditInput,
  meta: { id: string; recorded: string },
): Record<string, unknown> {
  const detail = (type: string, value: string) => ({
    type,
    valueString: value,
  });
  const details = [
    detail("questionSha256", sha256Hex(input.question)),
    detail("cypherSha256", sha256Hex(input.cypher ?? "")),
    detail("method", input.method),
    detail("resultCount", String(input.resultCount)),
    detail("odrlEnforced", String(input.odrlEnforced)),
  ];
  if (input.federated) {
    details.push(
      detail("contributors", input.federated.contributors.join(",")),
      detail(
        "aggregateSuppressed",
        String(input.federated.aggregateSuppressed),
      ),
    );
    if (input.federated.suppressionReason) {
      details.push(
        detail("suppressionReason", input.federated.suppressionReason),
      );
    }
  }
  return {
    resourceType: "AuditEvent",
    id: meta.id,
    meta: {
      profile: [
        "https://profiles.ihe.net/ITI/BALP/StructureDefinition/IHE.BasicAudit.Query",
      ],
    },
    type: {
      system: "http://dicom.nema.org/resources/ontology/DCM",
      code: "110112",
      display: "Query",
    },
    subtype: [
      {
        system: "http://hl7.org/fhir/restful-interaction",
        code: "search",
        display: "search",
      },
    ],
    action: "E",
    recorded: meta.recorded,
    outcome: input.outcome === "success" ? "0" : "4",
    ...(input.reason ? { outcomeDesc: input.reason } : {}),
    agent: [
      {
        who: { identifier: { value: input.participantId ?? "anonymous" } },
        requestor: true,
      },
      { who: { display: PROXY }, requestor: false },
    ],
    source: {
      observer: { display: PROXY },
      type: [
        {
          system: "http://terminology.hl7.org/CodeSystem/security-source-type",
          code: "4",
          display: "Application Server",
        },
      ],
    },
    entity: [
      {
        type: {
          system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
          code: "2",
          display: "System Object",
        },
        role: {
          system: "http://terminology.hl7.org/CodeSystem/object-role",
          code: "24",
          display: "Query",
        },
        detail: details,
      },
    ],
  };
}

export interface ChainedEvent {
  chain: string;
  seq: number;
  prevHash: string;
  hash: string;
  resource: Record<string, unknown>;
  /** Set when the chain already held this event (same dedupeKey). */
  duplicate?: boolean;
}

export function chainEvent(
  resource: Record<string, unknown>,
  chain: string,
  seq: number,
  prevHash: string,
): ChainedEvent {
  const hash = sha256Hex(canonicalJson({ chain, seq, prevHash, resource }));
  return { chain, seq, prevHash, hash, resource };
}

export type ChainCheck =
  | { ok: true; count: number; head: string }
  | { ok: false; seq: number; reason: string };

/** Checks a chain read back in seq order, from its first record. */
export function verifyChain(events: ChainedEvent[]): ChainCheck {
  let prev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const e of events) {
    if (e.seq !== expectedSeq) {
      return {
        ok: false,
        seq: e.seq,
        reason: `expected seq ${expectedSeq}, found ${e.seq}`,
      };
    }
    if (e.prevHash !== prev) {
      return {
        ok: false,
        seq: e.seq,
        reason: "prevHash does not match the previous record's hash",
      };
    }
    const recomputed = chainEvent(e.resource, e.chain, e.seq, e.prevHash).hash;
    if (recomputed !== e.hash) {
      return {
        ok: false,
        seq: e.seq,
        reason: "hash does not match the record's content",
      };
    }
    prev = e.hash;
    expectedSeq += 1;
  }
  return { ok: true, count: events.length, head: prev };
}

function toNumber(v: unknown): number {
  return neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v);
}

/**
 * Appends one query audit record to the chain in Neo4j. Resolves only once
 * the record is committed; rejects otherwise, and the caller must then not
 * release the query's results (fail closed).
 */
export async function appendQueryAudit(
  input: QueryAuditInput,
): Promise<ChainedEvent> {
  const resource = buildQueryAuditEvent(input, {
    id: randomUUID(),
    recorded: new Date().toISOString(),
  });
  return appendAuditEvent(QUERY_CHAIN, resource, {
    participantId: input.participantId ?? "anonymous",
    outcome: input.outcome,
  });
}

export interface AuditIndex {
  /** Indexed on the node for the UI and queries; the resource is the record. */
  participantId: string;
  outcome: string;
  /**
   * A key the same event always carries, such as an EDC event id. An event
   * whose key the chain already holds is not appended again, so a retried
   * callback leaves one record, and the existing one is returned.
   */
  dedupeKey?: string;
}

/**
 * Appends one AuditEvent resource to a chain. Resolves once committed,
 * rejects otherwise. The record is written with whatever else is queued, in
 * one transaction that holds the chain's (:AuditChain) head lock.
 */
export async function appendAuditEvent(
  chain: string,
  resource: Record<string, unknown>,
  index: AuditIndex,
): Promise<ChainedEvent> {
  if (!driver) throw new Error("audit: no Neo4j driver");
  // A record that cannot be serialised fails here, alone, before it joins a
  // batch whose other members it would otherwise take down with it.
  canonicalJson(resource);
  return new Promise<ChainedEvent>((resolve, reject) => {
    queue.push({ chain, resource, index, resolve, reject });
    // One microtask later, so records enqueued in the same tick share a batch.
    queueMicrotask(() => void flush());
  });
}

interface PendingRecord {
  chain: string;
  resource: Record<string, unknown>;
  index: AuditIndex;
  resolve: (event: ChainedEvent) => void;
  reject: (err: unknown) => void;
}

/** Records waiting for the next transaction, in arrival order. */
const queue: PendingRecord[] = [];
let flushing = false;
/** Upper bound for one transaction; the rest waits for the next one. */
const BATCH_MAX = Math.max(
  1,
  parseInt(process.env.AUDIT_BATCH_MAX ?? "100", 10) || 100,
);

/** Writes batches until the queue is empty. One flush runs at a time. */
async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const batch = queue.splice(0, BATCH_MAX);
      try {
        const events = await writeBatch(batch);
        batch.forEach((p, i) => p.resolve(events[i]));
      } catch (err) {
        // Fail closed for everyone in the transaction: none was committed.
        batch.forEach((p) => p.reject(err));
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * One transaction for a batch: lock each chain's head (in a fixed order, so
 * two replicas never wait on each other), find the keys the chains already
 * hold, then number, hash and write the rest in queue order.
 */
async function writeBatch(batch: PendingRecord[]): Promise<ChainedEvent[]> {
  if (!driver) throw new Error("audit: no Neo4j driver");
  const session = driver.session({ database: "neo4j" });
  try {
    const events = await session.executeWrite(async (tx) => {
      const heads = new Map<string, { seq: number; head: string }>();
      for (const chain of [...new Set(batch.map((p) => p.chain))].sort()) {
        // SET before RETURN: takes the head node's write lock first, so the
        // seq and head read below cannot change until this commits.
        const head = await tx.run(
          `MERGE (c:AuditChain {id: $chain})
             ON CREATE SET c.seq = 0, c.head = $genesis
           SET c.lockedAt = datetime()
           RETURN c.seq AS seq, c.head AS head`,
          { chain, genesis: GENESIS_HASH },
        );
        const record = head.records[0];
        heads.set(chain, {
          seq: toNumber(record.get("seq")),
          head: String(record.get("head")),
        });
      }

      // An event whose key the chain already holds is not appended again, so
      // a retried callback leaves one record; the same key twice in one batch
      // leaves one record too.
      const dedupeId = (p: PendingRecord) =>
        p.index.dedupeKey ? `${p.chain}\u0000${p.index.dedupeKey}` : null;
      const known = new Map<string, ChainedEvent>();
      const keyed = batch.filter((p) => p.index.dedupeKey);
      if (keyed.length > 0) {
        const seen = await tx.run(
          `UNWIND $keys AS k
           MATCH (e:AuditEvent {chain: k.chain, dedupeKey: k.key})
           RETURN k.chain AS chain, k.key AS key, e.seq AS seq,
                  e.prevHash AS prevHash, e.hash AS hash, e.resource AS resource`,
          {
            keys: keyed.map((p) => ({
              chain: p.chain,
              key: p.index.dedupeKey,
            })),
          },
        );
        for (const r of seen.records) {
          known.set(`${String(r.get("chain"))}\u0000${String(r.get("key"))}`, {
            chain: String(r.get("chain")),
            seq: toNumber(r.get("seq")),
            prevHash: String(r.get("prevHash")),
            hash: String(r.get("hash")),
            resource: JSON.parse(String(r.get("resource"))),
            duplicate: true,
          });
        }
      }

      const out: ChainedEvent[] = [];
      const rows: Array<Record<string, unknown>> = [];
      for (const p of batch) {
        const key = dedupeId(p);
        const prior = key ? known.get(key) : undefined;
        if (prior) {
          out.push(prior);
          continue;
        }
        const head = heads.get(p.chain)!;
        const event = chainEvent(p.resource, p.chain, head.seq + 1, head.head);
        head.seq = event.seq;
        head.head = event.hash;
        out.push(event);
        if (key) known.set(key, { ...event, duplicate: true });
        rows.push({
          chain: p.chain,
          id: p.resource.id,
          seq: neo4j.int(event.seq),
          prevHash: event.prevHash,
          hash: event.hash,
          recorded: p.resource.recorded,
          participantId: p.index.participantId,
          outcome: p.index.outcome,
          resource: canonicalJson(p.resource),
          dedupeKey: p.index.dedupeKey ?? null,
        });
      }
      if (rows.length > 0) {
        await tx.run(
          `UNWIND $events AS ev
           CREATE (e:AuditEvent {
             id: ev.id, chain: ev.chain, seq: ev.seq, prevHash: ev.prevHash, hash: ev.hash,
             recorded: datetime(ev.recorded), participantId: ev.participantId,
             outcome: ev.outcome, resource: ev.resource, dedupeKey: ev.dedupeKey
           })`,
          { events: rows },
        );
        await tx.run(
          `UNWIND $heads AS h
           MATCH (c:AuditChain {id: h.chain})
           SET c.seq = h.seq, c.head = h.head`,
          {
            heads: [...heads].map(([chain, h]) => ({
              chain,
              seq: neo4j.int(h.seq),
              head: h.head,
            })),
          },
        );
      }
      return out;
    });
    // A Plane 1 copy for dashboards (ADR-045 decision 12): what kind of
    // record, never who or which data. The chain stays the evidence.
    events.forEach((committed, i) => {
      const { chain, resource, index } = batch[i];
      if (committed.duplicate) {
        logger.info(
          { audit: { chain, seq: committed.seq } },
          "audit duplicate ignored",
        );
        return;
      }
      logger.info(
        {
          audit: {
            chain,
            seq: committed.seq,
            type: auditType(resource),
            outcome: index.outcome,
            source: detailValue(resource, "source"),
            demo: detailValue(resource, "demo") === "true",
            batch: batch.length,
          },
        },
        "audit recorded",
      );
    });
    return events;
  } finally {
    await session.close();
  }
}

/** The record's kind: its first subtype code (search, transfer-process.started, ...). */
export function auditType(resource: Record<string, unknown>): string {
  const subtype = resource.subtype as Array<{ code?: string }> | undefined;
  return subtype?.[0]?.code ?? "unknown";
}

function detailValue(
  resource: Record<string, unknown>,
  type: string,
): string | undefined {
  for (const entity of (resource.entity ?? []) as Array<{
    detail?: Array<{ type: string; valueString?: string }>;
  }>) {
    const found = entity.detail?.find((d) => d.type === type);
    if (found) return found.valueString;
  }
  return undefined;
}

export interface AuditSummary {
  seq: number;
  recorded: string;
  type: string;
  outcome: string;
  outcomeDesc?: string;
  agents: string[];
  entities: Record<string, string>;
  source?: string;
  demo: boolean;
  hash: string;
}

/**
 * One record reduced to what an operator scans in a table: what happened,
 * how it ended, who took part and under which agreement and permit. The
 * query chain stores questions as hashes only, so nothing here is health data.
 */
export function summarize(event: ChainedEvent): AuditSummary {
  const r = event.resource;
  const entities: Record<string, string> = {};
  for (const e of (r.entity ?? []) as Array<{
    what?: { identifier?: { system?: string; value?: string } };
  }>) {
    const id = e.what?.identifier;
    if (id?.system && id.value)
      entities[id.system.replace(/^urn:/, "")] = id.value;
  }
  return {
    seq: event.seq,
    recorded: String(r.recorded),
    type: auditType(r),
    outcome: String(r.outcome),
    ...(r.outcomeDesc ? { outcomeDesc: String(r.outcomeDesc) } : {}),
    agents: (
      (r.agent ?? []) as Array<{
        who?: { identifier?: { value?: string }; display?: string };
      }>
    )
      .map((a) => a.who?.identifier?.value ?? a.who?.display ?? "")
      .filter(Boolean),
    entities,
    source: detailValue(r, "source"),
    demo: detailValue(r, "demo") === "true",
    hash: event.hash,
  };
}

/** The last `limit` records of a chain, newest first. */
export async function readRecent(
  chain: string,
  limit: number,
): Promise<ChainedEvent[]> {
  if (!driver) throw new Error("audit: no Neo4j driver");
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `MATCH (e:AuditEvent {chain: $chain})
       RETURN e.seq AS seq, e.prevHash AS prevHash, e.hash AS hash, e.resource AS resource
       ORDER BY e.seq DESC LIMIT $limit`,
      { chain, limit: neo4j.int(limit) },
    );
    return res.records.map((r) => ({
      chain,
      seq: toNumber(r.get("seq")),
      prevHash: String(r.get("prevHash")),
      hash: String(r.get("hash")),
      resource: JSON.parse(String(r.get("resource"))),
    }));
  } finally {
    await session.close();
  }
}

const OUTCOME_TEXT: Record<string, string> = {
  "0": "success",
  "4": "refused",
  "8": "failure",
};

export interface AuditStats {
  from: string;
  to: string;
  bucketSeconds: number;
  totals: Array<{ type: string; outcome: string; count: number }>;
  series: Array<{ time: string; type: string; count: number }>;
}

/**
 * Counts a chain's records in [from, to] by kind and outcome, in total and per
 * time bucket. Counted from the records themselves, so a dashboard shows what
 * the evidence holds, not what a log pipeline happened to deliver.
 */
export async function chainStats(
  chain: string,
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): Promise<AuditStats> {
  if (!driver) throw new Error("audit: no Neo4j driver");
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `MATCH (e:AuditEvent {chain: $chain})
       WHERE e.recorded >= datetime({epochMillis: $from})
         AND e.recorded <= datetime({epochMillis: $to})
       RETURN e.recorded.epochMillis AS at, e.resource AS resource`,
      { chain, from: neo4j.int(fromMs), to: neo4j.int(toMs) },
    );
    const totals = new Map<
      string,
      { type: string; outcome: string; count: number }
    >();
    const series = new Map<
      string,
      { time: string; type: string; count: number }
    >();
    const bucketMs = bucketSeconds * 1000;
    for (const r of res.records) {
      const resource = JSON.parse(String(r.get("resource")));
      const type = auditType(resource);
      const outcome =
        OUTCOME_TEXT[String(resource.outcome)] ?? String(resource.outcome);
      const tKey = `${type}|${outcome}`;
      const total = totals.get(tKey) ?? { type, outcome, count: 0 };
      total.count += 1;
      totals.set(tKey, total);
      const at = toNumber(r.get("at"));
      const bucket = new Date(
        Math.floor(at / bucketMs) * bucketMs,
      ).toISOString();
      const sKey = `${bucket}|${type}`;
      const point = series.get(sKey) ?? { time: bucket, type, count: 0 };
      point.count += 1;
      series.set(sKey, point);
    }
    return {
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      bucketSeconds,
      totals: [...totals.values()].sort((a, b) => a.type.localeCompare(b.type)),
      series: [...series.values()].sort((a, b) => a.time.localeCompare(b.time)),
    };
  } finally {
    await session.close();
  }
}

/** Reads a chain back in order, for verifyChain(). */
export async function readChain(chain = QUERY_CHAIN): Promise<ChainedEvent[]> {
  if (!driver) throw new Error("audit: no Neo4j driver");
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.run(
      `MATCH (e:AuditEvent {chain: $chain})
       RETURN e.seq AS seq, e.prevHash AS prevHash, e.hash AS hash, e.resource AS resource
       ORDER BY e.seq`,
      { chain },
    );
    return res.records.map((r) => ({
      chain,
      seq: toNumber(r.get("seq")),
      prevHash: String(r.get("prevHash")),
      hash: String(r.get("hash")),
      resource: JSON.parse(String(r.get("resource"))),
    }));
  } finally {
    await session.close();
  }
}

/** The answer when the record could not be written: no data, a 503. */
export function auditUnavailable(res: Response, err: unknown): void {
  logger.error({ err }, "audit write failed, query not answered");
  res.status(503).json({
    error:
      "The query was not answered: its audit record could not be written. Try again; every query must be on the audit trail (ADR-045).",
  });
}
