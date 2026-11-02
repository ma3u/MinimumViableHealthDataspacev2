"use client";

/**
 * The cards of a docs section, one per published document, in the language
 * picked in the menu (ADR-071): a document translated into that language
 * shows its translated title and summary (translationOf), any other its
 * English ones. The section pages are server components and hand in only
 * what the cards show (docCards), never the Markdown.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { translationOf } from "@/lib/docs/published-docs-i18n";
import type { DocCard } from "@/lib/docs/published-docs";
import { useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";

export function PublishedDocCards({
  docs,
  testId,
}: {
  docs: DocCard[];
  testId?: string;
}) {
  const lang = useLanguage();
  const t = useT("docsCommon");
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10"
      data-testid={testId}
    >
      {docs.map((d) => {
        const tr = translationOf(d.section, d.slug, lang);
        const summary = tr?.summary;
        return (
          <Link
            key={d.slug}
            href={`/docs/${d.section}/${d.slug}`}
            className="flex flex-col border border-(--border) rounded-xl p-5 hover:border-indigo-500/50 transition-colors group"
          >
            <span
              className="font-semibold mb-2 text-indigo-700 dark:text-indigo-400"
              lang={tr ? lang : undefined}
            >
              {tr?.title ?? d.title}
            </span>
            <span
              className="text-sm text-(--text-secondary) mb-3 flex-1"
              lang={summary ? lang : undefined}
            >
              {summary ?? d.summary}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-(--accent) group-hover:underline mt-auto">
              {t("Read")} <ArrowRight size={14} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
