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
} from "lucide-react";
import Link from "next/link";
import PageIntro from "@/components/PageIntro";

interface Summary {
  totalTenants: number;
  totalParticipants: number;
  byRole: Record<string, number>;
}

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
          // EDC-V returns { participants: [{ policies: [...] }, ...] }
          if (Array.isArray(d.participants)) {
            const total = (d.participants as { policies?: unknown[] }[]).reduce(
              (sum, p) =>
                sum + (Array.isArray(p.policies) ? p.policies.length : 0),
              0,
            );
            setPolicyCount(total);
          } else if (Array.isArray(d.policies)) {
            // Neo4j fallback returns { policies: [...] }
            setPolicyCount(d.policies.length);
          }
        }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      href: "/admin/tenants",
      label: "Tenants",
      value: summary?.totalTenants ?? "—",
      icon: Building2,
      color: "text-blue-400",
    },
    {
      href: "/admin/tenants",
      label: "Participants",
      value: summary?.totalParticipants ?? "—",
      icon: Users,
      color: "text-green-400",
    },
    {
      href: "/admin/policies",
      label: "Policies",
      icon: ShieldCheck,
      value: policyCount ?? "—",
      color: "text-purple-400",
    },
    {
      href: "/admin/audit",
      label: "Audit Log",
      icon: ScrollText,
      value: "→",
      color: "text-yellow-400",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageIntro
        title="Operator Dashboard"
        icon={LayoutDashboard}
        description="EHDS Health Data Access Body administration overview. Monitor registered tenants, active policies, issued credentials, and recent audit events at a glance. Click any card to drill into detail."
        prevStep={{ href: "/data/transfer", label: "Data Transfers" }}
        nextStep={{ href: "/admin/tenants", label: "Manage Tenants" }}
        infoText="This dashboard aggregates key metrics from the tenant-manager, EDC-V control plane, IssuerService, and Neo4j provenance graph. Use the admin sub-pages for full management capabilities."
        docLink={{ href: "/docs/user-guide", label: "User Guide" }}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading dashboard…
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {cards.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="p-4 border border-gray-700 rounded-xl hover:border-layer2 transition-colors"
              >
                <c.icon size={20} className={c.color + " mb-2"} />
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </Link>
            ))}
          </div>

          {/* Role breakdown */}
          {summary?.byRole && Object.keys(summary.byRole).length > 0 && (
            <div className="border border-gray-700 rounded-xl p-5 mb-8">
              <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <FileKey2 size={16} className="text-layer2" />
                Participants by EHDS Role
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(summary.byRole).map(([role, count]) => (
                  <div
                    key={role}
                    className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                  >
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-gray-400">{role}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid md:grid-cols-4 gap-4">
            <Link
              href="/admin/components"
              className="p-4 border border-gray-700 rounded-xl hover:border-layer2 transition-colors"
            >
              <Activity size={18} className="text-layer2 mb-2" />
              <h3 className="font-semibold text-sm mb-1">EDC Components</h3>
              <p className="text-xs text-gray-500">
                Health, CPU &amp; memory per service
              </p>
            </Link>
            <Link
              href="/admin/tenants"
              className="p-4 border border-gray-700 rounded-xl hover:border-layer2 transition-colors"
            >
              <Building2 size={18} className="text-layer2 mb-2" />
              <h3 className="font-semibold text-sm mb-1">Manage Tenants</h3>
              <p className="text-xs text-gray-500">
                View and manage registered participants
              </p>
            </Link>
            <Link
              href="/admin/policies"
              className="p-4 border border-gray-700 rounded-xl hover:border-layer2 transition-colors"
            >
              <ShieldCheck size={18} className="text-layer2 mb-2" />
              <h3 className="font-semibold text-sm mb-1">Policy Definitions</h3>
              <p className="text-xs text-gray-500">
                View and create ODRL policies
              </p>
            </Link>
            <Link
              href="/admin/audit"
              className="p-4 border border-gray-700 rounded-xl hover:border-layer2 transition-colors"
            >
              <ScrollText size={18} className="text-layer2 mb-2" />
              <h3 className="font-semibold text-sm mb-1">Audit & Provenance</h3>
              <p className="text-xs text-gray-500">
                Query the Neo4j provenance graph
              </p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
