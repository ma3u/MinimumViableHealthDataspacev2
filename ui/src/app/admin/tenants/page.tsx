"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Circle,
  Info,
  Loader2,
  Users,
  ShieldCheck,
  Activity,
  Clock,
  Edit,
} from "lucide-react";
import Link from "next/link";
import { T, useT } from "@/lib/i18n/translate";

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

// CFM TenantManager stores roles in its own taxonomy
// (CLINIC/CRO/HDAB/REGISTRY/etc.) which doesn't match the EDC role names
// (DATA_HOLDER/DATA_USER/HDAB_AUTHORITY/EDC_ADMIN) the rest of this page,
// the Role badge, and the RBAC Summary panel were originally written
// against. Map CFM → EDC here so every consumer (badge label, access
// level pill, RBAC counts) lights up consistently.
const CFM_TO_EDC_ROLE: Record<string, string> = {
  CLINIC: "DATA_HOLDER",
  HOSPITAL: "DATA_HOLDER",
  REGISTRY: "DATA_HOLDER",
  CRO: "DATA_USER",
  PHARMA: "DATA_USER",
  RESEARCHER: "DATA_USER",
  HDAB: "HDAB_AUTHORITY",
  AUTHORITY: "HDAB_AUTHORITY",
  OPERATOR: "EDC_ADMIN",
  ADMIN: "EDC_ADMIN",
};

function normalizeRole(t: Tenant): string {
  const raw =
    t.properties.ehdsParticipantType || t.properties.role || "Unknown";
  return CFM_TO_EDC_ROLE[raw.toUpperCase()] ?? raw;
}

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; level: number }
> = {
  EDC_ADMIN: {
    label: "Admin",
    color: "text-(--role-admin-text)",
    bg: "bg-(--role-admin-bg)",
    level: 4,
  },
  DATA_HOLDER: {
    label: "Data Holder",
    color: "text-(--role-holder-text)",
    bg: "bg-(--role-holder-bg)",
    level: 3,
  },
  DATA_USER: {
    label: "Researcher",
    color: "text-(--role-user-text)",
    bg: "bg-(--role-user-bg)",
    level: 2,
  },
  HDAB_AUTHORITY: {
    label: "HDAB",
    color: "text-(--role-hdab-text)",
    bg: "bg-(--role-hdab-bg)",
    level: 3,
  },
  TRUST_CENTER_OPERATOR: {
    label: "Trust Center",
    color: "text-(--role-trust-text)",
    bg: "bg-(--role-trust-bg)",
    level: 3,
  },
  PATIENT: {
    label: "Patient",
    color: "text-(--role-patient-text)",
    bg: "bg-(--role-patient-bg)",
    level: 1,
  },
};

function RoleBadge({ role }: { role: string }) {
  const t = useT("admin");
  const cfg = ROLE_CONFIG[role];
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold ${
        cfg?.color ?? "text-(--text-secondary)"
      } ${cfg?.bg ?? "bg-(--surface-2)"}`}
    >
      {cfg ? t("Level {n}", { n: cfg.level }) : "—"}
    </span>
  );
}

export default function AdminTenantsPage() {
  const t = useT("admin");
  const tc = useT("common");
  // A role name the common area already has comes from there (#782).
  const roleLabel = (label: string) => {
    const shared = tc(label);
    return shared !== label ? shared : t(label);
  };
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
    (s, tn) => s + (tn.participantProfiles?.length || 0),
    0,
  );
  const activeParticipants = participants.filter(
    (p) => p.state === "ACTIVE",
  ).length;
  const disposedCount = tenants.reduce((s, tn) => {
    return (
      s +
      (tn.participantProfiles || []).reduce((ps, pp) => {
        const allDisposed =
          pp.vpas?.length > 0 && pp.vpas.every((v) => v.state === "disposed");
        return ps + (allDisposed ? 1 : 0);
      }, 0)
    );
  }, 0);

  const roleCounts: Record<string, number> = {};
  tenants.forEach((tn) => {
    const role = normalizeRole(tn);
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-(--bg)">
      <main className="px-8 py-10 max-w-7xl mx-auto space-y-8">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-header">{t("Tenant Management")}</h1>
            <p className="text-(--text-secondary) text-lg mt-1">
              {t(
                "Manage EHDS participant organisations, roles, and dataspace access",
              )}
            </p>
            <p className="text-xs text-(--text-secondary) mt-2 max-w-2xl flex items-start gap-1.5">
              <Info size={14} className="mt-0.5 shrink-0 text-(--accent)" />
              <span>
                <T
                  area="admin"
                  tags={{
                    b: <strong className="text-(--text-primary)" />,
                    c: <code />,
                  }}
                >
                  {
                    "<b>VPA (Virtual Participant Agent)</b>: a runtime instance provisioned by the CFM Tenant Manager for a participant. Each tenant typically runs three VPAs: <c>cfm.connector</c> (EDC-V control plane), <c>cfm.credentialservice</c> (IdentityHub), and <c>cfm.dataplane</c> (DCore data plane). State <c>disposed</c> means the agent was terminated by a demo reset; re-seed the tenants to recreate."
                  }
                </T>
              </span>
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-bold text-(--accent) hover:underline uppercase tracking-wider"
          >
            ← {t("Operator Dashboard")}
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary)">
            <Loader2 size={16} className="animate-spin" />
            {t("Loading tenants…")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* ── Left column: stats + table ── */}
              <div className="lg:col-span-8 space-y-6">
                {/* Bento stat grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="stat-card border-l-(--accent)">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-(--accent)/5 rounded-lg">
                        <Building2 size={20} className="text-(--accent)" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-(--text-secondary)">
                      {t("Total Tenants")}
                    </p>
                    <p className="text-3xl font-black text-(--text-primary) mt-1 tabular-nums">
                      {tenants.length}
                    </p>
                  </div>
                  <div className="stat-card border-l-(--success-text)">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-(--success)/5 rounded-lg">
                        <Activity size={20} className="text-(--success-text)" />
                      </div>
                      {activeParticipants > 0 && (
                        <span className="text-xs font-bold text-(--success-text) bg-(--success)/10 px-2 py-0.5 rounded-full">
                          {t("{n} active", { n: activeParticipants })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-(--text-secondary)">
                      {t("Participant Profiles")}
                    </p>
                    <p className="text-3xl font-black text-(--text-primary) mt-1 tabular-nums">
                      {totalProfiles}
                    </p>
                  </div>
                  <div className="stat-card border-l-(--warning-text)">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-(--warning)/5 rounded-lg">
                        <Clock size={20} className="text-(--warning-text)" />
                      </div>
                      {disposedCount > 0 && (
                        <span className="animate-pulse w-2 h-2 rounded-full bg-(--warning)" />
                      )}
                    </div>
                    <p
                      className="text-sm font-medium text-(--text-secondary) flex items-center gap-1.5"
                      title={t(
                        "Virtual Participant Agents (one per dataspace profile per tenant). Disposed = terminated by demo reset; re-seed to recreate.",
                      )}
                    >
                      {t("Disposed VPAs")}
                      <Info
                        size={12}
                        className="text-(--text-secondary) opacity-60"
                      />
                    </p>
                    <p className="text-3xl font-black text-(--text-primary) mt-1 tabular-nums">
                      {disposedCount}
                    </p>
                  </div>
                </div>

                {/* Tenants table */}
                <div className="bg-(--surface-card) rounded-xl shadow-xs overflow-hidden border border-(--border)">
                  <div className="p-6 border-b border-(--border) flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-(--text-primary)">
                      {t("Registered Organisations")}
                    </h3>
                    <Link
                      href="/admin/policies"
                      className="px-4 py-2 text-sm font-bold text-white bg-(--accent) rounded-xl hover:opacity-90 transition-opacity"
                    >
                      {t("Policy Definitions")} →
                    </Link>
                  </div>

                  {tenants.length === 0 ? (
                    <p className="p-6 text-(--text-secondary) text-sm">
                      {t("No tenants registered; connect to the live stack")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-(--surface) text-xs font-bold text-(--text-secondary) uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4">{t("Organisation")}</th>
                            <th className="px-6 py-4">{t("Role")}</th>
                            <th className="px-6 py-4">{t("Access Level")}</th>
                            <th className="px-6 py-4">{t("Status")}</th>
                            <th className="px-6 py-4 text-right">
                              {t("Details")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--border)">
                          {tenants.map((tn) => {
                            const isOpen = expanded === tn.id;
                            const role = normalizeRole(tn);
                            const roleCfg = ROLE_CONFIG[role] ?? null;
                            const allVpasDisposed = (
                              tn.participantProfiles || []
                            ).some(
                              (pp) =>
                                pp.vpas?.length > 0 &&
                                pp.vpas.every((v) => v.state === "disposed"),
                            );

                            return (
                              <>
                                <tr
                                  key={tn.id}
                                  className="hover:bg-(--surface) transition-colors"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-(--accent)/10 flex items-center justify-center shrink-0">
                                        <Building2
                                          size={18}
                                          className="text-(--accent)"
                                        />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-(--text-primary)">
                                          {tn.properties.displayName || tn.id}
                                        </p>
                                        <p className="text-[10px] text-(--text-secondary)">
                                          {tn.properties.organization || tn.id}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-(--text-primary)">
                                    {roleCfg ? roleLabel(roleCfg.label) : role}
                                  </td>
                                  <td className="px-6 py-4">
                                    <RoleBadge role={role} />
                                  </td>
                                  <td className="px-6 py-4">
                                    {allVpasDisposed ? (
                                      <div className="flex items-center gap-2 text-xs font-medium text-(--warning-text)">
                                        <span className="w-1.5 h-1.5 rounded-full bg-(--warning)" />
                                        {t("Disposed")}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs font-medium text-(--success-text)">
                                        <span className="w-1.5 h-1.5 rounded-full bg-(--success)" />
                                        {t("Active")}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() =>
                                        setExpanded(isOpen ? null : tn.id)
                                      }
                                      className="p-2 text-(--text-secondary) hover:text-(--accent) transition-colors"
                                      aria-label={
                                        isOpen
                                          ? t("Collapse details")
                                          : t("Expand details")
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
                                  <tr key={`${tn.id}-detail`}>
                                    <td
                                      colSpan={5}
                                      className="px-6 py-4 bg-(--surface) border-b border-(--border)"
                                    >
                                      <div className="space-y-4">
                                        {/* Properties */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                          {Object.entries(tn.properties)
                                            .filter(
                                              ([k]) => k !== "displayName",
                                            )
                                            .map(([k, v]) => (
                                              <div
                                                key={k}
                                                className="bg-(--surface-card) rounded-xl px-3 py-2.5"
                                              >
                                                <p className="text-[10px] text-(--text-secondary) uppercase tracking-wider font-bold">
                                                  {k}
                                                </p>
                                                <p className="text-xs text-(--text-primary) font-medium mt-0.5 break-all">
                                                  {v}
                                                </p>
                                              </div>
                                            ))}
                                          <div className="bg-(--surface-card) rounded-xl px-3 py-2.5">
                                            <p className="text-[10px] text-(--text-secondary) uppercase tracking-wider font-bold">
                                              {t("Tenant ID")}
                                            </p>
                                            <p className="text-xs text-(--text-primary) font-mono mt-0.5 break-all">
                                              {tn.id}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Participant profiles */}
                                        {tn.participantProfiles?.length > 0 && (
                                          <div>
                                            <p className="section-label">
                                              {t("Dataspace Profiles")}
                                            </p>
                                            <div className="grid md:grid-cols-2 gap-3">
                                              {tn.participantProfiles.map(
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
                                                          ? "border-(--warning)/30 bg-(--warning)/5"
                                                          : "border-(--border) bg-(--surface-card)"
                                                      }`}
                                                    >
                                                      {allDisposed && (
                                                        <div className="flex items-center gap-1.5 text-(--warning-text) text-[11px]">
                                                          <AlertTriangle
                                                            size={12}
                                                          />
                                                          {t(
                                                            "VPAs disposed; onboard the participant again",
                                                          )}
                                                        </div>
                                                      )}
                                                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                        <div>
                                                          <span className="text-(--text-secondary)">
                                                            {t("Profile ID")}{" "}
                                                          </span>
                                                          <span className="text-(--text-primary) font-mono">
                                                            {pp.id}
                                                          </span>
                                                        </div>
                                                        <div>
                                                          <span className="text-(--text-secondary)">
                                                            DID{" "}
                                                          </span>
                                                          <span className="text-(--text-primary) font-mono break-all">
                                                            {pp.identifier
                                                              ? decodeURIComponent(
                                                                  pp.identifier,
                                                                )
                                                              : "—"}
                                                          </span>
                                                        </div>
                                                        <div>
                                                          <span className="text-(--text-secondary)">
                                                            {t("Roles")}{" "}
                                                          </span>
                                                          <span className="text-(--text-primary)">
                                                            {roles.length > 0
                                                              ? roles.join(", ")
                                                              : "—"}
                                                          </span>
                                                        </div>
                                                        {ctx && (
                                                          <div>
                                                            <span className="text-(--text-secondary)">
                                                              {t("State")}{" "}
                                                            </span>
                                                            <span
                                                              className={`font-bold ${
                                                                ctx.state ===
                                                                "ACTIVE"
                                                                  ? "text-(--success-text)"
                                                                  : ctx.state ===
                                                                      "CREATED"
                                                                    ? "text-(--accent)"
                                                                    : "text-(--warning-text)"
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
                                                                  ? "bg-(--success)/10 text-(--success-text)"
                                                                  : v.state ===
                                                                      "disposed"
                                                                    ? "bg-(--surface-2) text-(--text-secondary)"
                                                                    : "bg-(--warning)/10 text-(--warning-text)"
                                                              }`}
                                                            >
                                                              <Circle
                                                                size={5}
                                                                className={
                                                                  v.state ===
                                                                  "active"
                                                                    ? "fill-(--success)"
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
                <div className="bg-(--surface) rounded-xl p-8 h-full">
                  <h3 className="text-lg font-bold text-(--text-primary) mb-6">
                    {t("RBAC Summary")}
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        role: "EDC_ADMIN",
                        icon: ShieldCheck,
                        label: t("Administrators"),
                        sub: t("Full Access (L4)"),
                        color: "text-(--role-admin-text)",
                        bg: "bg-(--role-admin-bg)",
                      },
                      {
                        role: "DATA_HOLDER",
                        icon: Building2,
                        label: t("Data Holders"),
                        sub: t("Write Access (L3)"),
                        color: "text-(--role-holder-text)",
                        bg: "bg-(--role-holder-bg)",
                      },
                      {
                        role: "DATA_USER",
                        icon: Users,
                        label: t("Researchers"),
                        sub: t("Read-only (L1–2)"),
                        color: "text-(--role-user-text)",
                        bg: "bg-(--role-user-bg)",
                      },
                      {
                        role: "HDAB_AUTHORITY",
                        icon: ShieldCheck,
                        label: t("HDAB"),
                        sub: t("Governance (L3)"),
                        color: "text-(--role-hdab-text)",
                        bg: "bg-(--role-hdab-bg)",
                      },
                    ].map(({ role, icon: Icon, label, sub, color, bg }) => (
                      <div
                        key={role}
                        className="flex items-center justify-between p-4 bg-(--surface-card) rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}
                          >
                            <Icon size={18} className={color} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-(--text-primary)">
                              {label}
                            </p>
                            <p className="text-xs text-(--text-secondary)">
                              {sub}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-(--text-primary) tabular-nums">
                          {roleCounts[role] ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Security notice */}
                  <div className="mt-8 p-6 bg-(--accent) text-white dark:text-gray-900 rounded-xl">
                    <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-80">
                      {t("Security Notice")}
                    </p>
                    <p className="text-sm mb-4 opacity-90">
                      {t(
                        "All Level 4 changes require secondary hardware key validation per EHDS Art. 50.",
                      )}
                    </p>
                    <Link
                      href="/admin/audit"
                      className="text-xs font-bold border border-white/30 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors inline-block"
                    >
                      {t("Audit Logs")}
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
