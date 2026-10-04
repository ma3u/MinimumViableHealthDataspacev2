import { CalendarClock } from "lucide-react";
import facts from "@/app/docs/docs-facts.json";

type DocsPage = keyof typeof facts.lastUpdated;

/** "Last updated" under a docs page title. The date is the page's last
 *  content change, kept by scripts/gen-docs-facts.py (pre-commit and the PR
 *  Gate), never typed by hand. */
export function DocsLastUpdated({ page }: { page: DocsPage }) {
  const iso = facts.lastUpdated[page];
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary) mb-4">
      <CalendarClock size={13} aria-hidden="true" />
      Last updated <time dateTime={iso}>{label}</time>
    </p>
  );
}
