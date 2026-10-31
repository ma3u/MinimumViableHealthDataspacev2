import { randomUUID } from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { appendAuditEventAlone, type ChainedEvent } from "./audit-chain.js";
import {
  NEO4J_SPE2_URI,
  SPE1_RUNS_ON,
  SPE2_RUNS_ON,
  SPE_AUDIT_SYNC_MS,
  SPE_ENVIRONMENT,
  SPE_READ_TIMEOUT_MS,
  TRUSTEE_OPERATOR,
  TRUSTEE_PROBE_URL,
  TRUSTEE_URL,
  TRUSTEE_VERIFIER,
} from "./config.js";
import { driver, spe1Driver, spe1IsWorkspace, spe2Driver } from "./db.js";
import { logger } from "./logger.js";
import { OPTED_OUT_LABEL, PERSON_LABELS } from "./opt-out.js";

// ---------------------------------------------------------------------------
// The SPEs' state for the administration, their events for the audit chain,
// and the hub's Art. 71 opt-outs for the workspaces (ADR-068, ADR-069, #774)
// ---------------------------------------------------------------------------
//
// The loader cannot reach the hub graph from an ACI workspace (ACA exposes
// the hub's Neo4j inside its environment only, by design). So it records what
// happened in the workspace itself: one (:SpeAttestation) per workspace and
// one (:SpeEvent) per attestation, key release, refusal and load.
//
// GET /spe/status only reads (speStatus). Every write is the sync's
// (runSpeSync), on a timer, one run at a time:
//   - each workspace event goes to the hub's audit chain `spe` once, the event
//     id as dedupe key, in a transaction of its own (ADR-045);
//   - spe.workspace_destroyed is the proxy's own observation: a workspace
//     that answers with a different load than the one the hub saw last was
//     destroyed and loaded afresh; the hub keeps the last load per SPE on a
//     (:SpeWorkspace {speId}) node;
//   - the hub's Art. 71 opt-outs (the OptedOut label, ADR-062) are put on, and
//     taken off, the workspaces' copies of the same persons, so an opt-out
//     made after the extract was sealed reaches every SPE within one sync
//     interval; each change is recorded as spe.optout_synced, counts only.

export const SPE_CHAIN = "spe";
const PROXY = "mvhd-neo4j-proxy";
const CODES = "https://ehds.mabu.red/fhir/CodeSystem/spe-audit-event";

export type SpeEventType =
  | "spe.attestation"
  | "spe.key_release"
  | "spe.key_refused"
  | "spe.workspace_loaded"
  | "spe.workspace_destroyed"
  | "spe.optout_synced";

export interface SpeEvent {
  eventId: string;
  type: SpeEventType;
  at: string;
  outcome: "success" | "refused" | "failure";
  speId: string;
  permitId: string | null;
  policyHash: string | null;
  teeType: string;
  attestationScope: string;
  simulated: boolean;
  loadId: string | null;
  detail: Record<string, unknown>;
}

export interface SpeEntry {
  id: "SPE-1" | "SPE-2";
  holder: string;
  runsOn: string;
  teeType: string;
  attestationScope: string;
  simulated: boolean;
  label: string;
  attestedAt: string | null;
  keyReleasedAt: string | null;
  permitId: string | null;
  policyHash: string | null;
  policyCheckedByHardware: boolean;
  patients: number | null;
  status: "ready" | "loading" | "refused" | "unreachable";
  attestation: SpeAttestationDetail;
}

/**
 * The attestation itself, as the loader read it from Trustee's EAR token
 * (services/spe-loader/src/attestation.ts). Every field is present; null
 * where nothing is known, `result` included for an SPE never attested.
 */
export interface SpeAttestationDetail {
  verifier: string | null;
  result: "pass" | "fail" | null;
  evidenceDigest: string | null;
  tokenIssuedAt: string | null;
  tokenExpiresAt: string | null;
  policyId: string | null;
  claims: {
    tee: string | null;
    measurement: string | null;
    reportedTcb: string | null;
    hostData: string | null;
    reportData: string | null;
    pcrs: Record<string, string> | null;
    vmId: string | null;
  };
  refusalReason: string | null;
}

export interface SpeStatus {
  environment: "azure" | "local";
  /** null when this proxy has no Trustee configured (TRUSTEE_URL unset). */
  trustee: {
    url: string;
    operator: string;
    verifier: string;
    reachable: boolean;
  } | null;
  spes: SpeEntry[];
  residualTrust: string[];
}

const HOLDERS = {
  "SPE-1": "AlphaKlinik Berlin",
  "SPE-2": "Limburg Medical Centre",
} as const;

const RESIDUAL_TRUST = {
  // ACI confidential containers (ADR-069): AMD's chain signs the report;
  // Microsoft's utility VM image runs the containers, its launch measurement
  // endorsed by Microsoft's reference-info, not by anyone else.
  azure: [
    "AMD root of trust",
    "Microsoft utility VM image (measurement endorsed by Microsoft)",
  ],
  local: [
    "None proven: no TEE on this machine, the evidence comes from Trustee's sample attester",
  ],
};

/** What a workspace holds about itself, or null when it has no record. */
export interface WorkspaceRead {
  attestation: Record<string, unknown> | null;
  patients: number;
  events: SpeEvent[];
}

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Rejects when `p` takes longer than `ms`: a hung workspace must not hang a caller. */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what}: no answer within ${ms} ms`)),
      ms,
    );
    timer.unref();
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

export async function readWorkspace(d: Driver): Promise<WorkspaceRead> {
  const session = d.session({
    database: "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const res = await withTimeout(
      session.run(
        `OPTIONAL MATCH (s:SpeAttestation)
         WITH s ORDER BY s.updatedAt DESC LIMIT 1
         CALL { MATCH (p:Patient) RETURN count(p) AS patients }
         CALL { OPTIONAL MATCH (e:SpeEvent) WITH e ORDER BY e.at
                RETURN collect(e {.*}) AS events }
         RETURN s {.*} AS attestation, patients, events`,
        {},
        { timeout: SPE_READ_TIMEOUT_MS },
      ),
      SPE_READ_TIMEOUT_MS,
      "SPE workspace read",
    );
    const r = res.records[0];
    const events = ((r?.get("events") as Array<Record<string, unknown>>) ?? [])
      .filter((e) => e && e.eventId)
      .map(
        (e): SpeEvent => ({
          eventId: String(e.eventId),
          type: String(e.type) as SpeEventType,
          at: String(e.at),
          outcome: (String(e.outcome) as SpeEvent["outcome"]) ?? "success",
          speId: String(e.speId),
          permitId: str(e.permitId),
          policyHash: str(e.policyHash),
          teeType: String(e.teeType ?? "none"),
          attestationScope: String(e.attestationScope ?? "none"),
          simulated: e.simulated !== false,
          loadId: str(e.loadId),
          detail: parseDetail(e.detail),
        }),
      );
    return {
      attestation:
        (r?.get("attestation") as Record<string, unknown> | null) ?? null,
      patients: neo4j.integer.toNumber(r?.get("patients") ?? 0),
      events,
    };
  } finally {
    // A session on a hung connection may not close either.
    await withTimeout(session.close(), 2000, "SPE session close").catch(
      () => undefined,
    );
  }
}

function parseDetail(v: unknown): Record<string, unknown> {
  if (typeof v !== "string") return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const STATUSES = new Set(["ready", "loading", "refused"]);

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

/** The stored attestation object, every field present, null where unknown. */
export function attestationDetail(
  stored: unknown,
  fallbackReason: string | null,
): SpeAttestationDetail {
  let raw: Record<string, unknown> = {};
  if (typeof stored === "string") {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") raw = parsed;
    } catch {
      raw = {};
    }
  }
  const c = (raw.claims ?? {}) as Record<string, unknown>;
  const pcrs =
    c.pcrs && typeof c.pcrs === "object"
      ? Object.fromEntries(
          Object.entries(c.pcrs as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ) as Array<[string, string]>,
        )
      : null;
  return {
    verifier: strOrNull(raw.verifier),
    result: raw.result === "pass" || raw.result === "fail" ? raw.result : null,
    evidenceDigest: strOrNull(raw.evidenceDigest),
    tokenIssuedAt: strOrNull(raw.tokenIssuedAt),
    tokenExpiresAt: strOrNull(raw.tokenExpiresAt),
    policyId: strOrNull(raw.policyId),
    claims: {
      tee: strOrNull(c.tee),
      measurement: strOrNull(c.measurement),
      reportedTcb: strOrNull(c.reportedTcb),
      hostData: strOrNull(c.hostData),
      reportData: strOrNull(c.reportData),
      pcrs: pcrs && Object.keys(pcrs).length > 0 ? pcrs : null,
      vmId: strOrNull(c.vmId),
    },
    refusalReason: strOrNull(raw.refusalReason) ?? fallbackReason,
  };
}

/** One SPE in the contract's shape, from what its workspace says. */
export function speEntry(
  id: "SPE-1" | "SPE-2",
  read: WorkspaceRead | null,
  runsOnDefault: string,
): SpeEntry {
  const a = read?.attestation ?? null;
  const status: SpeEntry["status"] = !read
    ? "unreachable"
    : a && STATUSES.has(String(a.status))
      ? (String(a.status) as SpeEntry["status"])
      : read.patients > 0
        ? "ready"
        : "loading";
  return {
    id,
    holder: str(a?.holder) ?? HOLDERS[id],
    runsOn: str(a?.runsOn) ?? runsOnDefault,
    teeType: str(a?.teeType) ?? "none",
    attestationScope: str(a?.attestationScope) ?? "none",
    simulated: a ? a.simulated !== false : true,
    label: str(a?.label) ?? "Simulated attestation",
    attestedAt: str(a?.attestedAt),
    keyReleasedAt: str(a?.keyReleasedAt),
    permitId: str(a?.permitId),
    policyHash: str(a?.policyHash),
    policyCheckedByHardware: a?.policyCheckedByHardware === true,
    patients: read ? read.patients : null,
    status,
    attestation: attestationDetail(
      a?.attestation,
      status === "refused" ? str(a?.reason) : null,
    ),
  };
}

/** Any HTTP answer means Trustee is up; KBS has no health endpoint. */
export async function probeTrustee(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<boolean> {
  if (!url) return false;
  try {
    await fetchImpl(`${url.replace(/\/$/, "")}/kbs/v0/auth`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

function runsOnDefault(id: "SPE-1" | "SPE-2"): string {
  if (id === "SPE-1") {
    return (
      SPE1_RUNS_ON ??
      (spe1IsWorkspace()
        ? "SPE-1 workspace"
        : "The hub graph (no workspace of its own)")
    );
  }
  return SPE2_RUNS_ON ?? "SPE-2 workspace";
}

interface Target {
  id: "SPE-1" | "SPE-2";
  driver: Driver | null;
  /** Configured but not connected: unreachable rather than absent. */
  configured: boolean;
}

function targets(): Target[] {
  return [
    {
      id: "SPE-1",
      driver: spe1IsWorkspace() ? spe1Driver : driver,
      configured: true,
    },
    { id: "SPE-2", driver: spe2Driver, configured: Boolean(NEO4J_SPE2_URI) },
  ];
}

async function readAll(): Promise<
  Array<{ target: Target; read: WorkspaceRead | null }>
> {
  return Promise.all(
    targets()
      .filter((t) => t.configured)
      .map(async (target) => {
        if (!target.driver) return { target, read: null };
        try {
          return { target, read: await readWorkspace(target.driver) };
        } catch (err) {
          logger.warn({ err, spe: target.id }, "SPE workspace did not answer");
          return { target, read: null };
        }
      }),
  );
}

export async function speStatus(fetchImpl: typeof fetch = fetch): Promise<{
  status: SpeStatus;
  reads: Array<{ id: string; read: WorkspaceRead | null }>;
}> {
  const [reads, reachable] = await Promise.all([
    readAll(),
    probeTrustee(TRUSTEE_PROBE_URL, fetchImpl),
  ]);
  return {
    status: {
      environment: SPE_ENVIRONMENT,
      trustee: TRUSTEE_URL
        ? {
            url: TRUSTEE_URL,
            operator: TRUSTEE_OPERATOR,
            verifier: TRUSTEE_VERIFIER,
            reachable,
          }
        : null,
      spes: reads.map(({ target, read }) =>
        speEntry(target.id, read, runsOnDefault(target.id)),
      ),
      residualTrust: RESIDUAL_TRUST[SPE_ENVIRONMENT],
    },
    reads: reads.map(({ target, read }) => ({ id: target.id, read })),
  };
}

// ---- the audit chain -------------------------------------------------------

const OUTCOME = { success: "0", refused: "4", failure: "8" } as const;

/** FHIR R4 AuditEvent for one SPE event, in the dsp chain's shape. */
export function buildSpeAuditEvent(
  e: SpeEvent,
  meta: { recorded: string },
): Record<string, unknown> {
  const details: Array<[string, string]> = [
    ["source", "spe-loader"],
    ["speId", e.speId],
    ["permitId", e.permitId ?? ""],
    ["policyHash", e.policyHash ?? ""],
    ["teeType", e.teeType],
    ["attestationScope", e.attestationScope],
    ["simulated", String(e.simulated)],
    ["loadId", e.loadId ?? ""],
    ["occurredAt", e.at],
    ["evidence", JSON.stringify(e.detail)],
  ];
  const entity: Array<Record<string, unknown>> = [
    {
      what: { identifier: { system: "urn:ehds:spe", value: e.speId } },
      type: {
        system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
        code: "2",
        display: "System Object",
      },
    },
  ];
  if (e.permitId) {
    entity.push({
      what: {
        identifier: { system: "urn:ehds:data-permit", value: e.permitId },
      },
      type: {
        system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
        code: "2",
        display: "System Object",
      },
      role: {
        system: "http://terminology.hl7.org/CodeSystem/object-role",
        code: "13",
        display: "Security Resource",
      },
    });
  }
  entity.push({
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
      code: "2",
      display: "System Object",
    },
    detail: details
      .filter(([, v]) => v !== "")
      .map(([type, valueString]) => ({ type, valueString })),
  });
  return {
    resourceType: "AuditEvent",
    id: e.eventId,
    type: {
      system: "http://dicom.nema.org/resources/ontology/DCM",
      code: "110113",
      display: "Security Alert",
    },
    subtype: [{ system: CODES, code: e.type, display: e.type }],
    action: "E",
    recorded: meta.recorded,
    outcome: OUTCOME[e.outcome] ?? "0",
    ...(e.outcome !== "success" && typeof e.detail.reason === "string"
      ? { outcomeDesc: e.detail.reason }
      : {}),
    agent: [
      {
        who: { display: `${e.speId} workspace (spe-loader)` },
        requestor: true,
      },
      { who: { display: TRUSTEE_OPERATOR }, requestor: false },
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
    entity,
  };
}

/** Event ids already on the chain, so a sync does not lock it for each again. */
const synced = new Set<string>();

export function resetSpeAuditCache(): void {
  synced.clear();
}

/**
 * One SPE event on the chain `spe`, in a transaction of its own (never in a
 * batch with a query's record), with the auditor's fields as node properties.
 */
async function appendSpeEvent(
  e: SpeEvent,
  now: () => Date,
): Promise<ChainedEvent> {
  const key = `spe:${e.eventId}`;
  const ev = await appendAuditEventAlone(
    SPE_CHAIN,
    buildSpeAuditEvent(e, { recorded: now().toISOString() }),
    {
      participantId: e.speId,
      outcome: e.outcome,
      dedupeKey: key,
      // What the auditor filters on, as node properties (#774).
      properties: {
        speId: e.speId,
        permitId: e.permitId,
        policyHash: e.policyHash,
        teeType: e.teeType,
        attestationScope: e.attestationScope,
        simulated: e.simulated,
      },
    },
  );
  synced.add(key);
  return ev;
}

/**
 * Appends every event a workspace recorded and the hub has not, and a
 * spe.workspace_destroyed for a load that has been replaced. Returns what it
 * appended. Never throws: the next run tries again.
 */
export async function syncSpeAudit(
  reads: Array<{ id: string; read: WorkspaceRead | null }>,
  now: () => Date = () => new Date(),
): Promise<ChainedEvent[]> {
  const appended: ChainedEvent[] = [];
  for (const { id, read } of reads) {
    if (!read) continue;
    try {
      const destroyed = await noteLoad(id, read, now);
      for (const e of [...destroyed, ...read.events]) {
        if (synced.has(`spe:${e.eventId}`)) continue;
        const ev = await appendSpeEvent(e, now);
        if (!ev.duplicate) appended.push(ev);
      }
    } catch (err) {
      logger.warn({ err, spe: id }, "SPE events not yet on the audit chain");
    }
  }
  return appended;
}

/**
 * Compares the workspace's current load with the last one the hub saw, keeps
 * the new one, and returns the destroyed event for the old one when they
 * differ.
 */
async function noteLoad(
  id: string,
  read: WorkspaceRead,
  now: () => Date,
): Promise<SpeEvent[]> {
  const a = read.attestation;
  const loadId = str(a?.loadId);
  if (!a || !loadId || a.status === "loading") return [];
  const session = driver.session({ database: "neo4j" });
  try {
    const res = await session.executeWrite((tx) =>
      tx.run(
        `MERGE (w:SpeWorkspace {speId: $id})
           ON CREATE SET w.createdAt = datetime()
         WITH w, w {.*} AS before
         SET w.loadId = $loadId, w.permitId = $permitId,
             w.policyHash = $policyHash, w.teeType = $teeType,
             w.attestationScope = $attestationScope,
             w.simulated = $simulated, w.seenAt = $now
         RETURN before`,
        {
          id,
          loadId,
          permitId: str(a.permitId),
          policyHash: str(a.policyHash),
          teeType: str(a.teeType) ?? "none",
          attestationScope: str(a.attestationScope) ?? "none",
          simulated: a.simulated !== false,
          now: now().toISOString(),
        },
      ),
    );
    const before = res.records[0]?.get("before") as Record<
      string,
      unknown
    > | null;
    const previous = str(before?.loadId);
    if (!previous || previous === loadId) return [];
    return [
      {
        eventId: `destroyed-${previous}`,
        type: "spe.workspace_destroyed",
        at: str(before?.seenAt) ?? now().toISOString(),
        outcome: "success",
        speId: id,
        permitId: str(before?.permitId),
        policyHash: str(before?.policyHash),
        teeType: str(before?.teeType) ?? "none",
        attestationScope: str(before?.attestationScope) ?? "none",
        simulated: before?.simulated !== false,
        loadId: previous,
        detail: {
          replacedBy: loadId,
          note: "the workspace answered with a new load; its memory-backed store went with the old one",
        },
      },
    ];
  } finally {
    await session.close();
  }
}

// ---- Art. 71 opt-outs into the workspaces (ADR-062) -------------------------

/**
 * The key the extract gave each node (services/spe-loader, nodeKey()): its
 * `id`, `resourceId` or `code`, the elementId only when it has none. The
 * workspace's copy carries it as `_speKey`.
 */
const HUB_OPTED_OUT = `
MATCH (n:${OPTED_OUT_LABEL})
WHERE any(l IN labels(n) WHERE l IN $labels)
WITH n, head([l IN $labels WHERE l IN labels(n)]) AS label
RETURN label,
       CASE
         WHEN n.id IS NOT NULL AND toString(n.id) <> '' THEN toString(n.id)
         WHEN n.resourceId IS NOT NULL AND toString(n.resourceId) <> '' THEN toString(n.resourceId)
         WHEN n.code IS NOT NULL AND toString(n.code) <> '' THEN toString(n.code)
         ELSE elementId(n)
       END AS key`;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The hub's opted-out persons, as {label: keys} for the person-level labels. */
export async function hubOptOuts(hub: Driver): Promise<Map<string, string[]>> {
  const session = hub.session({
    database: "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const res = await withTimeout(
      session.run(
        HUB_OPTED_OUT,
        { labels: [...PERSON_LABELS] },
        { timeout: SPE_READ_TIMEOUT_MS },
      ),
      SPE_READ_TIMEOUT_MS,
      "hub opt-out read",
    );
    const byLabel = new Map<string, string[]>();
    for (const r of res.records) {
      const label = String(r.get("label"));
      const list = byLabel.get(label) ?? [];
      list.push(String(r.get("key")));
      byLabel.set(label, list);
    }
    return byLabel;
  } finally {
    await withTimeout(session.close(), 2000, "hub session close").catch(
      () => undefined,
    );
  }
}

export interface OptOutChange {
  added: number;
  removed: number;
}

/**
 * Puts OptedOut on the workspace's copies of the hub's opted-out persons and
 * takes it off every copy the hub no longer marks. Only nodes the loader
 * wrote (`_speKey`) are touched; idempotent; one write transaction.
 */
export async function applyOptOuts(
  workspace: Driver,
  byLabel: Map<string, string[]>,
): Promise<OptOutChange> {
  const session = workspace.session({ database: "neo4j" });
  try {
    return await withTimeout(
      session.executeWrite(async (tx) => {
        let added = 0;
        let removed = 0;
        for (const label of PERSON_LABELS) {
          if (!IDENTIFIER.test(label)) continue;
          const keys = byLabel.get(label) ?? [];
          if (keys.length > 0) {
            const a = await tx.run(
              `UNWIND $keys AS k
               MATCH (n:\`${label}\` {_speKey: k})
               WHERE NOT n:${OPTED_OUT_LABEL}
               SET n:${OPTED_OUT_LABEL}
               RETURN count(n) AS c`,
              { keys },
            );
            added += neo4j.integer.toNumber(a.records[0]?.get("c") ?? 0);
          }
          const r = await tx.run(
            `MATCH (n:\`${label}\`:${OPTED_OUT_LABEL})
             WHERE n._speKey IS NOT NULL AND NOT n._speKey IN $keys
             REMOVE n:${OPTED_OUT_LABEL}
             RETURN count(n) AS c`,
            { keys },
          );
          removed += neo4j.integer.toNumber(r.records[0]?.get("c") ?? 0);
        }
        return { added, removed };
      }),
      SPE_READ_TIMEOUT_MS * 3,
      "SPE opt-out write",
    );
  } finally {
    await withTimeout(session.close(), 2000, "SPE session close").catch(
      () => undefined,
    );
  }
}

/** The audit record of an opt-out sync: counts only, never who. */
export function optOutEvent(
  id: string,
  read: WorkspaceRead | null,
  change: OptOutChange,
  optedOutInHub: number,
  now: () => Date,
): SpeEvent {
  const a = read?.attestation ?? null;
  return {
    eventId: randomUUID(),
    type: "spe.optout_synced",
    at: now().toISOString(),
    outcome: "success",
    speId: id,
    permitId: str(a?.permitId),
    policyHash: str(a?.policyHash),
    teeType: str(a?.teeType) ?? "none",
    attestationScope: str(a?.attestationScope) ?? "none",
    simulated: a ? a.simulated !== false : true,
    loadId: str(a?.loadId),
    detail: {
      optedOutAdded: change.added,
      optedOutRemoved: change.removed,
      optedOutInHub,
    },
  };
}

/**
 * Carries the hub's opt-outs into every connected workspace and records each
 * change. The hub graph itself, while it is SPE-1, needs nothing: it is where
 * the label is set.
 */
export async function syncOptOuts(
  hub: Driver,
  workspaces: Array<{ id: string; driver: Driver; read: WorkspaceRead | null }>,
  now: () => Date = () => new Date(),
): Promise<Array<{ id: string } & OptOutChange>> {
  if (workspaces.length === 0) return [];
  const byLabel = await hubOptOuts(hub);
  const optedOutInHub = [...byLabel.values()].reduce((n, k) => n + k.length, 0);
  const out: Array<{ id: string } & OptOutChange> = [];
  for (const w of workspaces) {
    try {
      const change = await applyOptOuts(w.driver, byLabel);
      out.push({ id: w.id, ...change });
      if (change.added + change.removed > 0) {
        logger.info(
          { spe: w.id, added: change.added, removed: change.removed },
          "Art. 71 opt-outs synced into the SPE workspace",
        );
        await appendSpeEvent(
          optOutEvent(w.id, w.read, change, optedOutInHub, now),
          now,
        );
      }
    } catch (err) {
      logger.warn(
        { err, spe: w.id },
        "Art. 71 opt-outs not yet synced into the SPE workspace",
      );
    }
  }
  return out;
}

// ---- the sync ----------------------------------------------------------------

let running = false;
let timer: NodeJS.Timeout | null = null;
let first: NodeJS.Timeout | null = null;

/** The workspaces the proxy has a driver for (not the hub graph as SPE-1). */
function workspaceTargets(): Array<{ id: "SPE-1" | "SPE-2"; driver: Driver }> {
  const out: Array<{ id: "SPE-1" | "SPE-2"; driver: Driver }> = [];
  if (spe1IsWorkspace() && spe1Driver)
    out.push({ id: "SPE-1", driver: spe1Driver });
  if (spe2Driver) out.push({ id: "SPE-2", driver: spe2Driver });
  return out;
}

/**
 * One run of the sync: read every workspace, carry the opt-outs in, append
 * the events. A run that finds the previous one still going is skipped
 * (false), so a slow workspace cannot pile runs up. Never throws.
 */
export async function runSpeSync(
  now: () => Date = () => new Date(),
): Promise<boolean> {
  if (running) {
    logger.info("SPE sync still running; this tick is skipped");
    return false;
  }
  running = true;
  try {
    const reads = await readAll();
    const readOf = new Map(reads.map(({ target, read }) => [target.id, read]));
    await syncOptOuts(
      driver,
      workspaceTargets().map((w) => ({ ...w, read: readOf.get(w.id) ?? null })),
      now,
    ).catch((err) => logger.warn({ err }, "SPE opt-out sync failed"));
    await syncSpeAudit(
      reads.map(({ target, read }) => ({ id: target.id, read })),
      now,
    );
    return true;
  } catch (err) {
    logger.warn({ err }, "SPE sync failed");
    return true;
  } finally {
    running = false;
  }
}

/**
 * The sync on a timer: once a few seconds after startup, then every
 * SPE_AUDIT_SYNC_MS. Only when a workspace is configured.
 */
export function startSpeSync(): void {
  if (timer || !(spe1IsWorkspace() || NEO4J_SPE2_URI) || SPE_AUDIT_SYNC_MS <= 0)
    return;
  first = setTimeout(
    () => void runSpeSync(),
    Math.min(5000, SPE_AUDIT_SYNC_MS),
  );
  first.unref();
  timer = setInterval(() => void runSpeSync(), SPE_AUDIT_SYNC_MS);
  timer.unref();
}

export function stopSpeSync(): void {
  if (first) clearTimeout(first);
  if (timer) clearInterval(timer);
  first = null;
  timer = null;
}
