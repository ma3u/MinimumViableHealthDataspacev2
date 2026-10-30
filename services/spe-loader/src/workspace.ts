import { readFileSync } from "node:fs";
import neo4j, { type Session } from "neo4j-driver";
import type { AttestationRecord } from "./attestation.js";
import { decodeProps } from "./codec.js";
import {
  KEY,
  OPTED_OUT_LABEL,
  ident,
  splitStatements,
  type Extract,
} from "./extract.js";

// ---------------------------------------------------------------------------
// The workspace side: writing an opened extract into the SPE's Neo4j
// ---------------------------------------------------------------------------
//
// Every write is a MERGE on (primary label, _speKey), so a second load of the
// same extract changes nothing. Labels are set to the extract's on every
// load, which carries an Art. 71 opt-out (and its reversal) into the
// workspace. Besides the data the loader writes two kinds of record into the
// workspace, for the proxy to read through /spe/status:
//   (:SpeAttestation {speId})  one per workspace, the fields of the contract
//   (:SpeEvent {eventId})      one per attestation, key release or refusal and
//                              per load, which the proxy appends to the hub's
//                              audit chain once each (ADR-045)

const BATCH = 500;

function* chunks<T>(items: T[], size = BATCH): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/** Things only the hub holds. A workspace that has any of them is not a workspace. */
const HUB_MARKERS = [
  "AuditChain",
  "HDABApproval",
  "Participant",
  "DataProduct",
];

export async function assertWorkspace(session: Session): Promise<void> {
  const res = await session.run(
    `UNWIND $labels AS l
     OPTIONAL MATCH (n) WHERE l IN labels(n)
     WITH l, count(n) AS c WHERE c > 0
     RETURN collect(l) AS found`,
    { labels: HUB_MARKERS },
  );
  const found = (res.records[0]?.get("found") as string[] | undefined) ?? [];
  if (found.length > 0) {
    throw new Error(
      `refusing to load: the target holds ${found.join(
        ", ",
      )} nodes, so it is a hub graph, not an SPE workspace`,
    );
  }
}

export async function writeExtract(
  session: Session,
  extract: Extract,
): Promise<{ nodes: number; relationships: number }> {
  const groups = new Map<
    string,
    { primary: string; labels: string[]; rows: unknown[] }
  >();
  for (const n of extract.nodes) {
    const labels = [...new Set(n.labels)].sort();
    const id = `${n.primary}|${labels.join(":")}`;
    const g = groups.get(id) ?? { primary: n.primary, labels, rows: [] };
    g.rows.push({ key: n.key, props: decodeProps(n.props) });
    groups.set(id, g);
  }
  for (const primary of [
    ...new Set([...groups.values()].map((g) => g.primary)),
  ].sort()) {
    await session.run(
      `CREATE INDEX ${ident(`spe_key_${primary}`)} IF NOT EXISTS FOR (n:${ident(
        primary,
      )}) ON (n.${KEY})`,
    );
  }
  await session.run("CALL db.awaitIndexes(300)");

  let nodes = 0;
  for (const g of groups.values()) {
    const query =
      "UNWIND $rows AS row " +
      `MERGE (n:${ident(g.primary)} {${KEY}: row.key}) ` +
      "ON CREATE SET n += row.props " +
      "ON MATCH SET n += row.props " +
      `REMOVE n:${ident(OPTED_OUT_LABEL)} ` +
      `SET n:${g.labels.map(ident).join(":")}`;
    for (const rows of chunks(g.rows)) {
      await session.run(query, { rows });
      nodes += rows.length;
    }
  }

  const relGroups = new Map<
    string,
    { s: string; type: string; e: string; rows: unknown[] }
  >();
  for (const r of extract.rels) {
    const id = `${r.s.primary}|${r.type}|${r.e.primary}`;
    const g = relGroups.get(id) ?? {
      s: r.s.primary,
      type: r.type,
      e: r.e.primary,
      rows: [],
    };
    g.rows.push({ s: r.s.key, e: r.e.key, props: decodeProps(r.props) });
    relGroups.set(id, g);
  }
  let relationships = 0;
  for (const g of relGroups.values()) {
    const query =
      "UNWIND $rows AS row " +
      `MATCH (a:${ident(g.s)} {${KEY}: row.s}) ` +
      `MATCH (b:${ident(g.e)} {${KEY}: row.e}) ` +
      `MERGE (a)-[r:${ident(g.type)}]->(b) ` +
      "ON CREATE SET r += row.props " +
      "ON MATCH SET r += row.props";
    for (const rows of chunks(g.rows)) {
      await session.run(query, { rows });
      relationships += rows.length;
    }
  }
  return { nodes, relationships };
}

/**
 * A refused workspace holds nothing of the permit's data: whatever an
 * earlier load left (a compose workspace that was not restarted) goes. Only
 * loader-written nodes carry _speKey, and assertWorkspace() has made sure
 * this is not the hub.
 */
export async function emptyWorkspace(session: Session): Promise<number> {
  let removed = 0;
  for (;;) {
    const res = await session.run(
      `MATCH (n) WHERE n.${KEY} IS NOT NULL
       WITH n LIMIT 5000
       DETACH DELETE n
       RETURN count(*) AS removed`,
    );
    const c = Number(res.records[0]?.get("removed") ?? 0);
    removed += c;
    if (c === 0) return removed;
  }
}

export async function applyCypherFile(
  session: Session,
  path: string,
): Promise<number> {
  const statements = splitStatements(readFileSync(path, "utf8"));
  for (const s of statements) await session.run(s);
  return statements.length;
}

export async function countPatients(session: Session): Promise<number> {
  const res = await session.run("MATCH (p:Patient) RETURN count(p) AS c");
  return neo4j.integer.toNumber(res.records[0]?.get("c") ?? 0);
}

export interface SpeAttestationRecord {
  speId: string;
  holder: string;
  runsOn: string;
  teeType: string;
  attestationScope: string;
  simulated: boolean;
  label: string;
  attestedAt: string | null;
  keyReleasedAt: string | null;
  permitId: string;
  policyHash: string | null;
  policyCheckedByHardware: boolean;
  status: "loading" | "ready" | "refused";
  loadId: string;
  earStatus: string | null;
  verifier: string | null;
  reason: string | null;
  patients: number | null;
  /** The administration's attestation object (attestation.ts), stored as JSON. */
  attestation: AttestationRecord;
}

export async function recordAttestation(
  session: Session,
  a: SpeAttestationRecord,
): Promise<void> {
  await session.run(
    `MERGE (s:SpeAttestation {speId: $a.speId})
       ON CREATE SET s.createdAt = datetime()
     SET s.holder = $a.holder, s.runsOn = $a.runsOn, s.teeType = $a.teeType,
         s.attestationScope = $a.attestationScope, s.simulated = $a.simulated,
         s.label = $a.label, s.attestedAt = $a.attestedAt,
         s.keyReleasedAt = $a.keyReleasedAt, s.permitId = $a.permitId,
         s.policyHash = $a.policyHash,
         s.policyCheckedByHardware = $a.policyCheckedByHardware,
         s.status = $a.status, s.loadId = $a.loadId, s.earStatus = $a.earStatus,
         s.verifier = $a.verifier, s.reason = $a.reason, s.patients = $a.patients,
         s.attestation = $a.attestation, s.updatedAt = datetime()`,
    {
      a: {
        ...a,
        patients: a.patients == null ? null : neo4j.int(a.patients),
        attestation: JSON.stringify(a.attestation),
      },
    },
  );
}

export type SpeEventType =
  | "spe.attestation"
  | "spe.key_release"
  | "spe.key_refused"
  | "spe.workspace_loaded"
  | "spe.workspace_destroyed";

export interface SpeEventRecord {
  eventId: string;
  type: SpeEventType;
  at: string;
  outcome: "success" | "refused" | "failure";
  speId: string;
  permitId: string;
  policyHash: string | null;
  teeType: string;
  attestationScope: string;
  simulated: boolean;
  loadId: string;
  /** A small JSON summary: ear status, label, reason, counts. Never data, never a key. */
  detail: Record<string, unknown>;
}

export async function recordEvents(
  session: Session,
  events: SpeEventRecord[],
): Promise<void> {
  if (events.length === 0) return;
  await session.run(
    `UNWIND $events AS e
     MERGE (ev:SpeEvent {eventId: e.eventId})
       ON CREATE SET ev.type = e.type, ev.at = e.at, ev.outcome = e.outcome,
                     ev.speId = e.speId, ev.permitId = e.permitId,
                     ev.policyHash = e.policyHash, ev.teeType = e.teeType,
                     ev.attestationScope = e.attestationScope,
                     ev.simulated = e.simulated, ev.loadId = e.loadId,
                     ev.detail = e.detail`,
    { events: events.map((e) => ({ ...e, detail: JSON.stringify(e.detail) })) },
  );
}

export async function currentLoadId(
  session: Session,
  speId: string,
): Promise<string | null> {
  const res = await session.run(
    "MATCH (s:SpeAttestation {speId: $speId}) RETURN s.loadId AS loadId, s.status AS status",
    { speId },
  );
  const r = res.records[0];
  if (!r || r.get("status") === "loading") return null;
  return (r.get("loadId") as string | null) ?? null;
}
