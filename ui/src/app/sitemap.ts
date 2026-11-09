import type { MetadataRoute } from "next";
import { STATIC_SITE_URL } from "@/lib/offline-mode";
import { publishedDocs } from "@/lib/docs/published-docs";
import facts from "@/app/docs/docs-facts.json";

export const dynamic = "force-static";

// The pages a visitor can read without signing in on the static site, which
// is the indexed copy (see robots.ts). Sign-in, settings and the onboarding
// forms are left out: they say nothing about the project.
const PAGES = [
  "/",
  "/demo",
  "/overview",
  "/journey",
  "/graph",
  "/catalog",
  "/eehrxf",
  "/jurisdictions",
  "/information",
  "/permits",
  "/activity-report",
  "/compliance",
  "/analytics",
  "/query",
  "/patient",
  "/data/discover",
  "/negotiate",
  "/supervision",
  "/credentials",
  "/docs",
  "/docs/user-guide",
  "/docs/architecture",
  "/docs/developer",
  "/docs/developer/api",
  "/docs/developer/quality-gates",
  "/docs/developer/reference",
  "/docs/ehds",
  "/docs/ehds/glossary",
  "/docs/security",
  "/docs/operations",
  "/docs/roadmap",
  "/docs/klarbefund",
  "/impressum",
  "/datenschutz",
];

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
