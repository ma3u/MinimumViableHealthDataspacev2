/**
 * The access body's supervision of data users and holders, Regulation (EU)
 * 2025/327 Art. 63: a finding of non-compliance, the party's right to state
 * its views, the measures the body may take, and requests for information.
 * Shared by the routes and the pages. Issue #206, M4.
 */

/** Art. 63(2): the party states its views within four weeks at most. */
export const RESPONSE_WEEKS = 4;

/** Art. 63(3): revoke the permit, exclude the party for up to five years; fines under Art. 64. */
export const MEASURES = [
  "NONE",
  "WARNING",
  "REVOCATION",
  "EXCLUSION",
  "FINE",
] as const;
export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABELS: Record<Measure, string> = {
  NONE: "no measure; the finding is closed",
  WARNING: "written warning",
  REVOCATION: "data permit revoked (Art. 63(3))",
  EXCLUSION: "excluded from access for a period, up to five years (Art. 63(3))",
  FINE: "administrative fine (Art. 64)",
};

export const FINDING_STATUSES = ["OPEN", "VIEWS_RECEIVED", "CLOSED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export interface Finding {
  findingId: string;
  party: string | null;
  partyName: string | null;
  partyType: string | null;
  permitId: string | null;
  description: string;
  gdprBreach: boolean;
  supervisoryAuthorityInformed: boolean;
  status: FindingStatus | string;
  notifiedAt: string | null;
  respondBy: string | null;
  daysToRespond: number | null;
  views: string | null;
  respondedAt: string | null;
  measure: string | null;
  measureNote: string | null;
  exclusionMonths: number | null;
  fineEur: number | null;
  closedAt: string | null;
  foundBy: string | null;
  accessBody: string | null;
}

export interface InformationRequest {
  requestId: string;
  party: string | null;
  partyName: string | null;
  permitId: string | null;
  findingId: string | null;
  question: string;
  status: "OPEN" | "ANSWERED" | string;
  requestedAt: string | null;
  answerBy: string | null;
  daysToAnswer: number | null;
  answer: string | null;
  answeredAt: string | null;
  requestedBy: string | null;
  accessBody: string | null;
}

export function weeksFrom(d: Date, weeks: number): Date {
  return new Date(d.getTime() + weeks * 7 * 86_400_000);
}

export function daysLeft(
  deadline: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!deadline) return null;
  const t = Date.parse(deadline.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? null : Math.ceil((t - now) / 86_400_000);
}

export function slugOf(did: string): string {
  return (
    did
      .replace(/^did:web:/, "")
      .split(":")[0]
      .split(".")[0]
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase() || "party"
  );
}
