"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Users,
} from "lucide-react";

interface Tenant {
  id: string;
  version: number;
  properties: Record<string, string>;
  participantProfiles: {
    dataspaceProfileId: string;
    participantContextId: string;
    tenantId: string;
  }[];
}

interface Participant {
  "@id": string;
  identity: string;
  state: string;
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/admin/tenants")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants || []);
        setParticipants(d.participants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Tenant Management</h1>
      <p className="text-gray-400 text-sm mb-6">
        All registered organizations and their participant profiles
      </p>

      {/* Summary */}
      {!loading && (
        <div className="flex gap-4 mb-6 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Building2 size={12} />
            {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {participants.length} participant context
            {participants.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading tenants…
        </div>
      ) : tenants.length === 0 ? (
        <p className="text-gray-500">No tenants registered</p>
      ) : (
        <div className="grid gap-3">
          {tenants.map((t) => {
            const isOpen = expanded === t.id;
            return (
              <div
                key={t.id}
                className={`border rounded-xl transition-colors ${
                  isOpen
                    ? "border-layer2 bg-gray-900/60"
                    : "border-gray-700 hover:border-layer2"
                }`}
              >
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 size={18} className="text-layer2 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-200">
                          {t.properties.displayName || t.id}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.properties.organization} · {t.properties.role} · v
                          {t.version} · {t.participantProfiles?.length || 0}{" "}
                          profile(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-layer2/20 text-layer2 px-2 py-0.5 rounded-full">
                        {t.properties.ehdsParticipantType || t.properties.role}
                      </span>
                      {isOpen ? (
                        <ChevronUp size={16} className="text-gray-500" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-500" />
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
                    {/* Properties */}
                    <div>
                      <h3 className="text-xs font-medium text-gray-500 mb-2">
                        Properties
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(t.properties).map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <span className="text-gray-500">{k}: </span>
                            <span className="text-gray-300">{v}</span>
                          </div>
                        ))}
                        <div className="text-xs">
                          <span className="text-gray-500">ID: </span>
                          <span className="text-gray-300 font-mono">
                            {t.id}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Participant profiles */}
                    {t.participantProfiles?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 mb-2">
                          Participant Profiles
                        </h3>
                        {t.participantProfiles.map((pp, i) => {
                          const ctx = participants.find(
                            (p) => p["@id"] === pp.participantContextId,
                          );
                          return (
                            <div
                              key={i}
                              className="p-2 rounded bg-gray-800/50 border border-gray-700 text-xs space-y-1 mb-2"
                            >
                              <div>
                                <span className="text-gray-500">
                                  Context ID:{" "}
                                </span>
                                <span className="text-gray-300 font-mono">
                                  {pp.participantContextId?.slice(0, 16)}…
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">DID: </span>
                                <span className="text-gray-300 font-mono">
                                  {ctx?.identity || "—"}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">State: </span>
                                <span
                                  className={`font-medium ${
                                    ctx?.state === "CREATED"
                                      ? "text-green-400"
                                      : "text-yellow-400"
                                  }`}
                                >
                                  {ctx?.state || "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
