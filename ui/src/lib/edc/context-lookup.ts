import { edcClient } from "@/lib/edc";
import { cached, forget } from "@/lib/server-cache";

/**
 * The control plane's participant contexts, kept for a minute.
 *
 * The catalogue request and the transfer POST each asked the control plane
 * for every context before doing their own work, to turn a DID into a
 * context id or back. Under the `contracts` load test on Azure that was one
 * management call more per request on a control plane already at 0.36 of
 * its 0.5 vCPU (docs/developer/edc-sizing-under-load.md). Contexts change
 * when a participant is onboarded or the stack is reset, not between two
 * requests, so the list is read once a minute at most. A DID the kept list
 * does not name is looked up again at once (a participant onboarded since),
 * and a caller whose request fails on a kept id calls `forgetContexts()`
 * and asks again (a stack reset since).
 */

export interface ContextRow {
  "@id"?: string;
  identity?: string;
  participantId?: string;
}

const KEY = "edc:participant-contexts";
const TTL_MS = 60_000;

interface Kept {
  rows: ContextRow[];
  /** Which read of the control plane this is, counting from 1. */
  read: number;
}

/** Reads started so far, so a lookup can tell a list read for it. */
let reads = 0;

async function load(): Promise<Kept> {
  const read = ++reads;
  const rows = await edcClient.management<ContextRow[]>("/v5/participants");
  return { rows: Array.isArray(rows) ? rows : [], read };
}

function kept(): Promise<Kept> {
  return cached(KEY, TTL_MS, load);
}

/** Drops the kept list; the next lookup asks the control plane. */
export function forgetContexts() {
  forget(KEY);
}

/**
 * The id of the context whose identity is this DID, and whether it came from
 * a list read before this call (`kept`), which may be out of date. A miss
 * in such a list asks the control plane once more before it throws.
 */
export async function contextIdForDid(
  did: string,
): Promise<{ id: string; kept: boolean }> {
  const before = reads;
  const find = (rows: ContextRow[]) =>
    rows.find((r) => r.identity === did)?.["@id"];
  const first = await kept();
  const old = first.read <= before;
  const id = find(first.rows);
  if (id) return { id, kept: old };
  if (old) {
    forgetContexts();
    const fresh = find((await kept()).rows);
    if (fresh) return { id: fresh, kept: false };
  }
  throw new Error(`No participant context has the identity ${did}`);
}

/**
 * The identity (DID) of a context id, or null. A context the kept list does
 * not name is looked up again at once, as in `contextIdForDid()`.
 */
export async function identityOfContext(id: string): Promise<string | null> {
  const find = (rows: ContextRow[]) => {
    const ctx = rows.find((r) => r["@id"] === id);
    return ctx?.identity ?? ctx?.participantId ?? null;
  };
  const before = reads;
  const first = await kept();
  const identity = find(first.rows);
  if (identity || first.read > before) return identity;
  forgetContexts();
  return find((await kept()).rows);
}
