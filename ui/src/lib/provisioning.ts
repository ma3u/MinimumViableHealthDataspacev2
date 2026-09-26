/**
 * Reading the state of CFM provisioning activities.
 *
 * Creating a participant profile in the CFM Tenant Manager returns three
 * virtual participant activities — `cfm.connector`, `cfm.credentialservice`
 * and `cfm.dataplane` — each `pending` until an agent completes it. The DID
 * and the credential exist only once they do.
 *
 * On the Azure deployment no agent ever does. `cfm-keycloak-agent`,
 * `cfm-registration-agent`, `cfm-edcv-agent` and `cfm-onboarding-agent` appear
 * only in `docker-compose.jad.yml`; there is no image of them in ACR and no
 * app running them. The two participants registered through the live form on
 * 2026-09-17 and 2026-09-18 still had all three activities `pending` when this
 * was written on 2026-09-26.
 *
 * So "the activities are pending" is the normal state for a few seconds and a
 * dead end after that, and the page must not show the same "Provisioning" for
 * both. A profile whose activities are all still pending well past the point
 * an agent would have taken them is reported as stalled. Issue #203.
 */

/**
 * How long every activity may sit `pending` before the profile counts as
 * stalled. Provisioning on the local JAD stack completes in seconds; ten
 * minutes is long enough that a slow agent is never called stalled, and short
 * enough that nobody watches a promise that is not coming for an afternoon.
 */
export const PROVISIONING_STALL_MS = 10 * 60 * 1000;

export interface Vpa {
  id?: string;
  type?: string;
  state?: string;
  stateTimestamp?: string;
}

export interface ProfileWithVpas {
  vpas?: Vpa[];
  [key: string]: unknown;
}

export interface VpaSummary {
  /** Total activities across every profile of the tenant. */
  total: number;
  /** How many are still `pending`. */
  pending: number;
  /** Activity types still pending, for naming them in the UI. */
  pendingTypes: string[];
  /** ISO timestamp of the longest-pending activity, or null when none is. */
  oldestPendingSince: string | null;
  /** Every activity is pending and has been for longer than the threshold. */
  stalled: boolean;
}

const EMPTY: VpaSummary = {
  total: 0,
  pending: 0,
  pendingTypes: [],
  oldestPendingSince: null,
  stalled: false,
};

/** Parse a CFM timestamp, returning null rather than NaN for anything odd. */
function parseTs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Summarise the activities of every participant profile of one tenant.
 *
 * `now` is injected so the threshold can be tested without waiting for it.
 */
export function summariseVpas(
  profiles: ProfileWithVpas[] | undefined,
  now: number = Date.now(),
): VpaSummary {
  const vpas = (profiles ?? []).flatMap((p) =>
    Array.isArray(p?.vpas) ? p.vpas : [],
  );
  if (vpas.length === 0) return EMPTY;

  const pending = vpas.filter((v) => v?.state === "pending");
  const pendingTypes = Array.from(
    new Set(pending.map((v) => v.type).filter((t): t is string => !!t)),
  ).sort();

  let oldestMs: number | null = null;
  for (const v of pending) {
    const ms = parseTs(v.stateTimestamp);
    if (ms === null) continue;
    if (oldestMs === null || ms < oldestMs) oldestMs = ms;
  }

  // Stalled only when nothing at all has moved. A profile with one completed
  // activity has an agent working on it, however slowly, and calling that
  // stalled would be the same overstatement in the other direction.
  const stalled =
    pending.length === vpas.length &&
    oldestMs !== null &&
    now - oldestMs > PROVISIONING_STALL_MS;

  return {
    total: vpas.length,
    pending: pending.length,
    pendingTypes,
    oldestPendingSince:
      oldestMs === null ? null : new Date(oldestMs).toISOString(),
    stalled,
  };
}

/** The sentence the UI shows for a stalled profile. */
export function stalledReason(summary: VpaSummary): string {
  const types = summary.pendingTypes.length
    ? summary.pendingTypes.join(", ")
    : "the provisioning activities";
  return (
    `The tenant and the participant profile were created, but ${types} ` +
    `${
      summary.pendingTypes.length === 1 ? "has" : "have"
    } been pending since ` +
    `${
      summary.oldestPendingSince ?? "creation"
    } and no provisioning agent has ` +
    `completed ${summary.pendingTypes.length === 1 ? "it" : "them"}. This ` +
    `deployment does not run the CFM provisioning agents, so no DID was ` +
    `registered and no credential issued. Tracked in issue #203.`
  );
}
