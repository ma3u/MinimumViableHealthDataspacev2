import data from "@/content/security-docs.json";

export interface SecurityDoc {
  slug: string;
  title: string;
  summary: string;
  /** Path of the source file in the repository. */
  source: string;
  markdown: string;
}

export const REPO_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2";

/** The shareable one-page version of the report for health insurers. */
export const INSURER_REPORT_PAGE =
  "https://claude.ai/artifact/DVmxYWDdfv9LdVMkR74m1h";

/** The security and data-protection reports, copied from docs/ by
 *  scripts/gen-docs-content.py, in index order. */
export const securityDocs: SecurityDoc[] = data.docs;

export function findSecurityDoc(slug: string): SecurityDoc | undefined {
  return securityDocs.find((d) => d.slug === slug);
}
