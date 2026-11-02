/**
 * The developer guide follows the language picker (ADR-071). Its API table
 * shows the descriptions of lib api-groups through t(), which the i18n
 * test's search for t("...") literals cannot see, so they are listed here;
 * and its pipeline chart has a variant per language that must still parse,
 * with the node ids of the English one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import mermaid from "mermaid";
import { MESSAGES } from "@/messages";
import { API_GROUP_DESCRIPTIONS } from "@/components/docs/api-groups";
import { DIAGRAMS } from "@/content/diagrams";
import { setLanguage } from "@/lib/use-language";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import DeveloperPage from "@/app/docs/developer/page";

const LANGS = ["de", "fr", "nl", "es"] as const;

describe("the developer guide's dictionary", () => {
  it("translates every API group description in every language", () => {
    const texts = Object.values(API_GROUP_DESCRIPTIONS);
    expect(texts.length).toBeGreaterThan(20);
    expect(texts.filter((x) => !(x in MESSAGES.en.docsDeveloper))).toEqual([]);
    for (const lang of LANGS) {
      const dict = MESSAGES[lang].docsDeveloper as Record<string, string>;
      for (const x of texts) {
        expect(dict[x], `${lang}: ${x}`).toBeTruthy();
        expect(dict[x], `${lang}: ${x}`).not.toBe(x);
      }
    }
  });
});

describe("DeveloperPage in another language", () => {
  afterEach(() => {
    act(() => setLanguage("en"));
    localStorage.clear();
  });

  it("shows its headings and paragraphs in German, code and paths unchanged", () => {
    render(<DeveloperPage />);
    act(() => setLanguage("de"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Entwicklerhandbuch" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Schnellstart (minimal)").length).toBe(1);
    expect(screen.getByText("Ablauf für Gesundheitsdatennutzer")).toBeVisible();
    // A marked part keeps its element and its words.
    const schema = screen.getByText("neo4j/init-schema.cypher");
    expect(schema.tagName).toBe("CODE");
    expect(schema.parentElement?.textContent).toContain(
      "Das Schema ist in neo4j/init-schema.cypher definiert",
    );
    expect(
      screen.getByRole("link", { name: "Scalar-API-Referenz" }),
    ).toHaveAttribute("href", "/docs/developer/reference");
  });

  it("names the Regulation EEDS in French", () => {
    render(<DeveloperPage />);
    act(() => setLanguage("fr"));
    expect(
      screen.getByRole("heading", { name: "Parcours utilisateur EEDS" }),
    ).toBeInTheDocument();
  });
});

describe("the quality-gates pipeline chart", () => {
  const variants = DIAGRAMS["quality-gates-pipeline"] as Record<string, string>;
  const ids = (chart: string) =>
    [...chart.matchAll(/^\s+([A-Z]+\d+)\[/gm)].map((m) => m[1]);

  it("has every language, with the English node ids", () => {
    expect(Object.keys(variants).sort()).toEqual([
      "de",
      "en",
      "es",
      "fr",
      "nl",
    ]);
    for (const lang of LANGS) {
      expect(ids(variants[lang]), lang).toEqual(ids(variants.en));
      expect(variants[lang], lang).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("parses in every language", async () => {
    mermaid.initialize({ startOnLoad: false });
    for (const [lang, chart] of Object.entries(variants)) {
      await expect(mermaid.parse(chart), lang).resolves.toBeTruthy();
    }
  });
});
