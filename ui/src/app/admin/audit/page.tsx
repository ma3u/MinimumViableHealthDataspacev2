"use client";

import { fetchApi } from "@/lib/api";
import { Fragment, useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ArrowRightLeft,
  FileSignature,
  ShieldCheck,
  Download,
  Globe,
  Mail,
  ChevronDown,
  ChevronRight,
  Database,
  AlertTriangle,
} from "lucide-react";
import { AccessLogSection } from "./_components/AccessLogSection";
import { ComplianceButton } from "./_components/ComplianceButton";
import { FilterBar } from "./_components/FilterBar";
import { SpeAuditSection } from "./_components/SpeAuditSection";
import { EMPTY_FILTERS, TABS } from "./_components/constants";
import {
  directionBadge,
  displayName,
  ehdsArticle,
  exportCSV,
  formatBytes,
  statusBadge,
} from "./_components/helpers";
import type {
  AuditData,
  AuditFilters,
  AuditType,
  Participant,
} from "./_components/types";
import { useT } from "@/lib/i18n/translate";

export default function AdminAuditPage() {
  const t = useT("admin");
  const [activeTab, setActiveTab] = useState<AuditType>("all");
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expandedNeg, setExpandedNeg] = useState<Set<string>>(new Set());

  // Load participant list once for filter dropdowns
  useEffect(() => {
    fetchApi("/api/admin/audit?type=participants")
      .then((r) => r.json())
      .then((d) => setParticipants(d.participants || []))
      .catch(() => {});
  }, []);

  // `isCurrent` turns false once the tab or a filter changed: the answer to
  // an older request is dropped. Without it a slow overview (type=all) that
  // answered after a click on Access Logs replaced that tab's rows with its
  // own, and the tab said "No access logs recorded" (2026-11-08, J911).
  const loadData = useCallback(
    (isCurrent: () => boolean) => {
      setLoading(true);
      const p = new URLSearchParams({ type: activeTab, limit: "50" });
      if (filters.status) p.set("status", filters.status);
      if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) p.set("dateTo", filters.dateTo);
      if (filters.consumerDid) p.set("consumerDid", filters.consumerDid);
      if (filters.providerDid) p.set("providerDid", filters.providerDid);
      if (filters.crossBorder) p.set("crossBorder", filters.crossBorder);

      fetchApi(`/api/admin/audit?${p.toString()}`)
        .then(async (r) => {
          // The route answers 502 with { error, detail } when Neo4j is out of
          // reach. Storing that body as data left the page blank on Azure;
          // treat it as the failure it is and show the reason.
          const body = await r.json();
          if (!r.ok || body?.error) {
            throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
          }
          return body as AuditData;
        })
        .then((d) => {
          if (!isCurrent()) return;
          setData(d);
          setError(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (!isCurrent()) return;
          setData(null);
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    },
    [activeTab, filters],
  );

  useEffect(() => {
    let current = true;
    loadData(() => current);
    return () => {
      current = false;
    };
  }, [loadData]);

  const updateFilter = (patch: Partial<AuditFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="min-h-screen bg-(--bg)">
      <main className="px-8 py-10 max-w-7xl mx-auto space-y-8">
        {/* ── Page header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="page-header">{t("Audit & Provenance")}</h1>
            {/*
              The subtitle read "Tamper-evident audit trail" and the badge next
              to it read "HIPAA COMPLIANT". Neither was backed by anything in
              the code: the records below are plain Neo4j properties with no
              hash, chain or seal, and HIPAA is a US statute that nothing here
              checks (issue #205). Sealed evidence is issue #204.
            */}
            <p className="text-(--text-secondary) text-lg mt-1">
              {t(
                "Access and provenance records · EHDS Art. 73 · Art. 59 · GDPR Art. 30",
              )}
            </p>
          </div>
          <div
            data-testid="integrity-notice"
            title={t(
              "Transfers, negotiations, credentials and access events are stored as ordinary Neo4j properties. Detached eIDAS seals over contract agreements are issue #204.",
            )}
            className="flex items-center gap-2 px-4 py-2 bg-(--warning)/10 text-(--warning-text) rounded-full border border-(--warning)/20 text-sm font-bold tracking-tight"
          >
            <AlertTriangle size={14} />
            {t("Records are not sealed")}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-(--border)">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setFilters(EMPTY_FILTERS);
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-(--accent) text-(--accent)"
                  : "border-transparent text-(--text-secondary) hover:text-(--text-primary)"
              }`}
            >
              <tab.icon size={14} />
              {t(tab.label)}
            </button>
          ))}
        </div>

        {/* Filter bar (not on overview; secure processing has its own) */}
        {activeTab !== "all" && activeTab !== "spe" && (
          <FilterBar
            filters={filters}
            onChange={updateFilter}
            onClear={() => setFilters(EMPTY_FILTERS)}
            participants={participants}
            tab={activeTab}
          />
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-(--text-secondary) mt-6">
            <Loader2 size={16} className="animate-spin" />
            {t("Querying Neo4j…")}
          </div>
        ) : !data ? (
          <div className="mt-6 space-y-1">
            <p className="text-(--text-secondary)">
              {t("Failed to load audit data")}
            </p>
            {error && (
              <p className="text-xs font-mono text-(--text-secondary)">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Overview summary cards */}
            {activeTab === "all" && data.summary?.nodeCounts && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {Object.entries(data.summary.nodeCounts).map(
                    ([label, count]) => (
                      <div
                        key={label}
                        className="stat-card border-l-(--accent)"
                      >
                        <p className="text-2xl font-black text-(--text-primary) tabular-nums">
                          {count}
                        </p>
                        <p className="text-xs font-medium text-(--text-secondary) mt-1">
                          {label}
                        </p>
                      </div>
                    ),
                  )}
                </div>

                {/* Access by consumer */}
                {(data.summary.accessByConsumer?.length ?? 0) > 0 && (
                  <section className="mb-8">
                    <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Database
                        size={14}
                        className="text-teal-800 dark:text-teal-300"
                      />
                      {t("Access Activity by Consumer")}
                    </h2>
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-(--text-secondary) border-b border-(--border)">
                            <th className="text-left py-2 px-2">
                              {t("Consumer")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Total Accesses")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Data Transferred")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Last Access")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.summary.accessByConsumer!.map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-(--border) hover:bg-(--surface-2)/50"
                            >
                              <td className="py-2 px-2 text-(--text-primary)">
                                {row.consumerName ?? "—"}
                              </td>
                              <td className="py-2 px-2">
                                <span className="inline-block px-1.5 py-0.5 rounded-sm bg-(--role-patient-bg) text-(--role-patient-text) border border-(--role-patient-border) text-[10px] font-semibold">
                                  {row.totalAccesses}×
                                </span>
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
                                {formatBytes(row.totalBytes)}
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
                                {row.lastAccess
                                  ? row.lastAccess.slice(0, 10)
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ── Transfers ──────────────────────────────────────────────── */}
            {(activeTab === "all" || activeTab === "transfers") &&
              data.transfers && (
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                      <ArrowRightLeft
                        size={14}
                        className="text-teal-800 dark:text-teal-300"
                      />
                      {t("Data Transfers ({n})", { n: data.transfers.length })}
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
                        className="flex items-center gap-1 text-xs text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                      >
                        <Download size={12} /> {t("Export CSV")}
                      </button>
                    )}
                  </div>
                  {data.transfers.length === 0 ? (
                    <p className="text-(--text-secondary) text-sm">
                      {t("No transfers recorded")}
                    </p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-(--text-secondary) border-b border-(--border)">
                            <th className="text-left py-2 px-2">{t("Dir")}</th>
                            <th className="text-left py-2 px-2">
                              {t("Consumer")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Provider")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Asset")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Purpose")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Status")}
                            </th>
                            <th className="text-left py-2 px-2">{t("Date")}</th>
                            <th className="text-left py-2 px-2">{t("Size")}</th>
                            <th className="text-left py-2 px-2">
                              {t("Accesses")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("EDC Source")}
                            </th>
                            <th className="text-left py-2 px-2">{t("EHDS")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.transfers.map((tr, i) => (
                            <tr
                              key={i}
                              className="border-b border-(--border) hover:bg-(--surface-2)/50"
                            >
                              <td className="py-2 px-2">
                                {directionBadge(tr.direction)}
                              </td>
                              <td className="py-2 px-2">
                                <div className="text-(--text-primary)">
                                  {displayName(
                                    tr.consumerName,
                                    tr.consumerDid,
                                    tr.consumerCountryCode,
                                  )}
                                </div>
                                <div className="mt-0.5">
                                  <ComplianceButton
                                    name={tr.consumerComplianceName}
                                    email={tr.consumerComplianceEmail}
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <div className="text-(--text-primary)">
                                  {displayName(
                                    tr.providerName,
                                    tr.providerDid,
                                    tr.providerCountryCode,
                                  )}
                                </div>
                                <div className="mt-0.5">
                                  <ComplianceButton
                                    name={tr.providerComplianceName}
                                    email={tr.providerComplianceEmail}
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
                                {tr.asset || tr.assetId || "—"}
                              </td>
                              <td
                                className="py-2 px-2 text-(--text-secondary) max-w-[140px] truncate"
                                title={tr.purposeOfSharing}
                              >
                                {tr.purposeOfSharing || "—"}
                              </td>
                              <td className="py-2 px-2">
                                {statusBadge(tr.status)}
                                {tr.errorMessage && (
                                  <span
                                    title={String(tr.errorMessage)}
                                    className="ml-1 text-red-400 cursor-help"
                                  >
                                    ⚠
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
                                {(tr.timestamp || tr.transferDate || "—").slice(
                                  0,
                                  10,
                                )}
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
                                {formatBytes(tr.byteSize)}
                              </td>
                              <td className="py-2 px-2">
                                {tr.accessLogCount != null &&
                                tr.accessLogCount > 0 ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded-sm bg-(--role-patient-bg) text-(--role-patient-text) border border-(--role-patient-border) text-[10px] font-semibold">
                                    {tr.accessLogCount}×
                                  </span>
                                ) : (
                                  <span className="text-(--text-secondary)">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                {tr.edcProviderEndpoint ? (
                                  <span
                                    title={tr.edcProviderEndpoint}
                                    className="font-mono text-(--text-secondary) text-[10px] truncate max-w-[100px] block cursor-help"
                                  >
                                    {tr.edcProviderEndpoint.replace(
                                      /^https?:\/\//,
                                      "",
                                    )}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="py-2 px-2">
                                {tr.crossBorder ? (
                                  <span className="flex items-center gap-0.5 text-orange-800 dark:text-orange-400">
                                    <Globe size={10} />
                                    {ehdsArticle(tr.policyId)}
                                  </span>
                                ) : (
                                  ehdsArticle(tr.policyId)
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

            {/* ── Negotiations ───────────────────────────────────────────── */}
            {(activeTab === "all" || activeTab === "negotiations") &&
              data.negotiations && (
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                      <FileSignature
                        size={14}
                        className="text-teal-800 dark:text-teal-300"
                      />
                      {t("Contract Negotiations ({n})", {
                        n: data.negotiations.length,
                      })}
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
                        className="flex items-center gap-1 text-xs text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                      >
                        <Download size={12} /> {t("Export CSV")}
                      </button>
                    )}
                  </div>
                  {data.negotiations.length === 0 ? (
                    <p className="text-(--text-secondary) text-sm">
                      {t("No negotiations recorded")}
                    </p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-(--text-secondary) border-b border-(--border)">
                            <th className="text-left py-2 px-2 w-5"></th>
                            <th className="text-left py-2 px-2">
                              {t("Consumer")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Provider")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Asset")}
                            </th>
                            <th className="text-left py-2 px-2">
                              {t("Status")}
                            </th>
                            <th className="text-left py-2 px-2">{t("Date")}</th>
                            <th className="text-left py-2 px-2">
                              {t("Accesses")}
                            </th>
                            <th className="text-left py-2 px-2">{t("EHDS")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.negotiations.map((n, nIdx) => {
                            const rowKey =
                              n.id || n.contractId || `neg-${nIdx}`;
                            const isOpen = expandedNeg.has(rowKey);
                            return (
                              <Fragment key={rowKey}>
                                <tr
                                  className="border-b border-(--border) hover:bg-(--surface-2)/40 cursor-pointer"
                                  onClick={() =>
                                    setExpandedNeg((prev) => {
                                      const next = new Set(prev);
                                      if (isOpen) {
                                        next.delete(rowKey);
                                      } else {
                                        next.add(rowKey);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  <td className="py-2 px-2 text-(--text-secondary)">
                                    {isOpen ? (
                                      <ChevronDown size={11} />
                                    ) : (
                                      <ChevronRight size={11} />
                                    )}
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="text-(--text-primary)">
                                      {displayName(
                                        n.consumerName,
                                        n.consumerDid,
                                        n.consumerCountryCode,
                                      )}
                                    </div>
                                    <div className="mt-0.5">
                                      <ComplianceButton
                                        name={n.consumerComplianceName}
                                        email={n.consumerComplianceEmail}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="text-(--text-primary)">
                                      {displayName(
                                        n.providerName,
                                        n.providerDid,
                                        n.providerCountryCode,
                                      )}
                                    </div>
                                    <div className="mt-0.5">
                                      <ComplianceButton
                                        name={n.providerComplianceName}
                                        email={n.providerComplianceEmail}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-(--text-secondary)">
                                    {n.asset || n.assetId || "—"}
                                  </td>
                                  <td className="py-2 px-2">
                                    {statusBadge(n.status)}
                                  </td>
                                  <td className="py-2 px-2 text-(--text-secondary)">
                                    {(
                                      n.timestamp ||
                                      n.negotiationDate ||
                                      "—"
                                    ).slice(0, 10)}
                                  </td>
                                  <td className="py-2 px-2">
                                    {n.accessLogCount != null &&
                                    n.accessLogCount > 0 ? (
                                      <span className="inline-block px-1.5 py-0.5 rounded-sm bg-(--role-patient-bg) text-(--role-patient-text) border border-(--role-patient-border) text-[10px] font-semibold">
                                        {n.accessLogCount}×
                                      </span>
                                    ) : (
                                      <span className="text-(--text-secondary)">
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2">
                                    {n.crossBorder ? (
                                      <span className="flex items-center gap-0.5 text-orange-800 dark:text-orange-400">
                                        <Globe size={10} />
                                        {ehdsArticle(n.policyId)}
                                      </span>
                                    ) : (
                                      ehdsArticle(n.policyId)
                                    )}
                                  </td>
                                </tr>

                                {/* Expanded policy card */}
                                {isOpen && (
                                  <tr className="border-b border-(--border) bg-(--surface)/60">
                                    <td colSpan={8} className="px-6 py-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Policy details */}
                                        <div className="border border-(--border) rounded-lg p-3">
                                          <p className="text-[10px] font-semibold text-(--text-secondary) uppercase mb-2">
                                            {t("Policy Details")}
                                          </p>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            <span className="text-(--text-secondary)">
                                              {t("Purpose")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.policyPurpose ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Legal Basis")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.policyLegalBasis ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Permitted")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.policyPermittedUses ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Prohibited")}
                                            </span>
                                            <span className="text-red-800 dark:text-red-400">
                                              {n.policyProhibitedUses ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Data Minimisation")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.policyDataMinimisation ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Retention")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.policyRetentionDays
                                                ? t("{n} days", {
                                                    n: n.policyRetentionDays,
                                                  })
                                                : "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Total Accesses")}
                                            </span>
                                            <span className="text-teal-300 font-semibold">
                                              {n.accessCount ?? 0}×
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Last Access")}
                                            </span>
                                            <span className="text-(--text-primary)">
                                              {n.lastAccessAt
                                                ? n.lastAccessAt.slice(0, 10)
                                                : "—"}
                                            </span>
                                          </div>
                                        </div>

                                        {/* EDC endpoints + contract ID */}
                                        <div className="border border-(--border) rounded-lg p-3">
                                          <p className="text-[10px] font-semibold text-(--text-secondary) uppercase mb-2">
                                            {t("EDC Endpoints & Contract")}
                                          </p>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            <span className="text-(--text-secondary)">
                                              {t("Consumer EDC")}
                                            </span>
                                            <span className="font-mono text-(--text-secondary) break-all">
                                              {n.consumerEdcEndpoint ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Provider EDC")}
                                            </span>
                                            <span className="font-mono text-(--text-secondary) break-all">
                                              {n.providerEdcEndpoint ?? "—"}
                                            </span>
                                            <span className="text-(--text-secondary)">
                                              {t("Contract ID")}
                                            </span>
                                            <span className="font-mono text-(--text-secondary)">
                                              {n.contractId ?? "—"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
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
                    <ShieldCheck
                      size={14}
                      className="text-teal-800 dark:text-teal-300"
                    />
                    {t("Verifiable Credentials ({n})", {
                      n: data.credentials.length,
                    })}
                  </h2>
                  {data.credentials.length === 0 ? (
                    <p className="text-(--text-secondary) text-sm">
                      {t("No credentials recorded")}
                    </p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-(--text-secondary) border-b border-(--border)">
                            <th className="text-left py-2 px-2">
                              {t("Participant")}
                            </th>
                            <th className="text-left py-2 px-2">{t("Type")}</th>
                            <th className="text-left py-2 px-2">
                              {t("Issued")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.credentials.map((c, i) => (
                            <tr
                              key={i}
                              className="border-b border-(--border) hover:bg-(--surface-2)/50"
                            >
                              <td className="py-2 px-2 text-(--text-primary)">
                                {c.participant ||
                                  c.subjectDid
                                    ?.replace("did:web:", "")
                                    .replace(/%3A/g, ":") ||
                                  "—"}
                              </td>
                              <td className="py-2 px-2 text-(--text-primary)">
                                {c.credentialType || c.type || "—"}
                              </td>
                              <td className="py-2 px-2 text-(--text-secondary)">
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
            {/* ── Secure processing (ADR-068, #774) ──────────────────────── */}
            {activeTab === "spe" && (
              <SpeAuditSection events={data.speEvents ?? []} />
            )}
            {/* ── Access Logs ────────────────────────────────────────────── */}
            {activeTab === "supervision" && (
              <section className="mb-8" data-testid="supervision-section">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle
                    size={14}
                    className="text-amber-700 dark:text-amber-300"
                  />
                  {t("Findings of non-compliance, Art. 63 ({n})", {
                    n: data.findings?.length ?? 0,
                  })}
                </h2>
                {!data.findings || data.findings.length === 0 ? (
                  <p className="text-(--text-secondary) text-sm mb-6">
                    {t("No finding recorded")}
                  </p>
                ) : (
                  <div className="overflow-auto mb-6">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-(--text-secondary) border-b border-(--border)">
                          <th className="text-left py-2 px-2">{t("Party")}</th>
                          <th className="text-left py-2 px-2">
                            {t("Finding")}
                          </th>
                          <th className="text-left py-2 px-2">{t("Status")}</th>
                          <th className="text-left py-2 px-2">
                            {t("Notified")}
                          </th>
                          <th className="text-left py-2 px-2">
                            {t("Views by")}
                          </th>
                          <th className="text-left py-2 px-2">
                            {t("Measure")}
                          </th>
                          <th className="text-left py-2 px-2">{t("GDPR")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.findings.map((f) => (
                          <tr
                            key={f.findingId}
                            className="border-b border-(--border) align-top"
                            data-testid="finding-row"
                          >
                            <td className="py-2 px-2">
                              <div>{f.partyName ?? f.partyId}</div>
                              {f.permitId && (
                                <div className="font-mono text-(--text-secondary)">
                                  {f.permitId}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <div>{f.description}</div>
                              <div className="font-mono text-(--text-secondary)">
                                {f.findingId}
                              </div>
                              {f.views && (
                                <div className="text-(--text-secondary)">
                                  {t("Views: {views}", { views: f.views })}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2">{f.status}</td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              {f.notifiedAt?.slice(0, 10)}
                            </td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              {f.respondBy?.slice(0, 10)}
                            </td>
                            <td className="py-2 px-2">
                              {f.measure ?? "—"}
                              {f.revokedPermit ? ` (${f.revokedPermit})` : ""}
                              {f.measureNote ? `: ${f.measureNote}` : ""}
                            </td>
                            <td className="py-2 px-2">
                              {f.gdprBreach ? t("authority informed") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Mail
                    size={14}
                    className="text-teal-800 dark:text-teal-300"
                  />
                  {t("Requests for information, Art. 63(1) ({n})", {
                    n: data.informationRequests?.length ?? 0,
                  })}
                </h2>
                {!data.informationRequests ||
                data.informationRequests.length === 0 ? (
                  <p className="text-(--text-secondary) text-sm">
                    {t("No request recorded")}
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-(--text-secondary) border-b border-(--border)">
                          <th className="text-left py-2 px-2">{t("Party")}</th>
                          <th className="text-left py-2 px-2">
                            {t("Question")}
                          </th>
                          <th className="text-left py-2 px-2">{t("Status")}</th>
                          <th className="text-left py-2 px-2">{t("Asked")}</th>
                          <th className="text-left py-2 px-2">
                            {t("Answer by")}
                          </th>
                          <th className="text-left py-2 px-2">{t("Answer")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.informationRequests.map((r) => (
                          <tr
                            key={r.requestId}
                            className="border-b border-(--border) align-top"
                            data-testid="information-request-row"
                          >
                            <td className="py-2 px-2">
                              {r.partyName ?? r.partyId}
                            </td>
                            <td className="py-2 px-2">{r.question}</td>
                            <td className="py-2 px-2">{r.status}</td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              {r.requestedAt?.slice(0, 10)}
                            </td>
                            <td className="py-2 px-2 whitespace-nowrap">
                              {r.answerBy?.slice(0, 10)}
                            </td>
                            <td className="py-2 px-2">{r.answer ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === "accesslogs" && (
              <AccessLogSection logs={data.accesslogs ?? []} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
