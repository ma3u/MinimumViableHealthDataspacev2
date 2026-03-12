"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ScrollText,
  ArrowRightLeft,
  FileSignature,
  ShieldCheck,
  Filter,
  X,
  Download,
  Globe,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type AuditType = "all" | "transfers" | "negotiations" | "credentials";

interface Participant {
  did: string;
  name: string;
  country: string;
}

interface AuditFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  consumerDid: string;
  providerDid: string;
  crossBorder: string; // "" | "true" | "false"
}

interface TransferRow {
  id: string;
  status: string;
  timestamp?: string;
  transferDate?: string;
  consumerDid?: string;
  consumerName?: string;
  consumerCountryCode?: string;
  providerDid?: string;
  providerName?: string;
  providerCountryCode?: string;
  asset?: string;
  assetId?: string;
  protocol?: string;
  byteSize?: number;
  crossBorder?: boolean;
  policyId?: string;
  contentHash?: string;
  errorMessage?: string;
}

interface NegotiationRow {
  id: string;
  status: string;
  timestamp?: string;
  negotiationDate?: string;
  consumerDid?: string;
  consumerName?: string;
  consumerCountryCode?: string;
  providerDid?: string;
  providerName?: string;
  providerCountryCode?: string;
  asset?: string;
  assetId?: string;
  crossBorder?: boolean;
  policyId?: string;
  contentHash?: string;
  contractId?: string;
}

interface CredentialRow {
  participant?: string;
  credentialType?: string;
  type?: string;
  issuedAt?: string;
  issuanceDate?: string;
  subjectDid?: string;
}

interface AuditData {
  type: string;
  limit: number;
  transfers?: TransferRow[];
  negotiations?: NegotiationRow[];
  credentials?: CredentialRow[];
  summary?: { nodeCounts: Record<string, number> };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: AuditType; label: string; icon: typeof ScrollText }[] = [
  { key: "all", label: "Overview", icon: ScrollText },
  { key: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { key: "negotiations", label: "Negotiations", icon: FileSignature },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
];

const TRANSFER_STATUSES = ["COMPLETED", "IN_PROGRESS", "ERROR"];
const NEGOTIATION_STATUSES = [
  "CONFIRMED",
  "FINALIZED",
  "IN_PROGRESS",
  "TERMINATED",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "bg-green-900 text-green-300",
    CONFIRMED: "bg-blue-900 text-blue-300",
    FINALIZED: "bg-blue-900 text-blue-300",
    IN_PROGRESS: "bg-yellow-900 text-yellow-300",
    TERMINATED: "bg-red-900 text-red-300",
    ERROR: "bg-red-900 text-red-300",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
        map[status] ?? "bg-gray-800 text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}

function ehdsArticle(policyId?: string) {
  if (!policyId) return null;
  if (policyId.includes("53c") || policyId.includes("research"))
    return <span className="text-purple-400">Art. 53(c)</span>;
  if (policyId.includes("art7") || policyId.includes("cross-border"))
    return <span className="text-orange-400">Art. 7</span>;
  return <span className="text-gray-500">{policyId}</span>;
}

function shortHash(h?: string) {
  if (!h) return "—";
  return (
    <span title={h} className="font-mono text-gray-500">
      {h.slice(0, 8)}
    </span>
  );
}

function formatBytes(b?: number) {
  if (!b) return "—";
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

function displayName(name?: string, did?: string, country?: string) {
  const label =
    name || did?.replace("did:web:", "").replace(/%3A/g, ":") || "—";
  return country ? `${label} (${country})` : label;
}

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows
    .map((r) =>
      keys.map((k) => JSON.stringify(r[k] ?? "")).join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onClear,
  participants,
  tab,
}: {
  filters: AuditFilters;
  onChange: (f: Partial<AuditFilters>) => void;
  onClear: () => void;
  participants: Participant[];
  tab: AuditType;
}) {
  const statuses =
    tab === "transfers" ? TRANSFER_STATUSES : NEGOTIATION_STATUSES;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 mb-4 bg-gray-900 border border-gray-700 rounded-lg text-xs">
      <Filter size={13} className="text-gray-500 self-center mt-4" />

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-500">From</label>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-gray-500">To</label>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-32"
        />
      </div>

      {/* Status */}
      {tab !== "all" && tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-gray-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-36"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Consumer */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-gray-500">Consumer</label>
          <select
            value={filters.consumerDid}
            onChange={(e) => onChange({ consumerDid: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-44"
          >
            <option value="">All consumers</option>
            {participants.map((p) => (
              <option key={p.did} value={p.did}>
                {p.name} ({p.country ?? "?"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Provider */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-gray-500">Provider</label>
          <select
            value={filters.providerDid}
            onChange={(e) => onChange({ providerDid: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-44"
          >
            <option value="">All providers</option>
            {participants.map((p) => (
              <option key={p.did} value={p.did}>
                {p.name} ({p.country ?? "?"})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cross-border */}
      {tab !== "credentials" && (
        <div className="flex flex-col gap-1">
          <label className="text-gray-500">Cross-border</label>
          <select
            value={filters.crossBorder}
            onChange={(e) => onChange({ crossBorder: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 w-32"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 mt-4 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: AuditFilters = {
  status: "",
  dateFrom: "",
  dateTo: "",
  consumerDid: "",
  providerDid: "",
  crossBorder: "",
};

export default function AdminAuditPage() {
  const [activeTab, setActiveTab] = useState<AuditType>("all");
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Load participant list once for filter dropdowns
  useEffect(() => {
    fetchApi("/api/admin/audit?type=participants")
      .then((r) => r.json())
      .then((d) => setParticipants(d.participants || []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ type: activeTab, limit: "50" });
    if (filters.status) p.set("status", filters.status);
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) p.set("dateTo", filters.dateTo);
    if (filters.consumerDid) p.set("consumerDid", filters.consumerDid);
    if (filters.providerDid) p.set("providerDid", filters.providerDid);
    if (filters.crossBorder) p.set("crossBorder", filters.crossBorder);

    fetchApi(`/api/admin/audit?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateFilter = (patch: Partial<AuditFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold">Audit & Provenance</h1>
          <p className="text-gray-400 text-sm mt-1">
            Neo4j provenance graph — EHDS Art. 32 / GDPR Art. 30 compliant
            audit trail with SHA-256 hash chaining
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-5 mb-6 border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              setFilters(EMPTY_FILTERS);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? "border-layer2 text-layer2"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar (not on overview) */}
      {activeTab !== "all" && (
        <FilterBar
          filters={filters}
          onChange={updateFilter}
          onClear={() => setFilters(EMPTY_FILTERS)}
          participants={participants}
          tab={activeTab}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 mt-6">
          <Loader2 size={16} className="animate-spin" />
          Querying Neo4j…
        </div>
      ) : !data ? (
        <p className="text-gray-500 mt-6">Failed to load audit data</p>
      ) : (
        <>
          {/* Overview summary cards */}
          {activeTab === "all" && data.summary?.nodeCounts && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {Object.entries(data.summary.nodeCounts).map(([label, count]) => (
                <div
                  key={label}
                  className="p-3 border border-gray-700 rounded-lg"
                >
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Transfers ──────────────────────────────────────────────── */}
          {(activeTab === "all" || activeTab === "transfers") &&
            data.transfers && (
              <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <ArrowRightLeft size={14} className="text-layer2" />
                    Data Transfers ({data.transfers.length})
                  </h2>
                  {data.transfers.length > 0 && (
                    <button
                      onClick={() =>
                        exportCSV(
                          data.transfers as unknown as Record<
                            string,
                            unknown
                          >[],
                          "transfers.csv",
                        )
                      }
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      <Download size={12} /> Export CSV
                    </button>
                  )}
                </div>
                {data.transfers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No transfers recorded</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Consumer</th>
                          <th className="text-left py-2 px-2">Provider</th>
                          <th className="text-left py-2 px-2">Asset</th>
                          <th className="text-left py-2 px-2">Status</th>
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-left py-2 px-2">Protocol</th>
                          <th className="text-left py-2 px-2">Size</th>
                          <th className="text-left py-2 px-2">EHDS</th>
                          <th className="text-left py-2 px-2">Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.transfers.map((t, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-800 hover:bg-gray-800/50"
                          >
                            <td className="py-2 px-2 text-gray-300">
                              {displayName(
                                t.consumerName,
                                t.consumerDid,
                                t.consumerCountryCode,
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {displayName(
                                t.providerName,
                                t.providerDid,
                                t.providerCountryCode,
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-400">
                              {t.asset || t.assetId || "—"}
                            </td>
                            <td className="py-2 px-2">
                              {statusBadge(t.status)}
                              {t.errorMessage && (
                                <span
                                  title={String(t.errorMessage)}
                                  className="ml-1 text-red-400 cursor-help"
                                >
                                  ⚠
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(t.timestamp || t.transferDate || "—").slice(
                                0,
                                10,
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {t.protocol || "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {formatBytes(t.byteSize)}
                            </td>
                            <td className="py-2 px-2">
                              {t.crossBorder ? (
                                <span className="flex items-center gap-0.5 text-orange-400">
                                  <Globe size={10} />
                                  {ehdsArticle(t.policyId)}
                                </span>
                              ) : (
                                ehdsArticle(t.policyId)
                              )}
                            </td>
                            <td className="py-2 px-2">
                              {shortHash(t.contentHash)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

          {/* ── Negotiations ───────────────────────────────────────────── */}
          {(activeTab === "all" || activeTab === "negotiations") &&
            data.negotiations && (
              <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <FileSignature size={14} className="text-layer2" />
                    Contract Negotiations ({data.negotiations.length})
                  </h2>
                  {data.negotiations.length > 0 && (
                    <button
                      onClick={() =>
                        exportCSV(
                          data.negotiations as unknown as Record<
                            string,
                            unknown
                          >[],
                          "negotiations.csv",
                        )
                      }
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      <Download size={12} /> Export CSV
                    </button>
                  )}
                </div>
                {data.negotiations.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    No negotiations recorded
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Consumer</th>
                          <th className="text-left py-2 px-2">Provider</th>
                          <th className="text-left py-2 px-2">Asset</th>
                          <th className="text-left py-2 px-2">Status</th>
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-left py-2 px-2">EHDS</th>
                          <th className="text-left py-2 px-2">Contract ID</th>
                          <th className="text-left py-2 px-2">Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.negotiations.map((n, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-800 hover:bg-gray-800/50"
                          >
                            <td className="py-2 px-2 text-gray-300">
                              {displayName(
                                n.consumerName,
                                n.consumerDid,
                                n.consumerCountryCode,
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {displayName(
                                n.providerName,
                                n.providerDid,
                                n.providerCountryCode,
                              )}
                            </td>
                            <td className="py-2 px-2 text-gray-400">
                              {n.asset || n.assetId || "—"}
                            </td>
                            <td className="py-2 px-2">
                              {statusBadge(n.status)}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(
                                n.timestamp ||
                                n.negotiationDate ||
                                "—"
                              ).slice(0, 10)}
                            </td>
                            <td className="py-2 px-2">
                              {n.crossBorder ? (
                                <span className="flex items-center gap-0.5 text-orange-400">
                                  <Globe size={10} />
                                  {ehdsArticle(n.policyId)}
                                </span>
                              ) : (
                                ehdsArticle(n.policyId)
                              )}
                            </td>
                            <td className="py-2 px-2 font-mono text-gray-500">
                              {n.contractId || "—"}
                            </td>
                            <td className="py-2 px-2">
                              {shortHash(n.contentHash)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

          {/* ── Credentials ────────────────────────────────────────────── */}
          {(activeTab === "all" || activeTab === "credentials") &&
            data.credentials && (
              <section className="mb-8">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-layer2" />
                  Verifiable Credentials ({data.credentials.length})
                </h2>
                {data.credentials.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    No credentials recorded
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Participant</th>
                          <th className="text-left py-2 px-2">Type</th>
                          <th className="text-left py-2 px-2">Issued</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.credentials.map((c, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-800 hover:bg-gray-800/50"
                          >
                            <td className="py-2 px-2 text-gray-300">
                              {c.participant ||
                                c.subjectDid
                                  ?.replace("did:web:", "")
                                  .replace(/%3A/g, ":") ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {c.credentialType || c.type || "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(c.issuedAt || c.issuanceDate || "—").slice(
                                0,
                                10,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
        </>
      )}
    </div>
  );
}

