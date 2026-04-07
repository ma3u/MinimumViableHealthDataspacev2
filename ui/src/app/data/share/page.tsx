"use client";

import { fetchApi } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Upload,
  Database,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileJson2,
  Copy,
  Network,
  Activity,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import FhirResourceViewer from "@/components/FhirResourceViewer";

interface ParticipantCtx {
  "@id": string;
  identity: string;
  state: string;
}

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

type Tab = "existing" | "create";

/* ── Collapsible JSON Tree (syntax-highlighted) ── */

function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (data === null || data === undefined) {
    return <span className="text-[var(--text-secondary)]">null</span>;
  }
  if (typeof data === "boolean") {
    return <span className="text-[var(--role-hdab-text)]">{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="text-[var(--role-holder-text)]">{data}</span>;
  }
  if (typeof data === "string") {
    return (
      <span className="text-[var(--role-user-text)]">&quot;{data}&quot;</span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0)
      return <span className="text-[var(--text-secondary)]">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-[var(--text-secondary)] text-xs ml-0.5">
            [{data.length}]
          </span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-[var(--border)] pl-2">
            {data.map((item, i) => (
              <div key={i}>
                <span className="text-gray-600 text-xs mr-1">{i}:</span>
                <JsonNode data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-[var(--text-secondary)]">{"{}"}</span>;
    }
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="text-[var(--text-secondary)] text-xs ml-0.5">
            {"{"}
            {entries.length}
            {"}"}
          </span>
        </button>
        {!collapsed && (
          <div className="ml-4 border-l border-[var(--border)] pl-2">
            {entries.map(([key, val]) => (
              <div key={key}>
                <span className="text-[var(--accent)]">{key}</span>
                <span className="text-[var(--text-secondary)]">: </span>
                <JsonNode data={val} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

/* ── Asset Detail Panel ── */

function AssetDetailPanel({ asset }: { asset: Asset }) {
  const [viewMode, setViewMode] = useState<"details" | "json" | "fhir">(
    "details",
  );
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fhirBundle, setFhirBundle] = useState<any>(null);
  const [fhirLoading, setFhirLoading] = useState(false);

  const name =
    asset.name || asset["edc:name"] || asset.properties?.name || asset["@id"];
  const desc =
    asset.description ||
    asset["edc:description"] ||
    asset.properties?.description;
  const ct =
    asset.contenttype ||
    asset["edc:contenttype"] ||
    asset.properties?.contenttype;

  const isFhir = String(ct ?? "").includes("fhir");

  // Load FHIR bundle when switching to fhir tab
  const loadFhirBundle = useCallback(async () => {
    if (fhirBundle || fhirLoading) return;
    setFhirLoading(true);
    try {
      // Try to match asset ID to a known FHIR bundle key
      const assetId = String(asset["@id"] ?? "");
      const bundleKey =
        assetId || name?.toString().toLowerCase().replace(/\s+/g, "-");
      const res = await fetch("/mock/fhir_bundles.json");
      if (res.ok) {
        const bundles = await res.json();
        // Try exact match, then prefix match
        const bundle =
          bundles[bundleKey] ??
          bundles[assetId.replace(/^asset:/, "")] ??
          Object.values(bundles).find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (b: any) => b?.resourceType === "Bundle",
          );
        if (bundle) setFhirBundle(bundle);
      }
    } catch {
      /* ignore — FHIR data unavailable */
    } finally {
      setFhirLoading(false);
    }
  }, [fhirBundle, fhirLoading, asset, name]);

  const copyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(asset, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [asset]);

  // Collect extra properties (skip already-displayed ones)
  const skipKeys = new Set([
    "@id",
    "@type",
    "name",
    "description",
    "contenttype",
    "edc:name",
    "edc:description",
    "edc:contenttype",
    "properties",
  ]);
  const extraEntries = Object.entries(asset).filter(([k]) => !skipKeys.has(k));
  const propEntries = asset.properties
    ? Object.entries(asset.properties).filter(
        ([k]) => !["name", "description", "contenttype"].includes(k),
      )
    : [];

  return (
    <div className="border-t border-layer2/30 bg-[var(--surface)]/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-layer2/10 border-b border-layer2/30">
        <div className="flex items-center gap-2">
          <FileJson2 size={14} className="text-layer2" />
          <span className="text-xs font-medium text-[var(--text-primary)]">
            Asset Details — {name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/graph?highlight=${encodeURIComponent(String(name))}`}
            className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline transition-colors"
          >
            View in Graph <Network size={10} />
          </a>
        </div>
      </div>

      {/* Summary metadata */}
      <div className="px-4 py-3 border-b border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Asset ID
          </div>
          <div className="text-sm text-[var(--text-primary)] font-mono truncate">
            {asset["@id"]}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Type
          </div>
          <div className="text-sm text-[var(--text-primary)]">
            {String(asset["@type"] || "Asset")}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Content Type
          </div>
          <div className="text-sm text-[var(--text-primary)]">{ct || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
            Properties
          </div>
          <div className="text-sm text-[var(--text-primary)]">
            {Object.keys(asset.properties || {}).length} fields
          </div>
        </div>
      </div>

      {/* Description */}
      {desc && (
        <div className="px-4 py-2 border-b border-[var(--border)]">
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide mb-1">
            Description
          </div>
          <p className="text-xs text-[var(--text-primary)]">{desc as string}</p>
        </div>
      )}

      {/* View mode tabs & copy */}
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("details")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "details"
                ? "bg-layer2/20 text-layer2"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setViewMode("json")}
            className={`text-xs px-2.5 py-1 rounded ${
              viewMode === "json"
                ? "bg-layer2/20 text-layer2"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Raw JSON
          </button>
          {isFhir && (
            <button
              onClick={() => {
                setViewMode("fhir");
                loadFhirBundle();
              }}
              className={`text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 ${
                viewMode === "fhir"
                  ? "bg-[var(--role-user-bg)] text-[var(--role-user-text)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Activity size={10} />
              FHIR Viewer
            </button>
          )}
        </div>
        <button
          onClick={copyJson}
          className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Copy size={10} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {viewMode === "fhir" ? (
          <div className="p-4">
            {fhirLoading ? (
              <div className="flex items-center gap-2 text-[var(--text-secondary)] py-6 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Loading FHIR bundle…
              </div>
            ) : fhirBundle ? (
              <FhirResourceViewer
                bundle={fhirBundle}
                title={`FHIR Resources — ${name}`}
              />
            ) : (
              <p className="text-[var(--text-secondary)] text-xs text-center py-6">
                No FHIR bundle data available for this asset.
              </p>
            )}
          </div>
        ) : viewMode === "details" ? (
          <div className="p-4 space-y-3">
            {/* Extra top-level properties */}
            {extraEntries.length > 0 && (
              <div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
                  EDC Metadata
                </div>
                <div className="space-y-1 font-mono text-xs">
                  {extraEntries.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-[var(--accent)] shrink-0">
                        {k}:
                      </span>
                      <span className="text-[var(--role-user-text)] truncate">
                        {typeof v === "string" ? v : JSON.stringify(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Nested properties */}
            {propEntries.length > 0 && (
              <div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
                  Properties
                </div>
                <div className="space-y-1 font-mono text-xs">
                  {propEntries.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-[var(--accent)] shrink-0">
                        {k}:
                      </span>
                      <span className="text-[var(--role-user-text)] truncate">
                        {typeof v === "string" ? v : JSON.stringify(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 font-mono text-xs">
            <JsonNode data={asset} depth={0} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DataSharePage() {
  const [tab, setTab] = useState<Tab>("existing");
  const [participants, setParticipants] = useState<ParticipantCtx[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [selectedCtx, setSelectedCtx] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetDesc, setAssetDesc] = useState("");
  const [contentType, setContentType] = useState("application/fhir+json");
  const [baseUrl, setBaseUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchApi("/api/participants").then((r) => (r.ok ? r.json() : [])),
      fetchApi("/api/assets").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([ctx, assetData]) => {
        // /api/participants returns flat array or { participants: [...] }
        const list: ParticipantCtx[] = Array.isArray(ctx)
          ? ctx
          : ctx.participants || [];
        setParticipants(list);
        if (list.length > 0) setSelectedCtx(list[0]["@id"]);

        // /api/assets returns flat array of {participantId, identity, assets[]} or { participants: [...] }
        const groups = Array.isArray(assetData)
          ? assetData
          : assetData.participants || [];
        const allAssets: Asset[] = [];
        for (const p of groups) {
          if (Array.isArray(p.assets)) {
            allAssets.push(...p.assets);
          }
        }
        setAssets(allAssets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);

    try {
      const res = await fetchApi("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: selectedCtx,
          name: assetName,
          description: assetDesc,
          contentType,
          baseUrl,
        }),
      });

      if (res.ok) {
        setCreateResult("Asset created successfully!");
        setAssetName("");
        setAssetDesc("");
        setBaseUrl("");
        // Refresh asset list
        const updated = await fetchApi(
          `/api/assets?participantId=${selectedCtx}`,
        );
        const data = await updated.json();
        setAssets(Array.isArray(data.assets) ? data.assets : []);
      } else {
        const err = await res.json();
        setCreateResult(`Error: ${err.error || "Creation failed"}`);
      }
    } catch {
      setCreateResult("Error: Failed to create asset");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <PageIntro
          title="Share Data"
          icon={Upload}
          description="Register data assets for sharing in the EHDS dataspace. Define FHIR or OMOP datasets with their access policies, then publish them so other participants can discover and negotiate access."
          prevStep={{ href: "/credentials", label: "Verifiable Credentials" }}
          nextStep={{ href: "/data/discover", label: "Discover Data" }}
          infoText="Each data asset is registered via the EDC-V management API with an ODRL policy. The asset becomes visible in the federated catalog once published."
          docLink={{ href: "/docs/developer", label: "Developer Guide" }}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          {(["existing", "create"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-layer2 text-layer2"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t === "existing" ? "My Assets" : "Register New"}
            </button>
          ))}
        </div>

        {tab === "existing" ? (
          loading ? (
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" />
              Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12">
              <Database size={40} className="text-gray-600 mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">
                No data assets registered yet
              </p>
              <button
                onClick={() => setTab("create")}
                className="mt-3 text-sm text-layer2 hover:underline"
              >
                Register your first asset →
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {assets.map((a) => {
                const id = a["@id"] || String(Math.random());
                const isOpen = expanded === id;
                return (
                  <div
                    key={id}
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
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-layer2">
                            {a.name ||
                              a["edc:name"] ||
                              a.properties?.name ||
                              a["@id"]}
                          </p>
                          {(a.description ||
                            a["edc:description"] ||
                            a.properties?.description) && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                              {
                                (a.description ||
                                  a["edc:description"] ||
                                  a.properties?.description) as string
                              }
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(a.contenttype ||
                            a["edc:contenttype"] ||
                            a.properties?.contenttype) && (
                            <span className="text-xs bg-gray-700 text-[var(--text-primary)] px-2 py-0.5 rounded-full">
                              {
                                (a.contenttype ||
                                  a["edc:contenttype"] ||
                                  a.properties?.contenttype) as string
                              }
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
                    {isOpen && <AssetDetailPanel asset={a} />}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Create new asset form */
          <div className="border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Upload size={18} className="text-layer2" />
              <h2 className="font-semibold text-sm">Register Data Asset</h2>
            </div>

            {createResult && (
              <div
                className={`mb-4 p-3 rounded text-sm ${
                  createResult.startsWith("Error")
                    ? "bg-[var(--role-admin-bg)] border border-[var(--role-admin-border)] text-[var(--role-admin-text)]"
                    : "bg-[var(--role-user-bg)] border border-[var(--role-user-border)] text-[var(--role-user-text)]"
                }`}
              >
                {createResult.startsWith("Error") ? null : (
                  <CheckCircle2 size={14} className="inline mr-1" />
                )}
                {createResult}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  Participant Context
                </label>
                <select
                  value={selectedCtx}
                  onChange={(e) => setSelectedCtx(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm"
                >
                  {participants.map((p) => (
                    <option key={p["@id"]} value={p["@id"]}>
                      {p.identity
                        ?.replace("did:web:", "")
                        .replace(/%3A/g, ":") || p["@id"].slice(0, 16)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    Asset Name
                  </label>
                  <input
                    type="text"
                    required
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="e.g. fhir-patient-cohort"
                    className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    Content Type
                  </label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm"
                  >
                    <option value="application/fhir+json">
                      FHIR R4 (application/fhir+json)
                    </option>
                    <option value="application/json">JSON</option>
                    <option value="text/csv">CSV</option>
                    <option value="application/x-ndjson">NDJSON</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  Description
                </label>
                <textarea
                  value={assetDesc}
                  onChange={(e) => setAssetDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe the dataset…"
                  className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  Data Source URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://fhir-server/Patient"
                  className="w-full px-3 py-2 bg-[var(--surface-2)] border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Register Asset
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
