/**
 * Shared pieces for nodes that carry a series (issue #271): the unfold set
 * of month nodes chained in time, and the status a series gives its node.
 */
import {
  isOutOfRange,
  trendOf,
  type Range,
  type SeriesPoint,
  type Severity,
} from "./derive";
import type { OverviewLink, OverviewNode } from "./types";

export interface SeriesSpec {
  series: SeriesPoint[];
  unit: string;
  measure: string;
  range?: Range | null;
  higherIsWorse?: boolean;
}

/** The month nodes a series unfolds into, chained oldest to newest. */
export function expandSeries(
  parentId: string,
  parentLabel: string,
  spec: SeriesSpec,
  layer: string,
): { nodes: OverviewNode[]; links: OverviewLink[] } {
  const nodes: OverviewNode[] = spec.series.map((p) => {
    const out = isOutOfRange(p.value, spec.range);
    return {
      id: `pt:${parentId}:${p.date}`,
      label: `${p.date.slice(0, 7)} · ${p.value}`,
      layer,
      kind: "Month",
      size: 0.9,
      color: out ? "#f59e0b" : "#93c5fd",
      title: `${parentLabel}, ${p.date.slice(0, 7)}`,
      sub: `${p.value} ${spec.unit}${out ? ", outside the expected band" : ""}`,
      facts: [
        ["measure", spec.measure],
        ["band", spec.range?.text ?? "none"],
      ],
    };
  });
  const links: OverviewLink[] = [];
  nodes.forEach((n, i) => {
    links.push({
      source: parentId,
      target: n.id,
      kind: "month",
      color: "#64748b",
      distance: 45,
    });
    if (i > 0) {
      links.push({
        source: nodes[i - 1].id,
        target: n.id,
        kind: "next",
        color: "#93c5fd",
        distance: 28,
        arrow: true,
        particles: 1,
      });
    }
  });
  return { nodes, links };
}

/** Attach a series to a node and return the severity the trend gives it. */
export function attachSeries(
  node: OverviewNode,
  spec: SeriesSpec,
  timeLayer: string,
): Severity {
  node.series = spec.series;
  node.unit = spec.unit;
  node.measure = spec.measure;
  node.range = spec.range ?? null;
  node.higherIsWorse = spec.higherIsWorse !== false;
  node.expand = expandSeries(node.id, node.label, spec, timeLayer);
  const t = trendOf(spec.series, {
    range: spec.range,
    higherIsWorse: spec.higherIsWorse !== false,
  });
  return t?.severity ?? "ok";
}

const RANK: Record<string, number> = {
  none: 0,
  ok: 1,
  info: 1,
  warn: 2,
  bad: 3,
};

/** Raise a node's status, never lower it. */
export function raiseStatus(node: OverviewNode, sev: Severity): void {
  if (RANK[sev] > RANK[node.status ?? "none"]) {
    node.status = sev;
    node.pulse = sev === "bad";
  }
}
