/**
 * The results a data user communicates, Regulation (EU) 2025/327 Art.
 * 61(4): within 18 months of the end of the processing, to the access body,
 * which publishes them (Art. 57(1)(j)(v)) and reports them (Art. 59(1)(j)
 * and (k)). Issue #206, M6.
 */
import { RESULTS_MONTHS, addMonths, parseGraphTime } from "@/lib/permits";

export const RESULT_KINDS = [
  "PUBLICATION",
  "POLICY_DOCUMENT",
  "REGULATORY_PROCEDURE",
  "IT_PRODUCT",
  "OTHER",
] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

export const RESULT_KIND_LABELS: Record<ResultKind, string> = {
  PUBLICATION: "scientific publication",
  POLICY_DOCUMENT: "policy document",
  REGULATORY_PROCEDURE: "regulatory procedure",
  IT_PRODUCT: "IT product",
  OTHER: "other result",
};

/** Art. 61(4): 18 months after the end of the processing under the permit. */
export function resultsDeadline(
  validUntil: string | null | undefined,
): string | null {
  const end = parseGraphTime(validUntil);
  if (end === null) return null;
  return addMonths(new Date(end), RESULTS_MONTHS).toISOString();
}

export interface ResultRow {
  resultId: string;
  permitId: string | null;
  applicant: string | null;
  applicantName: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  kind: string;
  title: string;
  summary: string | null;
  url: string | null;
  communicatedAt: string | null;
  deadline: string | null;
  onTime: boolean | null;
}
