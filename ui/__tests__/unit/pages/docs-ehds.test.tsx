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
import EhdsDocPage, { generateStaticParams } from "@/app/docs/ehds/[slug]/page";
import { docsInSection } from "@/lib/docs/published-docs";

describe("the EHDS documents", () => {
  it("are the implementation page and the numbering reference", () => {
    expect(docsInSection("ehds").map((d) => d.slug)).toEqual([
      "regulation-implementation",
      "article-numbering",
    ]);
    expect(generateStaticParams().map((p) => p.slug)).toEqual([
      "regulation-implementation",
      "article-numbering",
    ]);
  });

  it("cite the adopted Regulation and every chapter the hub touches", () => {
    const page = docsInSection("ehds")[0].markdown;
    expect(page).toContain("Regulation (EU) 2025/327");
    // one table row per article, its number in the first column
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
      expect(page).toMatch(new RegExp(`^\\| ${article}\\s+\\|`, "m"));
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
    ]);
    expect(
      screen.getByText(/Regulation \(EU\) 2025\/327 on EUR-Lex/).closest("a"),
    ).toHaveAttribute("href", expect.stringContaining("CELEX:32025R0327"));
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
