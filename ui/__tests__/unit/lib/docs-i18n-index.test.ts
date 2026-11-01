// @vitest-environment node
/**
 * The generated parts of the documentation's translations are well formed
 * (ADR-071): the index of translated published documents, the manifest of
 * translated images, and the registry of Mermaid charts. None of this asks
 * that anything be translated; an English edit never fails here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import index from "@/content/published-docs-i18n.json";
import manifest from "@/content/localized-images.json";
import { DIAGRAMS } from "@/content/diagrams";
import { publishedDocs } from "@/lib/docs/published-docs";

const LANGS = ["de", "fr", "nl", "es"];
const UI = resolve(__dirname, "../../..");
const REPO = resolve(UI, "..");

describe("the index of translated published documents", () => {
  const docs = index.docs as Record<
    string,
    Record<string, { status: string; title: string; summary?: string }>
  >;

  it("lists the picker's languages besides English", () => {
    expect(index.languages).toEqual(LANGS);
  });

  it("names only published documents, known languages and a known status", () => {
    const slugs = new Set(publishedDocs.map((d) => `${d.section}/${d.slug}`));
    for (const [key, langs] of Object.entries(docs)) {
      expect(slugs, key).toContain(key);
      for (const [lang, t] of Object.entries(langs)) {
        expect(LANGS, `${key} ${lang}`).toContain(lang);
        expect(["current", "stale"], `${key} ${lang}`).toContain(t.status);
        expect(t.title.length, `${key} ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("has a translated body and a source in docs/i18n for every entry", () => {
    for (const [key, langs] of Object.entries(docs)) {
      const [section, slug] = key.split("/");
      const source = publishedDocs.find(
        (d) => d.section === section && d.slug === slug,
      )!.source;
      for (const lang of Object.keys(langs)) {
        const file = join(
          UI,
          "public/published-docs/i18n",
          lang,
          section,
          `${slug}.json`,
        );
        expect(existsSync(file), file).toBe(true);
        const body = JSON.parse(readFileSync(file, "utf8"));
        expect(body.language).toBe(lang);
        expect(body.source).toBe(source);
        expect(body.translation).toBe(
          `docs/i18n/${lang}/${source.slice("docs/".length)}`,
        );
        expect(existsSync(join(REPO, body.translation))).toBe(true);
        expect(body.markdown.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the manifest of translated images", () => {
  const images = manifest.images as Record<string, Record<string, string>>;

  it("lists the picker's languages besides English", () => {
    expect(manifest.languages).toEqual(LANGS);
  });

  it("points from an English image to variants that exist", () => {
    for (const [english, variants] of Object.entries(images)) {
      expect(existsSync(join(UI, "public", english)), english).toBe(true);
      for (const [lang, variant] of Object.entries(variants)) {
        expect(LANGS).toContain(lang);
        expect(existsSync(join(UI, "public", variant)), variant).toBe(true);
      }
    }
  });
});

describe("the Mermaid charts of the docs pages", () => {
  it("each have English and only the picker's languages, of the same chart type", () => {
    for (const [id, chart] of Object.entries(DIAGRAMS)) {
      const variants = chart as Record<string, string>;
      expect(variants.en, id).toBeTruthy();
      const type = variants.en.split(/\s/, 1)[0];
      for (const [lang, text] of Object.entries(variants)) {
        expect(["en", ...LANGS], `${id} ${lang}`).toContain(lang);
        expect(text.split(/\s/, 1)[0], `${id} ${lang}`).toBe(type);
      }
    }
  });
});

describe("gen-localized-images.py", () => {
  const SCRIPT = join(REPO, "scripts/gen-localized-images.py");
  let root: string;
  const put = (rel: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), "img");
  };
  const gen = (...args: string[]) =>
    spawnSync("python3", [SCRIPT, "--root", root, ...args], {
      encoding: "utf8",
    });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "localized-images-"));
    put("ui/public/images/guide/catalog.webp");
    put("ui/public/images/guide/de/catalog.webp");
    put("ui/public/images/screenshots/home.png");
    put("ui/public/images/screenshots/fr/home.png");
    put("ui/public/published-docs/deployment.svg");
    put("ui/public/published-docs/deployment.nl.svg");
    put("ui/public/published-docs/i18n/de/security/sbom.json");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds the variants by folder and by suffix", () => {
    expect(gen().status).toBe(0);
    const out = JSON.parse(
      readFileSync(join(root, "ui/src/content/localized-images.json"), "utf8"),
    );
    expect(out.images).toEqual({
      "/images/guide/catalog.webp": { de: "/images/guide/de/catalog.webp" },
      "/images/screenshots/home.png": {
        fr: "/images/screenshots/fr/home.png",
      },
      "/published-docs/deployment.svg": {
        nl: "/published-docs/deployment.nl.svg",
      },
    });
    expect(gen("--check").status).toBe(0);
  });

  it("fails the check when an image is added, and on a variant with no English", () => {
    gen();
    put("ui/public/images/guide/es/catalog.webp");
    expect(gen("--check").status).toBe(1);
    put("ui/public/images/guide/de/misspelt.webp");
    const r = gen();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      "ui/public/images/guide/de/misspelt.webp has no English original",
    );
  });
});
