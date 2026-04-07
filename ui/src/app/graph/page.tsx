"use client";

import { fetchApi } from "@/lib/api";
import { themeChangeTarget } from "@/components/ThemeToggle";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { derivePersonaId } from "@/lib/auth";
import { useDemoPersona } from "@/lib/use-demo-persona";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
import dynamic from "next/dynamic";
import {
  Activity,
  BarChart2,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  FlaskConical,
  Heart,
  Lock,
  Loader2,
  MousePointerClick,
  PanelLeftClose,
  PanelRightClose,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import {
  FILTER_PRESETS,
  PATIENT_FILTER_PRESETS,
  HOSPITAL_FILTER_PRESETS,
  HDAB_FILTER_PRESETS,
  RESEARCHER_FILTER_PRESETS,
  LAYER_COLORS,
  LAYER_LABELS,
  LAYER_TOOLTIPS,
  NODE_ROLE_COLORS,
  NODE_DISPLAY_NAMES,
  NODE_TOOLTIPS,
  PERSONA_VIEWS,
  PERSONA_LAYER_LABELS,
  PERSONA_VALUE_NODES,
  PERSONA_RING_ASSIGNMENT,
  RING_RADII,
  type FilterPresetId,
  type PatientFilterPresetId,
  type HospitalFilterPresetId,
  type HdabFilterPresetId,
  type ResearcherFilterPresetId,
  type PersonaId,
} from "@/lib/graph-constants";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  label: string;
  layer: number;
  color: string;
  group?: string;
  expandable?: boolean;
  expanded?: boolean;
  isValueCenter?: boolean;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Constants ────────────────────────────────────────────────────────────────

// Role-specific color legend entries (warm/vivid — shown below structural layers)
const ROLE_LEGEND: Array<{
  label: string;
  color: string;
  description: string;
  tooltip: string;
}> = [
  {
    label: "Organization",
    color: NODE_ROLE_COLORS.Participant,
    description: "Hospital, researcher, or authority",
    tooltip: "DSP Participant — a registered dataspace actor",
  },
  {
    label: "Privacy Service",
    color: NODE_ROLE_COLORS.TrustCenter,
    description: "Manages pseudonyms for research",
    tooltip: "EHDS Art. 50/51 — Trust Center pseudonym authority",
  },
  {
    label: "Access Decision",
    color: NODE_ROLE_COLORS.HDABApproval,
    description: "Approval to use health data",
    tooltip: "EHDS Art. 46 — HDAB access decision",
  },
  {
    label: "Secure Processing",
    color: NODE_ROLE_COLORS.SPESession,
    description: "Active data processing session",
    tooltip: "EHDS Art. 50 — Secure Processing Environment",
  },
  {
    label: "My Consent",
    color: NODE_ROLE_COLORS.PatientConsent,
    description: "Patient consent for data use",
    tooltip: "GDPR Art. 15-22 — patient consent for secondary use",
  },
];

// User-friendly relationship type names (replaces UPPER_SNAKE_CASE on links)
const FRIENDLY_REL_NAMES: Record<string, string> = {
  HAS_CONDITION: "has condition",
  HAS_OBSERVATION: "has observation",
  HAS_ENCOUNTER: "has encounter",
  HAS_MEDICATION_REQUEST: "takes medication",
  HAS_PROCEDURE: "had procedure",
  CODED_BY: "coded as",
  MAPS_TO: "maps to",
  HAS_DISTRIBUTION: "available as",
  HAS_CONTRACT: "under contract",
  OFFERS: "offers",
  GOVERNED_BY: "governed by",
  APPROVED_BY: "approved by",
  SUBJECT_TO: "subject to",
  APPLIED_BY: "applied by",
  DESCRIBES: "describes",
  CONFORMS_TO: "conforms to",
  COVERS: "covers",
  UNDER: "under",
  MANAGES: "manages",
  RESOLVES_PSEUDONYMS_FOR: "resolves pseudonyms",
  MUTUALLY_RECOGNISES: "recognises",
  LINKED_FROM: "linked from",
  USED_IN: "used in",
  HAS_CONDITION_OCCURRENCE: "has condition",
  HAS_MEASUREMENT: "has measurement",
  HAS_DRUG_EXPOSURE: "takes drug",
  HAS_PROCEDURE_OCCURRENCE: "had procedure",
  HAS_VISIT_OCCURRENCE: "visited",
  REQUESTED_BY: "requested by",
  PROVIDED_BY: "provided by",
  PART_OF: "part of",
  ACCESSED: "accessed",
  TRANSFERRED_BY: "transferred by",
  TRANSFERS: "transfers",
  FROM_PROVIDER: "from provider",
  TO_CONSUMER: "to consumer",
  VALUE_FOCUS: "focus",
};

// Icon map for filter presets
type LucideIcon = React.ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
>;
const PRESET_ICONS: Record<string, LucideIcon> = {
  // filter preset icons
  Users,
  Lock,
  ShieldCheck,
  BookOpen,
  Activity,
  BarChart2,
  // patient filter preset icons
  Eye,
  FlaskConical,
  Heart,
  // persona icons
  Building2,
  Settings,
  Scale,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nId(n: string | GraphNode): string {
  return typeof n === "string" ? n : n.id;
}

/** Compute fixed position on a concentric ring, persona-aware. */
function ringPosition(
  label: string,
  idx: number,
  total: number,
  persona: PersonaId,
) {
  const ring = PERSONA_RING_ASSIGNMENT[persona]?.[label] ?? 4; // fallback to outermost
  const r = RING_RADII[ring] ?? 580;
  if (r === 0) return { fx: 0, fy: 0 }; // value center
  const angle = (2 * Math.PI * idx) / Math.max(total, 1);
  return { fx: r * Math.cos(angle), fy: r * Math.sin(angle) };
}

function mergeInto(
  prev: GraphData,
  newNodes: GraphNode[],
  newLinks: GraphLink[],
  persona: PersonaId,
): GraphData {
  const existingIds = new Set(prev.nodes.map((n) => n.id));

  // Count per ring for existing nodes (angle offset base)
  const ringCount: Record<number, number> = {};
  for (const n of prev.nodes) {
    const ring = PERSONA_RING_ASSIGNMENT[persona]?.[n.label] ?? 4;
    ringCount[ring] = (ringCount[ring] ?? 0) + 1;
  }

  const incoming = newNodes.filter((n) => !existingIds.has(n.id));

  // Pre-compute final total per ring so every node gets an even angular slot
  const ringTotal: Record<number, number> = { ...ringCount };
  for (const n of incoming) {
    const ring = PERSONA_RING_ASSIGNMENT[persona]?.[n.label] ?? 4;
    ringTotal[ring] = (ringTotal[ring] ?? 0) + 1;
  }

  const toAdd: GraphNode[] = [];
  for (const n of incoming) {
    const ring = PERSONA_RING_ASSIGNMENT[persona]?.[n.label] ?? 4;
    const idx = ringCount[ring] ?? 0;
    ringCount[ring] = idx + 1;
    toAdd.push({
      ...n,
      // Apply client-side color if missing from API/mock
      color:
        n.color || NODE_ROLE_COLORS[n.label] || LAYER_COLORS[n.layer] || "#888",
      ...ringPosition(n.label, idx, ringTotal[ring]!, persona),
    });
  }

  const existingLinkKeys = new Set(
    prev.links.map((l) => `${nId(l.source)}→${nId(l.target)}`),
  );
  const linksToAdd = newLinks.filter(
    (l) => !existingLinkKeys.has(`${nId(l.source)}→${nId(l.target)}`),
  );

  return {
    nodes: [...prev.nodes, ...toAdd],
    links: [...prev.links, ...linksToAdd],
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-44px)] items-center justify-center text-[var(--text-secondary)]">
          <Loader2 size={16} className="mr-2 animate-spin" />
          Loading…
        </div>
      }
    >
      <GraphContent />
    </Suspense>
  );
}

function GraphContent() {
  // Read URL params first so they can seed initial state
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const urlPersona = searchParams.get("persona") as PersonaId | null;

  const { data: session, status: sessionStatus } = useSession();
  // Always call useDemoPersona — hook rules require unconditional calls
  const demoPersona = useDemoPersona();
  const sessionRoles: string[] = IS_STATIC
    ? [...demoPersona.roles]
    : (session as { roles?: string[] } | null)?.roles ?? [];
  const sessionUsername: string = IS_STATIC
    ? demoPersona.username
    : session?.user?.name ?? session?.user?.email ?? "";
  const sessionPersonaId = derivePersonaId(sessionRoles, sessionUsername);

  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null); // nodeId being expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [neighbours, setNeighbours] = useState<
    { dir: "in" | "out"; type: string; node: GraphNode }[]
  >([]);
  // Node properties fetched from /api/graph/node for the selected node
  const [nodeProps, setNodeProps] = useState<
    Array<{ key: string; label: string; value: string }>
  >([]);
  const [propsLoading, setPropsLoading] = useState(false);
  // Active filter preset — null = show all (covers both researcher and patient presets)
  const [activeFilter, setActiveFilter] = useState<
    | FilterPresetId
    | PatientFilterPresetId
    | HospitalFilterPresetId
    | HdabFilterPresetId
    | ResearcherFilterPresetId
    | null
  >(null);
  // Active persona view — derived from session role; URL ?persona= overrides.
  // Computed directly each render (not stale state) to avoid race conditions
  // where the graph loads with "default" before the session resolves.
  const derivedPersona = (sessionPersonaId || "default") as PersonaId;
  const activePersona: PersonaId = urlPersona ?? derivedPersona;

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  // Canvas hover tooltip state
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  // Panel collapse state
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // Topological search — Phase 23e
  const [nodeSearch, setNodeSearch] = useState("");

  // ── Theme (light / dark) ─────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const handler = (e: Event) => {
      setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    };
    themeChangeTarget.addEventListener("theme-change", handler);
    return () => themeChangeTarget.removeEventListener("theme-change", handler);
  }, []);

  // ── Load graph (re-fetches when persona changes) ──────────────────────────
  // Wait for session to resolve before first load — avoids double-fetch
  // (default → real persona) that causes wrong center node name
  useEffect(() => {
    if (!IS_STATIC && sessionStatus === "loading") return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setExpandedIds(new Set());
    const url =
      activePersona === "default"
        ? "/api/graph"
        : `/api/graph?persona=${activePersona}`;
    fetchApi(url)
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.nodes)) throw new Error("Bad response");

        // Inject value-center node
        const vc = PERSONA_VALUE_NODES[activePersona];
        const valueCenterNode: GraphNode = {
          id: vc.id,
          name: vc.name,
          label: "ValueCenter",
          layer: 0,
          color: NODE_ROLE_COLORS.ValueCenter ?? "#FBBF24",
          group: "value-center",
          expandable: false,
          isValueCenter: true,
        };

        // Merge real nodes with persona-aware ring positioning
        const graph = mergeInto(
          { nodes: [], links: [] },
          d.nodes,
          d.links,
          activePersona,
        );

        // Mark ALL initial nodes as expanded (up to 1000) — no dashed rings
        const initialNodes = graph.nodes.map((n) => ({
          ...n,
          expanded: true,
        }));
        const initialIds = new Set(initialNodes.map((n) => n.id));

        // Connect value center to ALL matching focus nodes (not capped)
        const valueCenterLinks: GraphLink[] = [];
        const focusLabelSet = new Set(vc.connectedLabels);
        for (const n of initialNodes) {
          if (focusLabelSet.has(n.label)) {
            valueCenterLinks.push({
              source: vc.id,
              target: n.id,
              type: "VALUE_FOCUS",
            });
          }
        }

        setExpandedIds(initialIds);
        setData({
          nodes: [{ ...valueCenterNode, fx: 0, fy: 0 }, ...initialNodes],
          links: [...graph.links, ...valueCenterLinks],
        });
        setLoading(false);
        // Auto-fit all nodes into view after data arrives
        setTimeout(() => fgRef.current?.zoomToFit(400, 40), 150);
      })
      .catch(() => {
        setError("Neo4j unavailable — graph could not be loaded.");
        setLoading(false);
      });
  }, [activePersona, sessionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-highlight from URL param ─────────────────────────────────────────
  useEffect(() => {
    if (!highlightId || data.nodes.length === 0) return;
    const q = highlightId.toLowerCase();
    const match = data.nodes.find(
      (n) => n.id.toLowerCase().includes(q) || n.name.toLowerCase().includes(q),
    );
    if (match) {
      setSelected(match);
      setTimeout(() => {
        if (fgRef.current && match.x != null) {
          fgRef.current.centerAt(match.x, match.y, 600);
          fgRef.current.zoom(3, 600);
        }
      }, 300);
    }
  }, [highlightId, data.nodes]);

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () =>
      containerRef.current &&
      setDims({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── ESC deselect ──────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Mouse position for canvas hover tooltip ──────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("mousemove", handler);
    return () => el.removeEventListener("mousemove", handler);
  }, []);

  // ── Auto-collapse left sidebar when right panel opens on narrow screens ──
  useEffect(() => {
    if (selected && containerRef.current) {
      const totalWidth = window.innerWidth;
      // If viewport is < 1024px, auto-collapse left sidebar to make room
      if (totalWidth < 1024) {
        setLeftCollapsed(true);
      }
    }
  }, [!!selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recalculate canvas dims when panels open/close ─────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        setDims({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [!!selected, leftCollapsed, rightCollapsed]);

  // ── Fetch node properties when selection changes ────────────────────────
  useEffect(() => {
    if (!selected || selected.isValueCenter) {
      setNodeProps([]);
      return;
    }
    setPropsLoading(true);
    fetchApi(`/api/graph/node?id=${encodeURIComponent(selected.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.properties)) {
          setNodeProps(d.properties);
        } else {
          setNodeProps([]);
        }
      })
      .catch(() => setNodeProps([]))
      .finally(() => setPropsLoading(false));
  }, [selected]);

  // ── Neighbours list ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return setNeighbours([]);
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
    const nbrs: { dir: "in" | "out"; type: string; node: GraphNode }[] = [];
    for (const l of data.links) {
      const s = nId(l.source),
        t = nId(l.target);
      if (s === selected.id) {
        const nb = nodeMap.get(t);
        if (nb) nbrs.push({ dir: "out", type: l.type, node: nb });
      } else if (t === selected.id) {
        const nb = nodeMap.get(s);
        if (nb) nbrs.push({ dir: "in", type: l.type, node: nb });
      }
    }
    setNeighbours(nbrs);
  }, [selected, data]);

  // ── Expand on click ───────────────────────────────────────────────────────
  const expandNode = useCallback(
    async (node: GraphNode) => {
      if (expandedIds.has(node.id)) return; // already expanded
      if (node.isValueCenter) return; // virtual node — no Neo4j expand
      setExpanding(node.id);
      try {
        const r = await fetchApi(
          `/api/graph/expand?id=${encodeURIComponent(node.id)}`,
        );
        const d = await r.json();
        if (!Array.isArray(d.nodes)) return;
        setData((prev) => mergeInto(prev, d.nodes, d.links, activePersona));
        setExpandedIds((prev) => new Set(Array.from(prev).concat(node.id)));
        // Mark node as expanded in place
        setData((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === node.id ? { ...n, expanded: true } : n,
          ),
        }));
      } finally {
        setExpanding(null);
      }
    },
    [expandedIds, activePersona],
  );

  // ── Interaction handlers ──────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (raw: object) => {
      const node = raw as GraphNode;
      setSelected(node);
      // Clicking the value center clears any active filter to show all connections
      if (node.isValueCenter) {
        setActiveFilter(null);
      }
      // Centre camera
      if (fgRef.current && node.x != null) {
        fgRef.current.centerAt(node.x, node.y, 400);
      }
      // Auto-expand on single click if not yet expanded
      if (!expandedIds.has(node.id) && !node.isValueCenter) {
        expandNode(node);
      }
    },
    [expandedIds, expandNode],
  );

  const handleBgClick = useCallback(() => setSelected(null), []);

  // ── Hover handler for canvas tooltip ─────────────────────────────────────
  const handleNodeHover = useCallback((node: object | null) => {
    setHoveredNode(node ? (node as GraphNode) : null);
  }, []);

  // ── Pointer area paint (hit detection for custom-painted nodes) ──────────
  const paintPointerArea = useCallback(
    (n: object, color: string, ctx: CanvasRenderingContext2D, gs: number) => {
      const node = n as GraphNode;
      const r = node.isValueCenter
        ? Math.max(6, 18 / Math.sqrt(gs))
        : Math.max(2, 6 / Math.sqrt(gs));
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  // ── Canvas painters ───────────────────────────────────────────────────────
  const connectedIds = new Set(neighbours.map((nb) => nb.node.id));

  // Active filter preset labels set (null = no filter) — searches both preset arrays
  const filterLabelSet: Set<string> | null = activeFilter
    ? new Set(
        (
          [
            ...FILTER_PRESETS,
            ...PATIENT_FILTER_PRESETS,
            ...HOSPITAL_FILTER_PRESETS,
            ...HDAB_FILTER_PRESETS,
            ...RESEARCHER_FILTER_PRESETS,
          ].find((p) => p.id === activeFilter) as
            | { labels: readonly string[] }
            | undefined
        )?.labels ?? [],
      )
    : null;

  const paintNode = useCallback(
    (n: object, ctx: CanvasRenderingContext2D, gs: number) => {
      const node = n as GraphNode;
      const isSel = selected?.id === node.id;
      const isConn = connectedIds.has(node.id);
      const isExpanding = expanding === node.id;
      const isExpanded = node.expanded;
      const isVC = node.isValueCenter;
      // Dim: by selection context OR by active filter (non-matching labels)
      const filteredOut = filterLabelSet
        ? !filterLabelSet.has(node.label) && !isVC
        : false;
      const dim = filteredOut || (!!selected && !isSel && !isConn && !isVC);
      const x = node.x ?? 0,
        y = node.y ?? 0;

      // Value center node — larger, gradient, always visible
      if (isVC) {
        const vcR = Math.max(6, 18 / Math.sqrt(gs));
        ctx.globalAlpha = 1;

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(x, y, vcR + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
        ctx.lineWidth = 2 / gs;
        ctx.stroke();

        // Gradient fill
        const grad = ctx.createRadialGradient(x, y, 0, x, y, vcR);
        grad.addColorStop(0, "#FBBF24");
        grad.addColorStop(1, "#D97706");
        ctx.beginPath();
        ctx.arc(x, y, vcR, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();

        // Bold label
        const fs = Math.max(5, 14 / gs);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(node.name, x, y + vcR + fs * 1.3);

        // Subtitle
        const sfs = Math.max(3, 9 / gs);
        ctx.font = `${sfs}px sans-serif`;
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(
          NODE_DISPLAY_NAMES[node.label] ?? "",
          x,
          y + vcR + fs * 1.3 + sfs * 1.4,
        );
        return;
      }

      const r = Math.max(2, 6 / Math.sqrt(gs));
      ctx.globalAlpha = dim ? 0.15 : 1;

      // Outer glow for selected
      if (isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.5 / gs;
        ctx.stroke();
      }

      // Dashed ring for unexpanded nodes with neighbours
      if (!isExpanded && !isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5, 0, 2 * Math.PI);
        ctx.setLineDash([2 / gs, 2 / gs]);
        ctx.strokeStyle = node.color + "99";
        ctx.lineWidth = 0.8 / gs;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Spinning arc while expanding
      if (isExpanding) {
        const t = (Date.now() / 300) % (2 * Math.PI);
        ctx.beginPath();
        ctx.arc(x, y, r + 5, t, t + Math.PI);
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2 / gs;
        ctx.stroke();
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Label — always visible (font size formula keeps it ~9 screen-px regardless of zoom)
      if (gs >= 0.1 || isSel || isConn) {
        const fs = Math.max(3, 9 / gs);
        ctx.font = `${isSel ? "bold " : ""}${fs}px sans-serif`;
        ctx.fillStyle = isSel ? "#fff" : isConn ? "#f3f4f6" : "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText(
          node.name.length > 24 ? node.name.slice(0, 22) + "…" : node.name,
          x,
          y + r + fs * 1.3,
        );
      }
      ctx.globalAlpha = 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, connectedIds, expanding, filterLabelSet],
  );

  const paintLink = useCallback(
    (l: object, ctx: CanvasRenderingContext2D, gs: number) => {
      const link = l as GraphLink;
      const s = link.source as GraphNode,
        t = link.target as GraphNode;
      if (s.x == null || t.x == null) return;
      const isValueLink = link.type === "VALUE_FOCUS";
      const isAdj =
        selected &&
        (nId(link.source) === selected.id || nId(link.target) === selected.id);
      // Dim link if either endpoint is filtered out
      const filteredOut =
        filterLabelSet &&
        (!filterLabelSet.has(s.label) || !filterLabelSet.has(t.label));
      // Value focus links: golden dashed lines from center — dim when filter active
      if (isValueLink) {
        const filterActive = !!filterLabelSet;
        ctx.globalAlpha = selected ? 0.08 : filterActive ? 0.08 : 0.5;
        ctx.strokeStyle = "#FBBF24";
        ctx.lineWidth = (filterActive ? 0.5 : 2.5) / gs;
        ctx.setLineDash([6 / gs, 4 / gs]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y ?? 0);
        ctx.lineTo(t.x, t.y ?? 0);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label on golden line — hidden when filter active or node selected
        if (!selected && !filterLabelSet && gs >= 0.3) {
          const targetNode = t.isValueCenter ? s : t;
          const typeLabel =
            NODE_DISPLAY_NAMES[targetNode.label] ?? targetNode.label;
          const mx = (s.x + t.x) / 2,
            my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
          const fs = Math.max(3, 7 / gs);
          ctx.font = `${fs}px sans-serif`;
          const tw = ctx.measureText(typeLabel).width;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
          ctx.fillRect(mx - tw / 2 - 2, my - fs / 2 - 1, tw + 4, fs + 2);
          ctx.fillStyle = "#FBBF24";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(typeLabel, mx, my);
          ctx.textBaseline = "alphabetic";
        }
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = filteredOut ? 0.05 : isAdj ? 1 : selected ? 0.1 : 0.55;
      ctx.strokeStyle = isAdj ? "#60a5fa" : isDark ? "#374151" : "#cbd5e1";
      ctx.lineWidth = (isAdj ? 1.5 : 0.7) / gs;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y ?? 0);
      ctx.lineTo(t.x, t.y ?? 0);
      ctx.stroke();

      // Relationship type label — shown on adjacent links or all visible when zoomed in
      const showLabel = isAdj || (!selected && !filteredOut && gs >= 0.6);
      if (showLabel) {
        // User-friendly relationship label
        const rawType = link.type;
        const friendlyType = FRIENDLY_REL_NAMES[rawType] ?? rawType;
        const mx = (s.x + t.x) / 2,
          my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
        const fs = Math.max(3, 7 / gs);
        ctx.font = `${fs}px sans-serif`;
        const tw = ctx.measureText(friendlyType).width;
        ctx.globalAlpha = isAdj ? 0.9 : 0.5;
        ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
        ctx.fillRect(mx - tw / 2 - 2, my - fs / 2 - 1, tw + 4, fs + 2);
        ctx.fillStyle = isAdj
          ? isDark
            ? "#adc6ff" /* Stitch nocturne primary */
            : "#0058be" /* Stitch primary */
          : isDark
            ? "#6b7280"
            : "#94a3b8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(friendlyType, mx, my);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, filterLabelSet, isDark],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-[calc(100vh-44px)]">
      {/* Left sidebar — collapsible */}
      <aside
        className={`flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 ${
          leftCollapsed ? "w-10 p-1" : "w-64 p-4"
        }`}
      >
        {/* Collapse/expand toggle */}
        <button
          onClick={() => setLeftCollapsed((v) => !v)}
          className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title={leftCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {leftCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <PanelLeftClose size={14} />
          )}
        </button>
        {leftCollapsed ? null : (
          <>
            {/* ── Brand header ── */}
            <div className="pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--accent)] leading-tight">
                Knowledge Graph
              </h2>
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mt-0.5 mb-3">
                EHDS Health Dataspace
              </p>
              {/* Active Entities — Stitch stat-card: numbers are text-primary, border gives color */}
              <p className="section-label">Active Entities</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="stat-card border-l-[var(--accent)]">
                  <p className="section-label mb-0.5">Nodes</p>
                  <p className="text-2xl font-black text-[var(--text-primary)] leading-none tabular-nums">
                    {data.nodes.length.toLocaleString()}
                  </p>
                </div>
                <div className="stat-card border-l-[var(--success-text)]">
                  <p className="section-label mb-0.5">Links</p>
                  <p className="text-2xl font-black text-[var(--text-primary)] leading-none tabular-nums">
                    {data.links.length.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Topological search — Phase 23e glass-panel overlay pattern ── */}
            <div className="py-3 border-b border-[var(--border)]">
              <p className="section-label">Search nodes</p>
              <input
                type="search"
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                placeholder="Filter by name or type…"
                className="w-full px-3 py-2 text-xs bg-[var(--surface-card)] border border-[var(--border-ui)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              {nodeSearch.trim() && (
                <div className="mt-2 max-h-40 overflow-y-auto flex flex-col gap-0.5">
                  {data.nodes
                    .filter(
                      (n) =>
                        (n.name ?? "")
                          .toLowerCase()
                          .includes(nodeSearch.toLowerCase()) ||
                        (n.label ?? "")
                          .toLowerCase()
                          .includes(nodeSearch.toLowerCase()),
                    )
                    .slice(0, 10)
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          handleNodeClick(
                            n as Parameters<typeof handleNodeClick>[0],
                          );
                          setNodeSearch("");
                        }}
                        className="text-left px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors flex items-center gap-2 text-xs"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: n.color ?? "var(--text-secondary)",
                          }}
                        />
                        <span className="truncate text-[var(--text-primary)] font-medium">
                          {n.name}
                        </span>
                        <span className="text-[var(--text-secondary)] shrink-0">
                          {n.label}
                        </span>
                      </button>
                    ))}
                  {data.nodes.filter(
                    (n) =>
                      (n.name ?? "")
                        .toLowerCase()
                        .includes(nodeSearch.toLowerCase()) ||
                      (n.label ?? "")
                        .toLowerCase()
                        .includes(nodeSearch.toLowerCase()),
                  ).length === 0 && (
                    <p className="text-xs text-[var(--text-secondary)] px-2 py-1">
                      No nodes match
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Quick links ── */}
            <div>
              <p className="section-label">Explore</p>
              <div className="flex flex-col">
                {[
                  {
                    href: "/catalog",
                    icon: BookOpen,
                    label: "Dataset Catalog",
                  },
                  {
                    href: "/patient",
                    icon: Activity,
                    label: "Patient Journey",
                  },
                  {
                    href: "/analytics",
                    icon: Database,
                    label: "OMOP Analytics",
                  },
                  {
                    href: "/api/graph/validate",
                    icon: ShieldCheck,
                    label: "Validate graph",
                    external: true,
                  },
                ].map(({ href, icon: Icon, label, external }) => (
                  <a
                    key={href}
                    href={href}
                    target={external ? "_blank" : undefined}
                    className="flex items-center gap-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors rounded hover:bg-[var(--accent-surface)] px-1"
                  >
                    <Icon size={12} aria-hidden="true" />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Active persona indicator */}
            {activePersona !== "default" && (
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-surface)] px-3 py-2">
                {(() => {
                  const pv = PERSONA_VIEWS.find((p) => p.id === activePersona);
                  const Icon = pv ? PRESET_ICONS[pv.icon] ?? Eye : Eye;
                  return (
                    <>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                        <Icon size={11} />
                        {pv?.label ?? activePersona}
                      </div>
                      {pv?.ehdsArticle && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                          {pv.ehdsArticle}
                        </div>
                      )}
                      {pv?.question && (
                        <p className="mt-1 text-[10px] italic text-[var(--text-secondary)] leading-snug">
                          &ldquo;{pv.question}&rdquo;
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Filter presets — persona-aware */}
            <div>
              <p className="section-label">Filter by question</p>
              <div className="flex flex-col gap-0.5">
                {(activePersona === "patient"
                  ? PATIENT_FILTER_PRESETS
                  : activePersona === "hospital"
                    ? HOSPITAL_FILTER_PRESETS
                    : activePersona === "hdab"
                      ? HDAB_FILTER_PRESETS
                      : activePersona === "researcher"
                        ? RESEARCHER_FILTER_PRESETS
                        : FILTER_PRESETS
                ).map((preset) => {
                  const Icon = PRESET_ICONS[preset.icon] ?? BookOpen;
                  const isActive = activeFilter === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() =>
                        setActiveFilter((prev) =>
                          prev === preset.id
                            ? null
                            : (preset.id as FilterPresetId &
                                PatientFilterPresetId &
                                HospitalFilterPresetId &
                                HdabFilterPresetId &
                                ResearcherFilterPresetId),
                        )
                      }
                      title={preset.description}
                      className={`flex items-center gap-2 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? "nav-item-active rounded-r"
                          : "px-2 rounded text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon size={11} />
                      <span className="leading-tight">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
              {activeFilter && (
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  {
                    [
                      ...FILTER_PRESETS,
                      ...PATIENT_FILTER_PRESETS,
                      ...HOSPITAL_FILTER_PRESETS,
                      ...HDAB_FILTER_PRESETS,
                      ...RESEARCHER_FILTER_PRESETS,
                    ].find((p) => p.id === activeFilter)?.description
                  }
                </p>
              )}
            </div>

            {/* Layer legend — persona-aware labels */}
            <div>
              <p className="section-label">Structural layers</p>
              {Object.entries(LAYER_LABELS)
                .filter(([k]) => +k >= 1)
                .map(([k, v]) => {
                  const personaLabel =
                    PERSONA_LAYER_LABELS[activePersona]?.[+k] ?? v;
                  return (
                    <div
                      key={k}
                      className="mb-1 flex items-center gap-2 text-xs cursor-help"
                      title={LAYER_TOOLTIPS[+k]}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: LAYER_COLORS[+k] }}
                      />
                      <span className="text-[var(--text-primary)]">
                        {personaLabel}
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Node type color legend — warm/vivid accents */}
            <div>
              <p className="section-label">Key actors</p>
              {ROLE_LEGEND.map(({ label, color, description, tooltip }) => (
                <div
                  key={label}
                  className="mb-1.5 flex items-start gap-2 text-xs cursor-help"
                  title={tooltip}
                >
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">
                      {label}
                    </div>
                    <div className="text-[var(--text-secondary)]">
                      {description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Hint */}
            {!selected && !loading && (
              <div className="flex items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-2 text-xs text-[var(--text-secondary)]">
                <MousePointerClick
                  size={11}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                />
                Click a node to inspect and expand its neighbours.
              </div>
            )}
          </>
        )}
      </aside>

      {/* Graph canvas */}
      <div ref={containerRef} className="relative flex-1 bg-[var(--bg)]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Loading {PERSONA_VALUE_NODES[activePersona]?.name ?? "graph"}…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">
            {error}
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            graphData={data as any}
            width={dims.width}
            height={dims.height}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodeCanvasObject={paintNode as any}
            nodeCanvasObjectMode={() => "replace"}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            linkCanvasObject={paintLink as any}
            linkCanvasObjectMode={() => "replace"}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodePointerAreaPaint={paintPointerArea as any}
            onNodeClick={handleNodeClick}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onNodeHover={handleNodeHover as any}
            onBackgroundClick={handleBgClick}
            backgroundColor={isDark ? "#030712" : "#ffffff"}
            // Nodes have pre-assigned ring positions — physics not needed
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            warmupTicks={0}
            nodeRelSize={4}
          />
        )}

        {/* Canvas hover tooltip */}
        {hoveredNode && !selected && (
          <div
            className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{
              left: Math.min(mousePos.x + 14, dims.width - 280),
              top: Math.min(mousePos.y + 14, dims.height - 120),
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: hoveredNode.color }}
              />
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {hoveredNode.name}
              </span>
            </div>
            <div className="mb-1 text-xs text-[var(--text-secondary)]">
              {NODE_DISPLAY_NAMES[hoveredNode.label] ?? hoveredNode.label}
              {" · "}
              {(PERSONA_LAYER_LABELS[activePersona] ?? LAYER_LABELS)[
                hoveredNode.layer
              ] ?? LAYER_LABELS[hoveredNode.layer]}
            </div>
            {NODE_TOOLTIPS[hoveredNode.label] && (
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                {NODE_TOOLTIPS[hoveredNode.label]}
              </p>
            )}
          </div>
        )}

        {/* Expanding spinner overlay */}
        {expanding && (
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-[var(--surface)]/90 px-3 py-1.5 text-xs text-[var(--text-secondary)]">
            <Loader2 size={12} className="animate-spin" />
            Loading neighbours…
          </div>
        )}
      </div>

      {/* ── Right-side detail panel (absolute overlay to avoid layout squeeze) */}
      {selected && (
        <aside
          className={`absolute right-0 top-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-card)] animate-slide-in-right transition-all duration-200 z-40 shadow-2xl ${
            rightCollapsed ? "w-10" : "w-80"
          }`}
        >
          {/* Collapse/expand toggle */}
          <button
            onClick={() => setRightCollapsed((v) => !v)}
            className="flex w-full items-center justify-center border-b border-[var(--border)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title={rightCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {rightCollapsed ? (
              <ChevronLeft size={14} />
            ) : (
              <PanelRightClose size={14} />
            )}
          </button>
          {rightCollapsed ? null : (
            <>
              {/* Header — Stitch "Entity Details" pattern */}
              <div className="border-b border-[var(--border)] px-4 pt-4 pb-3">
                <div className="flex items-start justify-between mb-1.5">
                  <h2 className="text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                    Entity Details
                  </h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="shrink-0 mt-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    aria-label="Close detail panel"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div
                  className="flex items-center gap-1.5 cursor-help"
                  title={NODE_TOOLTIPS[selected.label]}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: selected.color }}
                  />
                  <span
                    className="text-sm font-semibold text-[var(--accent)] truncate"
                    style={{ color: selected.color }}
                  >
                    {selected.name}
                  </span>
                </div>
                <p
                  className="mt-0.5 text-xs text-[var(--text-secondary)] cursor-help"
                  title={LAYER_TOOLTIPS[selected.layer]}
                >
                  {NODE_DISPLAY_NAMES[selected.label] ?? selected.label}
                  {" · "}
                  {PERSONA_LAYER_LABELS[activePersona]?.[selected.layer] ??
                    LAYER_LABELS[selected.layer]}
                </p>
              </div>

              {/* Node ID (collapsible) */}
              <div className="px-4 py-2 border-b border-[var(--border)]">
                <p className="break-all text-[10px] leading-tight text-[var(--text-secondary)] font-mono">
                  {selected.id}
                </p>
              </div>

              {/* Deep links */}
              <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap gap-2">
                {selected.layer === 2 && (
                  <a
                    href={`/catalog?search=${encodeURIComponent(
                      selected.name,
                    )}`}
                    className="inline-flex items-center gap-1 text-xs text-[var(--layer2-text)] hover:underline"
                  >
                    <BookOpen size={10} /> Catalog
                  </a>
                )}
                {(selected.layer === 3 || selected.layer === 4) && (
                  <a
                    href="/patient"
                    className="inline-flex items-center gap-1 text-xs text-[var(--layer3-text)] hover:underline"
                  >
                    <Activity size={10} /> Patient view
                  </a>
                )}
                {selected.layer === 4 && (
                  <a
                    href="/analytics"
                    className="inline-flex items-center gap-1 text-xs text-[var(--layer4-text)] hover:underline"
                  >
                    <Database size={10} /> Analytics
                  </a>
                )}
                {(selected.label === "TrustCenter" ||
                  selected.label === "SPESession" ||
                  selected.label === "ResearchPseudonym") && (
                  <a
                    href="/compliance#trust-center"
                    className="inline-flex items-center gap-1 text-xs text-[var(--layer1-text)] hover:underline"
                  >
                    <Lock size={10} /> Trust Center
                  </a>
                )}
              </div>

              {/* Node properties */}
              {!selected.isValueCenter && (
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  {propsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Loader2 size={10} className="animate-spin" />
                      Loading details…
                    </div>
                  ) : nodeProps.length > 0 ? (
                    <div>
                      <p className="section-label">Graph Properties</p>
                      <div className="space-y-2">
                        {nodeProps.map((p) => (
                          <div
                            key={p.key}
                            className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--surface)] rounded-xl text-xs"
                          >
                            <span className="text-[var(--text-secondary)] shrink-0">
                              {p.label}
                            </span>
                            <span className="text-[var(--text-primary)] font-bold text-right break-all">
                              {p.value.length > 55
                                ? p.value.slice(0, 53) + "…"
                                : p.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      No additional properties
                    </p>
                  )}
                </div>
              )}

              {/* Expand button (hidden for value center) */}
              <div className="px-4 py-3 border-b border-[var(--border)]">
                {selected.isValueCenter ? (
                  <p className="text-xs text-amber-400/70 italic">
                    {PERSONA_VALUE_NODES[activePersona]?.tooltip ??
                      "Your starting point in the dataspace"}
                  </p>
                ) : !expandedIds.has(selected.id) ? (
                  <button
                    onClick={() => expandNode(selected)}
                    disabled={!!expanding}
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--accent)] py-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-surface)] disabled:opacity-50 transition-colors"
                  >
                    {expanding === selected.id ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />{" "}
                        Expanding…
                      </>
                    ) : (
                      <>
                        <MousePointerClick size={11} /> Expand neighbours
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Neighbours loaded ({neighbours.length} connections)
                  </p>
                )}
              </div>

              {/* Relationships */}
              {neighbours.length > 0 && (
                <div className="px-4 py-3">
                  {/* Outgoing */}
                  {neighbours.filter((nb) => nb.dir === "out").length > 0 && (
                    <div className="mb-3">
                      <p className="section-label">
                        Outgoing (
                        {neighbours.filter((nb) => nb.dir === "out").length})
                      </p>
                      <div className="divide-y divide-[var(--border)]">
                        {neighbours
                          .filter((nb) => nb.dir === "out")
                          .map((nb, i) => (
                            <button
                              key={`out-${i}`}
                              onClick={() => setSelected(nb.node)}
                              className="w-full flex items-center gap-2 py-2 px-1 text-left transition-colors hover:bg-[var(--surface-2)] rounded group"
                            >
                              <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent-surface)] px-1.5 py-0.5 rounded">
                                {FRIENDLY_REL_NAMES[nb.type] ?? nb.type}
                              </span>
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: nb.node.color }}
                              />
                              <span className="truncate text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] flex-1">
                                {nb.node.name}
                              </span>
                              <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                                {NODE_DISPLAY_NAMES[nb.node.label] ??
                                  nb.node.label}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Incoming */}
                  {neighbours.filter((nb) => nb.dir === "in").length > 0 && (
                    <div>
                      <p className="section-label">
                        Incoming (
                        {neighbours.filter((nb) => nb.dir === "in").length})
                      </p>
                      <div className="divide-y divide-[var(--border)]">
                        {neighbours
                          .filter((nb) => nb.dir === "in")
                          .map((nb, i) => (
                            <button
                              key={`in-${i}`}
                              onClick={() => setSelected(nb.node)}
                              className="w-full flex items-center gap-2 py-2 px-1 text-left transition-colors hover:bg-[var(--surface-2)] rounded group"
                            >
                              <span className="shrink-0 font-mono text-[10px] font-semibold text-[var(--layer3-text)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                                {FRIENDLY_REL_NAMES[nb.type] ?? nb.type}
                              </span>
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: nb.node.color }}
                              />
                              <span className="truncate text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] flex-1">
                                {nb.node.name}
                              </span>
                              <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                                {NODE_DISPLAY_NAMES[nb.node.label] ??
                                  nb.node.label}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
