/**
 * Retention of the secure processing environment's logs.
 *
 * - Regulation (EU) 2025/327 Art. 73(1)(e): identifiable logs of access and
 *   activity are kept for at least one year.
 * - Draft implementing act on secure processing environments, Art. 16(4)
 *   (Ares(2026)10903532, #1236): five years, or one year after the data
 *   permit ends if that is shorter.
 *
 * So an event under a permit is kept until one year after the permit ends,
 * at most five years after the event and never less than one year after it.
 * An event under no permit, or a permit with no end date, keeps one year.
 * Every access event and every recorded transfer carries `retainUntil`;
 * nothing is deleted before it. Issue #206, M3; #1236.
 */

export const RETENTION_MONTHS = 12;
export const RETENTION_MAX_YEARS = 5;
export const RETENTION_ARTICLE =
  "Regulation (EU) 2025/327, Art. 73(1)(e); draft SPE implementing act, Art. 16(4)";

const addYears = (d: Date, years: number) => {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + years);
  return r;
};

/** One year after `from`: the floor, and the rule for events under no permit. */
export function retainUntil(from: Date = new Date()): Date {
  const r = new Date(from);
  r.setUTCMonth(r.getUTCMonth() + RETENTION_MONTHS);
  return r;
}

/** The date an event recorded at `recorded` under a permit ending at `permitEnd` may be deleted. */
export function retainUntilFor(recorded: Date, permitEnd: Date | null): Date {
  const floor = retainUntil(recorded);
  if (!permitEnd) return floor;
  const cap = addYears(recorded, RETENTION_MAX_YEARS);
  const afterPermit = addYears(permitEnd, 1);
  const chosen = afterPermit < cap ? afterPermit : cap;
  return chosen < floor ? floor : chosen;
}

/**
 * The same rule in Cypher, for a query with the event as `event` (its
 * `timestamp` and `retainUntil` stored as strings) and the permit, an
 * `HDABApproval` that may be null, as `permit`.
 */
export function retentionCypher(event: string, permit: string): string {
  const at = `datetime(toString(${event}.timestamp))`;
  const end = `datetime(toString(${permit}.validUntil)) + duration({years: 1})`;
  return `FOREACH (_ IN CASE WHEN ${permit} IS NOT NULL AND ${permit}.validUntil IS NOT NULL THEN [1] ELSE [] END |
         SET ${event}.retainUntil = toString(CASE
           WHEN ${end} < ${at} + duration({years: 1}) THEN ${at} + duration({years: 1})
           WHEN ${end} < ${at} + duration({years: ${RETENTION_MAX_YEARS}}) THEN ${end}
           ELSE ${at} + duration({years: ${RETENTION_MAX_YEARS}})
         END))`;
}
