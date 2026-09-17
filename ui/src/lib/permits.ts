/**
 * Shared vocabulary of the data permit workflow, Regulation (EU) 2025/327.
 * Used by the applications and permits routes and by the compliance page.
 */

/** Art. 68(4): the access body decides within three months. */
export const DECISION_MONTHS = 3;

/** Art. 57(1)(j)(iii): decisions are published within 30 working days. */
export const PUBLISH_WORKING_DAYS = 30;

/** The Art. 53(1) purposes a permit may be issued for. */
export const PURPOSES = [
  "PUBLIC_HEALTH",
  "POLICY_MAKING",
  "STATISTICS",
  "EDUCATION",
  "SCIENTIFIC_RESEARCH",
  "CARE_IMPROVEMENT",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
  PUBLIC_HEALTH: "(a) public interest in public or occupational health",
  POLICY_MAKING: "(b) policymaking and regulatory activities",
  STATISTICS: "(c) official statistics",
  EDUCATION: "(d) education or teaching",
  SCIENTIFIC_RESEARCH: "(e) scientific research",
  CARE_IMPROVEMENT: "(f) improvement of the delivery of care",
};

/** Art. 68(1)(a) to (h): what the body assesses before it issues a permit. */
export const CRITERIA = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERIA_LABELS: Record<Criterion, string> = {
  a: "The purposes correspond to Art. 53(1)",
  b: "The data are necessary, adequate and proportionate (Art. 66)",
  c: "Processing is lawful under GDPR Art. 6(1); pseudonymised data are justified",
  d: "The applicant is qualified for the intended purposes",
  e: "Technical and organisational measures against misuse are sufficient",
  f: "The ethics assessment complies with national law",
  g: "An Art. 71(4) exception, where used, is justified",
  h: "All other requirements of Chapter IV are met",
};

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

/** Working days: weekends skipped, public holidays not. */
export function addWorkingDays(d: Date, days: number): Date {
  const r = new Date(d);
  let left = days;
  while (left > 0) {
    r.setUTCDate(r.getUTCDate() + 1);
    const wd = r.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return r;
}

/** Neo4j prints nine fractional digits; Date.parse wants at most three. */
export function parseGraphTime(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const t = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? null : t;
}

/**
 * The Art. 68(4) clock for one application: when the decision is due and how
 * many days remain (negative once overdue). Null when nothing is pending.
 */
export function decisionClock(
  submittedAt: string | null | undefined,
  undecided: boolean,
  now = Date.now(),
): { decisionDue: string | null; daysToDecision: number | null } {
  const submitted = parseGraphTime(submittedAt);
  if (submitted === null) return { decisionDue: null, daysToDecision: null };
  const due = addMonths(new Date(submitted), DECISION_MONTHS);
  return {
    decisionDue: due.toISOString(),
    daysToDecision: undecided
      ? Math.ceil((due.getTime() - now) / 86_400_000)
      : null,
  };
}
