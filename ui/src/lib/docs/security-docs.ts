import {
  docsInSection,
  findDoc,
  REPO_URL,
  type PublishedDoc,
} from "@/lib/docs/published-docs";

export type SecurityDoc = PublishedDoc;
export { REPO_URL };

/** The one-page version of the report for health insurers, served by the
 *  hub itself (docs/klarbefund/report-for-health-insurers.html). */
export const INSURER_REPORT_PAGE = `${
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
    ? "/MinimumViableHealthDataspacev2"
    : ""
}/published-docs/klarbefund-insurer-report.html`;

/** The security and data-protection reports, in index order. */
export const securityDocs: SecurityDoc[] = docsInSection("security");

export function findSecurityDoc(slug: string): SecurityDoc | undefined {
  return findDoc("security", slug);
}
