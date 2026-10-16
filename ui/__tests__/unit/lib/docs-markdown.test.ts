import { describe, it, expect } from "vitest";
import { headingId, renderMarkdown, splitMermaid } from "@/lib/docs/markdown";

describe("headingId", () => {
  it("matches GitHub's anchor for a numbered heading", () => {
    expect(headingId("4. Put the Swift suite into CI")).toBe(
      "4-put-the-swift-suite-into-ci",
    );
  });

  it("keeps letters outside ASCII", () => {
    expect(headingId("Datenschutz: Prüfung")).toBe("datenschutz-prüfung");
  });
});

describe("renderMarkdown", () => {
  it("gives every heading the anchor a GitHub link expects", () => {
    const html = renderMarkdown("## Run record\n\ntext\n");
    expect(html).toContain('<h2 id="run-record">Run record</h2>');
  });

  it("renders a GitHub-flavoured table", () => {
    const html = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>2</td>");
  });

  it("opens an external link in a new tab and keeps a route link in place", () => {
    const html = renderMarkdown(
      "[gh](https://github.com/x) and [here](/docs/security/sbom#x)",
    );
    expect(html).toContain(
      '<a href="https://github.com/x" target="_blank" rel="noopener noreferrer">gh</a>',
    );
    expect(html).toContain('<a href="/docs/security/sbom#x">here</a>');
  });
});

describe("renderMarkdown images", () => {
  it("links a diagram to its full-size file", () => {
    const html = renderMarkdown(
      "![A diagram](__BASE_PATH__/published-docs/x.svg)",
    );
    expect(html).toContain(
      '<a href="__BASE_PATH__/published-docs/x.svg" target="_blank" rel="noopener noreferrer" class="doc-figure"><img src="__BASE_PATH__/published-docs/x.svg" alt="A diagram" loading="lazy" /></a>',
    );
  });
});

describe("section numbers", () => {
  it("numbers h2 and h3 of a document, keeps GitHub's anchors", () => {
    const [seg] = splitMermaid(
      "# T\n\n## Alpha\n\n### Beta\n\n### Gamma\n\n## Delta\n",
    );
    expect(seg.kind).toBe("html");
    const html = seg.kind === "html" ? seg.html : "";
    expect(html).toContain(
      '<h2 id="alpha"><span class="doc-num">1.</span> Alpha</h2>',
    );
    expect(html).toContain(
      '<h3 id="beta"><span class="doc-num">1.1</span> Beta</h3>',
    );
    expect(html).toContain(
      '<h3 id="gamma"><span class="doc-num">1.2</span> Gamma</h3>',
    );
    expect(html).toContain(
      '<h2 id="delta"><span class="doc-num">2.</span> Delta</h2>',
    );
  });

  it("leaves a document alone that numbers its own headings", () => {
    const [seg] = splitMermaid("## 1. Roles\n\n### Sub\n\n## 2. Zones\n");
    const html = seg.kind === "html" ? seg.html : "";
    expect(html).not.toContain("doc-num");
    expect(html).toContain('<h2 id="1-roles">1. Roles</h2>');
  });

  it("does not number through renderMarkdown on its own", () => {
    expect(renderMarkdown("## Run record\n")).toContain(
      '<h2 id="run-record">Run record</h2>',
    );
  });
});

describe("splitMermaid", () => {
  it("cuts a mermaid fence out and renders the text around it", () => {
    const segs = splitMermaid(
      "# T\n\nbefore\n\n```mermaid\nflowchart LR\n  a --> b\n```\n\nafter\n",
    );
    expect(segs.map((s) => s.kind)).toEqual(["html", "mermaid", "html"]);
    expect(segs[1]).toEqual({
      kind: "mermaid",
      chart: "flowchart LR\n  a --> b",
    });
    expect((segs[2] as { html: string }).html).toContain("<p>after</p>");
  });

  it("leaves a document without diagrams as one html segment", () => {
    expect(splitMermaid("just text\n").map((s) => s.kind)).toEqual(["html"]);
  });
});
