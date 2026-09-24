/**
 * Derived state for the persona overviews (discussion #265).
 *
 * The four persona views show state, not structure: a value against its
 * expected band, a trend over months, a consumer's chain of trust, a decision
 * clock. Every one of these is a small pure function over data the platform
 * already holds. They live here, not in the browser, so the API route, the
 * page, the activity report and the tests all compute them the same way.
 *
 * Nothing in this file touches Neo4j or the network. The functions take plain
 * records as the API routes return them (ISO date strings, numbers, nulls).
 *
 * Article numbers are those of Regulation (EU) 2025/327 as adopted, see
 * docs/ehds-article-numbering.md.
 */

export type Severity = "ok" | "info" | "warn" | "bad";

export type OverviewPersona = "patient" | "researcher" | "hdab" | "hospital";

export interface SeriesPoint {
  /** ISO date, YYYY-MM-DD */
  date: string;
  value: number;
}

export interface Range {
  low?: number | null;
  high?: number | null;
  /** The band as printed, e.g. "4.0 - 6.0 %" or "> 90 mL/min" */
  text?: string;
}

export interface Trend {
  dir: "rising" | "falling" | "stable";
  severity: Severity;
  first: number;
  last: number;
  outOfRange: boolean;
  /** Whole months between the first and the last point */
  months: number;
}

const SEVERITY_RANK: Record<Severity, number> = {
  ok: 0,
  info: 1,
  warn: 2,
  bad: 3,
};

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = 2_629_800_000;

/** The higher of two severities. */
export function severityMax(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** Stable sort, worst first: bad, warn, info, ok. */
export function rankSignals<T extends { severity: Severity }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

/** True when the value lies outside the band. An open end never fails. */
export function isOutOfRange(
  value: number,
  range: Range | null | undefined,
): boolean {
  if (!range) return false;
  const { low, high } = range;
  if (low != null && value < low) return true;
  if (high != null && value > high) return true;
  return false;
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Direction and severity of a series against its band.
 *
 * The direction is judged relative to the width of the band (or a fifth of
 * the first value when there is no band): a move of less than 15 % of that
 * width is "stable". The severity is "bad" when the last value is outside
 * the band and moving the wrong way, "warn" when it is outside but improving
 * or inside but moving the wrong way, "ok" otherwise. `higherIsWorse` is
 * true by default (HbA1c, refusals, pending applications); false for values
 * where a fall is the problem (eGFR, conformance score, permitted use).
 */
export function trendOf(
  series: SeriesPoint[],
  opts: { range?: Range | null; higherIsWorse?: boolean } = {},
): Trend | null {
  if (!series || series.length < 2) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const lo = opts.range?.low;
  const hi = opts.range?.high;
  const width =
    lo != null && hi != null && hi > lo ? hi - lo : Math.abs(first) * 0.2 || 1;
  const rel = (last - first) / width;
  const dir: Trend["dir"] =
    Math.abs(rel) < 0.15 ? "stable" : rel > 0 ? "rising" : "falling";
  const outOfRange = isOutOfRange(last, opts.range);
  const higherIsWorse = opts.higherIsWorse !== false;
  const wrongWay = higherIsWorse ? dir === "rising" : dir === "falling";
  let severity: Severity;
  if (dir === "stable") severity = outOfRange ? "warn" : "ok";
  else if (wrongWay) severity = outOfRange ? "bad" : "warn";
  else severity = outOfRange ? "warn" : "ok";
  const months = Math.round(
    (new Date(sorted[sorted.length - 1].date).getTime() -
      new Date(sorted[0].date).getTime()) /
      MS_PER_MONTH,
  );
  return { dir, severity, first, last, outOfRange, months };
}

/** The first day of each of the last `months` months up to `asOf`, oldest first. */
export function monthRange(asOf: string | Date, months = 12): string[] {
  const d = new Date(asOf);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 10));
  }
  return out;
}

export interface AccessEvent {
  id?: string;
  /** ISO timestamp */
  accessedAt: string;
  consumerDid: string;
  providerDid?: string | null;
  datasetId?: string | null;
  statusCode?: number | null;
  permitId?: string | null;
  contractId?: string | null;
  responseBytes?: number | null;
}

/**
 * Group events by `keyOf` and count (or sum `valueOf`) per month, with every
 * month of the window present, zero-filled. Events outside the window and
 * events whose key is null are dropped.
 */
export function aggregateMonthly<E extends { accessedAt: string }>(
  events: E[],
  months: string[],
  keyOf: (e: E) => string | null,
  valueOf: (e: E) => number = () => 1,
): Record<string, SeriesPoint[]> {
  const index = new Map(months.map((m, i) => [m.slice(0, 7), i]));
  const out: Record<string, number[]> = {};
  for (const e of events) {
    const key = keyOf(e);
    if (key == null) continue;
    const i = index.get(e.accessedAt.slice(0, 7));
    if (i == null) continue;
    (out[key] ??= new Array(months.length).fill(0))[i] += valueOf(e);
  }
  const result: Record<string, SeriesPoint[]> = {};
  for (const [key, values] of Object.entries(out)) {
    result[key] = months.map((date, i) => ({ date, value: values[i] }));
  }
  return result;
}

export type CredentialState = "active" | "expiring" | "expired" | "revoked";

export interface CredentialLike {
  credentialType?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  revoked?: boolean | null;
}

/**
 * The state of a credential derived from its dates, never from its `status`
 * flag alone: the fixtures keep "active" on credentials past their expiry.
 */
export function credentialState(
  cred: CredentialLike,
  asOf: string | Date,
  expiringDays = 30,
): CredentialState {
  if (cred.revoked || cred.status === "revoked") return "revoked";
  if (cred.expiresAt) {
    const left = daysBetween(asOf, cred.expiresAt);
    if (left < 0) return "expired";
    if (left <= expiringDays) return "expiring";
  }
  if (cred.status === "expired") return "expired";
  return "active";
}

export type PermitState =
  | "valid"
  | "expiring"
  | "expired"
  | "refused"
  | "revoked"
  | "pending";

export interface PermitLike {
  permitId?: string | null;
  status?: string | null;
  validUntil?: string | null;
  revokedAt?: string | null;
  outcome?: string | null;
}

/** The state of an Art. 68 permit as of a date. */
export function permitState(
  permit: PermitLike,
  asOf: string | Date,
  expiringDays = 30,
): PermitState {
  const status = (permit.status ?? permit.outcome ?? "").toUpperCase();
  if (permit.revokedAt || status.includes("REVOKED")) return "revoked";
  if (status.includes("REJECT") || status.includes("REFUSED")) return "refused";
  if (status === "PENDING" || status === "UNDER_REVIEW") return "pending";
  if (permit.validUntil) {
    const left = daysBetween(asOf, permit.validUntil);
    if (left < 0) return "expired";
    if (left <= expiringDays) return "expiring";
  }
  return "valid";
}

export interface DecisionClock {
  /** ISO date the decision is due */
  dueAt: string;
  /** Days left as of `asOf`; negative when overdue */
  daysLeft: number;
  overdue: boolean;
  decided: boolean;
}

/**
 * The Art. 68(4) clock: an access body decides within three months of a
 * complete application. Art. 69(4) applies the same period to a health data
 * request. A decided application has no clock left to run.
 */
export function decisionClock(
  app: {
    submittedAt: string;
    decidedAt?: string | null;
    decisionDue?: string | null;
  },
  asOf: string | Date,
  months = 3,
): DecisionClock {
  const due = app.decisionDue
    ? new Date(app.decisionDue)
    : (() => {
        const d = new Date(app.submittedAt);
        d.setUTCMonth(d.getUTCMonth() + months);
        return d;
      })();
  const dueAt = due.toISOString().slice(0, 10);
  const decided = Boolean(app.decidedAt);
  const daysLeft = daysBetween(asOf, due);
  return { dueAt, daysLeft, overdue: !decided && daysLeft < 0, decided };
}

export interface Finding {
  severity: Severity;
  /** Stable machine code, e.g. "access-after-credential-expiry" */
  code: string;
  /** The id of the node the finding attaches to (consumer DID, permit id) */
  subject: string;
  text: string;
  /** The article the finding rests on, adopted numbering */
  article: string;
}

export interface ChainInput {
  consumerDid: string;
  consumerName?: string;
  credentials: CredentialLike[];
  permits: PermitLike[];
  contracts: { contractId: string; consumerDid?: string | null }[];
  events: AccessEvent[];
}

export interface ChainOfTrust {
  trusted: boolean;
  severity: Severity;
  findings: Finding[];
}

/**
 * Trust, in EHDS terms, is a chain and not a flag: DCP credentials
 * (membership, participant, purpose), an Art. 68 permit, a DSP contract, and
 * an access log that agrees with all three. This computes it that way for one
 * consumer, as of a date.
 */
export function chainOfTrust(
  input: ChainInput,
  asOf: string | Date,
): ChainOfTrust {
  const who = input.consumerName ?? input.consumerDid;
  const findings: Finding[] = [];
  const served = input.events.filter(
    (e) => (e.statusCode ?? 200) < 400 && e.consumerDid === input.consumerDid,
  );
  const refused = input.events.filter(
    (e) => (e.statusCode ?? 200) >= 400 && e.consumerDid === input.consumerDid,
  );

  // 1. Credentials in the wallet
  const byType = (t: string) =>
    input.credentials.filter((c) =>
      (c.credentialType ?? "").toLowerCase().includes(t),
    );
  if (byType("membership").length === 0) {
    findings.push({
      severity: "bad",
      code: "no-membership-credential",
      subject: input.consumerDid,
      text: `${who} presents no membership credential; nothing in the wallet says who they are.`,
      article: "DCP v1.0 membership credential; Art. 61(1)",
    });
  }
  for (const purpose of byType("purpose")) {
    const state = credentialState(purpose, asOf);
    if (state === "expired" || state === "revoked") {
      const after = purpose.expiresAt
        ? served.filter((e) => e.accessedAt > purpose.expiresAt!)
        : served;
      if (after.length > 0) {
        findings.push({
          severity: "bad",
          code: "access-after-credential-expiry",
          subject: input.consumerDid,
          text: `${who}: ${
            after.length
          } accesses served after the purpose credential ${state} on ${(
            purpose.expiresAt ?? ""
          ).slice(0, 10)}.`,
          article: "Art. 53(1), Art. 61(1)",
        });
      } else {
        findings.push({
          severity: "warn",
          code: "credential-expired",
          subject: input.consumerDid,
          text: `${who}: the purpose credential ${state}; the next access will have no valid purpose.`,
          article: "Art. 53(1)",
        });
      }
    } else if (state === "expiring") {
      findings.push({
        severity: "warn",
        code: "credential-expiring",
        subject: input.consumerDid,
        text: `${who}: the purpose credential expires within 30 days.`,
        article: "Art. 53(1)",
      });
    }
  }

  // 2. Permits
  const states = input.permits.map((p) => ({ p, s: permitState(p, asOf) }));
  const valid = states.filter((x) => x.s === "valid" || x.s === "expiring");
  const refusedPermit = states.find((x) => x.s === "refused");
  if (refusedPermit && refused.length > 0) {
    findings.push({
      severity: "bad",
      code: "access-attempt-after-refusal",
      subject: input.consumerDid,
      text: `${who}: ${refused.length} access attempts refused after the application was refused; a matter for enforcement.`,
      article: "Art. 61(1), Art. 63",
    });
  }
  if (served.length > 0 && valid.length === 0) {
    findings.push({
      severity: "bad",
      code: "access-without-permit",
      subject: input.consumerDid,
      text: `${who}: ${served.length} accesses served with no valid permit as of today.`,
      article: "Art. 61(1), Art. 68",
    });
  }
  for (const { p } of states.filter((x) => x.s === "expiring")) {
    findings.push({
      severity: "warn",
      code: "permit-expiring",
      subject: p.permitId ?? input.consumerDid,
      text: `${who}: permit ${p.permitId ?? ""} expires on ${(
        p.validUntil ?? ""
      ).slice(0, 10)}; renewal or the end of access.`,
      article: "Art. 68(6)",
    });
  }

  // 3. Contracts behind the served accesses
  const contractIds = new Set(input.contracts.map((c) => c.contractId));
  const uncovered = served.filter(
    (e) => !e.contractId || !contractIds.has(e.contractId),
  );
  if (served.length > 0 && uncovered.length === served.length) {
    findings.push({
      severity: valid.length > 0 ? "warn" : "bad",
      code: "transfer-without-contract",
      subject: input.consumerDid,
      text: `${who}: ${uncovered.length} accesses served with no DSP contract on file.`,
      article: "DSP 2025-1 contract agreement; Art. 60(1)",
    });
  } else if (uncovered.length > 0) {
    findings.push({
      severity: "warn",
      code: "transfer-partly-without-contract",
      subject: input.consumerDid,
      text: `${who}: ${uncovered.length} of ${served.length} accesses carry no contract reference.`,
      article: "DSP 2025-1 contract agreement",
    });
  }

  const severity = findings.reduce<Severity>(
    (acc, f) => severityMax(acc, f.severity),
    "ok",
  );
  return { trusted: severity !== "bad", severity, findings };
}
