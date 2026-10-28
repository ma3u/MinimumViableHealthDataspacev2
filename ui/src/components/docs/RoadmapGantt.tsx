"use client";

import MermaidDiagram from "@/components/MermaidDiagram";
import { roadmapGantt, roadmapTargets } from "@/lib/docs/roadmap";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Wraps an SVG element in a link, in place. */
function wrapInLink(el: Element, href: string, label: string) {
  const doc = el.ownerDocument;
  const a = doc.createElementNS(SVG_NS, "a");
  a.setAttribute("href", href);
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
  a.setAttribute("aria-label", label);
  a.setAttribute("class", "roadmap-link");
  const title = doc.createElementNS(SVG_NS, "title");
  title.textContent = label;
  a.appendChild(title);
  el.parentNode?.insertBefore(a, el);
  a.appendChild(el);
}

/**
 * Makes the rendered Gantt chart clickable and animated: every bar and
 * milestone, and its label, becomes a link to its issue or its source, with
 * the details as a tooltip; the bars get an index the CSS staggers their
 * grow-in by (globals.css, `.roadmap-gantt`; reduced motion turns it off).
 */
export function linkRoadmap(svg: SVGSVGElement) {
  svg.classList.add("roadmap-gantt");
  // Mermaid 11 prefixes every id with the diagram's own: <svg id>-<task id>.
  const prefix = svg.id ? `${svg.id}-` : "";
  roadmapTargets().forEach((t, index) => {
    const bar = svg.querySelector(`[id="${prefix}${t.taskId}"]`);
    const text = svg.querySelector(`[id="${prefix}${t.taskId}-text"]`);
    if (bar) {
      bar.setAttribute(
        "style",
        `${bar.getAttribute("style") ?? ""};--i: ${index}`,
      );
      wrapInLink(bar, t.href, t.label);
    }
    if (text) {
      // A label beside its bar keeps Mermaid's status colour (an !important
      // rule under the diagram's id) unless the status class goes; then the
      // page's text colour applies (globals.css).
      const cls = text.getAttribute("class") ?? "";
      if (cls.includes("taskTextOutside")) {
        text.setAttribute(
          "class",
          cls.replace(/\b(active|done|crit)Text\d+\b/g, "").trim(),
        );
      }
      wrapInLink(text, t.href, t.label);
    }
  });
}

export default function RoadmapGantt() {
  return (
    <div data-testid="roadmap-gantt">
      <MermaidDiagram
        chart={roadmapGantt()}
        caption="Click a bar for its issue, a diamond for its source. The red line is today."
        transform={linkRoadmap}
      />
    </div>
  );
}
