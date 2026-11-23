import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  type Hash,
} from "node:crypto";
import neo4j, { type Session } from "neo4j-driver";
import { appendAuditEventAlone, type ChainedEvent } from "./audit-chain.js";
import { AlreadyImportedError, type ImportRequest } from "./spe-import.js";
import { SPE_CHAIN, SPE_EVENT_CODES, type SpeEntry } from "./spe-status.js";

// ---------------------------------------------------------------------------
// A push into an SPE inbox (ADR-095)
// ---------------------------------------------------------------------------
//
// On a push the consumer's data plane asks this proxy to open an inbox in a
// workspace (DPS prepare), and the provider's data plane delivers into it
// (DPS start): one bundle, a stream of NDJSON chunks, or one file. The inbox
// opens only for a workspace whose latest attestation passed, or one that is
// simulated and says so; every step goes on the audit chain `spe` (ADR-045).
//
// Inbox state lives in this process, in a Map. That is a decision with a
// price: the proxy must run as one replica for push (a second replica does
// not know the first one's inboxes), and a restart loses every open inbox,
// so the provider's push then gets 401 and the transfer ends errored. What a
// completed push wrote stays in the workspace; only the read-back of the
// inbox (GET /spe/:speId/inbox/:flowId) is gone with the process.

export const PUSH_PROFILES = [
  "HttpData-PUSH",
  "HttpStream-PUSH",
  "HttpFile-PUSH",
  // Kafka between the two data planes; into the SPE they arrive as a stream
  // of chunks, exactly as HttpStream-PUSH does.
  "Kafka-PUSH",
  "Kafka-PULL",
] as const;
export type PushProfile = (typeof PUSH_PROFILES)[number];

/** The profiles delivered as numbered chunks and a closing message. */
export const STREAM_PROFILES: readonly PushProfile[] = [
  "HttpStream-PUSH",
  "Kafka-PUSH",
  "Kafka-PULL",
];

export function isPushProfile(v: unknown): v is PushProfile {
  return typeof v === "string" && ([...PUSH_PROFILES] as string[]).includes(v);
}

export function isStreamProfile(p: PushProfile): boolean {
  return STREAM_PROFILES.includes(p);
}

/** What the workspace's attestation proves, weakest first (ADR-068 decision 5). */
export type PushAttestationScope = "simulated" | "node" | "workload";

/** The attestation record the provider's data plane checks against its floor. */
export interface InboxAttestation {
  scope: PushAttestationScope;
  result: "pass";
  evidenceDigest: string | null;
  policyId: string | null;
  verifier: string | null;
  tokenExpiresAt: string | null;
}

/** The same fields for a workspace refused an inbox, with what it recorded. */
export interface RefusedAttestation {
  scope: string;
  result: "pass" | "fail" | null;
  evidenceDigest: string | null;
  policyId: string | null;
  verifier: string | null;
  tokenExpiresAt: string | null;
}

export type AttestationDecision =
  | { open: true; attestation: InboxAttestation }
  | { open: false; attestation: RefusedAttestation; reason: string };

/**
 * The attestation rule of the contract: an inbox only for a workspace whose
 * latest attestation passed, or a simulated one. A simulated workspace is
 * admitted whatever its result, because its scope tells the provider that
 * nothing was proven and the provider's floor decides (ADR-095 decision 5);
 * `result: "pass"` in that answer means "admitted by this rule".
 */
export function decideAttestation(entry: SpeEntry): AttestationDecision {
  const a = entry.attestation;
  const common = {
    evidenceDigest: a.evidenceDigest,
    policyId: a.policyId,
    verifier: a.verifier,
    tokenExpiresAt: a.tokenExpiresAt,
  };
  if (entry.simulated) {
    return {
      open: true,
      attestation: { scope: "simulated", result: "pass", ...common },
    };
  }
  const scope = entry.attestationScope;
  if (a.result !== "pass") {
    return {
      open: false,
      attestation: { scope, result: a.result, ...common },
      reason: `${entry.id}'s latest attestation did not pass (result ${
        a.result ?? "none"
      })`,
    };
  }
  if (scope !== "node" && scope !== "workload") {
    return {
      open: false,
      attestation: { scope, result: a.result, ...common },
      reason: `${entry.id}'s attestation scope '${scope}' is not one a push accepts`,
    };
  }
  return { open: true, attestation: { scope, result: "pass", ...common } };
}

// ---- the inboxes -------------------------------------------------------------

export type InboxState = "open" | "completed" | "refused" | "expired";

/**
 * A stream being received. Its chunks are written as they arrive; what is
 * kept here is what the closing message is checked against, and the records
 * written so far (by "Type/id", so a later chunk can refer to them).
 */
interface StreamState {
  nextSeq: number;
  /** Resources received, one per NDJSON line: the closing message's `records`. */
  received: number;
  bytes: number;
  /** Over every chunk body in order; copied, never finalised, until complete. */
  hash: Hash;
  written: Set<string>;
  relationships: number;
  /** push-stream-started is on the chain: the first write may go ahead. */
  startRecorded: boolean;
}

export interface Inbox {
  flowId: string;
  speId: string;
  profile: PushProfile;
  agreementId: string;
  datasetId: string;
  consumer: string;
  provider: string;
  /** SHA-256 of the token, hex. The token itself is never kept. */
  tokenHash: string;
  openedAt: string;
  expiresAt: string;
  closedAt?: string;
  state: "open" | "completed" | "refused";
  attestation: InboxAttestation;
  records?: number;
  bytes?: number;
  sha256?: string;
  reason?: string;
  stream?: StreamState;
  /**
   * When the consumer's control plane told its data plane that the transfer
   * has started. The provider waits for this before it delivers: a consumer
   * that has only been asked to start refuses the completion message
   * ("transfer cannot be completed"), the control plane does not retry that,
   * and a small dataset is delivered faster than a start is processed
   * (docs/gotchas.md, 2026-11-19).
   */
  consumerStartedAt?: string;
}

/** By flowId: a flow has at most one inbox, in one workspace. */
const inboxes = new Map<string, Inbox>();

/** A closed or expired inbox is kept this long for the read-back, then dropped. */
const KEEP_CLOSED_MS = 24 * 60 * 60 * 1000;

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 32 random bytes, base64url, for the provider; only its hash is stored. */
export function newInboxToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}

export function tokenMatches(inbox: Inbox, token: string): boolean {
  const given = Buffer.from(sha256Hex(token), "hex");
  const held = Buffer.from(inbox.tokenHash, "hex");
  return given.length === held.length && timingSafeEqual(given, held);
}

export function inboxState(inbox: Inbox, now: Date = new Date()): InboxState {
  if (inbox.state !== "open") return inbox.state;
  return now.getTime() >= Date.parse(inbox.expiresAt) ? "expired" : "open";
}

export function findInbox(flowId: string): Inbox | undefined {
  return inboxes.get(flowId);
}

/**
 * Stores a new inbox and drops the ones closed or expired long ago, so the
 * map does not grow with every transfer the proxy has seen.
 */
export function storeInbox(inbox: Inbox, now: Date = new Date()): void {
  for (const [id, held] of inboxes) {
    const end = Date.parse(held.closedAt ?? held.expiresAt);
    if (
      inboxState(held, now) !== "open" &&
      now.getTime() - end > KEEP_CLOSED_MS
    )
      inboxes.delete(id);
  }
  inboxes.set(inbox.flowId, inbox);
}

/** Closes an inbox and lets go of its stream state. */
export function closeInbox(
  inbox: Inbox,
  state: "completed" | "refused",
  now: Date = new Date(),
): void {
  inbox.state = state;
  inbox.closedAt = now.toISOString();
  delete inbox.stream;
}

/** An expired inbox keeps nothing either: its stream state goes. */
export function dropBuffer(inbox: Inbox): void {
  delete inbox.stream;
}

export function resetInboxes(): void {
  inboxes.clear();
}

export function startStream(): StreamState {
  return {
    nextSeq: 0,
    received: 0,
    bytes: 0,
    hash: createHash("sha256"),
    written: new Set(),
    relationships: 0,
    startRecorded: false,
  };
}

/** The hash of every chunk so far, leaving the running hash open. */
export function streamDigest(s: StreamState): string {
  return s.hash.copy().digest("hex");
}

/** What GET /spe/:speId/inbox/:flowId answers: never the token or its hash. */
export function inboxView(inbox: Inbox, now: Date = new Date()) {
  return {
    flowId: inbox.flowId,
    speId: inbox.speId,
    profile: inbox.profile,
    state: inboxState(inbox, now),
    ...(inbox.records !== undefined ? { records: inbox.records } : {}),
    ...(inbox.bytes !== undefined ? { bytes: inbox.bytes } : {}),
    ...(inbox.sha256 !== undefined ? { sha256: inbox.sha256 } : {}),
    ...(inbox.reason !== undefined ? { reason: inbox.reason } : {}),
    attestation: inbox.attestation,
    consumerStarted: inbox.consumerStartedAt !== undefined,
    openedAt: inbox.openedAt,
    ...(inbox.closedAt !== undefined ? { closedAt: inbox.closedAt } : {}),
  };
}

// ---- identity never arrives in a workspace -----------------------------------
//
// A pull is pseudonymised by the hub's UI before it reaches an SPE
// (ui/src/lib/transfer-data.ts, pseudonymiseFhir; the rule is
// ui/src/lib/patient-identity.ts). A push does not pass through the UI:
// /dataspace/push-source pseudonymises with the same rule (pseudonymise.ts).
// The inbox is the second line: it refuses a Patient that still carries
// what that rule removes, the fields below or a birth date finer than a
// year, whoever sent it. The SPE is secondary use (Art. 66, Art. 73): no role there
// sees identity. The `id` itself cannot be told from a pseudonym and is not
// checked.

const IDENTIFYING_PATIENT_FIELDS = [
  "name",
  "given",
  "family",
  "telecom",
  "address",
  "identifier",
  "contact",
  "photo",
  "city",
  "postalCode",
  "email",
  "phone",
  "ssn",
  "patientId",
  "resourceId",
  "fhirId",
  "deathDate",
  "deathDateTime",
];

/** The first field that says who a Patient is, or null when there is none. */
export function identifyingPatientField(
  resource: Record<string, unknown>,
): string | null {
  if (resource.resourceType !== "Patient") return null;
  for (const field of IDENTIFYING_PATIENT_FIELDS) {
    const v = resource[field];
    if (v !== undefined && v !== null && v !== "") return field;
  }
  const birth = resource.birthDate;
  if (birth !== undefined && birth !== null) {
    if (typeof birth !== "string" || !/^\d{4}$/.test(birth)) return "birthDate";
  }
  return null;
}

export class IdentityInPushError extends Error {}

/** Throws when any Patient anywhere in the data (entries, contained) says who it is. */
export function refuseIdentity(data: unknown): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const r = node as Record<string, unknown>;
    const field = identifyingPatientField(r);
    if (field) {
      throw new IdentityInPushError(
        `A Patient in the push carries '${field}'; an SPE takes pseudonymised data only (a name, contact details or a birth date finer than the year are refused)`,
      );
    }
    Object.values(r).forEach(walk);
  };
  walk(data);
}

// ---- the audit chain -----------------------------------------------------------

export type PushEventType =
  | "push-inbox-opened"
  | "push-stream-started"
  | "push-received"
  | "push-refused";

export interface PushEvent {
  type: PushEventType;
  outcome: "success" | "refused";
  /** Whose data plane acted: the consumer's opens, the provider's delivers. */
  actor: "consumer" | "provider";
  flowId: string;
  agreementId: string;
  datasetId: string;
  consumer: string;
  provider: string;
  speId: string;
  profile: string;
  attestationScope: string;
  evidenceDigest: string | null;
  policyId: string | null;
  records?: number;
  bytes?: number;
  sha256?: string;
  reason?: string;
}

const PROXY = "mvhd-neo4j-proxy";
const ENTITY_TYPE = {
  system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
  code: "2",
  display: "System Object",
};
const DCM = "http://dicom.nema.org/resources/ontology/DCM";
const EVENT_TYPE: Record<PushEventType, { code: string; display: string }> = {
  "push-inbox-opened": { code: "110100", display: "Application Activity" },
  "push-stream-started": { code: "110107", display: "Import" },
  "push-received": { code: "110107", display: "Import" },
  "push-refused": { code: "110113", display: "Security Alert" },
};

/** FHIR R4 AuditEvent for one push event, in the spe chain's shape. */
export function buildPushAuditEvent(
  e: PushEvent,
  meta: { id: string; recorded: string },
): Record<string, unknown> {
  const details: Array<[string, string]> = [
    ["source", "spe-inbox"],
    ["flowId", e.flowId],
    ["agreementId", e.agreementId],
    ["datasetId", e.datasetId],
    ["consumer", e.consumer],
    ["provider", e.provider],
    ["speId", e.speId],
    ["profile", e.profile],
    ["attestationScope", e.attestationScope],
    ["evidenceDigest", e.evidenceDigest ?? ""],
    ["policyId", e.policyId ?? ""],
    ["records", e.records !== undefined ? String(e.records) : ""],
    ["bytes", e.bytes !== undefined ? String(e.bytes) : ""],
    ["sha256", e.sha256 ?? ""],
    ["reason", e.reason ?? ""],
  ];
  const participant = e.actor === "consumer" ? e.consumer : e.provider;
  return {
    resourceType: "AuditEvent",
    id: meta.id,
    type: { system: DCM, ...EVENT_TYPE[e.type] },
    subtype: [{ system: SPE_EVENT_CODES, code: e.type, display: e.type }],
    action: e.type === "push-received" ? "C" : "E",
    recorded: meta.recorded,
    outcome: e.outcome === "success" ? "0" : "4",
    ...(e.outcome !== "success" && e.reason ? { outcomeDesc: e.reason } : {}),
    agent: [
      {
        who: {
          identifier: { value: participant },
          display: `mvhd-dataplane of the ${e.actor}`,
        },
        requestor: true,
      },
      { who: { display: `${e.speId} workspace` }, requestor: false },
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
        what: { identifier: { system: "urn:ehds:spe", value: e.speId } },
        type: ENTITY_TYPE,
      },
      {
        what: {
          identifier: {
            system: "urn:ehds:contract-agreement",
            value: e.agreementId,
          },
        },
        type: ENTITY_TYPE,
      },
      {
        type: ENTITY_TYPE,
        detail: details
          .filter(([, v]) => v !== "")
          .map(([type, valueString]) => ({ type, valueString })),
      },
    ],
  };
}

/**
 * One push event on the chain `spe`, in a transaction of its own, as the SPE
 * sync appends (never in a batch with a query's record), with the fields an
 * auditor filters on as node properties.
 */
export function appendPushEvent(
  e: PushEvent,
  now: () => Date = () => new Date(),
): Promise<ChainedEvent> {
  return appendAuditEventAlone(
    SPE_CHAIN,
    buildPushAuditEvent(e, { id: randomUUID(), recorded: now().toISOString() }),
    {
      participantId: e.speId,
      outcome: e.outcome,
      properties: {
        speId: e.speId,
        flowId: e.flowId,
        agreementId: e.agreementId,
        datasetId: e.datasetId,
        consumer: e.consumer,
        provider: e.provider,
        profile: e.profile,
        attestationScope: e.attestationScope,
        evidenceDigest: e.evidenceDigest,
        policyId: e.policyId,
        simulated: e.attestationScope === "simulated",
      },
    },
  );
}

/** The event for an inbox, with what happened added. */
export function eventOf(
  inbox: Pick<
    Inbox,
    | "flowId"
    | "agreementId"
    | "datasetId"
    | "consumer"
    | "provider"
    | "speId"
    | "profile"
  >,
  attestation: {
    scope: string;
    evidenceDigest: string | null;
    policyId: string | null;
  },
  what: Pick<PushEvent, "type" | "outcome" | "actor"> &
    Partial<Pick<PushEvent, "records" | "bytes" | "sha256" | "reason">>,
): PushEvent {
  return {
    flowId: inbox.flowId,
    agreementId: inbox.agreementId,
    datasetId: inbox.datasetId,
    consumer: inbox.consumer,
    provider: inbox.provider,
    speId: inbox.speId,
    profile: inbox.profile,
    attestationScope: attestation.scope,
    evidenceDigest: attestation.evidenceDigest,
    policyId: attestation.policyId,
    ...what,
  };
}

// ---- a file into the workspace (HttpFile-PUSH) ----------------------------------

export interface PushedFile {
  sha256: string;
  bytes: number;
  mediaType: string;
  name: string;
  /** The bytes, base64. */
  content: string;
}

const FILE_HELD = `
MATCH (d:ImportedDataset {datasetId: $datasetId})
RETURN d.records AS records, d.importedAt AS importedAt`;

const WRITE_FILE = `
MERGE (w:SpeWorkspace {speId: $meta.speId})
  ON CREATE SET w.createdAt = $importedAt
MERGE (d:ImportedDataset {datasetId: $meta.datasetId})
  ON CREATE SET d.name = 'Transfer of ' + $meta.assetId,
                d.speId = $meta.speId, d.transferId = $meta.transferId,
                d.agreementId = $meta.agreementId, d.assetId = $meta.assetId,
                d.provider = $meta.provider, d.consumer = $meta.consumer,
                d.importedBy = $meta.importedBy,
                d.pseudonymised = $meta.pseudonymised,
                d.importedAt = $importedAt, d.records = 0
  ON MATCH SET d.importedAt = $importedAt
MERGE (d)-[:LOADED_INTO]->(w)
MERGE (f:ImportedFile {fileKey: $fileKey})
  ON CREATE SET f.sha256 = $file.sha256, f.bytes = $bytes,
                f.mediaType = $file.mediaType, f.name = $file.name,
                f.content = $file.content, f.datasetId = $meta.datasetId
  ON MATCH SET f.sha256 = $file.sha256, f.bytes = $bytes,
               f.mediaType = $file.mediaType, f.name = $file.name,
               f.content = $file.content, f.datasetId = $meta.datasetId
MERGE (d)-[:CONTAINS]->(f)`;

/**
 * Writes the file as one dataset in one transaction. A dataset the workspace
 * holds already is refused, as an import is: a flow delivers once.
 */
export async function writeFile(
  session: Session,
  meta: ImportRequest,
  file: PushedFile,
  now: () => Date = () => new Date(),
): Promise<{ importedAt: string }> {
  const importedAt = now().toISOString();
  await session.executeWrite(async (tx) => {
    const held = await tx.run(FILE_HELD, { datasetId: meta.datasetId });
    if (held.records.length) {
      const r = held.records[0];
      const records = r.get("records");
      throw new AlreadyImportedError({
        datasetId: meta.datasetId,
        speId: meta.speId,
        records: neo4j.isInt(records)
          ? (records as { toNumber(): number }).toNumber()
          : Number(records ?? 0),
        importedAt: String(r.get("importedAt") ?? ""),
      });
    }
    await tx.run(WRITE_FILE, {
      meta,
      importedAt,
      fileKey: `${meta.datasetId}/file`,
      file,
      bytes: neo4j.int(file.bytes),
    });
  });
  return { importedAt };
}
