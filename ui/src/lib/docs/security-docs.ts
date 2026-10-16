import {
  docsInSection,
  findDoc,
  REPO_URL,
  type PublishedDoc,
} from "@/lib/docs/published-docs";

export type SecurityDoc = PublishedDoc;
export { REPO_URL };

/** The shareable one-page version of the report for health insurers. */
export const INSURER_REPORT_PAGE =
  "https://claude.ai/artifact/DVmxYWDdfv9LdVMkR74m1h";

/** The security and data-protection reports, in index order. */
export const securityDocs: SecurityDoc[] = docsInSection("security");

export function findSecurityDoc(slug: string): SecurityDoc | undefined {
  return findDoc("security", slug);
}
