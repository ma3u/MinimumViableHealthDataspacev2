"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, ShieldCheck } from "lucide-react";

interface PolicyGroup {
  participantId: string;
  identity: string;
  policies: unknown[];
  error?: string;
}

export default function AdminPoliciesPage() {
  const [groups, setGroups] = useState<PolicyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/admin/policies")
      .then((r) => (r.ok ? r.json() : {} as Record<string, unknown>))
      .then((d: Record<string, unknown>) => {
        setGroups((d.participants as typeof groups) || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalPolicies = groups.reduce(
    (sum, g) => sum + (Array.isArray(g.policies) ? g.policies.length : 0),
    0,
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Policy Definitions</h1>
      <p className="text-gray-400 text-sm mb-6">
        ODRL policies across all participant contexts
      </p>

      {!loading && (
        <div className="flex gap-4 mb-6 text-xs text-gray-500">
          <span>{groups.length} participants</span>
          <span>·</span>
          <span>{totalPolicies} total policies</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading policies…
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No policies found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => {
            const isOpen = expanded === g.participantId;
            const policies = Array.isArray(g.policies) ? g.policies : [];
            return (
              <div
                key={g.participantId}
                className={`border rounded-xl transition-colors ${
                  isOpen
                    ? "border-layer2 bg-gray-900/60"
                    : "border-gray-700 hover:border-layer2"
                }`}
              >
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpanded(isOpen ? null : g.participantId)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-200">
                        {g.identity
                          ?.replace("did:web:", "")
                          .replace(/%3A/g, ":") || g.participantId.slice(0, 16)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {policies.length} polic
                        {policies.length === 1 ? "y" : "ies"}
                        {g.error && (
                          <span className="text-red-400 ml-2">({g.error})</span>
                        )}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={16} className="text-gray-500" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-500" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                    {policies.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No policies defined
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {policies.map((p, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                          >
                            <pre className="text-xs text-gray-400 overflow-auto max-h-48">
                              {JSON.stringify(p, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
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
