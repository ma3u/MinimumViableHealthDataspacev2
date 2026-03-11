"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Loader2,
  Upload,
  Database,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

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
  [key: string]: unknown;
}

type Tab = "existing" | "create";

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
        const list: ParticipantCtx[] = Array.isArray(ctx) ? ctx : ctx.participants || [];
        setParticipants(list);
        if (list.length > 0) setSelectedCtx(list[0]["@id"]);

        // /api/assets returns flat array of {participantId, identity, assets[]} or { participants: [...] }
        const groups = Array.isArray(assetData) ? assetData : assetData.participants || [];
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
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Share Data</h1>
      <p className="text-gray-400 text-sm mb-6">
        Register data assets for sharing in the EHDS dataspace
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {(["existing", "create"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-layer2 text-layer2"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "existing" ? "My Assets" : "Register New"}
          </button>
        ))}
      </div>

      {tab === "existing" ? (
        loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Loading assets…
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-12">
            <Database size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No data assets registered yet</p>
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
                      ? "border-layer2 bg-gray-900/60"
                      : "border-gray-700 hover:border-layer2"
                  }`}
                >
                  <button
                    className="w-full text-left p-4"
                    onClick={() => setExpanded(isOpen ? null : id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-layer2">
                          {a["edc:name"] || a["@id"]}
                        </p>
                        {a["edc:description"] && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {a["edc:description"] as string}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {a["edc:contenttype"] && (
                          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                            {a["edc:contenttype"] as string}
                          </span>
                        )}
                        {isOpen ? (
                          <ChevronUp size={16} className="text-gray-500" />
                        ) : (
                          <ChevronDown size={16} className="text-gray-500" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                      <pre className="text-xs text-gray-400 overflow-auto max-h-60">
                        {JSON.stringify(a, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Create new asset form */
        <div className="border border-gray-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Upload size={18} className="text-layer2" />
            <h2 className="font-semibold text-sm">Register Data Asset</h2>
          </div>

          {createResult && (
            <div
              className={`mb-4 p-3 rounded text-sm ${
                createResult.startsWith("Error")
                  ? "bg-red-900/40 border border-red-700 text-red-300"
                  : "bg-green-900/40 border border-green-700 text-green-300"
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
              <label className="text-xs text-gray-400 mb-1 block">
                Participant Context
              </label>
              <select
                value={selectedCtx}
                onChange={(e) => setSelectedCtx(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
              >
                {participants.map((p) => (
                  <option key={p["@id"]} value={p["@id"]}>
                    {p.identity?.replace("did:web:", "").replace(/%3A/g, ":") ||
                      p["@id"].slice(0, 16)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Asset Name
                </label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g. fhir-patient-cohort"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Content Type
                </label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm"
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
              <label className="text-xs text-gray-400 mb-1 block">
                Description
              </label>
              <textarea
                value={assetDesc}
                onChange={(e) => setAssetDesc(e.target.value)}
                rows={2}
                placeholder="Describe the dataset…"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Data Source URL
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://fhir-server/Patient"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-layer2 text-white rounded-lg text-sm font-medium hover:bg-layer2/90 disabled:opacity-50"
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
  );
}
