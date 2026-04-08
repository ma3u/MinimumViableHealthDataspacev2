"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Database,
  Network,
  Loader2,
  Edit3,
  Download,
  GitBranch,
  X,
  Bookmark,
  ShieldCheck,
  Users,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import MermaidDiagram from "@/components/MermaidDiagram";

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
  providers?: string[];
  consumers?: string[];
  fhirResources?: string[];
  transfers?: string[];
}

const LEGAL_BASIS_LABELS: Record<string, string> = {
  "EHDS-Art53-SecondaryUse": "EHDS Art. 53",
};

/** Theme → Tailwind gradient classes */
const THEME_GRADIENT: Record<string, string> = {
  Oncology: "from-blue-600 to-indigo-700",
  "Cancer Registry": "from-blue-600 to-indigo-700",
  "Clinical Research": "from-violet-600 to-purple-700",
  Epidemiology: "from-violet-600 to-purple-700",
  "Clinical Trials": "from-violet-600 to-purple-700",
  "Patient Journey": "from-teal-600 to-emerald-700",
  "Patient Summary": "from-teal-600 to-emerald-700",
  "Encounter Records": "from-teal-500 to-cyan-700",
  Diagnostics: "from-purple-600 to-fuchsia-700",
  "Laboratory Results": "from-purple-500 to-fuchsia-600",
  Medications: "from-amber-600 to-orange-700",
  Pharmacovigilance: "from-amber-500 to-red-700",
  Procedures: "from-orange-500 to-amber-600",
  "Care Plans": "from-green-600 to-teal-700",
  Immunisation: "from-green-500 to-emerald-700",
  Allergies: "from-rose-600 to-red-700",
  "Problem List": "from-rose-600 to-red-700",
  "Catalog Metadata": "from-slate-600 to-gray-700",
  "Regulatory Data": "from-amber-600 to-red-600",
};

function themeGradient(theme: string): string {
  return THEME_GRADIENT[theme] ?? "from-blue-600 to-indigo-700";
}

/** Provider status badge config */
function providerStatus(publisher: string): {
  label: string;
  dotColor: string;
  textColor: string;
} {
  const lower = publisher?.toLowerCase() ?? "";
  if (lower.includes("alphaklini") || lower.includes("limburg")) {
    return {
      label: "VERIFIED PROVIDER",
      dotColor: "bg-[var(--role-user-text)]",
      textColor: "text-[var(--role-user-text)]",
    };
  }
  if (lower.includes("medreg") || lower.includes("institut")) {
    return {
      label: "HDAB AUTHORITY",
      dotColor: "bg-[var(--role-hdab-text)]",
      textColor: "text-[var(--role-hdab-text)]",
    };
  }
  return {
    label: "PARTNER NETWORK",
    dotColor: "bg-[var(--warning-text)]",
    textColor: "text-[var(--warning-text)]",
  };
}

/** Short publisher name */
function shortPublisher(publisher: string): string {
  if (!publisher) return "—";
  return publisher
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

/** Friendly datasetType label */
function dataTypeLabel(dt: string): string {
  const map: Record<string, string> = {
    SyntheticData: "Synthetic",
    AnalyticsData: "Analytics",
    RegistryData: "Registry",
    RealWorldData: "Real-World",
    AggregatedData: "Aggregate",
    MetadataCatalog: "Metadata",
    RegulatoryData: "Regulatory",
  };
  return map[dt] ?? dt;
}

function buildDcatApDiagram(d: Dataset): string {
  const lines = [
    "erDiagram",
    `    HealthDataset {`,
    `        string id "${d.id}"`,
    `        string title "${d.title}"`,
    `        string publisher "${d.publisher || "—"}"`,
    `        string theme "${d.theme || "—"}"`,
    `        string license "${d.license || "—"}"`,
    `        string legalBasis "${d.legalBasis || "—"}"`,
    `        string conformsTo "${d.conformsTo || "—"}"`,
    `        string datasetType "${d.datasetType || "—"}"`,
    `        int recordCount "${d.recordCount ?? "—"}"`,
    `    }`,
  ];
  if (d.publisher) {
    lines.push(
      `    Publisher {`,
      `        string name "${d.publisher}"`,
      `    }`,
    );
    lines.push(`    Publisher ||--o{ HealthDataset : "publishes"`);
  }
  if (d.conformsTo?.includes("fhir")) {
    lines.push(
      `    FHIRProfile {`,
      `        string version "R4"`,
      `        string spec "${d.conformsTo}"`,
      `    }`,
    );
    lines.push(`    HealthDataset ||--|| FHIRProfile : "conformsTo"`);
  }
  if (d.legalBasis) {
    lines.push(
      `    LegalBasis {`,
      `        string article "${d.legalBasis}"`,
      `    }`,
    );
    lines.push(`    HealthDataset ||--|| LegalBasis : "legalBasisForAccess"`);
  }
  if (d.theme) {
    lines.push(`    Theme {`, `        string label "${d.theme}"`, `    }`);
    lines.push(`    HealthDataset }o--|| Theme : "theme"`);
  }
  lines.push(
    `    Catalog {`,
    `        string standard "HealthDCAT-AP"`,
    `    }`,
  );
  lines.push(`    Catalog ||--o{ HealthDataset : "dcatDataset"`);
  return lines.join("\n");
}

function buildDcatApJsonLd(d: Dataset): object {
  return {
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      healthdcatap: "https://healthdcat-ap.github.io/ns#",
      foaf: "http://xmlns.com/foaf/0.1/",
    },
    "@type": "dcat:Dataset",
    "@id": d.id,
    "dct:title": d.title,
    "dct:description": d.description,
    "dct:license": d.license,
    "dct:conformsTo": d.conformsTo,
    "dct:publisher": d.publisher
      ? { "@type": "foaf:Organization", "foaf:name": d.publisher }
      : undefined,
    "dcat:theme": d.theme,
    "healthdcatap:datasetType": d.datasetType,
    "healthdcatap:legalBasisForAccess": d.legalBasis,
    "healthdcatap:numberOfRecords": d.recordCount,
  };
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
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
  const [searchText, setSearchText] = useState(
    searchParams.get("search") ?? "",
  );
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [minSamples, setMinSamples] = useState(0);
  const [detailDataset, setDetailDataset] = useState<Dataset | null>(null);
  const [diagramDataset, setDiagramDataset] = useState<Dataset | null>(null);

  const downloadDcatAp = (d: Dataset) => {
    const jsonLd = buildDcatApJsonLd(d);
    const blob = new Blob([JSON.stringify(jsonLd, null, 2)], {
      type: "application/ld+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.id.replace(/[^a-z0-9-]/gi, "_")}.jsonld`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchApi("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? d : d.datasets || d.catalog || [];
        if (arr.length > 0) {
          setDatasets(arr);
          setLoading(false);
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        fetch("/mock/catalog.json")
          .then((r) => r.json())
          .then((d) => setDatasets(Array.isArray(d) ? d : []))
          .catch(() => {})
          .finally(() => setLoading(false));
      });
  }, []);

  const maxRecords = Math.max(...datasets.map((d) => d.recordCount ?? 0), 0);

  const allThemes = [
    ...new Set(datasets.map((d) => d.theme).filter(Boolean)),
  ].sort();
  const allTypes = [
    ...new Set(datasets.map((d) => d.datasetType).filter(Boolean)),
  ].sort();

  const visible = datasets.filter((d) => {
    if (
      searchText &&
      !d.title?.toLowerCase().includes(searchText.toLowerCase()) &&
      !d.description?.toLowerCase().includes(searchText.toLowerCase()) &&
      !d.theme?.toLowerCase().includes(searchText.toLowerCase())
    ) {
      return false;
    }
    if (selectedThemes.length > 0 && !selectedThemes.includes(d.theme)) {
      return false;
    }
    if (selectedTypes.length > 0 && !selectedTypes.includes(d.datasetType)) {
      return false;
    }
    if (minSamples > 0 && (d.recordCount ?? 0) < minSamples) {
      return false;
    }
    return true;
  });

  const toggleTheme = (t: string) =>
    setSelectedThemes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  const toggleType = (t: string) =>
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  const resetFilters = () => {
    setSelectedThemes([]);
    setSelectedTypes([]);
    setMinSamples(0);
    setSearchText("");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-6 pb-12 pt-10">
        {/* Page header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              HealthDCAT-AP · EHDS Art. 53
            </p>
            <h1 className="text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Dataset Catalog
            </h1>
            <p className="text-[var(--text-secondary)] text-base font-medium">
              Explore curated FHIR R4 and OMOP datasets for cross-border health
              research.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!loading && (
              <span className="text-sm font-bold text-[var(--accent)] px-4 py-2 bg-[var(--accent-surface)] rounded-full">
                {visible.length} of {datasets.length} datasets
              </span>
            )}
            <input
              type="search"
              placeholder="Search datasets…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-ui)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text-primary)] w-52"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Connecting to Neo4j…
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-8">
            {/* ── Filter Sidebar ── */}
            <aside className="col-span-12 lg:col-span-3">
              <div className="bg-[var(--surface)] rounded-xl p-6 sticky top-6">
                <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest mb-6">
                  Refine Search
                </h3>

                {/* Theme filter */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Theme
                  </p>
                  <div className="space-y-2">
                    {allThemes.map((t) => (
                      <label
                        key={t}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedThemes.includes(t)}
                          onChange={() => toggleTheme(t)}
                          className="w-4 h-4 rounded accent-[var(--accent)]"
                        />
                        <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* DatasetType filter */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Data Type
                  </p>
                  <div className="space-y-2">
                    {allTypes.map((t) => (
                      <label
                        key={t}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(t)}
                          onChange={() => toggleType(t)}
                          className="w-4 h-4 rounded accent-[var(--accent)]"
                        />
                        <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                          {dataTypeLabel(t)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sample size range */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                    Min. Sample Size
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={maxRecords}
                    step={100}
                    value={minSamples}
                    onChange={(e) => setMinSamples(Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                  />
                  <div className="flex justify-between mt-2 text-[10px] font-bold text-[var(--text-secondary)]">
                    <span>0</span>
                    <span>
                      {minSamples > 0 ? minSamples.toLocaleString() : "Any"}
                    </span>
                    <span>{maxRecords.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={resetFilters}
                  className="w-full py-2.5 bg-[var(--surface-2)] text-[var(--accent)] font-bold text-xs rounded-lg uppercase tracking-wider hover:bg-[var(--accent)] hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={12} />
                  Reset All Filters
                </button>
              </div>
            </aside>

            {/* ── Main Grid ── */}
            <div className="col-span-12 lg:col-span-9">
              {/* Sort bar */}
              <div className="flex justify-between items-center mb-6">
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  {visible.length} dataset{visible.length !== 1 ? "s" : ""}{" "}
                  found
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">
                    EHDS Art. 53 · HealthDCAT-AP 2.1
                  </span>
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="surface-card p-8 text-center border border-[var(--border)]">
                  <Database
                    size={32}
                    className="mx-auto mb-3 text-[var(--text-secondary)]"
                  />
                  <p className="text-[var(--text-secondary)]">
                    No datasets match the current filters.
                  </p>
                  <button
                    onClick={resetFilters}
                    className="mt-4 text-sm text-[var(--accent)] hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {visible.map((d, idx) => {
                    const grad = themeGradient(d.theme);
                    const status = providerStatus(d.publisher);
                    return (
                      <div
                        key={d.id ?? `dataset-${idx}`}
                        className="group bg-[var(--surface-card)] rounded-xl overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
                      >
                        {/* Gradient header */}
                        <div
                          className={`h-32 bg-gradient-to-r ${grad} p-6 relative overflow-hidden`}
                        >
                          {/* Dot pattern overlay */}
                          <div
                            className="absolute inset-0 opacity-20"
                            style={{
                              backgroundImage:
                                "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                              backgroundSize: "20px 20px",
                            }}
                          />
                          <div className="relative z-10">
                            {d.theme && (
                              <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-widest">
                                {d.theme}
                              </span>
                            )}
                            <h3 className="text-white text-lg font-bold mt-2 leading-tight line-clamp-2">
                              {d.title ?? d.id}
                            </h3>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="p-6">
                          {/* Provider status row */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${status.dotColor}`}
                              />
                              <span
                                className={`text-xs font-bold uppercase ${status.textColor}`}
                              >
                                {status.label}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                              {d.license ?? "—"}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-4 mb-5">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                                Samples
                              </span>
                              <span className="text-sm font-black text-[var(--text-primary)] tabular-nums">
                                {d.recordCount != null
                                  ? Number(d.recordCount).toLocaleString()
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                                Data Type
                              </span>
                              <span className="text-sm font-black text-[var(--text-primary)]">
                                {dataTypeLabel(d.datasetType)}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                                Provider
                              </span>
                              <span className="text-sm font-black text-[var(--text-primary)]">
                                {shortPublisher(d.publisher)}
                              </span>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5 line-clamp-2">
                            {d.description}
                          </p>

                          {/* Legal basis tag */}
                          {d.legalBasis && (
                            <div className="mb-4">
                              <span className="text-[10px] font-bold text-[var(--role-hdab-text)] bg-[var(--role-hdab-bg)] border border-[var(--role-hdab-border)] px-2 py-0.5 rounded-full">
                                {LEGAL_BASIS_LABELS[d.legalBasis] ??
                                  d.legalBasis}
                              </span>
                            </div>
                          )}

                          {/* Action row */}
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              href={`/negotiate?dataset=${encodeURIComponent(
                                d.id,
                              )}`}
                              className="flex-grow py-2.5 btn-gradient text-center text-sm font-bold rounded-xl active:scale-95 transition-all"
                            >
                              Request Access
                            </Link>
                            <button
                              onClick={() => setDetailDataset(d)}
                              className="w-11 h-11 flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--accent-surface)] hover:text-[var(--accent)] transition-colors"
                              aria-label="View dataset details"
                              title="View HealthDCAT-AP metadata"
                            >
                              <Bookmark size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Detail / metadata modal ── */}
      {detailDataset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailDataset(null)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-[var(--accent)]" />
                <div>
                  <p className="font-bold text-sm text-[var(--text-primary)] line-clamp-1">
                    {detailDataset.title}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    HealthDCAT-AP Metadata
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailDataset(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Key metadata */}
              <div className="bg-[var(--surface-2)]/50 rounded-xl px-4 py-3 space-y-2">
                {[
                  { label: "Dataset ID", value: detailDataset.id },
                  { label: "Publisher", value: detailDataset.publisher },
                  {
                    label: "Data Providers",
                    value: detailDataset.providers?.join(", "),
                  },
                  {
                    label: "Data Consumers",
                    value: detailDataset.consumers?.join(", "),
                  },
                  {
                    label: "FHIR Patients",
                    value: detailDataset.fhirResources?.length
                      ? `${detailDataset.fhirResources.length} linked`
                      : undefined,
                  },
                  {
                    label: "Transfers",
                    value: detailDataset.transfers?.join(", "),
                  },
                  { label: "Dataset Type", value: detailDataset.datasetType },
                  {
                    label: "Legal Basis",
                    value:
                      LEGAL_BASIS_LABELS[detailDataset.legalBasis] ??
                      detailDataset.legalBasis,
                  },
                  {
                    label: "Record Count",
                    value:
                      detailDataset.recordCount != null
                        ? Number(detailDataset.recordCount).toLocaleString()
                        : undefined,
                  },
                  { label: "Theme", value: detailDataset.theme },
                  { label: "License", value: detailDataset.license },
                  { label: "Conforms To", value: detailDataset.conformsTo },
                ]
                  .filter((r) => r.value)
                  .map((r) => (
                    <div
                      key={r.label}
                      className="flex gap-3 py-1.5 border-b border-[var(--border)] last:border-0"
                    >
                      <span className="text-xs text-[var(--text-secondary)] w-32 shrink-0">
                        {r.label}
                      </span>
                      <span className="text-xs text-[var(--text-primary)] break-all">
                        {r.value}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Provider/consumer badges */}
              {((detailDataset.providers &&
                detailDataset.providers.length > 0) ||
                (detailDataset.consumers &&
                  detailDataset.consumers.length > 0)) && (
                <div className="flex flex-wrap gap-2">
                  {detailDataset.providers?.map((p) => (
                    <span
                      key={p}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] border border-[var(--role-holder-border)]"
                    >
                      <ShieldCheck size={10} />
                      {p}
                    </span>
                  ))}
                  {detailDataset.consumers?.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[var(--role-user-bg)] text-[var(--role-user-text)] border border-[var(--role-user-border)]"
                    >
                      <Users size={10} />
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Action links */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => {
                    setDiagramDataset(detailDataset);
                    setDetailDataset(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline font-medium"
                >
                  <GitBranch size={12} />
                  Data Model Diagram
                </button>
                <button
                  onClick={() => downloadDcatAp(detailDataset)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline font-medium"
                >
                  <Download size={12} />
                  Download DCAT-AP
                </button>
                <Link
                  href={`/graph?highlight=${encodeURIComponent(
                    detailDataset.title || detailDataset.id,
                  )}`}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline font-medium"
                  onClick={() => setDetailDataset(null)}
                >
                  <Network size={12} />
                  View in Graph
                </Link>
                <a
                  href="https://ehds.healthdataportal.eu/editor2/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline font-medium"
                >
                  <Edit3 size={12} />
                  EHDS DCAT-AP Editor
                </a>
                <a
                  href="https://healthdataeu.pages.code.europa.eu/healthdcat-ap/releases/release-6/index.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline font-medium"
                >
                  <ExternalLink size={12} />
                  HealthDCAT-AP Spec
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DCAT-AP data model diagram modal ── */}
      {diagramDataset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setDiagramDataset(null)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h2 className="font-semibold text-sm text-[var(--accent)]">
                <GitBranch size={14} className="inline mr-1.5" />
                HealthDCAT-AP Data Model — {diagramDataset.title}
              </h2>
              <button
                onClick={() => setDiagramDataset(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label="Close diagram"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <MermaidDiagram
                chart={buildDcatApDiagram(diagramDataset)}
                caption={`HealthDCAT-AP entity-relationship model for "${diagramDataset.title}"`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
