"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { X, BookOpen, Database, Activity, Loader2 } from "lucide-react";

// react-force-graph-2d requires browser APIs — load client-side only
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface GraphNode {
  id: string;
  name: string;
  label: string;
  layer: number;
  color: string;
  x?: number;
  y?: number;
  fx?: number; // fixed position — skips physics for pre-laid-out nodes
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

interface Neighbour {
  direction: "out" | "in";
  relType: string;
  node: GraphNode;
}

const LAYER_LABELS: Record<number, string> = {
  1: "L1 Marketplace",
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

// Ring radii per layer — pre-positions nodes so physics simulation is skipped
const LAYER_RADII: Record<number, number> = {
  1: 120,
  2: 240,
  3: 420,
  4: 600,
  5: 780,
};

/** Assign ring position to a node based on its layer and index within that layer */
function assignPosition(
  node: GraphNode,
  indexInLayer: number,
  totalInLayer: number,
): GraphNode {
  const r = LAYER_RADII[node.layer] ?? 500;
  const angle = (2 * Math.PI * indexInLayer) / Math.max(totalInLayer, 1);
  return { ...node, fx: r * Math.cos(angle), fy: r * Math.sin(angle) };
}

/** Merge a new page of nodes/links into existing graph data with ring positions */
function mergePages(
  existing: GraphData,
  newNodes: GraphNode[],
  newLinks: GraphLink[],
): GraphData {
  const existingIds = new Set(existing.nodes.map((n) => n.id));

  // Count existing nodes per layer to continue the angle offset
  const layerCounts: Record<number, number> = {};
  for (const n of existing.nodes) {
    layerCounts[n.layer] = (layerCounts[n.layer] ?? 0) + 1;
  }

  // Estimate total per layer from new batch (rough, good enough for positioning)
  const newByLayer: Record<number, GraphNode[]> = {};
  for (const n of newNodes) {
    if (!existingIds.has(n.id)) {
      (newByLayer[n.layer] ??= []).push(n);
    }
  }

  const positioned: GraphNode[] = [];
  for (const [layerStr, batch] of Object.entries(newByLayer)) {
    const layer = Number(layerStr);
    const startIdx = layerCounts[layer] ?? 0;
    const total = startIdx + batch.length;
    batch.forEach((n, i) => {
      positioned.push(assignPosition(n, startIdx + i, total));
    });
  }

  const existingLinkKeys = new Set(
    existing.links.map(
      (l) =>
        `${typeof l.source === "string" ? l.source : l.source.id}→${
          typeof l.target === "string" ? l.target : l.target.id
        }`,
    ),
  );
  const deduped = newLinks.filter((l) => {
    const key = `${typeof l.source === "string" ? l.source : l.source.id}→${
      typeof l.target === "string" ? l.target : l.target.id
    }`;
    return !existingLinkKeys.has(key);
  });

  return {
    nodes: [...existing.nodes, ...positioned],
    links: [...existing.links, ...deduped],
  };
}

function nodeId(n: string | GraphNode): string {
  return typeof n === "string" ? n : n.id;
}

export default function GraphPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-44px)] text-gray-500">
          <Loader2 size={16} className="animate-spin mr-2" />
          Loading graph…
        </div>
      }
    >
      <GraphContent />
    </Suspense>
  );
}

function GraphContent() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [neighbours, setNeighbours] = useState<Neighbour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedNodes, setLoadedNodes] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const searchParams = useSearchParams();
  const highlightParam = searchParams.get("highlight");

  // Progressive loading: fetch page 0 first to show graph immediately,
  // then stream remaining pages silently in the background.
  useEffect(() => {
    const PAGE_LIMIT = 200;
    let cancelled = false;

    async function loadPage(page: number): Promise<boolean> {
      const r = await fetchApi(`/api/graph?page=${page}&limit=${PAGE_LIMIT}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (cancelled) return false;

      if (!Array.isArray(d.nodes) || !Array.isArray(d.links)) {
        throw new Error("Unexpected response shape");
      }

      setTotalNodes(d.pagination?.total ?? d.nodes.length);
      setData((prev) => mergePages(prev, d.nodes, d.links));
      setLoadedNodes((n) => n + d.nodes.length);

      return d.pagination?.hasMore ?? false;
    }

    (async () => {
      try {
        // Page 0 — show graph immediately
        const hasMore = await loadPage(0);
        setLoading(false);

        if (!hasMore) return;

        // Remaining pages — stream silently without blocking the UI
        let page = 1;
        while (!cancelled) {
          const more = await loadPage(page);
          if (!more) break;
          page++;
          // Small yield between pages so the UI stays responsive
          await new Promise((r) => setTimeout(r, 50));
        }
      } catch {
        if (!cancelled) {
          setError("Neo4j unavailable — graph data could not be loaded.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-select node matching ?highlight= param
  useEffect(() => {
    if (!highlightParam || data.nodes.length === 0) return;
    const q = highlightParam.toLowerCase();
    const match = data.nodes.find(
      (n) => n.id.toLowerCase().includes(q) || n.name.toLowerCase().includes(q),
    );
    if (match) {
      setSelectedNode(match);
      setTimeout(() => {
        if (fgRef.current && match.x != null && match.y != null) {
          fgRef.current.centerAt(match.x, match.y, 800);
          fgRef.current.zoom(3, 800);
        }
      }, 500);
    }
  }, [highlightParam, data.nodes]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDims({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedNode(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedNode) {
      setNeighbours([]);
      return;
    }
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
    const nbrs: Neighbour[] = [];
    for (const link of data.links) {
      const srcId = nodeId(link.source);
      const tgtId = nodeId(link.target);
      if (srcId === selectedNode.id) {
        const n = nodeMap.get(tgtId);
        if (n) nbrs.push({ direction: "out", relType: link.type, node: n });
      } else if (tgtId === selectedNode.id) {
        const n = nodeMap.get(srcId);
        if (n) nbrs.push({ direction: "in", relType: link.type, node: n });
      }
    }
    setNeighbours(nbrs);
  }, [selectedNode, data.links, data.nodes]);

  const connectedIds = new Set(neighbours.map((nb) => nb.node.id));

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNode?.id === node.id;
      const isConnected = connectedIds.has(node.id);
      const r = Math.max(2, 6 / Math.sqrt(globalScale));
      const alpha = selectedNode && !isSelected && !isConnected ? 0.2 : 1.0;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color ?? "#888";
      ctx.fill();

      if (globalScale >= 1.5 || isSelected || isConnected) {
        const fontSize = Math.max(3, 10 / globalScale);
        ctx.font = `${isSelected ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = isSelected
          ? "#ffffff"
          : isConnected
            ? "#f3f4f6"
            : "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText(
          node.name.length > 28 ? node.name.slice(0, 26) + "…" : node.name,
          node.x ?? 0,
          (node.y ?? 0) + r + fontSize * 1.2,
        );
      }
      ctx.globalAlpha = 1.0;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNode, connectedIds],
  );

  const paintLink = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const srcId = nodeId(link.source);
      const tgtId = nodeId(link.target);
      const isAdjacent =
        selectedNode &&
        (srcId === selectedNode.id || tgtId === selectedNode.id);

      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (src.x == null || tgt.x == null) return;

      ctx.strokeStyle = isAdjacent ? "#93c5fd" : "#374151";
      ctx.lineWidth = (isAdjacent ? 1.5 : 0.8) / globalScale;
      ctx.globalAlpha = isAdjacent ? 1.0 : selectedNode ? 0.15 : 0.7;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y ?? 0);
      ctx.lineTo(tgt.x, tgt.y ?? 0);
      ctx.stroke();

      if (isAdjacent && selectedNode) {
        const mx = (src.x + tgt.x) / 2;
        const my = ((src.y ?? 0) + (tgt.y ?? 0)) / 2;
        const fontSize = Math.max(3, 9 / globalScale);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "#93c5fd";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(link.type).width;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(
          mx - tw / 2 - 2,
          my - fontSize / 2 - 1,
          tw + 4,
          fontSize + 2,
        );
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(link.type, mx, my);
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1.0;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNode],
  );

  const handleNodeClick = useCallback((n: object) => {
    const node = n as GraphNode;
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const isStreaming = loadedNodes > 0 && loadedNodes < totalNodes;

  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 p-4 flex flex-col gap-4 overflow-y-auto">
        <div>
          <h2 className="text-sm font-bold mb-1">Graph Explorer</h2>
          <p className="text-xs text-gray-500 mb-3">
            Interactive 5-layer knowledge graph. Click nodes to inspect, drag to
            rearrange.
          </p>
          <div className="flex flex-col gap-1.5 text-xs mb-3">
            <a
              href="/catalog"
              className="flex items-center gap-1.5 text-gray-500 hover:text-layer2 transition-colors"
            >
              <BookOpen size={12} />
              Dataset Catalog
            </a>
            <a
              href="/data/discover"
              className="flex items-center gap-1.5 text-gray-500 hover:text-layer2 transition-colors"
            >
              <Database size={12} />
              Discover FHIR Assets
            </a>
            <a
              href="/patient"
              className="flex items-center gap-1.5 text-gray-500 hover:text-layer2 transition-colors"
            >
              <Activity size={12} />
              Patient Journey
            </a>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">
            Layers
          </h2>
          {Object.entries(LAYER_LABELS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs mb-1">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: LAYER_COLORS[Number(k)] }}
              />
              {v}
            </div>
          ))}
        </div>

        {/* Node / loading counters */}
        <div className="text-xs text-gray-500">
          {data.nodes.length} nodes · {data.links.length} edges
        </div>

        {isStreaming && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={10} className="animate-spin shrink-0" />
              Loading {loadedNodes} / {totalNodes}
            </div>
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${(loadedNodes / totalNodes) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!selectedNode && !isStreaming && data.nodes.length > 0 && (
          <p className="text-xs text-gray-600 italic">
            Click a node to see details and relationships.
          </p>
        )}

        {selectedNode && (
          <div className="flex flex-col gap-3">
            <div className="border border-gray-600 rounded-lg p-3 bg-gray-800/60">
              <div className="flex items-start justify-between gap-1 mb-1">
                <span
                  className="text-xs font-bold text-white leading-tight"
                  style={{ color: selectedNode.color }}
                >
                  {selectedNode.name}
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="shrink-0 text-gray-500 hover:text-gray-200"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="text-xs text-gray-400 mb-1">
                {selectedNode.label}
              </div>
              <div className="text-gray-500 text-xs">
                {LAYER_LABELS[selectedNode.layer]}
              </div>
              <div className="text-gray-600 text-xs mt-1 break-all leading-tight">
                {selectedNode.id}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedNode.layer === 2 && (
                  <a
                    href={`/catalog?search=${encodeURIComponent(
                      selectedNode.name,
                    )}`}
                    className="inline-flex items-center gap-1 text-xs text-layer2 hover:underline"
                  >
                    <BookOpen size={10} />
                    View in Catalog
                  </a>
                )}
                {selectedNode.layer === 3 && (
                  <a
                    href={`/data/discover?search=${encodeURIComponent(
                      selectedNode.label?.replace(/\s+\d{4}-\d{2}.*$/, "") ??
                        selectedNode.name.replace(/\s+\d{4}-\d{2}.*$/, ""),
                    )}`}
                    className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
                  >
                    <Database size={10} />
                    View FHIR Asset
                  </a>
                )}
                {(selectedNode.layer === 3 || selectedNode.layer === 4) && (
                  <a
                    href="/patient"
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline"
                  >
                    <Activity size={10} />
                    Patient Journey
                  </a>
                )}
              </div>
            </div>

            {neighbours.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">
                  Relationships ({neighbours.length})
                </h3>
                <div className="flex flex-col gap-1.5">
                  {neighbours.map((nb, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedNode(nb.node)}
                      className="text-left rounded-lg border border-gray-700 bg-gray-800/40 hover:border-gray-500 px-2 py-1.5 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-blue-400 text-xs font-mono font-semibold tracking-tight">
                          {nb.direction === "out" ? "→" : "←"}
                        </span>
                        <span className="text-blue-300 text-xs font-mono truncate">
                          {nb.relType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: nb.node.color }}
                        />
                        <span className="text-xs text-gray-300 truncate">
                          {nb.node.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {nb.node.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1 bg-gray-950 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <Loader2 size={14} className="animate-spin mr-2" />
            Connecting to Neo4j…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-gray-500">
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
            onBackgroundClick={handleBackgroundClick}
            backgroundColor="#030712"
            // Nodes have pre-assigned fx/fy ring positions — skip physics wait
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            warmupTicks={0}
            nodeRelSize={4}
          />
        )}
      </div>
    </div>
  );
}
