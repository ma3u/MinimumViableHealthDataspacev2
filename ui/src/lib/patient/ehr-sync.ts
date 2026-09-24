/**
 * The last EHR sync of a patient's record (issue #271): when the ePA was
 * last transferred into the portal, as stored on the Patient node
 * (ehrSyncedAt, ehrSyncSource) and shown on the patient page.
 */

export interface EhrSync {
  /** ISO 8601 instant, e.g. 2026-09-22T18:05:00Z */
  at: string;
  /** Where the record came from, in the words of the seed or the flow */
  source: string | null;
}

/** The source the "Request EHR data" flow records for a fresh sync. */
export const EHR_SYNC_SOURCE = "ePA transfer, GesundheitsID-authenticated";

/** Rows from the graph carry the properties as strings or nulls. */
export function ehrSyncFromRow(
  row: { ehrSyncedAt?: unknown; ehrSyncSource?: unknown } | null | undefined,
): EhrSync | null {
  const at = row?.ehrSyncedAt;
  if (typeof at !== "string" || at.length === 0) return null;
  const source = row?.ehrSyncSource;
  return { at, source: typeof source === "string" ? source : null };
}

/**
 * The date and time of a sync in the viewer's locale and time zone, e.g.
 * "22 Sept 2026, 20:05". An unparseable instant is shown as it is.
 */
export function formatEhrSync(
  at: string,
  locale?: string,
  timeZone?: string,
): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(d);
}
