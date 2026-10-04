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
  if (!driver) throw new Error("audit: no Neo4j driver");
  const resource = buildQueryAuditEvent(input, {
    id: randomUUID(),
    recorded: new Date().toISOString(),
  });
  const session = driver.session({ database: "neo4j" });
  try {
    return await session.executeWrite(async (tx) => {
      // SET before RETURN: takes the head node's write lock first, so the
      // seq and head read below cannot change until this commits.
      const head = await tx.run(
        `MERGE (c:AuditChain {id: $chain})
           ON CREATE SET c.seq = 0, c.head = $genesis
         SET c.lockedAt = datetime()
         RETURN c.seq AS seq, c.head AS head`,
        { chain: QUERY_CHAIN, genesis: GENESIS_HASH },
      );
      const record = head.records[0];
      const event = chainEvent(
        resource,
        QUERY_CHAIN,
        toNumber(record.get("seq")) + 1,
        String(record.get("head")),
      );
      await tx.run(
        `MATCH (c:AuditChain {id: $chain})
         CREATE (e:AuditEvent {
           id: $id, chain: $chain, seq: $seq, prevHash: $prevHash, hash: $hash,
           recorded: datetime($recorded), participantId: $participantId,
           outcome: $outcome, resource: $resource
         })
         SET c.seq = $seq, c.head = $hash`,
        {
          chain: QUERY_CHAIN,
          id: resource.id,
          seq: neo4j.int(event.seq),
          prevHash: event.prevHash,
          hash: event.hash,
          recorded: resource.recorded,
          participantId: input.participantId ?? "anonymous",
          outcome: input.outcome,
          resource: canonicalJson(resource),
        },
      );
      return event;
    });
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
