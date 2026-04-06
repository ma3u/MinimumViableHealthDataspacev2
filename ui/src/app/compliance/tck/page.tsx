"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import PageIntro from "@/components/PageIntro";

/* ── Types ─────────────────────────────────────────────────────── */

interface TestResult {
  id: string;
  category: string;
  suite: "DSP" | "DCP" | "EHDS";
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

interface SuiteResult {
  results: TestResult[];
  passed: number;
  total: number;
}

interface TckData {
  timestamp: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  suites: Record<"DSP" | "DCP" | "EHDS", SuiteResult>;
}

/* ── Badge helpers ─────────────────────────────────────────────── */

function StatusIcon({ status }: { status: string }) {
  if (status === "pass")
    return <CheckCircle2 size={16} className="text-green-400 shrink-0" />;
  if (status === "fail")
    return <XCircle size={16} className="text-red-400 shrink-0" />;
  return <MinusCircle size={16} className="text-yellow-400 shrink-0" />;
}

function ScoreBadge({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const color =
    pct === 100
      ? "bg-green-900/60 text-green-300 border-green-700"
      : pct >= 80
        ? "bg-yellow-900/60 text-yellow-300 border-yellow-700"
        : "bg-red-900/60 text-red-300 border-red-700";
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${color}`}>
      {passed}/{total} ({pct}%)
    </span>
  );
}

/* ── Suite card ────────────────────────────────────────────────── */

const suiteLabels: Record<string, { title: string; description: string }> = {
  DSP: {
    title: "DSP 2025-1 Protocol",
    description:
      "Dataspace Protocol — catalog, negotiation, transfer process, schema compliance",
  },
  DCP: {
    title: "DCP v1.0 Identity",
    description:
      "Decentralized Claims Protocol — DIDs, key pairs, verifiable credentials, issuer service",
  },
  EHDS: {
    title: "EHDS Health Domain",
    description:
      "European Health Data Space — HealthDCAT-AP, EEHRxF, OMOP CDM, Article 53 enforcement",
  },
};

function SuiteCard({
  suiteKey,
  data,
}: {
  suiteKey: "DSP" | "DCP" | "EHDS";
  data: SuiteResult;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = suiteLabels[suiteKey];

  // Group by category
  const categories = data.results.reduce(
    (acc, r) => {
      (acc[r.category] ??= []).push(r);
      return acc;
    },
    {} as Record<string, TestResult[]>,
  );

  return (
    <div className="bg-[var(--surface-2)] rounded-lg border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck size={18} className="text-layer1 shrink-0" />
          <div className="text-left">
            <span className="font-semibold text-white">{meta.title}</span>
            <span className="block text-xs text-[var(--text-secondary)]">
              {meta.description}
            </span>
          </div>
        </div>
        <ScoreBadge passed={data.passed} total={data.total} />
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] divide-y divide-gray-700/60">
          {Object.entries(categories).map(([cat, tests]) => (
            <div key={cat} className="px-5 py-3">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                {cat}
              </h4>
              <ul className="space-y-1.5">
                {tests.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <StatusIcon status={t.status} />
                    <div>
                      <span className="text-gray-200">
                        <span className="font-mono text-xs text-[var(--text-secondary)] mr-1.5">
                          {t.id}
                        </span>
                        {t.name}
                      </span>
                      <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                        {t.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function ComplianceTckPage() {
  const [data, setData] = useState<TckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchApi("/api/compliance/tck")
      .then((r) => r.json())
      .then((d: TckData) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <PageIntro
          title="Protocol Compliance Dashboard"
          icon={ShieldCheck}
          description="Run the DSP 2025-1 and DCP v1.0 Technology Compatibility Kit against your connectors. This dashboard validates that your EDC-V deployment correctly implements the Dataspace Protocol and Decentralized Claims Protocol."
          prevStep={{ href: "/compliance", label: "EHDS Compliance" }}
          nextStep={{ href: "/credentials", label: "Verifiable Credentials" }}
          infoText="The TCK executes protocol-level tests covering catalog, negotiation, transfer, and identity resolution. Results indicate whether your connectors are interoperable with other EHDS participants."
          docLink={{
            href: "https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol",
            label: "Dataspace Protocol Spec",
            external: true,
          }}
        />
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Running…" : "Re-run"}
        </button>
      </div>
      <div className="flex items-center gap-3 mb-8 text-xs text-[var(--text-secondary)]">
        <Link
          href="/compliance"
          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
        >
          <ExternalLink size={12} />
          EHDS Approval Checker
        </Link>
        {data && (
          <span>Last run: {new Date(data.timestamp).toLocaleString()}</span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-[var(--surface-2)] rounded-lg animate-pulse border border-[var(--border)]"
            />
          ))}
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Total",
                value: data.summary.total,
                color: "text-white",
              },
              {
                label: "Passed",
                value: data.summary.passed,
                color: "text-green-400",
              },
              {
                label: "Failed",
                value: data.summary.failed,
                color: "text-red-400",
              },
              {
                label: "Skipped",
                value: data.summary.skipped,
                color: "text-yellow-400",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-3 text-center"
              >
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Suite cards */}
          <div className="space-y-4">
            {(["DSP", "DCP", "EHDS"] as const).map((key) => (
              <SuiteCard key={key} suiteKey={key} data={data.suites[key]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
