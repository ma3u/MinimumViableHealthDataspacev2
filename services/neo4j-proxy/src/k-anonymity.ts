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
 * Across a federation of SPEs (`federatedAnswer`, draft implementing act on
 * secure processing environments, Art. 2(12) and 18(2)(g), #1236) only
 * aggregates move: an answer about persons that is not a count is withheld,
 * and each SPE's counts are masked on their own, before they are put side
 * by side, so no SPE's small count reaches the caller. `/federated/query`
 * and a federated `/nlq` use it; `/nlq` on one SPE applies whichever rule
 * fits the answer (`anonymiseAnswer`).
 * `/federated/stats` applies the second to each SPE's feasibility counts and
 * adds them up with `combineCounts` (ADR-094, #1123).
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
  suppressionReason:
    | "contributor_k_violation"
    | "small_cells"
    | "row_level_in_federation"
    | null;
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

/**
 * A list of records about persons: source data, which no SPE in a
 * federation sends out (draft SPE act Art. 18(2)(g), #1236). The
 * coordinator does not ask for it at all.
 */
export function isRowLevelAboutPersons(cypher: string): boolean {
  return readsPersonData(cypher) && !AGGREGATE.test(cypher);
}

/** The answer when a federation was not asked for a list about persons. */
export function withheldRowLevel(k: number): KOutcome {
  return {
    rows: [],
    filtered: 0,
    minKApplied: k,
    aggregateSuppressed: true,
    suppressionReason: "row_level_in_federation",
  };
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

/**
 * One count across several sources, when each source's own count is shown
 * next to it with `suppressSmallCells` (ADR-094: every source applies its
 * small-count rule).
 *
 * The plain sum would give a suppressed count back: subtract the counts that
 * are shown and what is left is the one that was not. So the sum leaves out
 * the counts below k, unless those add up to k or more, in which case what a
 * reader can work out is itself a count of at least k. A total below k, or
 * one made only of suppressed counts, comes back as "<k".
 */
export function combineCounts(counts: number[], k: number): number | string {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (k <= 0) return total;
  const small = counts
    .filter((c) => c > 0 && c < k)
    .reduce((sum, c) => sum + c, 0);
  if (small === 0 || small >= k) return total;
  const shown = total - small;
  return shown > 0 ? shown : `<${k}`;
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

/**
 * The rule for an answer put together from several SPEs (#1236): counts
 * only, each SPE's masked on its own. A list of records about persons is
 * source data, and the draft act (Art. 18(2)(g)) lets no source data move
 * between the instances of a federation, so it is withheld whole.
 */
export function federatedAnswer(
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
  if (!AGGREGATE.test(cypher)) {
    const withheld = contributions.reduce(
      (n, c) => n + c.records.filter((r) => !isError(r)).length,
      0,
    );
    return {
      rows: contributions.flatMap((c) => c.records.filter(isError)),
      filtered: withheld,
      minKApplied: k,
      aggregateSuppressed: true,
      suppressionReason: "row_level_in_federation",
    };
  }
  let filtered = 0;
  const rows: Row[] = [];
  for (const c of contributions) {
    const out = suppressSmallCells(c.records, k);
    filtered += out.filtered;
    rows.push(...out.rows);
  }
  return {
    rows,
    filtered,
    minKApplied: k,
    aggregateSuppressed: false,
    suppressionReason: filtered > 0 ? "small_cells" : null,
  };
}
