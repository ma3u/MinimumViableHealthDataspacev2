/**
 * Helpers shared by the application routes (Art. 67), kept out of the route
 * files because Next.js allows only HTTP handlers to be exported there.
 */
import { IDENTIFIABILITY, type ApplicationItems } from "@/lib/permits";

export function text(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const v = body[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The Art. 67(2) items a request body carries, cleaned; absent ones null. */
export function itemsFromBody(body: Record<string, unknown>): ApplicationItems {
  const identifiability = text(body, "identifiability")?.toUpperCase() ?? null;
  const period = body.processingPeriodMonths ?? body.periodMonths;
  return {
    namedPersons: text(body, "namedPersons"),
    intendedUse: text(body, "intendedUse"),
    requestedData: text(body, "requestedData"),
    dataTimeRange: text(body, "dataTimeRange"),
    dataFormats: text(body, "dataFormats"),
    identifiability:
      identifiability &&
      (IDENTIFIABILITY as readonly string[]).includes(identifiability)
        ? identifiability
        : null,
    pseudonymisationJustification: text(body, "pseudonymisationJustification"),
    datasetsBroughtIn: text(body, "datasetsBroughtIn"),
    safeguards: text(body, "safeguards"),
    processingPeriodMonths:
      period === undefined || period === null || period === ""
        ? null
        : Math.min(60, Math.max(1, Math.round(Number(period)) || 12)),
    speTools: text(body, "speTools"),
    ethicsCommitteeRef: text(body, "ethicsCommitteeRef"),
    art71Exception:
      typeof body.art71Exception === "boolean"
        ? body.art71Exception
        : body.art71Exception === "true"
          ? true
          : body.art71Exception === "false"
            ? false
            : null,
    art71ExceptionJustification: text(body, "art71ExceptionJustification"),
  };
}

/** Every row carries these; the inbox and the register read them. */
export const APPLICATION_FIELDS = `
            app.namedPersons                  AS namedPersons,
            app.intendedUse                   AS intendedUse,
            app.requestedData                 AS requestedData,
            app.dataTimeRange                 AS dataTimeRange,
            app.dataFormats                   AS dataFormats,
            app.identifiability               AS identifiability,
            app.pseudonymisationJustification AS pseudonymisationJustification,
            app.datasetsBroughtIn             AS datasetsBroughtIn,
            app.safeguards                    AS safeguards,
            app.speTools                      AS speTools,
            app.art71Exception                AS art71Exception,
            app.art71ExceptionJustification   AS art71ExceptionJustification,
            app.applicantCategory             AS applicantCategory,
            app.dataMinimisationStatement     AS dataMinimisationStatement,
            toString(app.completedAt)         AS completedAt,
            toString(app.extendedAt)          AS extendedAt,
            app.extensionReason               AS extensionReason,
            toString(app.incompleteNoticeAt)  AS incompleteNoticeAt,
            app.incompleteReason              AS incompleteReason,
            toString(app.completeBy)          AS completeBy`;

export interface InboxRow extends ApplicationItems {
  applicationId: string;
  name: string | null;
  applicant: string | null;
  applicantName: string | null;
  applicantCategory: string | null;
  datasetId: string | null;
  datasetTitle: string | null;
  purpose: string | null;
  status: string | null;
  submittedAt: string | null;
  justification: string | null;
  dataMinimisationStatement: string | null;
  periodMonths: number | null;
  completedAt: string | null;
  extendedAt: string | null;
  extensionReason: string | null;
  incompleteNoticeAt: string | null;
  incompleteReason: string | null;
  completeBy: string | null;
  permitId: string | null;
  decision: string | null;
  decidedAt: string | null;
  validUntil: string | null;
  decisionJustification: string | null;
  statisticalAlternativeOffered: boolean | null;
}
