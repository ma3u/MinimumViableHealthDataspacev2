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
}

interface GraphLink {
  // after force-graph resolves string IDs these become node objects
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
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const searchParams = useSearchParams();
  const highlightParam = searchParams.get("highlight");

  useEffect(() => {
    fetchApi("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-select node matching ?highlight= query param and center on it
  useEffect(() => {
    if (!highlightParam || data.nodes.length === 0) return;
    const q = highlightParam.toLowerCase();
    const match = data.nodes.find(
      (n) => n.id.toLowerCase().includes(q) || n.name.toLowerCase().includes(q),
    );
    if (match) {
      setSelectedNode(match);
      // Wait for force-graph to settle, then center + zoom on the node
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

  // Build neighbour list whenever selection changes
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

  // Set of IDs connected to selected node — for highlighting
  const connectedIds = new Set(neighbours.map((nb) => nb.node.id));

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNode?.id === node.id;
      const isConnected = connectedIds.has(node.id);
      const r = Math.max(4, 8 / Math.sqrt(globalScale));

      // Dim unrelated nodes when something is selected
      const alpha = selectedNode && !isSelected && !isConnected ? 0.2 : 1.0;

      if (isSelected) {
        // White ring around selected node
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

      if (globalScale >= 0.6 || isSelected || isConnected) {
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

      const color = isAdjacent ? "#93c5fd" : "#374151";
      const width = isAdjacent ? 1.5 : 0.8;

      const src = link.source as GraphNode;
      const tgt = link.target as GraphNode;
      if (src.x == null || tgt.x == null) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = width / globalScale;
      ctx.globalAlpha = isAdjacent ? 1.0 : selectedNode ? 0.15 : 0.7;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y ?? 0);
      ctx.lineTo(tgt.x, tgt.y ?? 0);
      ctx.stroke();

      // Draw relationship type label on adjacent edges
      if (isAdjacent && selectedNode) {
        const mx = (src.x + tgt.x) / 2;
        const my = ((src.y ?? 0) + (tgt.y ?? 0)) / 2;
        const fontSize = Math.max(3, 9 / globalScale);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "#93c5fd";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // White background pill for readability
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

  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 p-4 flex flex-col gap-4 overflow-y-auto">
        <div>
          <h2 className="text-sm font-bold mb-1">Graph Explorer</h2>
          <p className="text-xs text-gray-500 mb-3">
            Interactive 5-layer knowledge graph showing all dataspace entities
            and their relationships. Click nodes to inspect, drag to rearrange.
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

        <div className="text-xs text-gray-500">
          {data.nodes.length} nodes · {data.links.length} edges
        </div>

        {!selectedNode && (
          <p className="text-xs text-gray-600 italic">
            Click a node to see details and relationships.
          </p>
        )}

        {selectedNode && (
          <div className="flex flex-col gap-3">
            {/* Node header */}
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
              {/* Contextual links based on layer */}
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
                    href={`/patient`}
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline"
                  >
                    <Activity size={10} />
                    Patient Journey
                  </a>
                )}
              </div>
            </div>

            {/* Relationships */}
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
      <div ref={containerRef} className="flex-1 bg-gray-950">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Connecting to Neo4j…
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
            backgroundColor="#030712"
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            cooldownTicks={200}
            nodeRelSize={6}
          />
        )}
      </div>
    </div>
  );
}
