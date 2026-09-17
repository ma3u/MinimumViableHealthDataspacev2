/**
 * In-memory store for the DSP records the demonstrator has to invent because the
 * connector cannot hold them.
 *
 * Why it exists: the Azure EDC stack has no ACTIVATED participant context
 * (issue #25, a deliberate scope split under ADR-022). So `/api/participants`
 * serves demo participants, `/api/negotiations` serves a demo catalogue, and a
 * negotiation against one of those offers is recorded rather than sent. Nothing
 * reaches the connector, which means a later GET has nowhere to read it back
 * from, and the next step of the walkthrough is a different page: the transfer
 * page builds its agreement list from `GET /api/negotiations`. Without this
 * store the negotiation the user just made is invisible one click later.
 *
 * Records are keyed by consumer participant context id, so one participant's
 * demo records never surface in another's list.
 *
 * Persistence: in-memory is acceptable because the ACA UI runs a single replica
 * (min=max=1, see `scripts/azure/05-cfm-ui.sh`). It does NOT survive a revision
 * rollover, which is the right lifetime for a record that was never real: the
 * lists fall back to the bundled fixtures. The durable path is a seeded
 * controlplane, not a better store.
 */

export type DemoRecordKind = "negotiation" | "transfer";

export type DemoRecord = Record<string, unknown> & { "@id": string };

/** Per participant and kind. Oldest records are dropped beyond this. */
const LIMIT = 20;

const store = new Map<string, DemoRecord[]>();

function key(kind: DemoRecordKind, participantId: string): string {
  return `${kind}:${participantId}`;
}

/**
 * Keep a demo record for later reads. Most recent first, so the thing the user
 * just did is at the top of the list it appears in. Re-recording the same `@id`
 * replaces the earlier copy rather than duplicating it: a demo negotiation id is
 * derived from the asset, so negotiating the same offer twice is expected.
 */
export function recordDemo(
  kind: DemoRecordKind,
  participantId: string,
  record: DemoRecord,
): void {
  const k = key(kind, participantId);
  const existing = store.get(k) ?? [];
  const next = existing.filter((r) => r["@id"] !== record["@id"]);
  next.unshift(record);
  store.set(k, next.slice(0, LIMIT));
}

/** Demo records of one kind for one participant, most recent first. */
export function listDemo(
  kind: DemoRecordKind,
  participantId: string,
): DemoRecord[] {
  return [...(store.get(key(kind, participantId)) ?? [])];
}

/** Test-only helper to clear the store between specs. */
export function __resetDemoRecordsForTests(): void {
  store.clear();
}
