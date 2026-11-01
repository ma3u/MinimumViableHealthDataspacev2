"use client";

/**
 * The language the visitor reads the hub in (#782), picked in the menu.
 *
 * Today it sets the language of the dataset descriptions; the interface is
 * English until it is translated (#782, phase 2), and then this is its
 * language too. Order: ?lang= in the address, the stored choice, the
 * browser's language, English (initialLanguage in metadata-language.ts).
 * A module-level EventTarget tells every component in the tab at once, as
 * use-demo-persona.ts does (the storage event only reaches other tabs).
 */
import { useEffect, useState } from "react";
import {
  type CatalogLanguage,
  initialLanguage,
  storedLanguage,
  storeLanguage,
} from "@/lib/metadata-language";

/** The languages the menu offers: those the hub has descriptions in. */
export const OFFERED_LANGUAGES: CatalogLanguage[] = ["en", "de", "fr", "nl"];

const emitter: EventTarget | null =
  typeof window !== "undefined" ? new EventTarget() : null;
const CHANGE = "language-change";

/** The visitor picks a language: stored, and every reader in the tab told. */
export function setLanguage(lang: CatalogLanguage): void {
  storeLanguage(lang);
  emitter?.dispatchEvent(new CustomEvent(CHANGE, { detail: lang }));
}

function currentLanguage(): CatalogLanguage {
  const fromUrl =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("lang");
  return initialLanguage(OFFERED_LANGUAGES, fromUrl, storedLanguage());
}

/** The language to show. English on the server and the first render. */
export function useLanguage(): CatalogLanguage {
  const [lang, setLang] = useState<CatalogLanguage>("en");
  useEffect(() => {
    setLang(currentLanguage());
    const onChange = (e: Event) =>
      setLang((e as CustomEvent<CatalogLanguage>).detail);
    emitter?.addEventListener(CHANGE, onChange);
    return () => emitter?.removeEventListener(CHANGE, onChange);
  }, []);
  return lang;
}
