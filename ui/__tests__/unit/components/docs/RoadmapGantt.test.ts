/**
 * linkRoadmap turns the Gantt chart Mermaid drew into links: each bar and its
 * label to the issue, each milestone to its source, with a tooltip; and it
 * numbers the bars for the staggered grow-in (globals.css).
 */
import { describe, it, expect } from "vitest";
import { linkRoadmap } from "@/components/docs/RoadmapGantt";

const NS = "http://www.w3.org/2000/svg";

/** A chart as Mermaid 11 draws it: every id prefixed with the diagram's. */
function chart(): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${NS}" id="mermaid-x">
       <g><rect id="mermaid-x-i708" class="task active1"/><rect id="mermaid-x-m_d_you" class="task milestone"/></g>
       <g><text id="mermaid-x-i708-text" class="taskTextOutsideRight taskTextOutside1 activeText1">708 EUDI Wallet sign-in</text></g>
     </svg>`,
    "image/svg+xml",
  );
  return doc.documentElement as unknown as SVGSVGElement;
}

describe("linkRoadmap", () => {
  it("wraps a bar and its label in a link to the issue, with the details as a tooltip", () => {
    const svg = chart();
    linkRoadmap(svg);
    const bar = svg.querySelector('[id="mermaid-x-i708"]')!;
    const label = svg.querySelector('[id="mermaid-x-i708-text"]')!;
    for (const el of [bar, label]) {
      const a = el.parentElement!;
      expect(a.localName).toBe("a");
      expect(a.namespaceURI).toBe(NS);
      expect(a.getAttribute("href")).toBe(
        "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/708",
      );
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.querySelector("title")?.textContent).toMatch(
        /^#708 EUDI Wallet sign-in to 2026\/2099 \(P1, in-progress/,
      );
    }
  });

  it("links a milestone to its source", () => {
    const svg = chart();
    linkRoadmap(svg);
    const a = svg.querySelector('[id="mermaid-x-m_d_you"]')!.parentElement!;
    expect(a.getAttribute("href")).toBe("https://eudi-wallet.gov.de/");
  });

  it("marks the chart for the roadmap styles and numbers the bars for the grow-in", () => {
    const svg = chart();
    linkRoadmap(svg);
    expect(svg.getAttribute("class")).toBe("roadmap-gantt");
    expect(
      svg.querySelector('[id="mermaid-x-i708"]')!.getAttribute("style"),
    ).toMatch(/--i: \d+$/);
  });

  it("drops the status class from a label beside its bar, so the page's text colour applies", () => {
    const svg = chart();
    linkRoadmap(svg);
    const cls = svg
      .querySelector('[id="mermaid-x-i708-text"]')!
      .getAttribute("class")!;
    expect(cls).toContain("taskTextOutsideRight");
    expect(cls).not.toMatch(/activeText/);
  });
});
