/**
 * The EHDS section of the docs: /docs/ehds lists what the hub implements of
 * Regulation (EU) 2025/327 and the numbering reference, each rendered from
 * ui/src/content/published-docs.json (#694).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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

vi.mock("@/components/MermaidDiagram", () => ({
  default: ({ chart }: { chart: string }) => (
    <pre data-testid="mermaid-diagram">{chart}</pre>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import EhdsDocsPage from "@/app/docs/ehds/page";
import EhdsGlossaryPage from "@/app/docs/ehds/glossary/page";
import EhdsDocPage, { generateStaticParams } from "@/app/docs/ehds/[slug]/page";
import { docsInSection } from "@/lib/docs/published-docs";

describe("the EHDS documents", () => {
  it("are the implementation page, the numbering reference, the bonus programme's data flow, the TEHDAS2 mapping and the two journeys", () => {
    expect(docsInSection("ehds").map((d) => d.slug)).toEqual([
      "regulation-implementation",
      "article-numbering",
      "bonus-programme-data-flow",
      "tehdas2-mapping",
      "person-journey",
      "researcher-journey",
    ]);
    expect(generateStaticParams().map((p) => p.slug)).toEqual([
      "regulation-implementation",
      "article-numbering",
      "bonus-programme-data-flow",
      "tehdas2-mapping",
      "person-journey",
      "researcher-journey",
    ]);
  });

  it("cite the adopted Regulation and every chapter the hub touches", () => {
    const page = docsInSection("ehds")[0].markdown;
    expect(page).toContain("Regulation (EU) 2025/327");
    // one table row per article, its number in the first column, linked to
    // that article of the Regulation on EUR-Lex
    for (const article of [
      "3",
      "16",
      "58",
      "67",
      "68",
      "69",
      "71",
      "73",
      "77",
    ]) {
      expect(page).toMatch(
        new RegExp(
          `^\\| \\[${article}\\]\\(https://eur-lex\\.europa\\.eu/eli/reg/2025/327/oj/eng#art_${article}\\)\\s+\\|`,
          "m",
        ),
      );
    }
    // the proposal's numbering is never presented as the Regulation's
    expect(page).not.toMatch(/\bEHDS Art\. 50\b/);
  });

  it("index links each document and the text on EUR-Lex", () => {
    render(<EhdsDocsPage />);
    const list = screen.getByTestId("ehds-docs");
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/docs/ehds/regulation-implementation",
      "/docs/ehds/article-numbering",
      "/docs/ehds/bonus-programme-data-flow",
      "/docs/ehds/tehdas2-mapping",
      "/docs/ehds/person-journey",
      "/docs/ehds/researcher-journey",
    ]);
    expect(
      screen.getByText(/Regulation \(EU\) 2025\/327 on EUR-Lex/).closest("a"),
    ).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng",
    );
  });

  it("links every article it cites to its anchor on EUR-Lex", () => {
    render(<EhdsDocsPage />);
    const eli = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
    expect(screen.getByRole("link", { name: "Art. 73(1)(e)" })).toHaveAttribute(
      "href",
      `${eli}#073.001`,
    );
    expect(screen.getByRole("link", { name: "Art. 58" })).toHaveAttribute(
      "href",
      `${eli}#art_58`,
    );
    for (const a of screen.getAllByRole("link", { name: "Art. 71" }))
      expect(a).toHaveAttribute("href", `${eli}#art_71`);
    expect(screen.getByRole("link", { name: "67" })).toHaveAttribute(
      "href",
      `${eli}#art_67`,
    );
    expect(
      screen.getByRole("link", { name: "numbering page" }),
    ).toHaveAttribute("href", "/docs/ehds/article-numbering");
  });

  it("renders a document and refuses an unknown one", async () => {
    render(
      await EhdsDocPage({
        params: Promise.resolve({ slug: "regulation-implementation" }),
      }),
    );
    expect(screen.getAllByText(/2025\/327/).length).toBeGreaterThan(0);
    await expect(
      EhdsDocPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the EHDS glossary", () => {
  it("links each term's article, the GDPR right a note names and the check that keeps the list", () => {
    render(<EhdsGlossaryPage />);
    const eli = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
    const table = screen.getByTestId("glossary");
    expect(
      within(table).getByRole("link", { name: "Art. 55" }),
    ).toHaveAttribute("href", `${eli}#art_55`);
    // EUR-Lex anchors paragraphs, not points: Art. 2(2)(e) is #002.002.
    expect(
      within(table).getByRole("link", { name: "Art. 2(2)(e)" }),
    ).toHaveAttribute("href", `${eli}#002.002`);
    expect(within(table).getByRole("link", { name: "Title" })).toHaveAttribute(
      "href",
      eli,
    );
    expect(screen.getByRole("link", { name: "Art. 21" })).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_21",
    );
    expect(
      screen.getByRole("link", {
        name: "scripts/i18n/check-ehds-terminology.py",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/i18n/check-ehds-terminology.py",
    );
    expect(screen.getByRole("link", { name: "Cellar" })).toHaveAttribute(
      "href",
      "https://op.europa.eu/en/web/cellar",
    );
  });
});
