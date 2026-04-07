"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Users,
  ShieldCheck,
  Activity,
  Clock,
  Edit,
} from "lucide-react";
import Link from "next/link";

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
  identifier: string;
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

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; level: string }
> = {
  EDC_ADMIN: {
    label: "Admin",
    color: "text-[var(--role-admin-text)]",
    bg: "bg-[var(--role-admin-bg)]",
    level: "Level 4",
  },
  DATA_HOLDER: {
    label: "Data Holder",
    color: "text-[var(--role-holder-text)]",
    bg: "bg-[var(--role-holder-bg)]",
    level: "Level 3",
  },
  DATA_USER: {
    label: "Researcher",
    color: "text-[var(--role-user-text)]",
    bg: "bg-[var(--role-user-bg)]",
    level: "Level 2",
  },
  HDAB_AUTHORITY: {
    label: "HDAB",
    color: "text-[var(--role-hdab-text)]",
    bg: "bg-[var(--role-hdab-bg)]",
    level: "Level 3",
  },
  TRUST_CENTER_OPERATOR: {
    label: "Trust Center",
    color: "text-[var(--role-trust-text)]",
    bg: "bg-[var(--role-trust-bg)]",
    level: "Level 3",
  },
  PATIENT: {
    label: "Patient",
    color: "text-[var(--role-patient-text)]",
    bg: "bg-[var(--role-patient-bg)]",
    level: "Level 1",
  },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] ?? {
    label: role,
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--surface-2)]",
    level: "—",
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold ${cfg.color} ${cfg.bg}`}
    >
      {cfg.level}
    </span>
  );
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

  const totalProfiles = tenants.reduce(
    (s, t) => s + (t.participantProfiles?.length || 0),
    0,
  );
  const activeParticipants = participants.filter(
    (p) => p.state === "ACTIVE",
  ).length;
  const disposedCount = tenants.reduce((s, t) => {
    return (
      s +
      (t.participantProfiles || []).reduce((ps, pp) => {
        const allDisposed =
          pp.vpas?.length > 0 && pp.vpas.every((v) => v.state === "disposed");
        return ps + (allDisposed ? 1 : 0);
      }, 0)
    );
  }, 0);

  // RBAC summary counts
  const roleCounts: Record<string, number> = {};
  tenants.forEach((t) => {
    const role =
      t.properties.ehdsParticipantType || t.properties.role || "Unknown";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="px-8 py-10 max-w-7xl mx-auto space-y-8">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-header">Tenant Management</h1>
            <p className="text-[var(--text-secondary)] text-lg mt-1">
              Manage EHDS participant organisations, roles, and dataspace access
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-bold text-[var(--accent)] hover:underline uppercase tracking-wider"
          >
            ← Operator Dashboard
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading tenants…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* ── Left column: stats + table ── */}
              <div className="lg:col-span-8 space-y-6">
                {/* Bento stat grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="stat-card border-l-[var(--accent)]">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-[var(--accent)]/5 rounded-lg">
                        <Building2 size={20} className="text-[var(--accent)]" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      Total Tenants
                    </p>
                    <p className="text-3xl font-black text-[var(--text-primary)] mt-1 tabular-nums">
                      {tenants.length}
                    </p>
                  </div>
                  <div className="stat-card border-l-[var(--success-text)]">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-[var(--success)]/5 rounded-lg">
                        <Activity
                          size={20}
                          className="text-[var(--success-text)]"
                        />
                      </div>
                      {activeParticipants > 0 && (
                        <span className="text-xs font-bold text-[var(--success-text)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
                          {activeParticipants} active
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      Participant Profiles
                    </p>
                    <p className="text-3xl font-black text-[var(--text-primary)] mt-1 tabular-nums">
                      {totalProfiles}
                    </p>
                  </div>
                  <div className="stat-card border-l-[var(--warning-text)]">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-[var(--warning)]/5 rounded-lg">
                        <Clock
                          size={20}
                          className="text-[var(--warning-text)]"
                        />
                      </div>
                      {disposedCount > 0 && (
                        <span className="animate-pulse w-2 h-2 rounded-full bg-[var(--warning)]" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      Disposed VPAs
                    </p>
                    <p className="text-3xl font-black text-[var(--text-primary)] mt-1 tabular-nums">
                      {disposedCount}
                    </p>
                  </div>
                </div>

                {/* Tenants table */}
                <div className="bg-[var(--surface-card)] rounded-xl shadow-sm overflow-hidden border border-[var(--border)]">
                  <div className="p-6 border-b border-[var(--border)] flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">
                      Registered Organisations
                    </h3>
                    <Link
                      href="/admin/policies"
                      className="px-4 py-2 text-sm font-bold text-white bg-[var(--accent)] rounded-xl hover:opacity-90 transition-opacity"
                    >
                      Policy Definitions →
                    </Link>
                  </div>

                  {tenants.length === 0 ? (
                    <p className="p-6 text-[var(--text-secondary)] text-sm">
                      No tenants registered — connect to live stack
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-[var(--surface)] text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4">Organisation</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Access Level</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {tenants.map((t) => {
                            const isOpen = expanded === t.id;
                            const role =
                              t.properties.ehdsParticipantType ||
                              t.properties.role ||
                              "Unknown";
                            const roleCfg = ROLE_CONFIG[role] ?? null;
                            const allVpasDisposed = (
                              t.participantProfiles || []
                            ).some(
                              (pp) =>
                                pp.vpas?.length > 0 &&
                                pp.vpas.every((v) => v.state === "disposed"),
                            );

                            return (
                              <>
                                <tr
                                  key={t.id}
                                  className="hover:bg-[var(--surface)] transition-colors"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                                        <Building2
                                          size={18}
                                          className="text-[var(--accent)]"
                                        />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-[var(--text-primary)]">
                                          {t.properties.displayName || t.id}
                                        </p>
                                        <p className="text-[10px] text-[var(--text-secondary)]">
                                          {t.properties.organization || t.id}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-[var(--text-primary)]">
                                    {roleCfg?.label ?? role}
                                  </td>
                                  <td className="px-6 py-4">
                                    <RoleBadge role={role} />
                                  </td>
                                  <td className="px-6 py-4">
                                    {allVpasDisposed ? (
                                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--warning-text)]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                                        Disposed
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--success-text)]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                                        Active
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() =>
                                        setExpanded(isOpen ? null : t.id)
                                      }
                                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                                      aria-label={
                                        isOpen
                                          ? "Collapse details"
                                          : "Expand details"
                                      }
                                    >
                                      {isOpen ? (
                                        <ChevronUp size={16} />
                                      ) : (
                                        <ChevronDown size={16} />
                                      )}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded detail row */}
                                {isOpen && (
                                  <tr key={`${t.id}-detail`}>
                                    <td
                                      colSpan={5}
                                      className="px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)]"
                                    >
                                      <div className="space-y-4">
                                        {/* Properties */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                          {Object.entries(t.properties)
                                            .filter(
                                              ([k]) => k !== "displayName",
                                            )
                                            .map(([k, v]) => (
                                              <div
                                                key={k}
                                                className="bg-[var(--surface-card)] rounded-xl px-3 py-2.5"
                                              >
                                                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                                                  {k}
                                                </p>
                                                <p className="text-xs text-[var(--text-primary)] font-medium mt-0.5 break-all">
                                                  {v}
                                                </p>
                                              </div>
                                            ))}
                                          <div className="bg-[var(--surface-card)] rounded-xl px-3 py-2.5">
                                            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                                              Tenant ID
                                            </p>
                                            <p className="text-xs text-[var(--text-primary)] font-mono mt-0.5 break-all">
                                              {t.id}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Participant profiles */}
                                        {t.participantProfiles?.length > 0 && (
                                          <div>
                                            <p className="section-label">
                                              Dataspace Profiles
                                            </p>
                                            <div className="grid md:grid-cols-2 gap-3">
                                              {t.participantProfiles.map(
                                                (pp, i) => {
                                                  const ctxId =
                                                    pp.properties?.[
                                                      "cfm.vpa.state"
                                                    ]?.participantContextId;
                                                  const ctx = ctxId
                                                    ? participants.find(
                                                        (p) =>
                                                          p["@id"] === ctxId,
                                                      )
                                                    : undefined;
                                                  const roles = Object.values(
                                                    pp.participantRoles || {},
                                                  ).flat();
                                                  const allDisposed =
                                                    pp.vpas?.length > 0 &&
                                                    pp.vpas.every(
                                                      (v) =>
                                                        v.state === "disposed",
                                                    );

                                                  return (
                                                    <div
                                                      key={i}
                                                      className={`p-4 rounded-xl border text-xs space-y-3 ${
                                                        pp.error
                                                          ? "border-[var(--warning)]/30 bg-[var(--warning)]/5"
                                                          : "border-[var(--border)] bg-[var(--surface-card)]"
                                                      }`}
                                                    >
                                                      {allDisposed && (
                                                        <div className="flex items-center gap-1.5 text-[var(--warning-text)] text-[11px]">
                                                          <AlertTriangle
                                                            size={12}
                                                          />
                                                          VPAs disposed — re-run{" "}
                                                          <code className="bg-[var(--warning)]/10 px-1 rounded font-mono">
                                                            seed-health-tenants.sh
                                                          </code>
                                                        </div>
                                                      )}
                                                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                        <div>
                                                          <span className="text-[var(--text-secondary)]">
                                                            Profile ID{" "}
                                                          </span>
                                                          <span className="text-[var(--text-primary)] font-mono">
                                                            {pp.id}
                                                          </span>
                                                        </div>
                                                        <div>
                                                          <span className="text-[var(--text-secondary)]">
                                                            DID{" "}
                                                          </span>
                                                          <span className="text-[var(--text-primary)] font-mono break-all">
                                                            {pp.identifier
                                                              ? decodeURIComponent(
                                                                  pp.identifier,
                                                                )
                                                              : "—"}
                                                          </span>
                                                        </div>
                                                        <div>
                                                          <span className="text-[var(--text-secondary)]">
                                                            Roles{" "}
                                                          </span>
                                                          <span className="text-[var(--text-primary)]">
                                                            {roles.length > 0
                                                              ? roles.join(", ")
                                                              : "—"}
                                                          </span>
                                                        </div>
                                                        {ctx && (
                                                          <div>
                                                            <span className="text-[var(--text-secondary)]">
                                                              State{" "}
                                                            </span>
                                                            <span
                                                              className={`font-bold ${
                                                                ctx.state ===
                                                                "ACTIVE"
                                                                  ? "text-[var(--success-text)]"
                                                                  : ctx.state ===
                                                                      "CREATED"
                                                                    ? "text-[var(--accent)]"
                                                                    : "text-[var(--warning-text)]"
                                                              }`}
                                                            >
                                                              {ctx.state}
                                                            </span>
                                                          </div>
                                                        )}
                                                      </div>
                                                      {pp.vpas?.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                          {pp.vpas.map((v) => (
                                                            <span
                                                              key={v.id}
                                                              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                                                                v.state ===
                                                                "active"
                                                                  ? "bg-[var(--success)]/10 text-[var(--success-text)]"
                                                                  : v.state ===
                                                                      "disposed"
                                                                    ? "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                                                                    : "bg-[var(--warning)]/10 text-[var(--warning-text)]"
                                                              }`}
                                                            >
                                                              <Circle
                                                                size={5}
                                                                className={
                                                                  v.state ===
                                                                  "active"
                                                                    ? "fill-[var(--success)]"
                                                                    : "fill-current opacity-50"
                                                                }
                                                              />
                                                              {v.type.replace(
                                                                "cfm.",
                                                                "",
                                                              )}{" "}
                                                              {v.state}
                                                            </span>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                },
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right column: RBAC Summary ── */}
              <div className="lg:col-span-4">
                <div className="bg-[var(--surface)] rounded-xl p-8 h-full">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6">
                    RBAC Summary
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        role: "EDC_ADMIN",
                        icon: ShieldCheck,
                        label: "Administrators",
                        sub: "Full Access (L4)",
                        color: "text-[var(--role-admin-text)]",
                        bg: "bg-[var(--role-admin-bg)]",
                      },
                      {
                        role: "DATA_HOLDER",
                        icon: Building2,
                        label: "Data Holders",
                        sub: "Write Access (L3)",
                        color: "text-[var(--role-holder-text)]",
                        bg: "bg-[var(--role-holder-bg)]",
                      },
                      {
                        role: "DATA_USER",
                        icon: Users,
                        label: "Researchers",
                        sub: "Read-only (L1–2)",
                        color: "text-[var(--role-user-text)]",
                        bg: "bg-[var(--role-user-bg)]",
                      },
                      {
                        role: "HDAB_AUTHORITY",
                        icon: ShieldCheck,
                        label: "HDAB",
                        sub: "Governance (L3)",
                        color: "text-[var(--role-hdab-text)]",
                        bg: "bg-[var(--role-hdab-bg)]",
                      },
                    ].map(({ role, icon: Icon, label, sub, color, bg }) => (
                      <div
                        key={role}
                        className="flex items-center justify-between p-4 bg-[var(--surface-card)] rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}
                          >
                            <Icon size={18} className={color} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[var(--text-primary)]">
                              {label}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {sub}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-[var(--text-primary)] tabular-nums">
                          {roleCounts[role] ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Security notice */}
                  <div className="mt-8 p-6 bg-[var(--accent)] text-white rounded-xl">
                    <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-80">
                      Security Notice
                    </p>
                    <p className="text-sm mb-4 opacity-90">
                      All Level 4 changes require secondary hardware key
                      validation per EHDS Art. 50.
                    </p>
                    <Link
                      href="/admin/audit"
                      className="text-xs font-bold border border-white/30 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors inline-block"
                    >
                      Audit Logs
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
