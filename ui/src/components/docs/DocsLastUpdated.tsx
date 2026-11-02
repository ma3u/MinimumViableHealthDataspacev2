import facts from "@/app/docs/docs-facts.json";
import { LastUpdatedLine } from "@/components/docs/LastUpdatedLine";

export type DocsPage = keyof typeof facts.lastUpdated;

/** "Last updated" under a docs page title. The date is the page's last
 *  content change, kept by scripts/gen-docs-facts.py (pre-commit and the PR
 *  Gate), never typed by hand; LastUpdatedLine writes it in the picked
 *  language. */
export function DocsLastUpdated({ page }: { page: DocsPage }) {
  return <LastUpdatedLine iso={facts.lastUpdated[page]} />;
}
