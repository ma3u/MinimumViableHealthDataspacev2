"use client";

import { Languages } from "lucide-react";
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
 * language of the dataset descriptions; the interface stays English until
 * it is translated.
 */
export default function LanguagePicker() {
  const lang = useLanguage();
  return (
    <label
      className="flex items-center gap-1 px-1.5 py-1 rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-2) transition-colors"
      title="Language of the dataset descriptions; the menus are in English for now"
    >
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">Language</span>
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
