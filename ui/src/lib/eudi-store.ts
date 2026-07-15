/**
 * Short-TTL, in-memory store for in-flight EUDI Wallet OpenID4VP login
 * transactions, keyed by an opaque server-issued session id (`sid`).
 *
 * The `sid` is the only handle the browser ever sees — the verifier-side
 * transaction id, the nonce, and (once verified) the resolved patient identity
 * never leave the server. The browser polls `GET /api/auth/eudi/status?sid=…`
 * and, on completion, calls `signIn("eudi-wallet", { sid })`; the Credentials
 * provider re-reads the pinned, server-verified result for that `sid`.
 *
 * Persistence: an in-memory Map is acceptable because the Azure Container Apps
 * UI runs a single replica (min=max=1, see scripts/azure/05-cfm-ui.sh). It does
 * NOT survive a revision rollover/restart — in-flight logins would drop. A
 * durable store (Neo4j / Vault / Postgres) is the production path. Flagged in
 * ADR-028.
 */
import { randomUUID, randomBytes } from "crypto";

export type EudiTxStatus = "pending" | "completed" | "error";

export interface EudiVerifiedPatient {
  /** username key matching DEMO_PERSONAS / PATIENT_RESOURCE_MAP (e.g. "patient1") */
  username: string;
  /** display name — the verified wallet holder's name when available */
  displayName: string;
  roles: string[];
}

export interface EudiTransaction {
  sid: string;
  /** verifier-side transaction / presentation id */
  transactionId: string;
  /** anti-replay nonce echoed by the wallet's presentation */
  nonce: string;
  status: EudiTxStatus;
  createdAt: number;
  /** pinned only after the verifier confirms a valid presentation */
  verifiedPatient?: EudiVerifiedPatient;
  /** true once a session has been minted from this sid (single-use) */
  consumed?: boolean;
  error?: string;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, EudiTransaction>();

/** Remove expired transactions so the Map can't grow unbounded. */
function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [sid, tx] of store) {
    if (tx.createdAt < cutoff) store.delete(sid);
  }
}

/** Opaque browser-facing id. */
export function newSid(): string {
  return randomUUID();
}

/** Anti-replay nonce for the OpenID4VP request. */
export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function putTransaction(
  tx: Omit<EudiTransaction, "status" | "createdAt"> &
    Partial<Pick<EudiTransaction, "status" | "createdAt">>,
): EudiTransaction {
  sweep();
  const full: EudiTransaction = {
    status: "pending",
    createdAt: Date.now(),
    ...tx,
  };
  store.set(full.sid, full);
  return full;
}

export function getTransaction(sid: string): EudiTransaction | undefined {
  sweep();
  return store.get(sid);
}

export function updateTransaction(
  sid: string,
  patch: Partial<EudiTransaction>,
): EudiTransaction | undefined {
  const tx = store.get(sid);
  if (!tx) return undefined;
  const next = { ...tx, ...patch };
  store.set(sid, next);
  return next;
}

export function deleteTransaction(sid: string): void {
  store.delete(sid);
}
