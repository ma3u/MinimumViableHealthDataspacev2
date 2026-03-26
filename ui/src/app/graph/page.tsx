"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Activity,
  BookOpen,
  Database,
  Loader2,
  MousePointerClick,
  X,
} from "lucide-react";

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
  expandable?: boolean;
  expanded?: boolean;
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

const LAYER_LABELS: Record<number, string> = {
  1: "L1 Governance",
  2: "L2 HealthDCAT-AP",
  3: "L3 FHIR R4",
  4: "L4 OMOP CDM",
  5: "L5 Ontology",
};

const LAYER_COLORS: Record<number, string> = {
  1: "#2471A3",
  2: "#148F77",
  3: "#1E8449",
  4: "#CA6F1E",
  5: "#7D3C98",
};

// Concentric ring radii — nodes pre-positioned so physics is skipped
const LAYER_RADII: Record<number, number> = {
  1: 90,
  2: 200,
  3: 340,
  4: 500,
  5: 650,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nId(n: string | GraphNode): string {
  return typeof n === "string" ? n : n.id;
}

function ringPosition(layer: number, idx: number, total: number) {
  const r = LAYER_RADII[layer] ?? 400;
  const angle = (2 * Math.PI * idx) / Math.max(total, 1);
  return { fx: r * Math.cos(angle), fy: r * Math.sin(angle) };
}

function mergeInto(
  prev: GraphData,
  newNodes: GraphNode[],
  newLinks: GraphLink[],
): GraphData {
  const existingIds = new Set(prev.nodes.map((n) => n.id));

  // Count per layer to continue the angle offset for newly added nodes
  const layerCount: Record<number, number> = {};
  for (const n of prev.nodes)
    layerCount[n.layer] = (layerCount[n.layer] ?? 0) + 1;

  const toAdd: GraphNode[] = [];
  for (const n of newNodes) {
    if (existingIds.has(n.id)) continue;
    const idx = layerCount[n.layer] ?? 0;
    layerCount[n.layer] = idx + 1;
    toAdd.push({ ...n, ...ringPosition(n.layer, idx, idx + 1) });
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
        <div className="flex h-[calc(100vh-44px)] items-center justify-center text-gray-500">
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
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null); // nodeId being expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [neighbours, setNeighbours] = useState<
    { dir: "in" | "out"; type: string; node: GraphNode }[]
  >([]);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  // ── Initial researcher overview load ──────────────────────────────────────
  useEffect(() => {
    fetchApi("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.nodes)) throw new Error("Bad response");
        setData(mergeInto({ nodes: [], links: [] }, d.nodes, d.links));
        setLoading(false);
      })
      .catch(() => {
        setError("Neo4j unavailable — graph could not be loaded.");
        setLoading(false);
      });
  }, []);

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
      setExpanding(node.id);
      try {
        const r = await fetchApi(
          `/api/graph/expand?id=${encodeURIComponent(node.id)}`,
        );
        const d = await r.json();
        if (!Array.isArray(d.nodes)) return;
        setData((prev) => mergeInto(prev, d.nodes, d.links));
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
    [expandedIds],
  );

  // ── Interaction handlers ──────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (raw: object) => {
      const node = raw as GraphNode;
      if (selected?.id === node.id) {
        // Second click = expand
        expandNode(node);
      } else {
        setSelected(node);
        // Centre camera
        if (fgRef.current && node.x != null) {
          fgRef.current.centerAt(node.x, node.y, 400);
        }
      }
    },
    [selected, expandNode],
  );

  const handleBgClick = useCallback(() => setSelected(null), []);

  // ── Canvas painters ───────────────────────────────────────────────────────
  const connectedIds = new Set(neighbours.map((nb) => nb.node.id));

  const paintNode = useCallback(
    (n: object, ctx: CanvasRenderingContext2D, gs: number) => {
      const node = n as GraphNode;
      const isSel = selected?.id === node.id;
      const isConn = connectedIds.has(node.id);
      const isExpanding = expanding === node.id;
      const isExpanded = node.expanded;
      const dim = !!selected && !isSel && !isConn;
      const r = Math.max(2, 6 / Math.sqrt(gs));
      const x = node.x ?? 0,
        y = node.y ?? 0;

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

      // Label
      if (gs >= 1.2 || isSel || isConn) {
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
    [selected, connectedIds, expanding],
  );

  const paintLink = useCallback(
    (l: object, ctx: CanvasRenderingContext2D, gs: number) => {
      const link = l as GraphLink;
      const s = link.source as GraphNode,
        t = link.target as GraphNode;
      if (s.x == null || t.x == null) return;
      const isAdj =
        selected &&
        (nId(link.source) === selected.id || nId(link.target) === selected.id);
      ctx.globalAlpha = isAdj ? 1 : selected ? 0.1 : 0.55;
      ctx.strokeStyle = isAdj ? "#60a5fa" : "#374151";
      ctx.lineWidth = (isAdj ? 1.5 : 0.7) / gs;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y ?? 0);
      ctx.lineTo(t.x, t.y ?? 0);
      ctx.stroke();
      if (isAdj && selected) {
        const mx = (s.x + t.x) / 2,
          my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
        const fs = Math.max(3, 8 / gs);
        ctx.font = `${fs}px sans-serif`;
        const tw = ctx.measureText(link.type).width;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(mx - tw / 2 - 2, my - fs / 2 - 1, tw + 4, fs + 2);
        ctx.fillStyle = "#93c5fd";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(link.type, mx, my);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-700 bg-gray-900 p-4">
        <div>
          <h2 className="mb-1 text-sm font-bold">Knowledge Graph</h2>
          <p className="mb-3 text-xs text-gray-500">
            Researcher view. Click a node to inspect. Click again to expand its
            connections.
          </p>
          <div className="mb-3 flex flex-col gap-1.5 text-xs">
            <a
              href="/catalog"
              className="flex items-center gap-1.5 text-gray-500 hover:text-teal-400 transition-colors"
            >
              <BookOpen size={11} /> Dataset Catalog
            </a>
            <a
              href="/patient"
              className="flex items-center gap-1.5 text-gray-500 hover:text-teal-400 transition-colors"
            >
              <Activity size={11} /> Patient Journey
            </a>
            <a
              href="/analytics"
              className="flex items-center gap-1.5 text-gray-500 hover:text-teal-400 transition-colors"
            >
              <Database size={11} /> OMOP Analytics
            </a>
          </div>
        </div>

        {/* Layer legend */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
            Layers
          </p>
          {Object.entries(LAYER_LABELS).map(([k, v]) => (
            <div key={k} className="mb-1 flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: LAYER_COLORS[+k] }}
              />
              {v}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="text-xs text-gray-600">
          {data.nodes.length} nodes · {data.links.length} edges loaded
        </div>

        {/* Hint */}
        {!selected && !loading && (
          <div className="flex items-start gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 p-2 text-xs text-gray-500">
            <MousePointerClick
              size={11}
              className="mt-0.5 shrink-0 text-blue-500"
            />
            Click a node to explore. Click again to expand its neighbours.
          </div>
        )}

        {/* Selected node panel */}
        {selected && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3">
              <div className="mb-1 flex items-start justify-between gap-1">
                <span
                  className="text-xs font-bold leading-tight"
                  style={{ color: selected.color }}
                >
                  {selected.name}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-gray-500 hover:text-gray-200"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="text-xs text-gray-400">{selected.label}</div>
              <div className="text-xs text-gray-500">
                {LAYER_LABELS[selected.layer]}
              </div>
              <div className="mt-1 break-all text-xs leading-tight text-gray-700">
                {selected.id}
              </div>

              {/* Deep links */}
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.layer === 2 && (
                  <a
                    href={`/catalog?search=${encodeURIComponent(
                      selected.name,
                    )}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-400 hover:underline"
                  >
                    <BookOpen size={10} /> Catalog
                  </a>
                )}
                {(selected.layer === 3 || selected.layer === 4) && (
                  <a
                    href="/patient"
                    className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
                  >
                    <Activity size={10} /> Patient view
                  </a>
                )}
                {selected.layer === 4 && (
                  <a
                    href="/analytics"
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline"
                  >
                    <Database size={10} /> Analytics
                  </a>
                )}
              </div>

              {/* Expand button */}
              {!expandedIds.has(selected.id) && (
                <button
                  onClick={() => expandNode(selected)}
                  disabled={!!expanding}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-blue-700 bg-blue-900/40 py-1.5 text-xs text-blue-300 hover:bg-blue-900/70 disabled:opacity-50 transition-colors"
                >
                  {expanding === selected.id ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Expanding…
                    </>
                  ) : (
                    <>
                      <MousePointerClick size={11} /> Expand neighbours
                    </>
                  )}
                </button>
              )}
              {expandedIds.has(selected.id) && (
                <p className="mt-2 text-xs text-gray-600">
                  ✓ Neighbours loaded ({neighbours.length} in view)
                </p>
              )}
            </div>

            {/* Neighbour list */}
            {neighbours.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-gray-500">
                  Connected ({neighbours.length})
                </p>
                <div className="flex flex-col gap-1">
                  {neighbours.slice(0, 12).map((nb, i) => (
                    <button
                      key={i}
                      onClick={() => setSelected(nb.node)}
                      className="rounded border border-gray-700 bg-gray-800/40 px-2 py-1.5 text-left transition-colors hover:border-gray-500"
                    >
                      <div className="mb-0.5 flex items-center gap-1">
                        <span className="font-mono text-xs font-semibold text-blue-400">
                          {nb.dir === "out" ? "→" : "←"}
                        </span>
                        <span className="truncate font-mono text-xs text-blue-300">
                          {nb.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: nb.node.color }}
                        />
                        <span className="truncate text-xs text-gray-300">
                          {nb.node.name}
                        </span>
                      </div>
                    </button>
                  ))}
                  {neighbours.length > 12 && (
                    <p className="text-xs text-gray-600 px-1">
                      +{neighbours.length - 12} more — expand to see all
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Graph canvas */}
      <div ref={containerRef} className="relative flex-1 bg-gray-950">
        {loading ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Building researcher overview…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-gray-500">
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
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBgClick}
            backgroundColor="#030712"
            // Nodes have pre-assigned ring positions — physics not needed
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            warmupTicks={0}
            nodeRelSize={4}
          />
        )}

        {/* Expanding spinner overlay */}
        {expanding && (
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-gray-900/90 px-3 py-1.5 text-xs text-blue-300">
            <Loader2 size={12} className="animate-spin" />
            Loading neighbours…
          </div>
        )}
      </div>
    </div>
  );
}
