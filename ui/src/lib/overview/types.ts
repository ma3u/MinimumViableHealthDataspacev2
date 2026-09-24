/**
 * The view model of a persona overview (issue #271, discussion #265).
 *
 * `GET /api/overview?persona=` returns one `OverviewView`. The page renders
 * the signals as a list (the accessible path), the nodes and links as a
 * layered 3D scene (an enhancement), and one node at a time in the detail
 * panel. Everything a client needs is in the JSON: no functions, no lookups.
 */
import type { Range, SeriesPoint, Severity } from "./derive";

export type { Range, SeriesPoint, Severity };

export type NodeStatus = Severity | "none";

export interface OverviewLayer {
  id: string;
  name: string;
  /** Stacking order; the scene puts z * 110 units between layers */
  z: number;
  color: string;
}

export type Fact = [string, string];

export interface OverviewLinkRef {
  href: string;
  text: string;
}

export interface OverviewLink {
  source: string;
  target: string;
  /** What the link means, e.g. "drives", "treats", "consent", "accesses" */
  kind?: string;
  status?: NodeStatus;
  color?: string;
  width?: number;
  distance?: number;
  /** Animated particles along the link: a flow */
  particles?: number;
  arrow?: boolean;
}

export interface OverviewNode {
  id: string;
  label: string;
  layer: string;
  /** The record type in plain words, never a Neo4j label: "Patient", "Diagnosis", "Parameter" */
  kind: string;
  status?: NodeStatus;
  pulse?: boolean;
  size?: number;
  color?: string;
  /** Fixed x/y on its layer */
  pin?: [number, number];
  title?: string;
  sub?: string;
  description?: string;
  facts?: Fact[];
  /** The article the node rests on, adopted numbering */
  article?: string;
  links?: OverviewLinkRef[];
  /** A series over time, with what it measures and the expected band */
  series?: SeriesPoint[];
  unit?: string;
  measure?: string;
  range?: Range | null;
  higherIsWorse?: boolean;
  /** Nodes and links a click unfolds from this node (the single measurements, the months) */
  expand?: { nodes: OverviewNode[]; links: OverviewLink[] };
}

export interface OverviewSignal {
  severity: Severity;
  nodeId: string;
  /** Stable machine code, e.g. "parameter-out-of-range" */
  code: string;
  text: string;
  article?: string;
}

export interface OverviewLegendItem {
  color: string;
  text: string;
}

export interface OverviewView {
  persona: "patient" | "researcher" | "hdab" | "hospital";
  /** ISO date the view was computed for */
  asOf: string;
  me: { id: string; name: string };
  title: string;
  question: string;
  article: string;
  layers: OverviewLayer[];
  nodes: OverviewNode[];
  links: OverviewLink[];
  /** Sorted worst first */
  signals: OverviewSignal[];
  legend: OverviewLegendItem[];
  dataNote?: string;
}
