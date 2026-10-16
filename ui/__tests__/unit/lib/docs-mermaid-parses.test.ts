/**
 * Every ```mermaid fence in a published report must parse, or the page shows
 * a render error where a diagram should be.
 */
import { describe, it, expect } from "vitest";
import mermaid from "mermaid";
import { securityDocs } from "@/lib/docs/security-docs";

const fences = securityDocs.flatMap((d) =>
  [...d.markdown.matchAll(/^```mermaid[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map(
    (m, i) => ({ slug: d.slug, i, chart: m[1].trim() }),
  ),
);

describe("mermaid diagrams in the published reports", () => {
  it("all parse (none today: the guideline's diagrams are PlantUML SVGs)", async () => {
    mermaid.initialize({ startOnLoad: false });
    for (const f of fences) {
      await expect(
        mermaid.parse(f.chart),
        `${f.slug} #${f.i}`,
      ).resolves.toBeTruthy();
    }
  });
});
