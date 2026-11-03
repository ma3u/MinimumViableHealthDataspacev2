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
      { id: "findings", text: "Findings", level: 2, num: "1." },
      { id: "f1", text: "F1", level: 3, num: "1.1" },
    ]);
  });

  it("uses the enclosing section's id and gives it to the heading", () => {
    const main = page(`<section id="purpose"><h2>Purpose</h2></section>`);
    expect(collectHeadings(main)).toEqual([
      { id: "purpose", text: "Purpose", level: 2, num: "1." },
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

describe("the section numbers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("numbers a page's headings h2 1. and h3 1.1, on the heading itself", () => {
    const main = page(`
      <h3 id="intro">Before any section</h3>
      <h2 id="a">Alpha</h2><h3 id="a1">One</h3><h3 id="a2">Two</h3>
      <h2 id="b">Beta</h2><h3 id="b1">One</h3>
    `);
    expect(collectHeadings(main).map((e) => e.num)).toEqual([
      "",
      "1.",
      "1.1",
      "1.2",
      "2.",
      "2.1",
    ]);
    const shown = [...main.querySelectorAll("h2, h3")].map((h) =>
      h.getAttribute("data-doc-num"),
    );
    expect(shown).toEqual([null, "1.", "1.1", "1.2", "2.", "2.1"]);
  });

  it("keeps a number the heading already shows, and counts on from it", () => {
    const main = page(`
      <h2 id="p"><span class="doc-num">1.</span> Purpose</h2>
      <h2 id="s">6. Checks</h2><h3 id="s1">6.1 PR Gate</h3><h3 id="s2">Others</h3>
      <h2 id="r">References</h2>
    `);
    const entries = collectHeadings(main);
    expect(entries.map((e) => [e.num, e.text])).toEqual([
      ["1.", "Purpose"],
      ["6.", "Checks"],
      ["6.1", "PR Gate"],
      ["6.2", "Others"],
      ["7.", "References"],
    ]);
    // A number already on the page is not drawn a second time.
    expect(main.querySelector("#p")!.hasAttribute("data-doc-num")).toBe(false);
    expect(main.querySelector("#s")!.hasAttribute("data-doc-num")).toBe(false);
    expect(main.querySelector("#s2")!.getAttribute("data-doc-num")).toBe("6.2");
  });

  it("leaves the introduction of a self-numbered page without a number", () => {
    const main = page(`
      <h2 id="read">How to read this model</h2><h3 id="r1">Scope</h3>
      <h2 id="ctx">1. System context</h2><h3 id="c1">Boundaries</h3>
      <h2 id="assets">2. Assets</h2>
    `);
    expect(collectHeadings(main).map((e) => e.num)).toEqual([
      "",
      "",
      "1.",
      "1.1",
      "2.",
    ]);
  });

  it("reads a number with many parts quickly, and a long run of digits too", () => {
    const main = page(`
      <h2 id="a">1.2.3. Deep</h2>
      <h2 id="b">0.${"0".repeat(5000)}x</h2>
    `);
    const started = performance.now();
    const entries = collectHeadings(main);
    expect(performance.now() - started).toBeLessThan(500);
    expect(entries[0]).toMatchObject({ num: "1.2.3.", text: "Deep" });
    expect(entries[1].num).toBe("2.");
  });

  it("does not take a figure for a section number", () => {
    const main = page(`<h2 id="x">127 synthetic patients</h2>`);
    expect(collectHeadings(main)).toEqual([
      { id: "x", text: "127 synthetic patients", level: 2, num: "1." },
    ]);
  });

  it("shows the same numbers in the index", async () => {
    page(`<h2 id="a">Alpha</h2><h3 id="b">Beta</h3><h2 id="c">Gamma</h2>`);
    await act(async () => {
      render(<DocsTocSidebar />);
    });
    const toc = await screen.findByTestId("docs-toc");
    expect(
      within(toc)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["1.Alpha", "1.1Beta", "2.Gamma"]);
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
