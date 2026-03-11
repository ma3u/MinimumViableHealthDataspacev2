"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  caption?: string;
}

export default function MermaidDiagram({
  chart,
  caption,
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            darkMode: true,
            background: "#1a1a2e",
            primaryColor: "#6366f1",
            primaryTextColor: "#e2e8f0",
            primaryBorderColor: "#818cf8",
            lineColor: "#94a3b8",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg: rendered } = await mermaid.render(id, chart.trim());
        if (!cancelled) setSvg(rendered);
      } catch (err: unknown) {
        if (!cancelled) setError(String(err));
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="border border-red-700 rounded-lg p-4 my-4">
        <p className="text-red-400 text-sm">Diagram render error: {error}</p>
        <pre className="text-xs text-gray-500 mt-2 overflow-x-auto">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <figure className="my-6">
      <div
        ref={containerRef}
        className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 overflow-x-auto flex justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption && (
        <figcaption className="text-center text-sm text-gray-500 mt-2 italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
