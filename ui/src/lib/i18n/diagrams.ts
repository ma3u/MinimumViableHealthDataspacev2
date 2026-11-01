/**
 * The Mermaid charts of the hand-written docs pages in the picked language
 * (ADR-071). Each chart is a module under ui/src/content/diagrams/ holding
 * its text per language, English required, and is registered once in
 * ui/src/content/diagrams/index.ts. A language with no text of its own
 * shows the English chart.
 *
 *   const lang = useLanguage();
 *   <MermaidDiagram chart={localizedChart("user-guide-workflow", lang)} />
 *
 * Mermaid inside a published Markdown document is translated in the
 * translated Markdown instead (docs/i18n/<lang>/...).
 */
import { DIAGRAMS, type ChartId } from "@/content/diagrams";
import type { CatalogLanguage } from "@/lib/metadata-language";

/** A chart's text per language; English is the source and the fallback. */
export type ChartVariants = { en: string } & Partial<
  Record<Exclude<CatalogLanguage, "en">, string>
>;

/** The chart's text in a language, or the English one when it has none. */
export function localizedChart(id: ChartId, lang: CatalogLanguage): string {
  const chart: ChartVariants = DIAGRAMS[id];
  return chart[lang] ?? chart.en;
}
