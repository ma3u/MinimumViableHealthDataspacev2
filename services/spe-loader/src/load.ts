import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Session } from "neo4j-driver";
import {
  summariseToken,
  type AttestationRecord,
  type AttestationSummary,
} from "./attestation.js";
import { ExtractKeyError, open, readHeader } from "./crypto.js";
import { parseJsonl, type Extract } from "./extract.js";
import { KbsError, type Kbs } from "./kbs.js";
import type { SpeDefinition } from "./spes.js";
import {
  applyCypherFile,
  assertWorkspace,
  countPatients,
  currentLoadId,
  emptyWorkspace,
  recordAttestation,
  recordEvents,
  writeExtract,
  type SpeAttestationRecord,
  type SpeEventRecord,
} from "./workspace.js";

// ---------------------------------------------------------------------------
// load = unlock (attest, key, decrypt) + ingest (write, record)
// ---------------------------------------------------------------------------
//
// unlock needs Trustee and the sealed extract, nothing else; ingest needs the
// workspace's Neo4j. On compose one process does both (`spe-loader load`). On
// AKS unlock is the init container, before Neo4j starts, and ingest the
// sidecar once it has (k8s/spe/workspace.yaml): an init container cannot
// reach a database in its own pod.
//
// The rule both halves keep: no key, no data. An attestation that fails, a
// key Trustee refuses, or a key that does not open the extract ends the same
// way: the workspace records the refusal and holds none of the permit's data.

export interface UnlockOutcome {
  loadId: string;
  speId: string;
  permitId: string;
  policyHash: string | null;
  keyPath: string;
  ok: boolean;
  stage?: "attestation" | "key" | "decrypt";
  reason?: string;
  attestation?: AttestationSummary;
  attestedAt?: string;
  keyReleasedAt?: string;
  /** What the TEE platform offered the loader (ACI: device, UVM files); see platform.ts. */
  platform?: Record<string, string | boolean | null>;
}

export interface UnlockDeps {
  kbs: Kbs;
  spe: SpeDefinition;
  /** Attempts while Trustee does not answer at all; a refusal is never retried. */
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (msg: string) => void;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function unlock(
  envelope: Buffer,
  deps: UnlockDeps,
): Promise<{ outcome: UnlockOutcome; plaintext: Buffer | null }> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? wait;
  const { header } = readHeader(envelope);
  if (header.speId !== deps.spe.id) {
    throw new Error(
      `this extract is ${header.speId}'s, the workspace is ${deps.spe.id}`,
    );
  }
  const base: UnlockOutcome = {
    loadId: randomUUID(),
    speId: header.speId,
    permitId: header.permitId,
    policyHash: header.policyHash,
    keyPath: header.keyPath,
    ok: false,
  };

  let token: string | null = null;
  const attempts = Math.max(1, deps.attempts ?? 1);
  for (let i = 1; i <= attempts && token === null; i++) {
    try {
      token = await deps.kbs.attest();
    } catch (err) {
      const denied = err instanceof KbsError && err.denied;
      if (denied || i === attempts) {
        return {
          outcome: {
            ...base,
            stage: "attestation",
            reason: `attestation failed: ${(err as Error).message}`,
          },
          plaintext: null,
        };
      }
      log(`Trustee did not answer (attempt ${i} of ${attempts}); retrying`);
      await sleep(deps.intervalMs ?? 15_000);
    }
  }
  const attestedAt = now().toISOString();
  const attestation = summariseToken(token as string);
  log(`attested: ${attestation.label}, ear.status ${attestation.earStatus}`);

  let key: Buffer;
  try {
    key = await deps.kbs.getResource(header.keyPath, token as string);
  } catch (err) {
    return {
      outcome: {
        ...base,
        attestation,
        attestedAt,
        stage: "key",
        // The token's own verdict first: after a policy denial kbs-client
        // retries and reports that retry's error, not the denial.
        reason: `Trustee refused ${header.keyPath} (ear.status ${
          attestation.earStatus
        }): ${(err as Error).message}`,
      },
      plaintext: null,
    };
  }
  const keyReleasedAt = now().toISOString();
  try {
    const { plaintext } = open(envelope, key);
    return {
      outcome: { ...base, ok: true, attestation, attestedAt, keyReleasedAt },
      plaintext,
    };
  } catch (err) {
    const reason =
      err instanceof ExtractKeyError
        ? `the released key does not open the extract: ${err.message}`
        : String(err);
    return {
      outcome: {
        ...base,
        attestation,
        attestedAt,
        keyReleasedAt,
        stage: "decrypt",
        reason,
      },
      plaintext: null,
    };
  } finally {
    key.fill(0);
  }
}

/** What ingest needs from the workspace; a Neo4j session in production, a fake in tests. */
export interface WorkspacePort {
  assertWorkspace(): Promise<void>;
  currentLoadId(speId: string): Promise<string | null>;
  writeExtract(
    extract: Extract,
  ): Promise<{ nodes: number; relationships: number }>;
  emptyWorkspace(): Promise<number>;
  applyFile(path: string): Promise<number>;
  countPatients(): Promise<number>;
  recordAttestation(a: SpeAttestationRecord): Promise<void>;
  recordEvents(events: SpeEventRecord[]): Promise<void>;
}

export function sessionWorkspace(session: Session): WorkspacePort {
  return {
    assertWorkspace: () => assertWorkspace(session),
    currentLoadId: (speId) => currentLoadId(session, speId),
    writeExtract: (e) => writeExtract(session, e),
    emptyWorkspace: () => emptyWorkspace(session),
    applyFile: (p) => applyCypherFile(session, p),
    countPatients: () => countPatients(session),
    recordAttestation: (a) => recordAttestation(session, a),
    recordEvents: (e) => recordEvents(session, e),
  };
}

export interface IngestDeps {
  workspace: WorkspacePort;
  spe: SpeDefinition;
  runsOn: string;
  /** Directory holding init-schema.cypher and the registrations. */
  cypherDir: string;
  now?: () => Date;
  newId?: () => string;
  log?: (msg: string) => void;
}

export type IngestResult =
  | { status: "ready"; patients: number; nodes: number; relationships: number }
  | { status: "refused"; reason: string; removed: number }
  | { status: "unchanged" };

export async function ingest(
  outcome: UnlockOutcome,
  plaintext: Buffer | null,
  deps: IngestDeps,
): Promise<IngestResult> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const log = deps.log ?? (() => undefined);
  const ws = deps.workspace;
  await ws.assertWorkspace();
  if ((await ws.currentLoadId(deps.spe.id)) === outcome.loadId) {
    log(`load ${outcome.loadId} is already in the workspace`);
    return { status: "unchanged" };
  }

  const a = outcome.attestation;
  const refusalReason = outcome.ok ? null : outcome.reason ?? "no key";
  // Always an object, null where nothing is known (an attestation that never
  // produced a token): the contract of #774.
  const attestation: AttestationRecord = a
    ? { ...a.record, refusalReason }
    : {
        verifier: null,
        result: "fail",
        evidenceDigest: null,
        tokenIssuedAt: null,
        tokenExpiresAt: null,
        policyId: null,
        claims: {
          tee: null,
          measurement: null,
          reportedTcb: null,
          hostData: null,
          reportData: null,
          pcrs: null,
          vmId: null,
        },
        refusalReason,
      };
  const evidence = {
    teeType: a?.teeType ?? "none",
    attestationScope: a?.attestationScope ?? "none",
    simulated: a?.simulated ?? true,
  };
  // Per-workload evidence (ACI, A2) carries the policy hash itself: SEV-SNP's
  // HOST_DATA is the SHA-256 of the group's ccePolicy. That, not what the
  // envelope says, is the hash of record, and it was checked by hardware
  // when Trustee released the key (resource-azure.rego requires it to equal
  // the permit's). Node-level and sample evidence carry no such thing.
  const hostData =
    a?.attestationScope === "workload" ? a.record.claims.hostData : null;
  const policyHash = hostData ? `sha256:${hostData}` : outcome.policyHash;
  const policyCheckedByHardware = Boolean(hostData) && outcome.ok;
  const record: SpeAttestationRecord = {
    speId: deps.spe.id,
    holder: deps.spe.holder,
    runsOn: deps.runsOn,
    ...evidence,
    label: a?.label ?? "Simulated attestation",
    attestedAt: outcome.attestedAt ?? null,
    keyReleasedAt: outcome.ok ? outcome.keyReleasedAt ?? null : null,
    permitId: outcome.permitId,
    policyHash,
    // Hardware checks the policy hash only with per-workload evidence (ADR-068 decision 2).
    policyCheckedByHardware,
    status: "loading",
    loadId: outcome.loadId,
    earStatus: a?.earStatus ?? null,
    verifier: a?.verifier ?? null,
    reason: outcome.reason ?? null,
    patients: null,
    attestation,
  };
  const event = (
    type: SpeEventRecord["type"],
    at: string,
    outcomeOf: SpeEventRecord["outcome"],
    detail: Record<string, unknown>,
  ): SpeEventRecord => ({
    eventId: newId(),
    type,
    at,
    outcome: outcomeOf,
    speId: deps.spe.id,
    permitId: outcome.permitId,
    policyHash,
    ...evidence,
    loadId: outcome.loadId,
    detail: outcome.platform
      ? { ...detail, platform: outcome.platform }
      : detail,
  });
  const events: SpeEventRecord[] = [];
  if (a && outcome.attestedAt) {
    events.push(
      event(
        "spe.attestation",
        outcome.attestedAt,
        a.earStatus === "affirming" ? "success" : "refused",
        {
          earStatus: a.earStatus,
          label: a.label,
          trustVector: a.trustVector,
          attestation,
        },
      ),
    );
  }

  if (!outcome.ok || !plaintext) {
    const removed = await ws.emptyWorkspace();
    await ws.recordAttestation({
      ...record,
      status: "refused",
      patients: await ws.countPatients(),
    });
    events.push(
      event("spe.key_refused", now().toISOString(), "refused", {
        stage: outcome.stage ?? "key",
        reason: outcome.reason ?? "no key",
        keyPath: outcome.keyPath,
        earStatus: a?.earStatus ?? null,
      }),
    );
    await ws.recordEvents(events);
    log(`refused: ${outcome.reason ?? "no key"}; nothing loaded`);
    return { status: "refused", reason: outcome.reason ?? "no key", removed };
  }

  events.push(
    event(
      "spe.key_release",
      outcome.keyReleasedAt ?? now().toISOString(),
      "success",
      {
        keyPath: outcome.keyPath,
        earStatus: a?.earStatus ?? null,
      },
    ),
  );
  await ws.recordAttestation(record);
  await ws.recordEvents(events);

  const extract = parseJsonl(plaintext.toString("utf8"));
  if (
    extract.header.speId !== deps.spe.id ||
    extract.header.permitId !== outcome.permitId
  ) {
    throw new Error("the extract's own header does not match its envelope");
  }
  const written = await ws.writeExtract(extract);
  await ws.applyFile(join(deps.cypherDir, "init-schema.cypher"));
  await ws.applyFile(
    join(deps.cypherDir, deps.spe.registration.replace(/^neo4j\//, "")),
  );
  const patients = await ws.countPatients();
  await ws.recordAttestation({ ...record, status: "ready", patients });
  await ws.recordEvents([
    event("spe.workspace_loaded", now().toISOString(), "success", {
      patients,
      nodes: written.nodes,
      relationships: written.relationships,
      extractCreatedAt: extract.header.createdAt,
    }),
  ]);
  log(
    `loaded ${patients} patients (${written.nodes} nodes, ${written.relationships} relationships)`,
  );
  return { status: "ready", patients, ...written };
}
