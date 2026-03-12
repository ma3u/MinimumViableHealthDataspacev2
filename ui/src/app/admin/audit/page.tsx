"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Loader2,
  ScrollText,
  ArrowRightLeft,
  FileSignature,
  ShieldCheck,
} from "lucide-react";

type AuditType = "all" | "transfers" | "negotiations" | "credentials";

interface AuditData {
  type: string;
  limit: number;
  transfers?: Record<string, unknown>[];
  negotiations?: Record<string, unknown>[];
  credentials?: Record<string, unknown>[];
  summary?: {
    nodeCounts: Record<string, number>;
  };
}

const TABS: { key: AuditType; label: string; icon: typeof ScrollText }[] = [
  { key: "all", label: "Overview", icon: ScrollText },
  { key: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { key: "negotiations", label: "Negotiations", icon: FileSignature },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
];

export default function AdminAuditPage() {
  const [activeTab, setActiveTab] = useState<AuditType>("all");
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchApi(`/api/admin/audit?type=${activeTab}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Audit & Provenance</h1>
      <p className="text-gray-400 text-sm mb-6">
        Neo4j provenance graph — transfers, negotiations, credentials
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
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

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Querying Neo4j…
        </div>
      ) : !data ? (
        <p className="text-gray-500">Failed to load audit data</p>
      ) : (
        <>
          {/* Summary cards (only on overview) */}
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

          {/* Transfer section */}
          {(activeTab === "all" || activeTab === "transfers") &&
            data.transfers && (
              <section className="mb-8">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <ArrowRightLeft size={14} className="text-layer2" />
                  Data Transfers ({data.transfers.length})
                </h2>
                {data.transfers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No transfers recorded</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Participant</th>
                          <th className="text-left py-2 px-2">Asset</th>
                          <th className="text-left py-2 px-2">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.transfers.map((t, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-800 hover:bg-gray-800/50"
                          >
                            <td className="py-2 px-2 text-gray-300">
                              {(t.participant as string) ||
                                (t.consumerDid as string)
                                  ?.replace("did:web:", "")
                                  .replace(/%3A/g, ":") ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {(t.asset as string) ||
                                (t.assetId as string) ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(t.timestamp as string)?.slice(0, 10) ||
                                (t.transferDate as string) ||
                                "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

          {/* Negotiation section */}
          {(activeTab === "all" || activeTab === "negotiations") &&
            data.negotiations && (
              <section className="mb-8">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <FileSignature size={14} className="text-layer2" />
                  Contract Negotiations ({data.negotiations.length})
                </h2>
                {data.negotiations.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    No negotiations recorded
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Participant</th>
                          <th className="text-left py-2 px-2">Asset</th>
                          <th className="text-left py-2 px-2">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.negotiations.map((n, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-800 hover:bg-gray-800/50"
                          >
                            <td className="py-2 px-2 text-gray-300">
                              {(n.participant as string) ||
                                (n.consumerDid as string)
                                  ?.replace("did:web:", "")
                                  .replace(/%3A/g, ":") ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {(n.asset as string) ||
                                (n.assetId as string) ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(n.timestamp as string)?.slice(0, 10) ||
                                (n.negotiationDate as string) ||
                                "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

          {/* Credentials section */}
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
                              {(c.participant as string) ||
                                (c.subjectDid as string)
                                  ?.replace("did:web:", "")
                                  .replace(/%3A/g, ":") ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-300">
                              {(c.credentialType as string) ||
                                (c.type as string) ||
                                "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-500">
                              {(c.issuedAt as string)?.slice(0, 10) ||
                                (c.issuanceDate as string) ||
                                "—"}
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
