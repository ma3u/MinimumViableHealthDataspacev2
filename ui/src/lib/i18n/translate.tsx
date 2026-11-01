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
 *   const t = useT("nav");   t("Dataset Catalog")        in a client component
 *   <T area="home" tags={{ b: <strong /> }}>Run <b>FHIR R4</b></T>
 *                                                      in a server component
 */
import { cloneElement, type ReactElement, type ReactNode } from "react";
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

/**
 * A translated text, for a server component, which cannot call a hook.
 * `tags` turns marked parts into elements: in "Run <b>FHIR R4</b>" the part
 * "FHIR R4" is rendered inside a copy of tags.b. The elements are made by
 * the server component (a link, a <strong>), so the translation moves the
 * words and keeps the markup; tags do not nest.
 */
export function T({
  area,
  children,
  vars,
  tags,
}: {
  area: Area;
  children: string;
  vars?: Record<string, string | number>;
  tags?: Record<string, ReactElement<{ children?: ReactNode }>>;
}): ReactNode {
  const t = useT(area);
  const text = t(children, vars);
  if (!tags) return text;
  const parts: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const el = tags[m[1]];
    parts.push(
      el ? cloneElement(el, { key: `${m[1]}-${m.index}` }, m[2]) : m[2],
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
