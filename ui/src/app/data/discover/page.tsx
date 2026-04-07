"use client";

import { fetchApi } from "@/lib/api";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageIntro from "@/components/PageIntro";
import {
  Loader2,
  Search,
  Database,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileSignature,
  Network,
  ExternalLink,
} from "lucide-react";

interface Asset {
  "@id": string;
  "edc:name"?: string;
  "edc:description"?: string;
  "edc:contenttype"?: string;
  name?: string;
  description?: string;
  contenttype?: string;
  properties?: {
    name?: string;
    description?: string;
    contenttype?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Resolve an asset field checking normalised, edc:*, and properties.* locations. */
function assetField(
  a: Asset,
  field: "name" | "description" | "contenttype",
): string {
  return (
    ((a[field] as string) ||
      (a[`edc:${field}`] as string) ||
      a.properties?.[field] ||
      (field === "name" ? a["@id"] : "")) ??
    ""
  );
}

interface ParticipantAssets {
  participantId: string;
  identity: string;
  assets: Asset[];
}

interface CatalogEntry {
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

type Tab = "all" | "assets" | "catalog";

/** Keyword-based matching: every non-date keyword in the query must appear in the text. */
function keywordMatch(text: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((w) => w.length >= 2 && !/^\d{4}-\d{2}/.test(w));
  if (words.length === 0) return true;
  const lc = text.toLowerCase();
  return words.some((w) => lc.includes(w));
}

export default function DataDiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-[var(--text-secondary)] p-10">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      }
    >
      <DataDiscoverContent />
    </Suspense>
  );
}

function DataDiscoverContent() {
  const [groups, setGroups] = useState<ParticipantAssets[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("search") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    Promise.all([
      fetchApi("/api/assets")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetchApi("/api/catalog")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([assetData, catalogData]) => {
      setGroups(
        Array.isArray(assetData) ? assetData : assetData.participants || [],
      );
      setCatalog(Array.isArray(catalogData) ? catalogData : []);
      setLoading(false);
    });
  }, []);

  // Flatten all assets for filtering
  const allAssets = groups.flatMap((g) =>
    (g.assets || []).map((a) => ({
      ...a,
      _participantId: g.participantId,
      _identity: g.identity,
    })),
  );

  const visibleAssets = filter
    ? allAssets.filter(
        (a) =>
          keywordMatch(assetField(a, "name"), filter) ||
          keywordMatch(assetField(a, "description"), filter) ||
          keywordMatch(a["@id"] ?? "", filter),
      )
    : allAssets;

  const visibleCatalog = filter
    ? catalog.filter(
        (c) =>
          keywordMatch(c.title ?? "", filter) ||
          keywordMatch(c.description ?? "", filter) ||
          keywordMatch(c.theme ?? "", filter) ||
          keywordMatch(c.publisher ?? "", filter),
      )
    : catalog;

  const showAssets = tab === "all" || tab === "assets";
  const showCatalog = tab === "all" || tab === "catalog";
  const totalMatching =
    (showAssets ? visibleAssets.length : 0) +
    (showCatalog ? visibleCatalog.length : 0);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title="Discover Data"
          icon={Search}
          description="Browse available data assets and HealthDCAT-AP datasets across all dataspace participants. Search by name, description, theme, or FHIR resource type to find datasets, then negotiate access."
          prevStep={{ href: "/data/share", label: "Share Data" }}
          nextStep={{ href: "/negotiate", label: "Negotiate Contract" }}
          infoText="EDC assets come from the federated catalog; HealthDCAT-AP entries describe datasets using the European health metadata standard. Search uses keyword matching — each word is matched independently."
          docLink={{ href: "/docs/user-guide", label: "User Guide" }}
        />

        {/* Search bar */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            type="search"
            placeholder="Search by name, theme, FHIR type, publisher…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
          {(
            [
              { key: "all", label: "All" },
              { key: "assets", label: "EDC Assets" },
              { key: "catalog", label: "HealthDCAT-AP" },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-layer2 text-layer2"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
              {!loading && (
                <span className="ml-1 text-gray-600">
                  (
                  {t.key === "all"
                    ? totalMatching
                    : t.key === "assets"
                      ? visibleAssets.length
                      : visibleCatalog.length}
                  )
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {!loading && (
          <div className="flex gap-4 mb-6 text-xs text-[var(--text-secondary)]">
            <span>
              {groups.length} participant{groups.length !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>{allAssets.length} EDC assets</span>
            <span>·</span>
            <span>{catalog.length} HealthDCAT-AP datasets</span>
            {filter && (
              <>
                <span>·</span>
                <span>{totalMatching} matching</span>
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Querying federated catalog…
          </div>
        ) : totalMatching === 0 ? (
          <div className="text-center py-12">
            <Database size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">
              {filter
                ? "No datasets match your search"
                : "No datasets available"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* HealthDCAT-AP Catalog Section */}
            {showCatalog && visibleCatalog.length > 0 && (
              <div>
                {tab === "all" && (
                  <h2 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                    <BookOpen size={12} />
                    HealthDCAT-AP Datasets ({visibleCatalog.length})
                  </h2>
                )}
                <div className="grid gap-3">
                  {visibleCatalog.map((c) => {
                    const isOpen = expanded === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`border rounded-xl transition-colors ${
                          isOpen
                            ? "border-purple-500 bg-[var(--surface)]/60"
                            : "border-[var(--border)] hover:border-purple-500"
                        }`}
                      >
                        <button
                          className="w-full text-left p-4"
                          onClick={() => setExpanded(isOpen ? null : c.id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <BookOpen
                                  size={14}
                                  className="text-purple-400 shrink-0"
                                />
                                <h3 className="font-semibold text-sm text-purple-300">
                                  {c.title}
                                </h3>
                              </div>
                              {c.description && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 ml-5 line-clamp-2">
                                  {c.description}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-1.5 ml-5">
                                {c.publisher && (
                                  <span className="text-xs text-gray-600">
                                    {c.publisher}
                                  </span>
                                )}
                                {c.theme && (
                                  <span className="text-xs bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded">
                                    {c.theme}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {c.datasetType && (
                                <span className="text-xs bg-gray-700 text-[var(--text-primary)] px-2 py-0.5 rounded-full">
                                  {c.datasetType}
                                </span>
                              )}
                              {isOpen ? (
                                <ChevronUp
                                  size={16}
                                  className="text-[var(--text-secondary)]"
                                />
                              ) : (
                                <ChevronDown
                                  size={16}
                                  className="text-[var(--text-secondary)]"
                                />
                              )}
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-[var(--border)] pt-3">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
                              {c.license && (
                                <div className="text-xs">
                                  <span className="text-[var(--text-secondary)]">
                                    License:
                                  </span>{" "}
                                  <span className="text-[var(--text-primary)]">
                                    {c.license}
                                  </span>
                                </div>
                              )}
                              {c.legalBasis && (
                                <div className="text-xs">
                                  <span className="text-[var(--text-secondary)]">
                                    Legal Basis:
                                  </span>{" "}
                                  <span className="text-[var(--text-primary)]">
                                    {c.legalBasis}
                                  </span>
                                </div>
                              )}
                              {c.conformsTo && (
                                <div className="text-xs">
                                  <span className="text-[var(--text-secondary)]">
                                    Conforms To:
                                  </span>{" "}
                                  <a
                                    href={c.conformsTo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    {c.conformsTo
                                      .replace(/^https?:\/\//, "")
                                      .slice(0, 40)}
                                    <ExternalLink size={10} />
                                  </a>
                                </div>
                              )}
                              {c.recordCount != null && (
                                <div className="text-xs">
                                  <span className="text-[var(--text-secondary)]">
                                    Records:
                                  </span>{" "}
                                  <span className="text-[var(--text-primary)]">
                                    {c.recordCount.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <a
                                href={`/catalog?search=${encodeURIComponent(
                                  c.title,
                                )}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-500"
                              >
                                <BookOpen size={14} />
                                View in Catalog
                              </a>
                              <a
                                href={`/graph?highlight=${encodeURIComponent(
                                  c.title,
                                )}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-600 text-[var(--text-primary)] rounded text-xs font-medium hover:border-purple-500 hover:text-purple-300 transition-colors"
                              >
                                <Network size={14} />
                                View in Graph
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EDC Assets Section */}
            {showAssets && visibleAssets.length > 0 && (
              <div>
                {tab === "all" && (
                  <h2 className="text-xs font-semibold uppercase text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                    <Database size={12} />
                    EDC Data Assets ({visibleAssets.length})
                  </h2>
                )}
                <div className="grid gap-3">
                  {visibleAssets.map((a, idx) => {
                    const id = a["@id"] || `asset-${idx}`;
                    const uniqueKey = `${a._participantId ?? idx}-${id}`;
                    const isOpen = expanded === id;
                    return (
                      <div
                        key={uniqueKey}
                        className={`border rounded-xl transition-colors ${
                          isOpen
                            ? "border-layer2 bg-[var(--surface)]/60"
                            : "border-[var(--border)] hover:border-layer2"
                        }`}
                      >
                        <button
                          className="w-full text-left p-4"
                          onClick={() => setExpanded(isOpen ? null : id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm text-layer2">
                                {assetField(a, "name")}
                              </h3>
                              {assetField(a, "description") && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                                  {assetField(a, "description")}
                                </p>
                              )}
                              <p className="text-xs text-gray-600 mt-1">
                                Provider:{" "}
                                {a._identity
                                  ?.replace("did:web:", "")
                                  .replace(/%3A/g, ":") ||
                                  a._participantId?.slice(0, 12)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {assetField(a, "contenttype") && (
                                <span className="text-xs bg-gray-700 text-[var(--text-primary)] px-2 py-0.5 rounded-full">
                                  {assetField(a, "contenttype")}
                                </span>
                              )}
                              {isOpen ? (
                                <ChevronUp
                                  size={16}
                                  className="text-[var(--text-secondary)]"
                                />
                              ) : (
                                <ChevronDown
                                  size={16}
                                  className="text-[var(--text-secondary)]"
                                />
                              )}
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-[var(--border)] pt-3">
                            <pre className="text-xs text-[var(--text-secondary)] overflow-auto max-h-48 mb-3">
                              {JSON.stringify(a, null, 2)}
                            </pre>
                            <div className="flex flex-wrap gap-3">
                              <a
                                href={`/negotiate?assetId=${a["@id"]}&providerId=${a._participantId}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-layer2 text-white rounded text-xs font-medium hover:bg-layer2/90"
                              >
                                <FileSignature size={14} />
                                Negotiate Access
                              </a>
                              <a
                                href={`/graph?highlight=${encodeURIComponent(
                                  assetField(a, "name"),
                                )}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-600 text-[var(--text-primary)] rounded text-xs font-medium hover:border-layer2 hover:text-layer2 transition-colors"
                              >
                                <Network size={14} />
                                View in Graph
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
