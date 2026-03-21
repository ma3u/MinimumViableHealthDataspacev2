"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  Network,
  Loader2,
  Edit3,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

interface Dataset {
  id: string;
  title: string;
  description: string;
  license: string;
  conformsTo: string;
  publisher: string;
  theme: string;
  datasetType: string;
  legalBasis: string;
  recordCount: number;
}

const LEGAL_BASIS_LABELS: Record<string, string> = {
  "EHDS-Art53-SecondaryUse": "EHDS Art. 53",
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-xs text-gray-200 break-all">{String(value)}</span>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-gray-500 p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}

function CatalogContent() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("search") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/catalog")
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
      d.description?.toLowerCase().includes(filter.toLowerCase()) ||
      d.theme?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Dataset Catalog"
        icon={Database}
        description="Browse HealthDCAT-AP metadata for all EHDS secondary-use datasets registered in the dataspace. Each entry describes the data holder, legal basis, FHIR profiles, and access conditions."
        prevStep={{ href: "/graph", label: "Graph Explorer" }}
        nextStep={{ href: "/data/discover", label: "Discover Data" }}
        infoText="Datasets are registered using the HealthDCAT-AP standard (DCAT 3 profile for health data). Use the search to filter by title, theme, or description before requesting access."
        docLink={{
          href: "https://ehds2pilot.eu/healthdcat-ap/",
          label: "HealthDCAT-AP Specification",
          external: true,
        }}
      />

      <input
        type="search"
        placeholder="Filter by title, description or theme…"
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
          {visible.map((d) => {
            const isOpen = expanded === d.id;
            return (
              <div
                key={d.id}
                className={`border rounded-xl transition-colors ${
                  isOpen
                    ? "border-layer2 bg-gray-900/60"
                    : "border-gray-700 hover:border-layer2"
                }`}
              >
                {/* Card header — click to expand */}
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-layer2">
                        {d.title ?? d.id}
                      </h2>
                      {d.description && (
                        <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                          {d.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {d.datasetType && (
                        <span className="text-xs bg-layer2/20 text-layer2 px-2 py-0.5 rounded-full">
                          {d.datasetType}
                        </span>
                      )}
                      {d.theme && (
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                          {d.theme}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-gray-500 mt-0.5">
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                    {d.publisher && <span>Publisher: {d.publisher}</span>}
                    {d.legalBasis && (
                      <span className="text-green-500">
                        Legal basis:{" "}
                        {LEGAL_BASIS_LABELS[d.legalBasis] ?? d.legalBasis}
                      </span>
                    )}
                    {d.recordCount != null && (
                      <span>
                        {Number(d.recordCount).toLocaleString()} records
                      </span>
                    )}
                    {d.license && <span>License: {d.license}</span>}
                  </div>
                </button>

                {/* Expanded detail panel */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-700 mt-1 pt-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      HealthDCAT-AP Metadata
                    </h3>
                    <div className="bg-gray-800/50 rounded-lg px-3 py-1">
                      <DetailRow label="Dataset ID" value={d.id} />
                      <DetailRow label="Title" value={d.title} />
                      <DetailRow label="Description" value={d.description} />
                      <DetailRow label="Publisher" value={d.publisher} />
                      <DetailRow label="Dataset Type" value={d.datasetType} />
                      <DetailRow
                        label="Legal Basis"
                        value={LEGAL_BASIS_LABELS[d.legalBasis] ?? d.legalBasis}
                      />
                      <DetailRow
                        label="Record Count"
                        value={
                          d.recordCount != null
                            ? Number(d.recordCount).toLocaleString()
                            : null
                        }
                      />
                      <DetailRow label="Theme" value={d.theme} />
                      <DetailRow label="License" value={d.license} />
                      <DetailRow label="Conforms To" value={d.conformsTo} />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3">
                      <a
                        href={`/graph?highlight=${encodeURIComponent(
                          d.title || d.id,
                        )}`}
                        className="inline-flex items-center gap-1 text-xs text-layer2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Network size={11} />
                        View in Graph
                      </a>
                      <a
                        href="https://ehds.healthdataportal.eu/editor2/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Edit3 size={11} />
                        Open in EHDS DCAT-AP Editor
                      </a>
                      <a
                        href="https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-6/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={11} />
                        HealthDCAT-AP Spec
                      </a>
                      {d.conformsTo?.includes("fhir") && (
                        <a
                          href="https://hl7.org/fhir/R4/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} />
                          FHIR R4 Spec
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
