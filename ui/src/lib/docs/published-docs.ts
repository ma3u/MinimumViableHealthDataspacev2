import data from "@/content/published-docs.json";

/** A section of the published documentation, one route under /docs each. */
export type DocSection = "security" | "klarbefund";

export interface PublishedDoc {
  section: DocSection;
  slug: string;
  title: string;
  summary: string;
  /** Path of the source file in the repository. */
  source: string;
  markdown: string;
}

export const REPO_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2";

/** Every document copied from docs/ by scripts/gen-docs-content.py, in
 *  index order. */
export const publishedDocs: PublishedDoc[] = data.docs as PublishedDoc[];

export function docsInSection(section: DocSection): PublishedDoc[] {
  return publishedDocs.filter((d) => d.section === section);
}

export function findDoc(
  section: DocSection,
  slug: string,
): PublishedDoc | undefined {
  return publishedDocs.find((d) => d.section === section && d.slug === slug);
}
