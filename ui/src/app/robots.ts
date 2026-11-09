import type { MetadataRoute } from "next";
import { STATIC_SITE_URL } from "@/lib/offline-mode";

export const dynamic = "force-static";

// Every crawler may read every page, AI crawlers included, for search,
// for answers and for training. The groups name the AI crawlers explicitly so
// the choice is on record; a named group replaces the "*" group for that
// crawler, so each one carries the same rules.
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google AI training and Gemini grounding
  "Google-Extended",
  // Apple Intelligence training
  "Applebot-Extended",
  // Common Crawl, the corpus most models start from
  "CCBot",
  // Meta, Mistral, Amazon
  "meta-externalagent",
  "MistralAI-User",
  "Amazonbot",
];

// Sign-in, the session API and the offline notice say nothing about the
// project; everything else is content.
const DISALLOW = ["/api/", "/auth/", "/offline"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    // The static site is the indexed copy, so the live site points there too.
    sitemap: `${STATIC_SITE_URL}/sitemap.xml`,
  };
}
