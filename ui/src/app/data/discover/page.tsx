"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import PageIntro from "@/components/PageIntro";
import {
  Loader2,
  Search,
  Database,
  ChevronDown,
  ChevronUp,
  FileSignature,
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

export default function DataDiscoverPage() {
  const [groups, setGroups] = useState<ParticipantAssets[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        // /api/assets returns flat array of {participantId, identity, assets[]} or { participants: [...] }
        setGroups(Array.isArray(d) ? d : d.participants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Flatten all assets for filtering
  const allAssets = groups.flatMap((g) =>
    (g.assets || []).map((a) => ({
      ...a,
      _participantId: g.participantId,
      _identity: g.identity,
    })),
  );

  const visible = filter
    ? allAssets.filter((a) => {
        const q = filter.toLowerCase();
        return (
          assetField(a, "name").toLowerCase().includes(q) ||
          assetField(a, "description").toLowerCase().includes(q) ||
          a["@id"]?.toLowerCase().includes(q)
        );
      })
    : allAssets;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Discover Data"
        icon={Search}
        description="Browse available data assets across all dataspace participants. Search by name, description, or ID to find datasets published by data holders, then initiate a contract negotiation to request access."
        prevStep={{ href: "/data/share", label: "Share Data" }}
        nextStep={{ href: "/negotiate", label: "Negotiate Contract" }}
        infoText="Assets shown here are fetched from the EDC-V federated catalog. Each asset includes its ODRL policy — review it before negotiating access."
        docLink={{ href: "/docs/user-guide", label: "User Guide" }}
      />

      {/* Search bar */}
      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="search"
          placeholder="Search assets by name, description or ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm outline-none focus:border-layer2"
        />
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="flex gap-4 mb-6 text-xs text-gray-500">
          <span>
            {groups.length} participant{groups.length !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>
            {allAssets.length} asset{allAssets.length !== 1 ? "s" : ""}
          </span>
          {filter && (
            <>
              <span>·</span>
              <span>{visible.length} matching</span>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Querying federated catalog…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12">
          <Database size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {filter ? "No assets match your search" : "No assets available"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((a) => {
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-sm text-layer2">
                        {assetField(a, "name")}
                      </h2>
                      {assetField(a, "description") && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
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
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                          {assetField(a, "contenttype")}
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
                    <pre className="text-xs text-gray-400 overflow-auto max-h-48 mb-3">
                      {JSON.stringify(a, null, 2)}
                    </pre>
                    <a
                      href={`/negotiate?assetId=${a["@id"]}&providerId=${a._participantId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-layer2 text-white rounded text-xs font-medium hover:bg-layer2/90"
                    >
                      <FileSignature size={14} />
                      Negotiate Access
                    </a>
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
