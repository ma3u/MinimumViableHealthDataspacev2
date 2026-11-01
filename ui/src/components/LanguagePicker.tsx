"use client";

import { useEffect } from "react";
import { Languages } from "lucide-react";
import { useT } from "@/lib/i18n/translate";
import { LANGUAGE_NAMES } from "@/lib/metadata-language";
import type { CatalogLanguage } from "@/lib/metadata-language";
import {
  OFFERED_LANGUAGES,
  setLanguage,
  useLanguage,
} from "@/lib/use-language";

/**
 * The language picker in the menu bar (#782). Each language is named in
 * itself (Deutsch, Français), so a reader finds their own. It sets the
 * language of the interface (lib/i18n/translate.tsx) and of the dataset
 * descriptions; a text not yet translated shows in English.
 */
export default function LanguagePicker({
  className = "",
}: {
  className?: string;
}) {
  const lang = useLanguage();
  const t = useT("nav");
  // The page is in this language now; a screen reader reads it so
  // (WCAG 2.2, 3.1.1 Language of Page).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <label
      className={`items-center gap-1 px-1.5 py-1 rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-2) transition-colors ${
        className || "flex"
      }`}
      title={t("Language")}
    >
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t("Language")}</span>
      <select
        value={lang}
        onChange={(e) => setLanguage(e.target.value as CatalogLanguage)}
        className="bg-transparent text-xs font-semibold cursor-pointer outline-hidden focus-visible:ring-2 focus-visible:ring-(--accent) rounded-sm"
      >
        {OFFERED_LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
