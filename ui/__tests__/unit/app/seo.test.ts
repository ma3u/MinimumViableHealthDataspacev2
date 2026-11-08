/**
 * What search engines and AI crawlers read: the robots rules, the sitemap,
 * /llms.txt, and the provider details the legal pages show.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GET as llms } from "@/app/llms.txt/route";
import { isComplete, PROVIDER } from "@/lib/legal-notice";
import { publishedDocs } from "@/lib/docs/published-docs";

const STATIC = "https://ma3u.github.io/MinimumViableHealthDataspacev2";
const APP = path.join(__dirname, "../../../src/app");

describe("robots.txt", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("lets every crawler read the content and keeps sign-in out", () => {
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual(["/api/", "/auth/", "/offline"]);
    }
  });

  it("names the AI crawlers, training ones included, as allowed", () => {
    const named = rules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent],
    );
    for (const bot of [
      "GPTBot",
      "OAI-SearchBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
      "CCBot",
    ]) {
      expect(named).toContain(bot);
    }
  });

  it("points at the static site's sitemap", () => {
    expect(r.sitemap).toBe(`${STATIC}/sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  it("lists only addresses on the static site, without a trailing slash", () => {
    for (const e of entries) {
      expect(e.url.startsWith(`${STATIC}/`)).toBe(true);
      if (e.url !== `${STATIC}/`) expect(e.url.endsWith("/")).toBe(false);
    }
  });

  it("lists pages that exist", () => {
    for (const e of entries) {
      const route = e.url.slice(STATIC.length) || "/";
      const doc = route.match(/^\/docs\/([^/]+)\/([^/]+)$/);
      const isPublished =
        doc &&
        publishedDocs.some((d) => d.section === doc[1] && d.slug === doc[2]);
      if (isPublished) continue;
      expect(existsSync(path.join(APP, route, "page.tsx")), route).toBe(true);
    }
  });

  it("lists every published document and both legal pages", () => {
    const urls = entries.map((e) => e.url);
    for (const d of publishedDocs) {
      expect(urls).toContain(`${STATIC}/docs/${d.section}/${d.slug}`);
    }
    expect(urls).toContain(`${STATIC}/impressum`);
    expect(urls).toContain(`${STATIC}/datenschutz`);
  });

  it("has no duplicates", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("llms.txt", () => {
  it("is plain text with a title, a summary and every published document", async () => {
    const res = llms();
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text.startsWith("# ")).toBe(true);
    expect(text).toMatch(/^> /m);
    for (const d of publishedDocs) {
      expect(text).toContain(`${STATIC}/docs/${d.section}/${d.slug}`);
    }
  });
});

describe("legal notice", () => {
  it("names the provider", () => {
    expect(PROVIDER.name).toBe("Matthias Buchhorn");
  });

  // A placeholder must not be published. Locally the pages can be built and
  // looked at with placeholders; CI refuses them, so a pull request with one
  // cannot be merged.
  it.runIf(process.env.CI === "true")(
    "has no placeholder left (§ 5 DDG: address, email, phone)",
    () => {
      expect(isComplete()).toBe(true);
    },
  );
});
