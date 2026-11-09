import type { MetadataRoute } from "next";
import { STATIC_SITE_URL } from "@/lib/offline-mode";
import { publishedDocs } from "@/lib/docs/published-docs";
import facts from "@/app/docs/docs-facts.json";
import sitePages from "@/content/site-pages.json";

export const dynamic = "force-static";

// The pages a visitor can read without signing in on the static site, which
// is the indexed copy (see robots.ts). The site search reads the same list.
const PAGES = sitePages.pages.map((p) => p.path);

// The date each docs page last changed, kept by scripts/gen-docs-facts.py.
const LAST_UPDATED = facts.lastUpdated as Record<string, string>;

function entry(path: string, dateKey = path): MetadataRoute.Sitemap[number] {
  const date = LAST_UPDATED[dateKey];
  return {
    url: path === "/" ? `${STATIC_SITE_URL}/` : `${STATIC_SITE_URL}${path}`,
    ...(date ? { lastModified: date } : {}),
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((p) => entry(p)),
    ...publishedDocs.map((d) =>
      entry(`/docs/${d.section}/${d.slug}`, `/docs/${d.section}/[slug]`),
    ),
  ];
}
