"use client";

import { fetchApi } from "@/lib/api";
import { IS_STATIC } from "@/lib/static-export";
import { minimalDescription } from "@/lib/healthdcat-ap";
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
import {
  type CatalogLanguage,
  type MetadataLanguage,
  type Translation,
  localise,
  searchableText,
} from "@/lib/metadata-language";
import { useLanguage } from "@/lib/use-language";
import { T, useT } from "@/lib/i18n/translate";

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
  translations?: Partial<Record<MetadataLanguage, Translation>>;
  accessBody?: string | null;
  accessBodyCountry?: string | null;
}

/** The text a card shows in a language other than the page's, so a screen
 * reader reads it in that language (WCAG 2.2, 3.1.2 Language of Parts). */
function InLanguage({
  lang,
  shown,
  children,
}: {
  lang: CatalogLanguage;
  shown: CatalogLanguage;
  children: React.ReactNode;
}) {
  const t = useT("catalog");
  return (
    <>
      <span lang={lang}>{children}</span>
      {lang !== shown && (
        <span
          className="ml-1.5 align-middle text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded-sm bg-white/20 border border-current opacity-80"
          data-testid="english-fallback"
          title={t("No text in this language yet, shown in English")}
          aria-label={t("shown in English, no text in this language yet")}
        >
          EN
        </span>
      )}
    </>
  );
}

/** The legal basis a dataset names, as the reader's language writes it. */
function legalBasisLabel(basis: string, t: (text: string) => string): string {
  return basis === "EHDS-Art53-SecondaryUse" ? t("EHDS Art. 53") : basis;
}

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
      dotColor: "bg-(--role-user-text)",
      textColor: "text-(--role-user-text)",
    };
  }
  if (lower.includes("medreg") || lower.includes("institut")) {
    return {
      label: "HDAB AUTHORITY",
      dotColor: "bg-(--role-hdab-text)",
      textColor: "text-(--role-hdab-text)",
    };
  }
  return {
    label: "PARTNER NETWORK",
    dotColor: "bg-(--warning-text)",
    textColor: "text-(--warning-text)",
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

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-(--text-secondary) p-10">
          <Loader2 size={16} className="animate-spin" />
          <T area="common">{"Loading…"}</T>
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
  // The language of the dataset descriptions, picked in the menu (#782);
  // the rest of the page stays English until the interface is translated.
  const lang = useLanguage();
  const t = useT("catalog");
  const tc = useT("common");

  // The live hub hands over the proxy's HealthDCAT-AP Release 8 document, the
  // one CI validates with the official SHACL (#700); the static export has no
  // proxy and builds a minimal description in the page.
  const downloadDcatAp = async (d: Dataset) => {
    let jsonLd: object = minimalDescription(d);
    if (!IS_STATIC) {
      try {
        const r = await fetchApi(
          `/api/catalog/jsonld?id=${encodeURIComponent(d.id)}`,
        );
        if (r.ok) jsonLd = await r.json();
      } catch {
        // keep the page's own description
      }
    }
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
    // A search finds a dataset in any language it is described in.
    if (
      searchText &&
      !searchableText(d).includes(searchText.toLowerCase()) &&
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
    <div className="min-h-screen bg-(--bg)">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 pt-10">
        {/* Page header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-(--text-secondary) uppercase tracking-widest">
              {t("HealthDCAT-AP · EHDS Art. 53")}
            </p>
            <h1 className="text-4xl font-extrabold text-(--text-primary) tracking-tight">
              {t("Dataset Catalog")}
            </h1>
            <p className="text-(--text-secondary) text-base font-medium">
              {t(
                "Explore curated FHIR R4 and OMOP datasets for cross-border health research.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
            {!loading && (
              <span className="text-sm font-bold text-(--accent) px-4 py-2 bg-(--accent-surface) rounded-full">
                {t("{shown} of {total} datasets", {
                  shown: visible.length,
                  total: datasets.length,
                })}
              </span>
            )}
            <input
              type="search"
              placeholder={t("Search datasets…")}
              aria-label={t("Search datasets")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="px-3 py-2 bg-(--surface-card) border border-(--border-ui) rounded-xl text-sm outline-hidden focus:border-(--accent) text-(--text-primary) placeholder:text-(--text-secondary) w-full min-w-0 sm:w-52"
            />
          </div>
        </div>
        <div className="-mt-4 mb-8 flex flex-wrap items-center gap-2">
          <Link
            href="/jurisdictions"
            className="ml-auto text-xs font-bold text-(--accent) hover:underline"
          >
            {t("National EHDS rules →")}
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            {t("Connecting to Neo4j…")}
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-8">
            {/* ── Filter Sidebar ── */}
            <aside className="col-span-12 lg:col-span-3 min-w-0">
              <div className="bg-(--surface) rounded-xl p-6 sticky top-6">
                <h3 className="text-xs font-black text-(--text-primary) uppercase tracking-widest mb-6">
                  {t("Refine Search")}
                </h3>

                {/* Theme filter */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">
                    {t("Theme")}
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
                          className="w-4 h-4 rounded-sm accent-(--accent)"
                        />
                        <span className="text-sm font-medium text-(--text-primary) group-hover:text-(--accent) transition-colors">
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* DatasetType filter */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">
                    {t("Data Type")}
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
                          className="w-4 h-4 rounded-sm accent-(--accent)"
                        />
                        <span className="text-sm font-medium text-(--text-primary) group-hover:text-(--accent) transition-colors">
                          {dataTypeLabel(t)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sample size range */}
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">
                    {t("Min. Sample Size")}
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={maxRecords}
                    step={100}
                    value={minSamples}
                    onChange={(e) => setMinSamples(Number(e.target.value))}
                    aria-label={t("Minimum sample size")}
                    className="w-full h-1.5 bg-(--border) rounded-lg appearance-none cursor-pointer accent-(--accent)"
                  />
                  <div className="flex justify-between mt-2 text-[10px] font-bold text-(--text-secondary)">
                    <span>0</span>
                    <span>
                      {minSamples > 0 ? minSamples.toLocaleString() : t("Any")}
                    </span>
                    <span>{maxRecords.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={resetFilters}
                  className="w-full py-2.5 bg-(--surface-2) text-(--accent) font-bold text-xs rounded-lg uppercase tracking-wider hover:bg-(--accent) hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={12} />
                  {t("Reset All Filters")}
                </button>
              </div>
            </aside>

            {/* ── Main Grid ── */}
            <div className="col-span-12 lg:col-span-9 min-w-0">
              {/* Sort bar */}
              <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-1 mb-6">
                <p className="text-sm font-semibold text-(--text-secondary)">
                  {t("{count} datasets found", { count: visible.length })}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--text-secondary)">
                    {t("EHDS Art. 77 · HealthDCAT-AP Release 8")}
                  </span>
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="surface-card p-8 text-center border border-(--border)">
                  <Database
                    size={32}
                    className="mx-auto mb-3 text-(--text-secondary)"
                  />
                  <p className="text-(--text-secondary)">
                    {t("No datasets match the current filters.")}
                  </p>
                  <button
                    onClick={resetFilters}
                    className="mt-4 text-sm text-(--accent) hover:underline"
                  >
                    {t("Clear filters")}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {visible.map((d, idx) => {
                    const grad = themeGradient(d.theme);
                    const status = providerStatus(d.publisher);
                    const text = localise(d, lang);
                    return (
                      <div
                        key={d.id ?? `dataset-${idx}`}
                        className="group bg-(--surface-card) rounded-xl overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
                      >
                        {/* Gradient header */}
                        <div
                          className={`h-32 bg-linear-to-r ${grad} p-6 relative overflow-hidden`}
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
                              <InLanguage lang={text.titleLang} shown={lang}>
                                {text.title || d.id}
                              </InLanguage>
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
                                {t(status.label)}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-(--text-secondary)">
                              {d.license ?? "—"}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-4 mb-5">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-(--text-secondary) uppercase tracking-wider">
                                {t("Samples")}
                              </span>
                              <span className="text-sm font-black text-(--text-primary) tabular-nums">
                                {d.recordCount != null
                                  ? Number(d.recordCount).toLocaleString()
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-(--text-secondary) uppercase tracking-wider">
                                {t("Data Type")}
                              </span>
                              <span className="text-sm font-black text-(--text-primary)">
                                {dataTypeLabel(d.datasetType)}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-(--text-secondary) uppercase tracking-wider">
                                {t("Provider")}
                              </span>
                              <span className="text-sm font-black text-(--text-primary)">
                                {shortPublisher(d.publisher)}
                              </span>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-(--text-secondary) leading-relaxed mb-5 line-clamp-2">
                            {text.description && (
                              <InLanguage
                                lang={text.descriptionLang}
                                shown={lang}
                              >
                                {text.description}
                              </InLanguage>
                            )}
                          </p>

                          {/* Legal basis tag */}
                          {d.legalBasis && (
                            <div className="mb-4">
                              <span className="text-[10px] font-bold text-(--role-hdab-text) bg-(--role-hdab-bg) border border-(--role-hdab-border) px-2 py-0.5 rounded-full">
                                {legalBasisLabel(d.legalBasis, t)}
                              </span>
                            </div>
                          )}

                          {/* Action row */}
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              href={`/negotiate?dataset=${encodeURIComponent(
                                d.id,
                              )}`}
                              className="grow py-2.5 btn-gradient text-center text-sm font-bold rounded-xl active:scale-95 transition-all"
                            >
                              {t("Request Access")}
                            </Link>
                            <button
                              onClick={() => setDetailDataset(d)}
                              className="w-11 h-11 flex items-center justify-center bg-(--surface-2) text-(--text-secondary) rounded-xl hover:bg-(--accent-surface) hover:text-(--accent) transition-colors"
                              data-testid="dataset-details"
                              aria-label={t("View dataset details")}
                              title={t("View HealthDCAT-AP metadata")}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={() => setDetailDataset(null)}
        >
          <div
            className="bg-(--surface) border border-(--border) rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-(--border)">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-(--accent)" />
                <div>
                  <p className="font-bold text-sm text-(--text-primary) line-clamp-1">
                    <InLanguage
                      lang={localise(detailDataset, lang).titleLang}
                      shown={lang}
                    >
                      {localise(detailDataset, lang).title}
                    </InLanguage>
                  </p>
                  <p className="text-xs text-(--text-secondary)">
                    {t("HealthDCAT-AP Metadata")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailDataset(null)}
                className="text-(--text-secondary) hover:text-(--text-primary)"
                aria-label={tc("Close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Key metadata */}
              <div className="bg-(--surface-2) rounded-xl px-4 py-3 space-y-2">
                {[
                  { label: "Dataset ID", value: detailDataset.id },
                  { label: "Publisher", value: detailDataset.publisher },
                  {
                    label: "Access Body",
                    value: detailDataset.accessBody
                      ? `${detailDataset.accessBody}${
                          detailDataset.accessBodyCountry
                            ? ` (${detailDataset.accessBodyCountry})`
                            : ""
                        }`
                      : undefined,
                  },
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
                      ? t("{count} linked", {
                          count: detailDataset.fhirResources.length,
                        })
                      : undefined,
                  },
                  {
                    label: "Transfers",
                    value: detailDataset.transfers?.join(", "),
                  },
                  { label: "Dataset Type", value: detailDataset.datasetType },
                  {
                    label: "Legal Basis",
                    value: legalBasisLabel(detailDataset.legalBasis, t),
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
                      className="flex gap-3 py-1.5 border-b border-(--border) last:border-0"
                    >
                      <span className="text-xs text-(--text-secondary) w-32 shrink-0">
                        {t(r.label)}
                      </span>
                      <span className="text-xs text-(--text-primary) break-all">
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
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-(--role-holder-bg) text-(--role-holder-text) border border-(--role-holder-border)"
                    >
                      <ShieldCheck size={10} />
                      {p}
                    </span>
                  ))}
                  {detailDataset.consumers?.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)"
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
                  className="inline-flex items-center gap-1.5 text-xs text-(--accent) hover:underline font-medium"
                >
                  <GitBranch size={12} />
                  {t("Data Model Diagram")}
                </button>
                <button
                  onClick={() => downloadDcatAp(detailDataset)}
                  className="inline-flex items-center gap-1.5 text-xs text-(--accent) hover:underline font-medium"
                >
                  <Download size={12} />
                  {t("Download DCAT-AP")}
                </button>
                <Link
                  href={`/graph?highlight=${encodeURIComponent(
                    detailDataset.title || detailDataset.id,
                  )}`}
                  className="inline-flex items-center gap-1.5 text-xs text-(--accent) hover:underline font-medium"
                  onClick={() => setDetailDataset(null)}
                >
                  <Network size={12} />
                  {t("View in Graph")}
                </Link>
                <a
                  href="https://ehds.healthdataportal.eu/editor2/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary) hover:text-(--accent) hover:underline font-medium"
                >
                  <Edit3 size={12} />
                  {t("EHDS DCAT-AP Editor")}
                </a>
                <a
                  href="https://data.health.europa.eu/healthdcat-ap/releases/latest/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary) hover:text-(--accent) hover:underline font-medium"
                >
                  <ExternalLink size={12} />
                  {t("HealthDCAT-AP Spec")}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DCAT-AP data model diagram modal ── */}
      {diagramDataset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs"
          onClick={() => setDiagramDataset(null)}
        >
          <div
            className="bg-(--surface) border border-(--border) rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-(--border)">
              <h2 className="font-semibold text-sm text-(--accent)">
                <GitBranch size={14} className="inline mr-1.5" />
                {t("HealthDCAT-AP Data Model")} — {diagramDataset.title}
              </h2>
              <button
                onClick={() => setDiagramDataset(null)}
                className="text-(--text-secondary) hover:text-(--text-primary)"
                aria-label={t("Close diagram")}
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
