"use client";

import { fetchApi } from "@/lib/api";
import { themeChangeTarget } from "@/components/ThemeToggle";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { derivePersonaId, DEMO_PERSONAS } from "@/lib/auth";
import { useDemoPersona, setDemoPersona } from "@/lib/use-demo-persona";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart2,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
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
  FILTER_PRESET_PERSONA,
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

  // Sync URL ?persona= to sessionStorage so Navigation/UserMenu reflect the
  // correct persona. Without this, the graph fetches the right data but the
  // nav still shows the old persona (e.g. "Patient / Citizen" instead of
  // "EDC / Dataspace Admin").
  useEffect(() => {
    if (!IS_STATIC || !urlPersona) return;
    const match = DEMO_PERSONAS.find((p) => p.personaId === urlPersona);
    if (match) setDemoPersona(match.username);
  }, [urlPersona]);

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
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

  // ── Auto-load subgraph when filter activated + auto-select starting node ──
  useEffect(() => {
    if (!activeFilter) return;
    const preset = [
      ...FILTER_PRESETS,
      ...PATIENT_FILTER_PRESETS,
      ...HOSPITAL_FILTER_PRESETS,
      ...HDAB_FILTER_PRESETS,
      ...RESEARCHER_FILTER_PRESETS,
    ].find((p) => p.id === activeFilter);
    if (!preset) return;
    const filterLabels = new Set(preset.labels as readonly string[]);

    // Always fetch the designated persona subgraph to ensure all relevant nodes
    // are present (the default graph often lacks specialist nodes like
    // ResearchPseudonym, ProviderPseudonym, etc.)
    const neededPersona = FILTER_PRESET_PERSONA[activeFilter];
    const shouldFetch = neededPersona && neededPersona !== activePersona;

    const afterMerge = () => {
      // Auto-select the most connected matching node and open inspector
      setData((prev) => {
        const matching = prev.nodes.filter(
          (n) => filterLabels.has(n.label) && !n.isValueCenter,
        );
        if (matching.length === 0) return prev;
        // Prefer nodes that have the most links (most connected = best starting point)
        const linkCount = new Map<string, number>();
        for (const l of prev.links) {
          const sid = nId(l.source),
            tid = nId(l.target);
          linkCount.set(sid, (linkCount.get(sid) ?? 0) + 1);
          linkCount.set(tid, (linkCount.get(tid) ?? 0) + 1);
        }
        matching.sort(
          (a, b) => (linkCount.get(b.id) ?? 0) - (linkCount.get(a.id) ?? 0),
        );
        const best = matching[0];
        // Use setTimeout so React state updates don't conflict
        setTimeout(() => {
          setSelected(best);
          setRightCollapsed(false);
          // Center the graph on the starting node
          if (fgRef.current && best.x != null) {
            fgRef.current.centerAt(best.x, best.y, 600);
            fgRef.current.zoom(2.5, 600);
          }
        }, 100);
        return prev;
      });
    };

    if (shouldFetch) {
      const url =
        neededPersona === "default"
          ? "/api/graph"
          : `/api/graph?persona=${neededPersona}`;
      fetchApi(url)
        .then((r) => r.json())
        .then((d) => {
          if (!Array.isArray(d.nodes)) return;
          setData((prev) => mergeInto(prev, d.nodes, d.links, activePersona));
          // Give the merge a tick to settle, then auto-select
          setTimeout(afterMerge, 50);
        })
        .catch(() => afterMerge());
    } else {
      afterMerge();
    }
  }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Canvas accessibility — WCAG 1.1.1 / 4.1.2 ───────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const canvas = containerRef.current.querySelector("canvas");
    if (!canvas) return;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      `Interactive force-directed knowledge graph showing ${data.nodes.length} nodes and ${data.links.length} links across 5 data layers`,
    );
    canvas.setAttribute("tabIndex", "0");
  }, [data.nodes.length, data.links.length]);

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
      setRightCollapsed(false); // auto-open inspector on single click
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
        ctx.fillStyle = isDark ? "#fff" : "#0f172a";
        ctx.textAlign = "center";
        ctx.fillText(node.name, x, y + vcR + fs * 1.3);

        // Subtitle
        const sfs = Math.max(3, 9 / gs);
        ctx.font = `${sfs}px sans-serif`;
        ctx.fillStyle = isDark ? "#fbbf24" : "#b45309";
        ctx.fillText(
          NODE_DISPLAY_NAMES[node.label] ?? "",
          x,
          y + vcR + fs * 1.3 + sfs * 1.4,
        );
        return;
      }

      const r = Math.max(3, 7 / Math.sqrt(gs));
      const filterHighlighted = filterLabelSet && !filteredOut && !isVC;
      // When a filter is active, make non-matching nodes dimmed but still visible
      // Selection-based dimming uses a milder 0.30
      ctx.globalAlpha = filteredOut ? (isDark ? 0.1 : 0.25) : dim ? 0.3 : 1;

      // Outer glow for selected
      if (isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";
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

      // Glow ring for filter-highlighted nodes
      if (filterHighlighted && !isSel) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = node.color + "66";
        ctx.lineWidth = 2 / gs;
        ctx.stroke();
      }

      // Main node circle with border for visibility on any background
      const drawR = filterHighlighted ? r * 1.3 : r;
      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
      // Stroke outline — ensures nodes are visible in light mode
      if (!filteredOut) {
        ctx.strokeStyle = isDark
          ? "rgba(255,255,255,0.25)"
          : "rgba(0,0,0,0.35)";
        ctx.lineWidth = 0.8 / gs;
        ctx.stroke();
      }

      // Label — always visible (font size formula keeps it ~9 screen-px regardless of zoom)
      // When a filter is active, matching nodes show their name in bold
      if (gs >= 0.1 || isSel || isConn || filterHighlighted) {
        const fs = Math.max(3, (filterHighlighted ? 11 : 9) / gs);
        ctx.font = `${
          isSel || filterHighlighted ? "bold " : ""
        }${fs}px sans-serif`;
        // Theme-aware label colors — high contrast in both light and dark mode
        ctx.fillStyle = isSel
          ? isDark
            ? "#fff"
            : "#0f172a"
          : filterHighlighted
            ? isDark
              ? "#f1f5f9"
              : "#0f172a"
            : isConn
              ? isDark
                ? "#e2e8f0"
                : "#1e293b"
              : isDark
                ? "#94a3b8"
                : "#475569";
        ctx.textAlign = "center";
        // Filter-matching nodes show the friendly name; others show ID
        const labelText = filterHighlighted ? node.name : node.id;
        const maxLen = filterHighlighted ? 24 : 18;
        ctx.fillText(
          labelText.length > maxLen
            ? labelText.slice(0, maxLen - 2) + "…"
            : labelText,
          x,
          y + r + fs * 1.3,
        );
        // Show type label below name for filter-highlighted nodes
        if (filterHighlighted && !isSel) {
          const tfs = Math.max(2.5, 7 / gs);
          ctx.font = `${tfs}px sans-serif`;
          ctx.fillStyle = node.color;
          ctx.fillText(
            NODE_DISPLAY_NAMES[node.label] ?? node.label,
            x,
            y + r + fs * 1.3 + tfs * 1.4,
          );
        }
      }
      ctx.globalAlpha = 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, connectedIds, expanding, filterLabelSet, isDark],
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
      // When a filter is active, links between two matching nodes are highlighted
      const filterMatch =
        filterLabelSet &&
        !filteredOut &&
        filterLabelSet.has(s.label) &&
        filterLabelSet.has(t.label);
      ctx.globalAlpha = filteredOut
        ? isDark
          ? 0.05
          : 0.12
        : filterMatch
          ? 0.9
          : isAdj
            ? 1
            : selected
              ? isDark
                ? 0.22
                : 0.3
              : isDark
                ? 0.55
                : 0.7;
      const linkColor = isAdj
        ? "#60a5fa"
        : filterMatch
          ? isDark
            ? "#93c5fd"
            : "#2563eb"
          : isDark
            ? "#64748b"
            : "#475569";
      ctx.strokeStyle = linkColor;
      ctx.lineWidth =
        (isAdj ? 1.5 : filterMatch ? 1.2 : isDark ? 0.7 : 1.0) / gs;
      // Offset line end to stop before target node edge
      const angle = Math.atan2((t.y ?? 0) - (s.y ?? 0), t.x - s.x);
      const tR = Math.max(3, 7 / Math.sqrt(gs));
      const tx = t.x - (tR + 4 / gs) * Math.cos(angle);
      const ty = (t.y ?? 0) - (tR + 4 / gs) * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y ?? 0);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // Arrowhead pointing at target
      const aLen = Math.max(4, 10 / gs);
      ctx.globalAlpha = filteredOut
        ? isDark
          ? 0.05
          : 0.15
        : filterMatch
          ? 0.9
          : isAdj
            ? 1
            : selected
              ? 0.3
              : isDark
                ? 0.65
                : 0.8;
      ctx.fillStyle = linkColor;
      ctx.beginPath();
      ctx.moveTo(t.x - tR * Math.cos(angle), (t.y ?? 0) - tR * Math.sin(angle));
      ctx.lineTo(
        t.x - (tR + aLen) * Math.cos(angle) - aLen * 0.4 * Math.sin(angle),
        (t.y ?? 0) -
          (tR + aLen) * Math.sin(angle) +
          aLen * 0.4 * Math.cos(angle),
      );
      ctx.lineTo(
        t.x - (tR + aLen) * Math.cos(angle) + aLen * 0.4 * Math.sin(angle),
        (t.y ?? 0) -
          (tR + aLen) * Math.sin(angle) -
          aLen * 0.4 * Math.cos(angle),
      );
      ctx.closePath();
      ctx.fill();

      // Relationship type label — shown on adjacent links, filter-matched links, or when zoomed in
      const showLabel =
        isAdj || filterMatch || (!selected && !filteredOut && gs >= 0.6);
      if (showLabel) {
        // User-friendly relationship label
        const rawType = link.type;
        const friendlyType = FRIENDLY_REL_NAMES[rawType] ?? rawType;
        const mx = (s.x + t.x) / 2,
          my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
        const fs = Math.max(3, 7 / gs);
        ctx.font = `${fs}px sans-serif`;
        const tw = ctx.measureText(friendlyType).width;
        ctx.globalAlpha = isAdj || filterMatch ? 1 : 0.7;
        ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
        ctx.fillRect(mx - tw / 2 - 2, my - fs / 2 - 1, tw + 4, fs + 2);
        ctx.fillStyle =
          isAdj || filterMatch
            ? isDark
              ? "#93c5fd" /* bright blue adjacent / filter match */
              : "#0058be" /* Stitch primary */
            : isDark
              ? "#94a3b8"
              : "#475569";
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
          aria-label={leftCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!leftCollapsed}
          aria-controls="graph-sidebar-panel"
        >
          {leftCollapsed ? (
            <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={14} aria-hidden="true" />
          )}
        </button>
        {leftCollapsed ? null : (
          <div id="graph-sidebar-panel" className="flex flex-col gap-3">
            {/* ── Compact header with inline stats ── */}
            <div className="pb-2 border-b border-[var(--border)]">
              <div className="flex items-baseline justify-between">
                <h1 className="text-sm font-bold text-[var(--accent)] leading-tight">
                  Knowledge Graph
                </h1>
                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">
                  {data.nodes.length} nodes · {data.links.length} links
                </span>
              </div>

              {/* Active persona indicator — compact inline */}
              {activePersona !== "default" &&
                (() => {
                  const pv = PERSONA_VIEWS.find((p) => p.id === activePersona);
                  const Icon = pv ? PRESET_ICONS[pv.icon] ?? Eye : Eye;
                  return (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--accent)]">
                      <Icon size={10} />
                      <span className="font-semibold">
                        {pv?.label ?? activePersona}
                      </span>
                      {pv?.ehdsArticle && (
                        <span className="text-[var(--text-secondary)]">
                          · {pv.ehdsArticle}
                        </span>
                      )}
                    </div>
                  );
                })()}
            </div>

            {/* ── Search — matches name, label, display name, and group ── */}
            <div>
              <input
                id="graph-node-search"
                type="search"
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                placeholder="e.g. Organization, Contract, Pseudonym…"
                aria-label="Search graph nodes by name, type, or keyword"
                className="w-full px-3 py-1.5 text-xs bg-[var(--surface-card)] border border-[var(--border-ui)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              {nodeSearch.trim() &&
                (() => {
                  const q = nodeSearch.toLowerCase();
                  const matches = data.nodes.filter(
                    (n) =>
                      (n.name ?? "").toLowerCase().includes(q) ||
                      (n.label ?? "").toLowerCase().includes(q) ||
                      (NODE_DISPLAY_NAMES[n.label] ?? "")
                        .toLowerCase()
                        .includes(q) ||
                      (n.group ?? "").toLowerCase().includes(q),
                  );
                  return (
                    <div className="mt-1.5 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {matches.length > 0 ? (
                        <>
                          <p className="text-[10px] text-[var(--text-secondary)] px-2 py-0.5">
                            {matches.length} result
                            {matches.length !== 1 ? "s" : ""}
                          </p>
                          {matches.slice(0, 15).map((n) => (
                            <button
                              key={n.id}
                              onClick={() => {
                                handleNodeClick(
                                  n as Parameters<typeof handleNodeClick>[0],
                                );
                                setNodeSearch("");
                                setRightCollapsed(false);
                              }}
                              className="text-left px-2 py-1 rounded hover:bg-[var(--surface-2)] transition-colors flex items-center gap-2 text-xs"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  background:
                                    n.color ?? "var(--text-secondary)",
                                }}
                              />
                              <span className="truncate text-[var(--text-primary)] font-medium">
                                {n.name}
                              </span>
                              <span className="text-[var(--text-secondary)] shrink-0 text-[10px]">
                                {NODE_DISPLAY_NAMES[n.label] ?? n.label}
                              </span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <p className="text-xs text-[var(--text-secondary)] px-2 py-1">
                          No nodes match &ldquo;{nodeSearch}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                })()}
            </div>

            {/* ── Filter by question — most prominent section ── */}
            <div>
              <p className="section-label">Ask the graph</p>
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
                <p className="mt-1.5 px-2 py-1.5 text-[10px] text-[var(--text-secondary)] bg-[var(--accent-surface)] rounded leading-snug">
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

            {/* ── Quick links — compact icon row ── */}
            <div className="border-t border-[var(--border)] pt-2">
              <p className="section-label">Explore</p>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { href: "/catalog", icon: BookOpen, label: "Catalog" },
                  { href: "/patient", icon: Activity, label: "Patients" },
                  { href: "/analytics", icon: Database, label: "OMOP" },
                  {
                    href: "/api/graph/validate",
                    icon: ShieldCheck,
                    label: "Validate",
                    external: true,
                  },
                ].map(({ href, icon: Icon, label, external }) => (
                  <a
                    key={href}
                    href={href}
                    target={external ? "_blank" : undefined}
                    className="flex items-center gap-1.5 py-1 px-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors rounded hover:bg-[var(--accent-surface)]"
                  >
                    <Icon size={10} aria-hidden="true" />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* ── Legend — always available, collapsed by default ── */}
            <details
              className="border-t border-[var(--border)] pt-2"
              open={!activeFilter}
            >
              <summary className="section-label cursor-pointer select-none hover:text-[var(--accent)] transition-colors mb-1">
                Legend
              </summary>
              <div className="mt-2 space-y-3">
                {/* Layer colors */}
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold mb-1">
                    Layers
                  </p>
                  {Object.entries(LAYER_LABELS)
                    .filter(([k]) => +k >= 1)
                    .map(([k, v]) => {
                      const personaLabel =
                        PERSONA_LAYER_LABELS[activePersona]?.[+k] ?? v;
                      return (
                        <div
                          key={k}
                          className="mb-0.5 flex items-center gap-2 text-[11px] cursor-help"
                          title={LAYER_TOOLTIPS[+k]}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: LAYER_COLORS[+k] }}
                            aria-hidden="true"
                          />
                          <span className="text-[var(--text-primary)]">
                            {personaLabel}
                          </span>
                        </div>
                      );
                    })}
                </div>
                {/* Key actors */}
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold mb-1">
                    Key actors
                  </p>
                  {ROLE_LEGEND.map(({ label, color, description, tooltip }) => (
                    <div
                      key={label}
                      className="mb-1 flex items-start gap-2 text-[11px] cursor-help"
                      title={tooltip}
                    >
                      <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <div>
                        <span className="font-medium text-[var(--text-primary)]">
                          {label}
                        </span>
                        <span className="text-[var(--text-secondary)]">
                          {" "}
                          — {description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            {/* Hint — only when no selection and no filter */}
            {!selected && !activeFilter && !loading && (
              <div className="flex items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 p-2 text-[10px] text-[var(--text-secondary)]">
                <MousePointerClick
                  size={10}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                  aria-hidden="true"
                />
                Click a node to inspect, or pick a question above.
              </div>
            )}
          </div>
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

      {/* ── Right-side entity inspector panel ── */}
      {selected && (
        <aside
          className={`absolute right-0 top-0 h-full overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-card)] animate-slide-in-right z-40 shadow-2xl transition-[width] duration-200 ${
            rightCollapsed ? "w-10" : "w-96"
          }`}
        >
          {/* Collapse/expand toggle */}
          <button
            onClick={() => setRightCollapsed((v) => !v)}
            className="flex w-full items-center justify-center border-b border-[var(--border)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={
              rightCollapsed ? "Expand inspector" : "Collapse inspector"
            }
            aria-expanded={!rightCollapsed}
            aria-controls="graph-inspector-panel"
          >
            {rightCollapsed ? (
              <ChevronLeft size={14} aria-hidden="true" />
            ) : (
              <PanelRightClose size={14} aria-hidden="true" />
            )}
          </button>

          {rightCollapsed ? null : (
            <div id="graph-inspector-panel">
              {/* ── Header ── */}
              <div className="border-b border-[var(--border)] px-5 pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">
                    Entity Details
                  </p>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] rounded-lg p-1 transition-colors"
                    aria-label="Close detail panel"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>

                {/* Node name with color indicator */}
                <div className="flex items-start gap-2.5 mb-3">
                  <span
                    className="mt-1.5 h-3 w-3 shrink-0 rounded-full shadow-sm"
                    style={{ background: selected.color }}
                  />
                  <h2
                    className="text-xl font-black leading-tight tracking-tight break-words"
                    style={{ color: selected.color }}
                    title={NODE_TOOLTIPS[selected.label]}
                  >
                    {selected.name}
                  </h2>
                </div>

                {/* Type + layer badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: selected.color + "20",
                      color: selected.color,
                    }}
                  >
                    {NODE_DISPLAY_NAMES[selected.label] ?? selected.label}
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    {PERSONA_LAYER_LABELS[activePersona]?.[selected.layer] ??
                      LAYER_LABELS[selected.layer]}
                  </span>
                </div>
              </div>

              {/* ── Node ID (copyable) ── */}
              <div className="px-5 py-3 border-b border-[var(--border)] group flex items-center gap-2">
                <p className="break-all text-[10px] leading-relaxed text-[var(--text-secondary)] font-mono flex-1">
                  {selected.id}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selected.id);
                    setCopiedKey("__id__");
                    setTimeout(() => setCopiedKey(null), 1500);
                  }}
                  className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                  title="Copy node ID"
                  aria-label="Copy node ID"
                >
                  {copiedKey === "__id__" ? (
                    <Check size={12} className="text-[var(--success-text)]" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>

              {/* ── Deep links ── */}
              {(selected.layer === 2 ||
                selected.layer === 3 ||
                selected.layer === 4 ||
                selected.label === "TrustCenter" ||
                selected.label === "SPESession" ||
                selected.label === "ResearchPseudonym") && (
                <div className="px-5 py-3 border-b border-[var(--border)] flex flex-wrap gap-2">
                  {selected.layer === 2 && (
                    <a
                      href={`/catalog?search=${encodeURIComponent(
                        selected.name,
                      )}`}
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--layer2-text)] bg-[var(--surface-2)] px-2.5 py-1.5 rounded-full hover:bg-[var(--accent-surface)] transition-colors"
                    >
                      <BookOpen size={10} /> Dataset Catalog
                    </a>
                  )}
                  {(selected.layer === 3 || selected.layer === 4) && (
                    <a
                      href="/patient"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--layer3-text)] bg-[var(--surface-2)] px-2.5 py-1.5 rounded-full hover:bg-[var(--accent-surface)] transition-colors"
                    >
                      <Activity size={10} /> Patient Journey
                    </a>
                  )}
                  {selected.layer === 4 && (
                    <a
                      href="/analytics"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--layer4-text)] bg-[var(--surface-2)] px-2.5 py-1.5 rounded-full hover:bg-[var(--accent-surface)] transition-colors"
                    >
                      <Database size={10} /> OMOP Analytics
                    </a>
                  )}
                  {(selected.label === "TrustCenter" ||
                    selected.label === "SPESession" ||
                    selected.label === "ResearchPseudonym") && (
                    <a
                      href="/compliance#trust-center"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--layer1-text)] bg-[var(--surface-2)] px-2.5 py-1.5 rounded-full hover:bg-[var(--accent-surface)] transition-colors"
                    >
                      <Lock size={10} /> Trust Center
                    </a>
                  )}
                </div>
              )}

              {/* ── Graph properties ── */}
              {!selected.isValueCenter && (
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  {propsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Loader2 size={12} className="animate-spin" />
                      Loading properties…
                    </div>
                  ) : nodeProps.length > 0 ? (
                    <>
                      <p className="section-label mb-3">Graph Properties</p>
                      <div className="space-y-1.5">
                        {nodeProps.map((p) => {
                          const isUrl = p.value.startsWith("http");
                          const isEmail =
                            p.value.includes("@") &&
                            !p.value.startsWith("http");
                          const isPhone = p.value.startsWith("+");
                          const isCopied = copiedKey === p.key;
                          return (
                            <div
                              key={p.key}
                              className="flex items-start justify-between gap-2 px-3 py-2.5 bg-[var(--surface)] rounded-xl text-xs group"
                            >
                              <span className="text-[var(--text-secondary)] shrink-0 pt-0.5 w-24 leading-snug">
                                {p.label}
                              </span>
                              <div className="flex items-start gap-1.5 flex-1 min-w-0 justify-end">
                                {isUrl ? (
                                  <a
                                    href={p.value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--accent)] font-medium break-all hover:underline flex items-center gap-1 text-right"
                                  >
                                    {p.value.length > 36
                                      ? p.value.slice(0, 34) + "…"
                                      : p.value}
                                    <ExternalLink
                                      size={9}
                                      className="shrink-0"
                                    />
                                  </a>
                                ) : isEmail ? (
                                  <a
                                    href={`mailto:${p.value}`}
                                    className="text-[var(--accent)] font-medium hover:underline text-right"
                                  >
                                    {p.value}
                                  </a>
                                ) : isPhone ? (
                                  <a
                                    href={`tel:${p.value.replace(/\s/g, "")}`}
                                    className="text-[var(--text-primary)] font-bold hover:text-[var(--accent)] text-right"
                                  >
                                    {p.value}
                                  </a>
                                ) : (
                                  <span className="text-[var(--text-primary)] font-bold text-right break-all">
                                    {p.value.length > 45
                                      ? p.value.slice(0, 43) + "…"
                                      : p.value}
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.value);
                                    setCopiedKey(p.key);
                                    setTimeout(() => setCopiedKey(null), 1500);
                                  }}
                                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-secondary)] hover:text-[var(--accent)]"
                                  title={`Copy ${p.label}`}
                                  aria-label={`Copy ${p.label}`}
                                >
                                  {isCopied ? (
                                    <Check
                                      size={10}
                                      className="text-[var(--success-text)]"
                                    />
                                  ) : (
                                    <Copy size={10} />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)] italic">
                      No additional properties
                    </p>
                  )}
                </div>
              )}

              {/* ── Expand / neighbours loaded ── */}
              <div className="px-5 py-4 border-b border-[var(--border)]">
                {selected.isValueCenter ? (
                  <p className="text-xs text-[var(--warning-text)] italic">
                    {PERSONA_VALUE_NODES[activePersona]?.tooltip ??
                      "Your starting point in the dataspace"}
                  </p>
                ) : !expandedIds.has(selected.id) ? (
                  <button
                    onClick={() => expandNode(selected)}
                    disabled={!!expanding}
                    className="btn-gradient w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold disabled:opacity-50"
                  >
                    {expanding === selected.id ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Expanding…
                      </>
                    ) : (
                      <>
                        <MousePointerClick size={12} />
                        Expand Neighbours
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
                    {neighbours.length} connections loaded
                  </div>
                )}
              </div>

              {/* ── Relationships ── */}
              {neighbours.length > 0 && (
                <div className="px-5 py-4">
                  {/* Outgoing */}
                  {neighbours.filter((nb) => nb.dir === "out").length > 0 && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="section-label">Outgoing</p>
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--surface)] px-1.5 py-0.5 rounded-full border border-[var(--border)]">
                          {neighbours.filter((nb) => nb.dir === "out").length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {neighbours
                          .filter((nb) => nb.dir === "out")
                          .map((nb, i) => (
                            <button
                              key={`out-${i}`}
                              onClick={() => setSelected(nb.node)}
                              className="w-full flex items-center gap-2 py-2.5 px-3 text-left bg-[var(--surface)] hover:bg-[var(--accent-surface)] rounded-xl transition-colors group"
                            >
                              <ArrowUpRight
                                size={12}
                                className="shrink-0 text-[var(--accent)] opacity-60 group-hover:opacity-100"
                              />
                              <span className="shrink-0 font-mono text-[9px] font-black text-[var(--accent)] bg-[var(--accent-surface)] group-hover:bg-white/50 px-1.5 py-0.5 rounded max-w-[90px] truncate">
                                {FRIENDLY_REL_NAMES[nb.type] ?? nb.type}
                              </span>
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: nb.node.color }}
                              />
                              <span className="truncate text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] flex-1 text-left">
                                {nb.node.name}
                              </span>
                              <ChevronRight
                                size={10}
                                className="shrink-0 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Incoming */}
                  {neighbours.filter((nb) => nb.dir === "in").length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="section-label">Incoming</p>
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--surface)] px-1.5 py-0.5 rounded-full border border-[var(--border)]">
                          {neighbours.filter((nb) => nb.dir === "in").length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {neighbours
                          .filter((nb) => nb.dir === "in")
                          .map((nb, i) => (
                            <button
                              key={`in-${i}`}
                              onClick={() => setSelected(nb.node)}
                              className="w-full flex items-center gap-2 py-2.5 px-3 text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] rounded-xl transition-colors group"
                            >
                              <ArrowDownLeft
                                size={12}
                                className="shrink-0 text-[var(--layer3-text)] opacity-60 group-hover:opacity-100"
                              />
                              <span className="shrink-0 font-mono text-[9px] font-black text-[var(--layer3-text)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded max-w-[90px] truncate">
                                {FRIENDLY_REL_NAMES[nb.type] ?? nb.type}
                              </span>
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: nb.node.color }}
                              />
                              <span className="truncate text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] flex-1 text-left">
                                {nb.node.name}
                              </span>
                              <ChevronRight
                                size={10}
                                className="shrink-0 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
