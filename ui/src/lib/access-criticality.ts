import { isTestIdentity } from "@/lib/test-identity";

/**
 * How critical one recorded data access is: low, medium or high, with the
 * reasons that put it there. It tells a health data access body which rows
 * of the access register (`/admin/audit`, Access Logs) to read first; it is
 * a reading aid, not a finding of non-compliance (Art. 63 needs a person).
 *
 * The rules use only what the access record carries (`/api/admin/audit`,
 * `type=accesslogs`), so the API is unchanged and the static build, which
 * has no API, computes the same answer from `public/mock/admin_audit.json`.
 * Each rule is one sentence, and every level comes with its reasons; there
 * is no score.
 *
 * 1. Scope sets the starting level, from the endpoint the neo4j-proxy
 *    recorded (or the access type when a seeded event has none):
 *    - catalogue metadata (`/catalog`): low. No health data.
 *    - aggregate counts (`/federated/stats`, `/federated/query`,
 *      `/omop/cohort`, an NLQ answer of at most one row): low. Art. 69
 *      lets a health data request be answered in anonymised statistical
 *      form; the proxy applies k-anonymity to federated answers.
 *    - record-level data (`/fhir/*`, `/trust-center/*`, an NLQ answer of
 *      several rows, a transfer or read without an endpoint): medium.
 *      Art. 68: record-level secondary use runs under a data permit.
 *    - one patient's full record (`/fhir/Patient/{id}/$everything`,
 *      `/omop/person/{id}/...`): high. The caller named the person, which
 *      is what revealing a patient's identity amounts to. The record does
 *      not carry the proxy's X-Patient-Identity decision
 *      (`revealsPatientIdentity()` in the NLQ engine), so this is read from
 *      the endpoint.
 * 2. Raised to high: record-level data with no data permit and no contract
 *    (Art. 68); record-level data under a permit that was not valid when it
 *    was read (never granted, or past its validity end; Art. 68);
 *    record-level data by an unknown consumer (GDPR Art. 30 records name
 *    the recipients of personal data).
 * 3. Raised to medium: an aggregate under a permit that was not valid when
 *    it was read; an aggregate with a large result (100 rows or more, or
 *    1 MiB or more), since a long breakdown approaches record level.
 * 4. Capped at medium: a request that failed or was refused (status not
 *    2xx, or an error recorded) disclosed nothing; a refused attempt at
 *    record-level data is still worth a look (Art. 63(1)).
 * 5. Listed, level unchanged: an automated test's session, a cross-border
 *    access (consumer and provider in different Member States; Art. 75
 *    HealthData@EU), a large record-level result, and an unknown consumer
 *    of aggregate data.
 *
 * Purposes (Art. 53(1)) are shown in the record but not scored: the access
 * body checks them against the permit, the record cannot.
 * Art. 73(1)(e) and GDPR Art. 30 are why the record exists at all.
 */

export type CriticalityLevel = "low" | "medium" | "high";

/** The reasons, as English keys the page translates (area `admin`). */
export const CRITICALITY_REASONS = [
  "catalogue metadata only",
  "aggregate counts only",
  "record-level data",
  "one patient's full record",
  "no data permit or contract",
  "data permit not valid at access time",
  "unknown consumer",
  "automated test",
  "large result",
  "cross-border",
  "request refused or failed, nothing disclosed",
] as const;

export type CriticalityReason = (typeof CRITICALITY_REASONS)[number];

/** The fields of an access record the rules read; all of them optional. */
export interface AccessRecord {
  consumerDid?: string | null;
  consumerCountry?: string | null;
  providerCountry?: string | null;
  accessedAt?: string | null;
  accessType?: string | null;
  endpoint?: string | null;
  statusCode?: number | null;
  errorMessage?: string | null;
  resultCount?: number | null;
  bytesAccessed?: number | null;
  permitId?: string | null;
  permitStatus?: string | null;
  permitValidUntil?: string | null;
  contractId?: string | null;
}

export interface Criticality {
  level: CriticalityLevel;
  reasons: CriticalityReason[];
}

type Scope = "metadata" | "aggregate" | "record" | "single-patient";

const LARGE_RESULT_ROWS = 100;
const LARGE_RESULT_BYTES = 1024 * 1024;

/** Permit statuses that mean the permit was never granted. */
const NEVER_GRANTED = new Set([
  "DRAFT",
  "REQUESTED",
  "PENDING",
  "UNDER_REVIEW",
  "REJECTED",
]);

const RANK: Record<CriticalityLevel, number> = { low: 0, medium: 1, high: 2 };

function atLeast(a: CriticalityLevel, b: CriticalityLevel): CriticalityLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

function scopeOf(r: AccessRecord): Scope {
  const ep = (r.endpoint ?? "").split("?")[0];
  if (ep) {
    if (ep.startsWith("/catalog")) return "metadata";
    if (/^\/fhir\/Patient\/[^/]+\/\$everything$/.test(ep)) {
      return "single-patient";
    }
    if (/^\/omop\/person\/[^/]+/.test(ep)) return "single-patient";
    if (
      ep.startsWith("/federated/stats") ||
      ep.startsWith("/federated/query") ||
      ep === "/omop/cohort"
    ) {
      return "aggregate";
    }
    if (ep.startsWith("/nlq")) {
      return (r.resultCount ?? 0) <= 1 ? "aggregate" : "record";
    }
    return "record";
  }
  return r.accessType === "QUERY" ? "aggregate" : "record";
}

function failed(r: AccessRecord): boolean {
  const s = r.statusCode;
  if (typeof s === "number" && (s < 200 || s >= 300)) return true;
  return Boolean(r.errorMessage);
}

function permitInvalid(r: AccessRecord): boolean {
  if (!r.permitId) return false;
  if (r.permitStatus && NEVER_GRANTED.has(r.permitStatus.toUpperCase())) {
    return true;
  }
  if (r.permitValidUntil && r.accessedAt) {
    const until = Date.parse(r.permitValidUntil);
    const at = Date.parse(r.accessedAt);
    if (!Number.isNaN(until) && !Number.isNaN(at) && at > until) return true;
  }
  return false;
}

/** No DID, or the `did:web:unknown:<login>` a login no participant maps to. */
function unknownConsumer(did: string | null | undefined): boolean {
  if (!did || did === "unknown") return true;
  return did.startsWith("did:web:unknown:");
}

/** Classify one access record. Pure: same record, same answer. */
export function classifyAccess(r: AccessRecord): Criticality {
  const reasons: CriticalityReason[] = [];
  const scope = scopeOf(r);
  const recordLevel = scope === "record" || scope === "single-patient";
  let level: CriticalityLevel;

  switch (scope) {
    case "metadata":
      reasons.push("catalogue metadata only");
      level = "low";
      break;
    case "aggregate":
      reasons.push("aggregate counts only");
      level = "low";
      break;
    case "record":
      reasons.push("record-level data");
      level = "medium";
      break;
    case "single-patient":
      reasons.push("one patient's full record");
      level = "high";
      break;
  }

  if (recordLevel && !r.permitId && !r.contractId) {
    reasons.push("no data permit or contract");
    level = "high";
  }
  if (permitInvalid(r)) {
    reasons.push("data permit not valid at access time");
    level = atLeast(level, recordLevel ? "high" : "medium");
  }

  if (isTestIdentity(r.consumerDid)) {
    reasons.push("automated test");
  } else if (unknownConsumer(r.consumerDid)) {
    reasons.push("unknown consumer");
    if (recordLevel) level = "high";
  }

  const large =
    (r.resultCount ?? 0) >= LARGE_RESULT_ROWS ||
    (r.bytesAccessed ?? 0) >= LARGE_RESULT_BYTES;
  if (large) {
    reasons.push("large result");
    if (!recordLevel) level = atLeast(level, "medium");
  }

  if (
    r.consumerCountry &&
    r.providerCountry &&
    r.consumerCountry.toUpperCase() !== r.providerCountry.toUpperCase()
  ) {
    reasons.push("cross-border");
  }

  if (failed(r)) {
    reasons.push("request refused or failed, nothing disclosed");
    if (level === "high") level = "medium";
  }

  return { level, reasons };
}
