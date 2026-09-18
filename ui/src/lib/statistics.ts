/**
 * Health data requests, Regulation (EU) 2025/327 Art. 69: the applicant gets
 * an answer "only in an anonymised statistical format" and "shall have no
 * access to the electronic health data used to provide that response".
 *
 * The answer comes from the same NLQ path a permit holder uses, but only
 * templates that aggregate are allowed, identifier-like columns are refused,
 * and small counts are suppressed (k-anonymity, k = 5, the threshold the
 * federated statistics already use). Issue #206, M5.
 */

export const K_ANONYMITY = 5;

/** NLQ templates whose result is a statistic, not a list of records. */
export const STATISTICAL_TEMPLATES = [
  "patient_count",
  "patient_by_gender",
  "top_conditions",
  "top_medications",
  "condition_prevalence",
  "encounters_by_type",
  "omop_cohort_stats",
  "age_distribution",
  "adverse_event_in_cohort",
] as const;

const MAX_ROWS = 200;
const IDENTIFIER_KEY =
  /(^|_)(id|did|patientid|personid|resourceid|name|birthdate|dob)$/i;

export interface NlqAnswer {
  method?: string;
  templateName?: string;
  results?: Record<string, unknown>[];
  totalRows?: number;
  cypher?: string;
  error?: string;
  message?: string;
}

export interface StatisticalAnswer {
  ok: boolean;
  templateName: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  suppressedCells: number;
  kAnonymity: number;
  reason: string;
}

/**
 * Turn an NLQ answer into what Art. 69 allows to leave the environment, or
 * say why it cannot.
 */
export function toStatisticalAnswer(answer: NlqAnswer): StatisticalAnswer {
  const base = {
    templateName: answer.templateName ?? null,
    rows: [] as Record<string, unknown>[],
    rowCount: 0,
    suppressedCells: 0,
    kAnonymity: K_ANONYMITY,
  };
  if (answer.error) {
    return { ...base, ok: false, reason: `The query failed: ${answer.error}` };
  }
  if (answer.method !== "template" || !answer.templateName) {
    return {
      ...base,
      ok: false,
      reason: `The question did not resolve to a statistical template (${
        answer.method ?? "no match"
      }); Art. 69 allows only anonymised statistical answers.`,
    };
  }
  if (
    !(STATISTICAL_TEMPLATES as readonly string[]).includes(answer.templateName)
  ) {
    return {
      ...base,
      ok: false,
      reason: `The question resolves to "${answer.templateName}", which returns records rather than statistics; Art. 69 allows only anonymised statistical answers.`,
    };
  }
  const results = Array.isArray(answer.results) ? answer.results : [];
  if (results.length > MAX_ROWS) {
    return {
      ...base,
      ok: false,
      reason: `The result has ${results.length} rows, which is not a summary statistic.`,
    };
  }
  const leakingKey = results
    .flatMap((r) => Object.keys(r ?? {}))
    .find((k) => IDENTIFIER_KEY.test(k));
  if (leakingKey) {
    return {
      ...base,
      ok: false,
      reason: `The result carries an identifier column (${leakingKey}); Art. 69 allows only anonymised statistical answers.`,
    };
  }

  let suppressed = 0;
  const rows = results.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r ?? {})) {
      if (
        typeof v === "number" &&
        Number.isInteger(v) &&
        v > 0 &&
        v < K_ANONYMITY
      ) {
        out[k] = `<${K_ANONYMITY}`;
        suppressed += 1;
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  return {
    ...base,
    ok: true,
    rows,
    rowCount: rows.length,
    suppressedCells: suppressed,
    reason:
      suppressed > 0
        ? `Anonymised statistical result; ${suppressed} count${
            suppressed === 1 ? "" : "s"
          } below ${K_ANONYMITY} suppressed.`
        : "Anonymised statistical result.",
  };
}
