"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import PageIntro from "@/components/PageIntro";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Users,
} from "lucide-react";

interface VPA {
  id: string;
  state: string;
  type: string;
  cellId: string;
}

interface ProfileProperties {
  "cfm.vpa.state"?: {
    participantContextId?: string;
    credentialRequest?: string;
    holderPid?: string;
  };
  displayName?: string;
  [key: string]: unknown;
}

interface ParticipantProfile {
  id: string;
  version: number;
  identifier: string; // DID
  tenantId: string;
  participantRoles: Record<string, string[]>;
  vpas: VPA[];
  properties: ProfileProperties;
  error?: boolean;
}

interface Tenant {
  id: string;
  version: number;
  properties: Record<string, string>;
  participantProfiles: ParticipantProfile[];
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
      .then((r) => (r.ok ? r.json() : ({} as Record<string, unknown>)))
      .then((d: Record<string, unknown>) => {
        setTenants((d.tenants as Tenant[]) || []);
        setParticipants((d.participants as Participant[]) || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Tenant Management"
        icon={Building2}
        description="View and manage all registered organisations and their participant profiles. Each tenant represents an EHDS participant with one or more dataspace contexts for data sharing and consumption."
        prevStep={{ href: "/admin", label: "Operator Dashboard" }}
        nextStep={{ href: "/admin/policies", label: "Policy Definitions" }}
        infoText="Tenants are created during onboarding via the tenant-manager API. Each participant context maps to a DID:web identity and contains EDC-V connector credentials for secure data exchange."
        docLink={{ href: "/docs/developer", label: "Developer Guide" }}
      />

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
                          Dataspace Profiles
                        </h3>
                        {t.participantProfiles.map((pp, i) => {
                          const ctxId =
                            pp.properties?.["cfm.vpa.state"]?.participantContextId;
                          const ctx = ctxId
                            ? participants.find((p) => p["@id"] === ctxId)
                            : undefined;
                          const roles = Object.values(
                            pp.participantRoles || {},
                          ).flat();
                          const allDisposed =
                            pp.vpas?.length > 0 &&
                            pp.vpas.every((v) => v.state === "disposed");
                          const allActive =
                            pp.vpas?.length > 0 &&
                            pp.vpas.every((v) => v.state === "active");

                          return (
                            <div
                              key={i}
                              className={`p-3 rounded-lg border text-xs space-y-2 mb-2 ${
                                pp.error
                                  ? "border-yellow-700/60 bg-yellow-900/10"
                                  : "border-gray-700 bg-gray-800/50"
                              }`}
                            >
                              {/* VPA status banner */}
                              {allDisposed && (
                                <div className="flex items-center gap-1.5 text-yellow-400 text-[11px]">
                                  <AlertTriangle size={12} />
                                  VPAs disposed — re-run{" "}
                                  <code className="bg-yellow-900/40 px-1 rounded text-yellow-300">
                                    seed-health-tenants.sh
                                  </code>{" "}
                                  to re-provision
                                </div>
                              )}

                              {/* Profile ID + DID */}
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <div>
                                  <span className="text-gray-500">
                                    Profile ID{" "}
                                  </span>
                                  <span className="text-gray-300 font-mono">
                                    {pp.id}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">
                                    DID{" "}
                                  </span>
                                  <span className="text-gray-300 font-mono break-all">
                                    {pp.identifier
                                      ? decodeURIComponent(pp.identifier)
                                      : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">
                                    Participant Ctx{" "}
                                  </span>
                                  <span className="text-gray-300 font-mono">
                                    {ctxId || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">
                                    Roles{" "}
                                  </span>
                                  <span className="text-gray-300">
                                    {roles.length > 0 ? roles.join(", ") : "—"}
                                  </span>
                                </div>
                              </div>

                              {/* Participant context state */}
                              {ctx && (
                                <div>
                                  <span className="text-gray-500">
                                    Participant State:{" "}
                                  </span>
                                  <span
                                    className={`font-medium ${
                                      ctx.state === "ACTIVE"
                                        ? "text-green-400"
                                        : ctx.state === "CREATED"
                                          ? "text-blue-400"
                                          : "text-yellow-400"
                                    }`}
                                  >
                                    {ctx.state}
                                  </span>
                                </div>
                              )}

                              {/* VPA list */}
                              {pp.vpas?.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {pp.vpas.map((v) => (
                                    <span
                                      key={v.id}
                                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                        v.state === "active"
                                          ? "bg-green-900/30 text-green-400"
                                          : v.state === "disposed"
                                            ? "bg-gray-700/50 text-gray-500"
                                            : v.state === "provisioning"
                                              ? "bg-blue-900/30 text-blue-400"
                                              : "bg-yellow-900/30 text-yellow-400"
                                      }`}
                                    >
                                      <Circle
                                        size={6}
                                        className={
                                          v.state === "active"
                                            ? "fill-green-400"
                                            : v.state === "disposed"
                                              ? "fill-gray-500"
                                              : "fill-yellow-400"
                                        }
                                      />
                                      {v.type.replace("cfm.", "")}{" "}
                                      <span className="opacity-70">
                                        {v.state}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
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
