/**
 * Retention of the secure processing environment's logs, Regulation (EU)
 * 2025/327 Art. 73(1)(e): identifiable logs of access and activity are kept
 * for at least one year. Every access event and every recorded transfer
 * carries `retainUntil`; nothing is deleted before it. Issue #206, M3.
 */

export const RETENTION_MONTHS = 12;
export const RETENTION_ARTICLE = "Regulation (EU) 2025/327, Art. 73(1)(e)";

export function retainUntil(from: Date = new Date()): Date {
  const r = new Date(from);
  r.setUTCMonth(r.getUTCMonth() + RETENTION_MONTHS);
  return r;
}
