"use client";

/**
 * The "Last updated" line under a docs page title, in the language picked in
 * the menu (ADR-071): the words from the docsCommon dictionary, the date
 * written the way that language writes it. English on the server and the
 * first render, like every translated text.
 */
import { CalendarClock } from "lucide-react";
import { T } from "@/lib/i18n/translate";
import type { CatalogLanguage } from "@/lib/metadata-language";
import { useLanguage } from "@/lib/use-language";

const LOCALE: Record<CatalogLanguage, string> = {
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  nl: "nl-NL",
  es: "es-ES",
};

export function LastUpdatedLine({ iso }: { iso: string }) {
  const lang = useLanguage();
  const date = new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE[lang], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary) mb-4">
      <CalendarClock size={13} aria-hidden="true" />
      <span>
        <T
          area="docsCommon"
          vars={{ date }}
          tags={{ time: <time dateTime={iso} /> }}
        >
          {"Last updated <time>{date}</time>"}
        </T>
      </span>
    </p>
  );
}
