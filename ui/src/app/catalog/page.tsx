"use client";

import { useEffect, useState } from "react";

interface Dataset {
  id: string;
  title: string;
  description: string;
  license: string;
  conformsTo: string;
  publisher: string;
  theme: string;
}

export default function CatalogPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        setDatasets(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visible = datasets.filter(
    (d) =>
      !filter ||
      d.title?.toLowerCase().includes(filter.toLowerCase()) ||
      d.theme?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Dataset Catalog</h1>
      <p className="text-gray-400 text-sm mb-6">
        HealthDCAT-AP metadata — EHDS secondary-use datasets
      </p>

      <input
        type="search"
        placeholder="Filter by title or theme…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-6 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
      />

      {loading ? (
        <p className="text-gray-500">Connecting to Neo4j…</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500">No datasets found.</p>
      ) : (
        <div className="grid gap-4">
          {visible.map((d) => (
            <div
              key={d.id}
              className="border border-gray-700 rounded-xl p-4 hover:border-layer2 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-layer2">
                    {d.title ?? d.id}
                  </h2>
                  {d.description && (
                    <p className="text-sm text-gray-400 mt-0.5">
                      {d.description}
                    </p>
                  )}
                </div>
                {d.theme && (
                  <span className="shrink-0 text-xs bg-layer2/20 text-layer2 px-2 py-0.5 rounded-full">
                    {d.theme}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                {d.publisher && <span>Publisher: {d.publisher}</span>}
                {d.license && <span>License: {d.license}</span>}
                {d.conformsTo && <span>Conforms to: {d.conformsTo}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
