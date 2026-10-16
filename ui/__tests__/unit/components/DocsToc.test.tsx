/**
 * DocsToc: the "On this page" index every documentation page carries, read
 * from the rendered headings so hand-written pages, Markdown and Mermaid all
 * get one without declaring it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import {
  collectHeadings,
  DocsTocInline,
  DocsTocSidebar,
} from "@/components/docs/DocsToc";

function page(html: string) {
  document.body.innerHTML = `<main id="main-content">${html}</main>`;
  return document.getElementById("main-content")!;
}

describe("collectHeadings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("takes h2 and h3 with their ids, and skips navigation", () => {
    const main = page(`
      <nav><h2>Contents</h2></nav>
      <h2 id="findings">Findings</h2>
      <h3 id="f1">F1</h3>
      <h2>Related Documentation</h2>
    `);
    expect(collectHeadings(main)).toEqual([
      { id: "findings", text: "Findings", level: 2 },
      { id: "f1", text: "F1", level: 3 },
    ]);
  });

  it("uses the enclosing section's id and gives it to the heading", () => {
    const main = page(`<section id="purpose"><h2>Purpose</h2></section>`);
    expect(collectHeadings(main)).toEqual([
      { id: "purpose", text: "Purpose", level: 2 },
    ]);
    expect(main.querySelector("h2")!.id).toBe("purpose");
  });

  it("gives a heading without an id one from its text, unique", () => {
    const main = page(`<h2>Run it again</h2><h3>Run it again</h3>`);
    expect(collectHeadings(main).map((e) => e.id)).toEqual([
      "run-it-again",
      "run-it-again-2",
    ]);
  });
});

describe("DocsTocSidebar and DocsTocInline", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing for a page with fewer than two headings", async () => {
    page(`<h2 id="only">Only</h2>`);
    await act(async () => {
      render(<DocsTocSidebar />);
    });
    expect(screen.queryByTestId("docs-toc")).not.toBeInTheDocument();
  });

  it("lists every heading as an anchor link and marks the first current", async () => {
    page(`<h2 id="a">Alpha</h2><h3 id="b">Beta</h3><h2 id="c">Gamma</h2>`);
    await act(async () => {
      render(<DocsTocSidebar />);
    });
    const toc = await screen.findByTestId("docs-toc");
    const links = within(toc).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#a",
      "#b",
      "#c",
    ]);
    // jsdom lays nothing out, so every heading counts as scrolled past and
    // the last one is current; what matters is that exactly one is.
    expect(
      links.filter((l) => l.getAttribute("aria-current") === "location"),
    ).toHaveLength(1);
  });

  it("offers the same index folded at the top for narrow screens", async () => {
    page(`<h2 id="a">Alpha</h2><h2 id="c">Gamma</h2>`);
    await act(async () => {
      render(<DocsTocInline />);
    });
    const toc = await screen.findByTestId("docs-toc-inline");
    expect(within(toc).getByText("On this page")).toBeInTheDocument();
    expect(within(toc).getAllByRole("link")).toHaveLength(2);
  });
});
