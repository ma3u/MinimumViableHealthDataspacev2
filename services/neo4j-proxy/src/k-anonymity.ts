/**
 * k-anonymity for answers that leave the secure processing environments.
 *
 * Two rules, one per shape of answer:
 *
 * - Row-level answers (`suppressSmallGroups`): identical rows form a group,
 *   and a group of fewer than k is dropped. A contributor that returned some
 *   rows but fewer than k is suppressed, and because a missing contributor is
 *   itself identifying, the whole aggregate goes with it (issue #8).
 * - Aggregate answers (`suppressSmallCells`): every count below k becomes
 *   "<k", as the Art. 69 statistics do (ui/src/lib/statistics.ts), and a
 *   percentage in the same row goes too, or it would give the count back.
 *
 * `/federated/query` applies the first rule to the Cypher a caller sends;
 * `/nlq` applies whichever fits the answer, from one SPE as from several.
 * Only an answer about persons is filtered: a count of datasets identifies
 * nobody.
 */

type Row = Record<string, any>;

export interface Contribution {
  source: string;
  records: Row[];
}

export interface KOutcome {
  rows: Row[];
  /** Rows dropped (row-level) or cells masked (aggregate). */
  filtered: number;
  minKApplied: number;
  aggregateSuppressed: boolean;
  suppressionReason: "contributor_k_violation" | "small_cells" | null;
}

/**
 * Cypher that reads persons or their clinical records. A label can sit in a
 * label expression: the Art. 71 rewrite makes `(p:Patient)` into
 * `(p:(Patient)&!OptedOut)` (src/opt-out.ts).
 */
const PERSON_DATA =
  /[:(&|]\s*(Patient|OMOPPerson|Condition|Observation|Encounter|MedicationRequest|MedicationStatement|Procedure|Immunization|DiagnosticReport|OMOP[A-Z]\w*)\b/;

/** Cypher whose answer is a count, not a list of records. */
const AGGREGATE = /\b(count|sum)\s*\(/i;

/** A relevance score, which counts nobody, even when it comes out whole. */
const SCORE_KEY = /(score|similarity)$/i;

/** A share computed from a count in the same row. */
const SHARE_KEY = /(pct|percent|share|ratio|rate)$/i;

export function readsPersonData(cypher: string): boolean {
  return PERSON_DATA.test(cypher);
}

const isError = (row: Row) => row._error !== undefined;

export function suppressSmallGroups(
  contributions: Contribution[],
  k: number,
): KOutcome {
  let rows = contributions.flatMap((c) => c.records);
  let filtered = 0;

  const keys = new Set<string>();
  rows.forEach((row) =>
    Object.keys(row).forEach((key) => {
      if (key !== "_source" && key !== "_error") keys.add(key);
    }),
  );
  const groupKey = (row: Row) =>
    Array.from(keys)
      .map((key) => `${key}=${row[key]}`)
      .join("|");
  const groups = new Map<string, Row[]>();
  rows.forEach((row) => {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });
  rows = [];
  for (const [, group] of groups) {
    if (group.length >= k) rows.push(...group);
    else filtered += group.length;
  }

  const violating = contributions.some((c) => {
    const n = c.records.filter((r) => !isError(r)).length;
    return n > 0 && n < k;
  });
  if (violating) {
    filtered += rows.length;
    rows = [];
  }
  return {
    rows,
    filtered,
    minKApplied: k,
    aggregateSuppressed: violating,
    suppressionReason: violating ? "contributor_k_violation" : null,
  };
}

export function suppressSmallCells(rows: Row[], k: number): KOutcome {
  let filtered = 0;
  const masked = rows.map((row) => {
    const small = Object.entries(row).filter(
      ([key, v]) =>
        key !== "_source" &&
        !SCORE_KEY.test(key) &&
        typeof v === "number" &&
        Number.isInteger(v) &&
        v > 0 &&
        v < k,
    );
    if (small.length === 0) return row;
    filtered += small.length;
    const out: Row = { ...row };
    for (const [key] of small) out[key] = `<${k}`;
    for (const [key, v] of Object.entries(row)) {
      if (typeof v === "number" && SHARE_KEY.test(key)) out[key] = `<${k}`;
    }
    return out;
  });
  return {
    rows: masked,
    filtered,
    minKApplied: k,
    aggregateSuppressed: false,
    suppressionReason: filtered > 0 ? "small_cells" : null,
  };
}

/** The rule that fits an NLQ answer, or none if it is not about persons. */
export function anonymiseAnswer(
  cypher: string,
  contributions: Contribution[],
  k: number,
): KOutcome {
  if (!readsPersonData(cypher)) {
    return {
      rows: contributions.flatMap((c) => c.records),
      filtered: 0,
      minKApplied: 0,
      aggregateSuppressed: false,
      suppressionReason: null,
    };
  }
  if (AGGREGATE.test(cypher)) {
    return suppressSmallCells(
      contributions.flatMap((c) => c.records),
      k,
    );
  }
  return suppressSmallGroups(contributions, k);
}
