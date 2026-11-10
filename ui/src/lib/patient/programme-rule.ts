/**
 * The active year rule, evaluated inside the member's own record (#934,
 * step 6; ADR-080, decision 3; ADR-087).
 *
 * AlphaKasse DE publishes the rule with its programme ("active for at least
 * 150 minutes a week on average and went to one check-up"); the hub reads
 * it, works it out here and keeps the detail to itself. What a transfer
 * carries is the year and goal met, yes or no (ADR-080, decision 2). The
 * breakdown (minutes a week, check-ups) is for the member's own eyes.
 *
 * - **Ended years only** (ADR-087, decision 1). Before 1 January of the next
 *   year the answer could still change, so the hub says the year is not over
 *   and sends nothing.
 * - **Activity** is LOINC 55411-3 "Exercise duration", one Observation per
 *   week holding that week's mean minutes per day, as the Klarbefund app
 *   sends it from the tracker (ADR-057). A week's minutes are its mean times
 *   seven; a week belongs to the year it ends in. The year's average divides
 *   by 52: a week the tracker shared nothing counts as no activity, because
 *   the hub can only see what was shared. Minutes are never guessed from
 *   steps.
 * - **The check-up** is an Encounter in that year coded SNOMED CT 185349003
 *   "Encounter for check up", or carrying that display, which is how the
 *   Synthea loader stores it.
 */
import { runQuery } from "@/lib/neo4j";
import type { YearEvaluation } from "@/lib/patient/bonus-programme";

export type { YearEvaluation };

export const EXERCISE_DURATION_LOINC = "55411-3";
export const CHECK_UP_SNOMED = ["185349003"];
const CHECK_UP_DISPLAYS = [
  "Encounter for check up",
  "Encounter for check up (procedure)",
];

/** Rule 2025.1, as AlphaKasse publishes it. */
export const ACTIVE_YEAR_RULE = {
  minutesPerWeek: 150,
  checkUps: 1,
  weeksPerYear: 52,
} as const;

/** The year a rule version names: 2025.1 is the rule for 2025. */
export function ruleYear(
  ruleVersion: string | null | undefined,
): number | null {
  const year = Number((ruleVersion ?? "").slice(0, 4));
  return Number.isInteger(year) && year >= 2000 ? year : null;
}

/** True from 1 January (UTC) of the following year. */
export function yearIsOver(year: number, now: Date = new Date()): boolean {
  return now.getTime() >= Date.UTC(year + 1, 0, 1);
}

/**
 * The year's activity weeks and check-ups, summed inside the hub. No row
 * when the record does not exist. Nothing finer than these three numbers
 * leaves the query.
 */
export const YEAR_RECORD_CYPHER = `MATCH (p:Patient)
   WHERE coalesce(p.id, p.resourceId, elementId(p)) = $patientId
   OPTIONAL MATCH (p)-[:HAS_OBSERVATION]->(o:Observation {code: $exerciseCode})
     WHERE substring(toString(coalesce(o.effectiveDate, '')), 0, 4) = $year
   WITH p, sum(toFloat(coalesce(o.valueQuantity, o.value, 0)) * 7) AS minutes,
        count(o) AS weeks
   OPTIONAL MATCH (p)-[:HAS_ENCOUNTER]->(e:Encounter)
     WHERE substring(toString(coalesce(e.period, e.date, '')), 0, 4) = $year
       AND (e.typeCode IN $checkUpCodes OR e.type IN $checkUpDisplays)
   RETURN minutes, weeks, count(e) AS checkUps`;

export interface YearRecordRow {
  minutes: number;
  weeks: number;
  checkUps: number;
}

/** The rule applied to what the record holds for an ended year. */
export function applyActiveYearRule(
  year: number,
  row: YearRecordRow,
): Extract<YearEvaluation, { status: "evaluated" }> {
  const perWeek = Number(row.minutes) / ACTIVE_YEAR_RULE.weeksPerYear;
  const activityMet = perWeek >= ACTIVE_YEAR_RULE.minutesPerWeek;
  const checkUps = Number(row.checkUps);
  const checkUpMet = checkUps >= ACTIVE_YEAR_RULE.checkUps;
  return {
    year,
    status: "evaluated",
    goalMet: activityMet && checkUpMet,
    activity: {
      minutesPerWeek: Math.round(perWeek),
      required: ACTIVE_YEAR_RULE.minutesPerWeek,
      weeksWithData: Number(row.weeks),
      met: activityMet,
    },
    checkUp: {
      count: checkUps,
      required: ACTIVE_YEAR_RULE.checkUps,
      met: checkUpMet,
    },
  };
}

/** Works the year out for one record, or null when the record is not there. */
export async function evaluateYear(
  patientId: string,
  year: number,
  now: Date = new Date(),
): Promise<YearEvaluation | null> {
  if (!yearIsOver(year, now)) {
    return {
      year,
      status: "year-not-over",
      evaluableFrom: `${year + 1}-01-01`,
    };
  }
  const [row] = await runQuery<YearRecordRow>(YEAR_RECORD_CYPHER, {
    patientId,
    year: String(year),
    exerciseCode: EXERCISE_DURATION_LOINC,
    checkUpCodes: CHECK_UP_SNOMED,
    checkUpDisplays: CHECK_UP_DISPLAYS,
  });
  return row ? applyActiveYearRule(year, row) : null;
}
