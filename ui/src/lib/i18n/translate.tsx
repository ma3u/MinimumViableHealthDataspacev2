"use client";

/**
 * The interface in the language picked in the menu bar (#782, phase 2).
 *
 * English is the source and the key: a dictionary maps each English text to
 * its translation (ui/src/messages/<lang>/<area>.json). A text with no
 * translation shows in English; __tests__/unit/lib/i18n-messages.test.ts
 * lists what each language is missing and holds legal terms to
 * ui/src/lib/i18n/ehds-terminology.json. The language is the picker's
 * (lib/use-language.ts); pages keep their URLs (ADR-070).
 *
 *   const t = useT("nav");   t("Dataset Catalog")
 */
import { useLanguage } from "@/lib/use-language";
import type { CatalogLanguage } from "@/lib/metadata-language";
import { MESSAGES, type Area } from "@/messages";

/** The text in a language, or the English one when it has none. */
export function translate(
  lang: CatalogLanguage,
  area: Area,
  text: string,
  vars?: Record<string, string | number>,
): string {
  const out = lang === "en" ? text : MESSAGES[lang]?.[area]?.[text] ?? text;
  return vars
    ? out.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      )
    : out;
}

/** A translator for one area, in the language the picker holds. */
export function useT(area: Area) {
  const lang = useLanguage();
  return (text: string, vars?: Record<string, string | number>) =>
    translate(lang, area, text, vars);
}
