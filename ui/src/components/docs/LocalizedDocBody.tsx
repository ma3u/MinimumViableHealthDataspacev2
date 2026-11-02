"use client";

/**
 * The body of a published document in the language picked in the menu
 * (ADR-071). The server renders the English body and hands it in as
 * children; in another language this fetches the translation the generator
 * wrote to public/published-docs/i18n/<lang>/<section>/<slug>.json and shows
 * it instead, with lang set on it (WCAG 3.1.2).
 *
 * No translation: the English body, with a note saying so. A stale one (the
 * English changed after it was translated): the translation, with a note and
 * a button to read the English. While the translation loads, and if it
 * cannot be fetched, the English body stays.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Languages } from "lucide-react";
import MermaidDiagram from "@/components/MermaidDiagram";
import { docSegments } from "@/lib/docs/markdown";
import { translationOf, translationUrl } from "@/lib/docs/published-docs-i18n";
import { useT } from "@/lib/i18n/translate";
import type { CatalogLanguage } from "@/lib/metadata-language";
import { useLanguage } from "@/lib/use-language";

/** A language's name as it stands inside a sentence of that language. The
 *  notes are only ever shown in the language they name. */
const IN_SENTENCE: Record<CatalogLanguage, string> = {
  en: "English",
  de: "Deutsch",
  fr: "français",
  nl: "Nederlands",
  es: "español",
};

function Note({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      data-testid="doc-translation-note"
      className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-(--border) bg-(--surface-2) px-3 py-2 text-xs text-(--text-secondary)"
    >
      <Languages size={14} aria-hidden="true" />
      {children}
    </p>
  );
}

export function LocalizedDocBody({
  section,
  slug,
  children,
}: {
  section: string;
  slug: string;
  /** The English body, rendered on the server. */
  children: ReactNode;
}) {
  const lang = useLanguage();
  const t = useT("docsCommon");
  const translation = translationOf(section, slug, lang);
  const [loaded, setLoaded] = useState<{
    lang: CatalogLanguage;
    markdown: string;
  } | null>(null);
  const [failed, setFailed] = useState<CatalogLanguage | null>(null);
  const [english, setEnglish] = useState(false);

  useEffect(() => {
    setEnglish(false);
    if (!translation) return;
    let cancelled = false;
    fetch(translationUrl(section, slug, lang))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ markdown: string }>;
      })
      .then((doc) => {
        if (!cancelled) setLoaded({ lang, markdown: doc.markdown });
      })
      .catch(() => {
        if (!cancelled) setFailed(lang);
      });
    return () => {
      cancelled = true;
    };
  }, [section, slug, lang, translation]);

  const markdown = loaded?.lang === lang ? loaded.markdown : null;
  const segments = useMemo(
    () => (markdown ? docSegments(markdown) : null),
    [markdown],
  );

  if (lang === "en") return <>{children}</>;

  if (!translation || failed === lang) {
    return (
      <>
        <Note>
          {t("Not yet translated into {language}.", {
            language: IN_SENTENCE[lang],
          })}
        </Note>
        {children}
      </>
    );
  }

  // The translation is on its way: English until it arrives.
  if (!segments) return <>{children}</>;

  const toggle = (
    <button
      type="button"
      onClick={() => setEnglish((e) => !e)}
      className="text-(--accent) underline"
    >
      {english ? t("Back to the translation") : t("Read the English original")}
    </button>
  );

  return (
    <>
      {translation.status === "stale" ? (
        <Note>
          {t("The English original was changed after this translation.")}{" "}
          {toggle}
        </Note>
      ) : english ? (
        <Note>{toggle}</Note>
      ) : null}
      {english ? (
        children
      ) : (
        <div lang={lang} data-testid="published-doc-translation">
          {segments.map((seg, i) =>
            seg.kind === "mermaid" ? (
              <MermaidDiagram key={i} chart={seg.chart} />
            ) : (
              <div
                key={i}
                // The HTML comes from the repository's own Markdown.
                dangerouslySetInnerHTML={{ __html: seg.html }}
              />
            ),
          )}
        </div>
      )}
    </>
  );
}
