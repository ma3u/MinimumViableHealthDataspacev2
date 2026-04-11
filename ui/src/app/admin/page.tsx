"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  FileKey2,
  LayoutDashboard,
  Loader2,
  ScrollText,
  ShieldCheck,
  Users,
  Key,
  Shield,
  RefreshCw,
  Terminal,
  ClipboardList,
  Gauge,
} from "lucide-react";
import Link from "next/link";

interface Summary {
  totalTenants: number;
  totalParticipants: number;
  byRole: Record<string, number>;
}

const ACTIVITY_LOG = [
  {
    icon: Key,
    color: "text-[var(--accent)]",
    title: "Security keys rotated",
    sub: "Admin • 12m ago",
  },
  {
    icon: Shield,
    color: "text-[var(--success-text)]",
    title: "New node authorized",
    sub: "Frankfurt-Cluster-04 • 45m ago",
  },
  {
    icon: ShieldCheck,
    color: "text-[var(--danger-text)]",
    title: "DDoS attempt mitigated",
    sub: "Auto-Defense System • 1h ago",
  },
  {
    icon: RefreshCw,
    color: "text-[var(--text-secondary)]",
    title: "Scheduled Backup Complete",
    sub: "System • 3h ago",
    dim: true,
  },
];

const QUICK_OPS = [
  { icon: RefreshCw, label: "Deploy Patch", href: "/admin/components" },
  { icon: Terminal, label: "Flush Cache", href: "/admin/components" },
  { icon: ClipboardList, label: "Audit Logs", href: "/admin/audit" },
  { icon: Gauge, label: "Test Latency", href: "/admin/components" },
];

export default function AdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [policyCount, setPolicyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchApi("/api/admin/tenants")
        .then((r) => (r.ok ? r.json() : ({} as Record<string, unknown>)))
        .then((d: Record<string, unknown>) => {
          setSummary((d.summary as Summary) || null);
        }),
      fetchApi("/api/admin/policies")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Record<string, unknown> | null) => {
          if (!d) return;
          if (Array.isArray(d.participants)) {
            const total = (d.participants as { policies?: unknown[] }[]).reduce(
              (sum, p) =>
                sum + (Array.isArray(p.policies) ? p.policies.length : 0),
              0,
            );
            setPolicyCount(total);
          } else if (Array.isArray(d.policies)) {
            setPolicyCount(d.policies.length);
          }
        }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="px-8 py-10 max-w-7xl mx-auto space-y-8">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-header">System Overview</h1>
            <p className="text-[var(--text-secondary)] text-lg mt-1">
              EHDS Health Dataspace — Operator Control
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--success)]/10 text-[var(--success-text)] rounded-full border border-[var(--success)]/20 text-sm font-bold tracking-tight">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              SYSTEMS NOMINAL
            </div>
            <button className="btn-gradient flex items-center gap-2 text-sm">
              <ScrollText size={16} />
              Generate Report
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading dashboard…
          </div>
        ) : (
          <>
            {/* ── Bento stat grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  href: "/admin/tenants",
                  icon: Building2,
                  iconColor: "text-[var(--accent)]",
                  iconBg: "bg-[var(--accent)]/5",
                  label: "Tenants",
                  value: summary?.totalTenants ?? "—",
                  border: "border-l-[var(--accent)]",
                },
                {
                  href: "/admin/tenants",
                  icon: Users,
                  iconColor: "text-[var(--success-text)]",
                  iconBg: "bg-[var(--success)]/5",
                  label: "Participants",
                  value: summary?.totalParticipants ?? "—",
                  border: "border-l-[var(--success-text)]",
                },
                {
                  href: "/admin/policies",
                  icon: ShieldCheck,
                  iconColor: "text-[var(--layer5-text)]",
                  iconBg: "bg-[var(--layer5)]/5",
                  label: "Policies",
                  value: policyCount ?? "—",
                  border: "border-l-[var(--layer5-text)]",
                },
                {
                  href: "/admin/audit",
                  icon: ScrollText,
                  iconColor: "text-[var(--warning-text)]",
                  iconBg: "bg-[var(--warning)]/5",
                  label: "Audit Logs",
                  value: "→",
                  border: "border-l-[var(--warning-text)]",
                },
              ].map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className={`stat-card ${c.border} hover:shadow-md transition-shadow`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 ${c.iconBg} rounded-lg`}>
                      <c.icon size={20} className={c.iconColor} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                    {c.label}
                  </p>
                  <p className="text-3xl font-black text-[var(--text-primary)] mt-1 tabular-nums">
                    {c.value}
                  </p>
                </Link>
              ))}
            </div>

            {/* ── Main content grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* EHDS Role breakdown + EU data flow */}
              <div className="lg:col-span-2 bg-[var(--surface)] rounded-xl p-8 relative overflow-hidden min-h-[320px]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                      Participants by EHDS Role
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                      Access control breakdown across the dataspace
                    </p>
                  </div>
                  <LayoutDashboard
                    size={32}
                    className="text-[var(--border)] shrink-0"
                  />
                </div>
                {summary?.byRole && Object.keys(summary.byRole).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(summary.byRole).map(([role, count]) => (
                      <div
                        key={role}
                        className="surface-card p-4 border border-[var(--border)]"
                      >
                        <p className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
                          {count}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 break-all">
                          {role}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                    <FileKey2 size={18} />
                    <span className="text-sm">
                      No role data available — connect to live stack
                    </span>
                  </div>
                )}
                {/* EU data flow indicator strip */}
                <div className="mt-6 pt-4 border-t border-[var(--border)]">
                  <p className="section-label mb-3">European data flow</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      {
                        id: "DE",
                        label: "AlphaKlinik Berlin",
                        color: "var(--role-holder-text)",
                        bg: "var(--role-holder-bg)",
                      },
                      {
                        id: "NL",
                        label: "Limburg Medical",
                        color: "var(--role-holder-text)",
                        bg: "var(--role-holder-bg)",
                      },
                      {
                        id: "FR",
                        label: "Institut Santé",
                        color: "var(--role-hdab-text)",
                        bg: "var(--role-hdab-bg)",
                      },
                      {
                        id: "DE",
                        label: "MedReg DE",
                        color: "var(--role-hdab-text)",
                        bg: "var(--role-hdab-bg)",
                      },
                      {
                        id: "DE",
                        label: "PharmaCo AG",
                        color: "var(--role-user-text)",
                        bg: "var(--role-user-bg)",
                      },
                    ].map((node, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border"
                        style={{
                          color: node.color,
                          background: node.bg,
                          borderColor: node.color,
                        }}
                      >
                        <span className="font-mono">{node.id}</span>
                        {node.label}
                      </span>
                    ))}
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      ↔ DSP 2025-1
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Operations + Activity */}
              <div className="flex flex-col gap-6">
                {/* Quick ops */}
                <div className="bg-[var(--surface-2)] rounded-xl p-6">
                  <p className="section-label">Quick Operations</p>
                  <div className="grid grid-cols-2 gap-3">
                    {QUICK_OPS.map(({ icon: Icon, label, href }) => (
                      <Link
                        key={label}
                        href={href}
                        className="flex flex-col items-center justify-center p-4 bg-[var(--surface-card)] rounded-xl hover:bg-[var(--accent)] hover:text-white transition-all group shadow-sm"
                      >
                        <Icon
                          size={20}
                          className="text-[var(--accent)] group-hover:text-white mb-2"
                        />
                        <span className="text-xs font-bold text-center leading-tight">
                          {label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Activity feed — Stitch activity-timeline pattern */}
                <div className="flex-1 surface-card p-6 border border-[var(--border)]">
                  <p className="section-label">Administrative Activity</p>
                  <div className="activity-timeline space-y-5 pl-7">
                    {ACTIVITY_LOG.map((item, i) => (
                      <div key={i} className="flex gap-3 items-start relative">
                        {/* Timeline node */}
                        <div className="absolute -left-7 top-1 w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0 z-10">
                          <item.icon size={14} className={item.color} />
                        </div>
                        <div>
                          <p
                            className={`text-sm font-bold ${
                              item.dim
                                ? "text-gray-500 dark:text-gray-400"
                                : "text-[var(--text-primary)]"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p
                            className={`text-xs ${
                              item.dim
                                ? "text-gray-500 dark:text-gray-400"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {item.sub}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Sub-page quick links ── */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[var(--surface)] rounded-xl p-6 border border-[var(--border)] flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-[var(--success)]/10 flex items-center justify-center shrink-0">
                  <ShieldCheck
                    size={28}
                    className="text-[var(--success-text)]"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[var(--text-primary)]">
                    GDPR Compliance Check
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    Next automated audit scheduled for next month.
                  </p>
                  <Link
                    href="/compliance"
                    className="text-sm font-black text-[var(--success-text)] hover:underline uppercase tracking-wider"
                  >
                    RUN PRE-AUDIT NOW
                  </Link>
                </div>
              </div>
              <div className="bg-[var(--surface)] rounded-xl p-6 border border-[var(--border)] flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                  <Activity size={28} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[var(--text-primary)]">
                    EDC Components
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    Monitor health, CPU &amp; memory per service.
                  </p>
                  <Link
                    href="/admin/components"
                    className="text-sm font-black text-[var(--accent)] hover:underline uppercase tracking-wider"
                  >
                    VIEW COMPONENTS
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
