import { describe, it, expect } from "vitest";
import { headingId, renderMarkdown } from "@/lib/docs/markdown";

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
