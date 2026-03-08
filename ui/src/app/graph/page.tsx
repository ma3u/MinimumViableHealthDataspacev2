"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";

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
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
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

export default function GraphPage() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const r = 6;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color ?? "#888";
      ctx.fill();
      ctx.font = "4px sans-serif";
      ctx.fillStyle = "#e5e7eb";
      ctx.textAlign = "center";
      ctx.fillText(node.name, node.x ?? 0, (node.y ?? 0) + r + 4);
    },
    [],
  );

  return (
    <div className="flex h-[calc(100vh-44px)]">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-700 p-4 flex flex-col gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase text-gray-500 mb-2">
            Layers
          </h2>
          {Object.entries(LAYER_LABELS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs mb-1">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: LAYER_COLORS[Number(k)] }}
              />
              {v}
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          {data.nodes.length} nodes · {data.links.length} edges
        </div>
        {selectedNode && (
          <div className="border border-gray-700 rounded p-2 text-xs">
            <div className="font-semibold text-gray-200 mb-1">
              {selectedNode.name}
            </div>
            <div className="text-gray-400">{selectedNode.label}</div>
            <div className="text-gray-500 mt-1 break-all">
              {selectedNode.id}
            </div>
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            graphData={data as any}
            width={dims.width}
            height={dims.height}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodeCanvasObject={paintNode as any}
            nodeCanvasObjectMode={() => "replace"}
            linkColor={() => "#374151"}
            linkWidth={0.8}
            linkLabel="type"
            onNodeClick={(n) => setSelectedNode(n as unknown as GraphNode)}
            backgroundColor="#030712"
          />
        )}
      </div>
    </div>
  );
}
