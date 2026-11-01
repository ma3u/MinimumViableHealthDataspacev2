"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import {
  classifyAccess,
  type Criticality,
  type CriticalityLevel,
} from "@/lib/access-criticality";
import { isTestIdentity } from "@/lib/test-identity";
import { useT } from "@/lib/i18n/translate";
import { RetentionLine } from "./RetentionLine";
import { accessTypeBadge, formatBytes } from "./helpers";
import type { AuditData } from "./types";

type AccessLog = NonNullable<AuditData["accesslogs"]>[number];

const LEVEL_LABEL: Record<CriticalityLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const LEVEL_CLASS: Record<CriticalityLevel, string> = {
  high: "bg-(--role-admin-bg) text-(--role-admin-text) border border-(--role-admin-border)",
  medium:
    "bg-(--role-hdab-bg) text-(--role-hdab-text) border border-(--role-hdab-border)",
  low: "bg-(--role-user-bg) text-(--role-user-text) border border-(--role-user-border)",
};

function CriticalityChip({
  crit,
  t,
}: {
  crit: Criticality;
  t: (text: string) => string;
}) {
  return (
    <span
      data-testid="criticality-chip"
      data-level={crit.level}
      title={crit.reasons.map((r) => t(r)).join(" · ")}
      className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${
        LEVEL_CLASS[crit.level]
      }`}
    >
      {t(LEVEL_LABEL[crit.level])}
    </span>
  );
}

/**
 * The Access Logs tab: every access the neo4j-proxy recorded, each with its
 * criticality (`lib/access-criticality.ts`) and, for a forged CI session, a
 * Test badge. Both filters work on the rows already loaded; the API is not
 * asked again.
 */
export function AccessLogSection({ logs }: { logs: AccessLog[] }) {
  const t = useT("admin");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<"" | CriticalityLevel>("");
  const [hideTests, setHideTests] = useState(false);

  const rows = useMemo(
    () =>
      logs.map((a, i) => ({
        a,
        key: a.id ?? `log-${i}`,
        crit: classifyAccess(a),
        test: isTestIdentity(a.consumerDid),
      })),
    [logs],
  );
  const shown = rows.filter(
    (r) => (!level || r.crit.level === level) && !(hideTests && r.test),
  );
  const hidden = rows.length - shown.length;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="mb-8">
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Eye size={14} className="text-teal-800 dark:text-teal-300" />
        {t("Data Access Logs ({n})", { n: logs.length })}
      </h2>
      <RetentionLine />
      {logs.length === 0 ? (
        <p className="text-(--text-secondary) text-sm">
          {t("No access logs recorded")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
            <label className="flex items-center gap-2 text-(--text-secondary)">
              {t("Criticality")}
              <select
                aria-label={t("Criticality")}
                data-testid="criticality-filter"
                value={level}
                onChange={(e) =>
                  setLevel(e.target.value as "" | CriticalityLevel)
                }
                className="bg-(--surface-2) border border-(--border) rounded-sm px-2 py-1 text-(--text-primary)"
              >
                <option value="">{t("All")}</option>
                <option value="high">{t("High")}</option>
                <option value="medium">{t("Medium")}</option>
                <option value="low">{t("Low")}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-(--text-secondary)">
              <input
                type="checkbox"
                data-testid="hide-tests"
                checked={hideTests}
                onChange={(e) => setHideTests(e.target.checked)}
              />
              {t("Hide automated tests")}
            </label>
            {hidden > 0 && (
              <span className="text-(--text-secondary)">
                {t("{n} hidden by the filters", { n: hidden })}
              </span>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="text-(--text-secondary) text-sm">
              {t("No access matches the filters")}
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-(--text-secondary) border-b border-(--border)">
                    <th className="text-left py-2 px-2">{t("Criticality")}</th>
                    <th className="text-left py-2 px-2">{t("Consumer")}</th>
                    <th className="text-left py-2 px-2">{t("Provider")}</th>
                    <th className="text-left py-2 px-2">{t("Asset")}</th>
                    <th className="text-left py-2 px-2">{t("Type")}</th>
                    <th className="text-left py-2 px-2">{t("Purpose")}</th>
                    <th className="text-left py-2 px-2">{t("Accessed At")}</th>
                    <th className="text-left py-2 px-2">{t("Bytes")}</th>
                    <th className="text-left py-2 px-2">{t("Contract")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ a, key, crit, test }) => {
                    const isOpen = expanded.has(key);
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          data-testid="access-log-row"
                          className="border-b border-(--border) hover:bg-(--surface-2)/50 cursor-pointer"
                        >
                          <td className="py-2 px-2">
                            <span className="inline-flex items-center gap-1">
                              {isOpen ? (
                                <ChevronDown size={11} />
                              ) : (
                                <ChevronRight size={11} />
                              )}
                              <CriticalityChip crit={crit} t={t} />
                            </span>
                          </td>
                          <td className="py-2 px-2 text-(--text-primary)">
                            {a.consumerName ?? a.consumerDid ?? "—"}
                            {a.consumerCountry && (
                              <span className="text-(--text-secondary)">
                                {" "}
                                ({a.consumerCountry})
                              </span>
                            )}
                            {test && (
                              <span
                                data-testid="test-identity-badge"
                                title={t(
                                  "An automated test signed in with a forged session, not a participant",
                                )}
                                className="ml-1 inline-block px-1 py-0.5 rounded-sm text-[10px] font-semibold uppercase bg-(--surface-2) text-(--text-secondary) border border-(--border)"
                              >
                                {t("Test")}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-(--text-primary)">
                            {a.providerName ?? a.providerDid ?? "—"}
                            {a.providerCountry && (
                              <span className="text-(--text-secondary)">
                                {" "}
                                ({a.providerCountry})
                              </span>
                            )}
                          </td>
                          <td
                            className="py-2 px-2 text-(--text-secondary) max-w-[180px] truncate"
                            title={a.assetId ?? ""}
                          >
                            {a.assetTitle ?? a.assetId ?? "—"}
                          </td>
                          <td className="py-2 px-2">
                            {accessTypeBadge(a.accessType, t)}
                          </td>
                          <td
                            className="py-2 px-2 text-(--text-secondary) max-w-[140px] truncate"
                            title={a.purpose}
                          >
                            {a.purpose ?? "—"}
                          </td>
                          <td className="py-2 px-2 text-(--text-secondary)">
                            {a.accessedAt ? a.accessedAt.slice(0, 10) : "—"}
                          </td>
                          <td className="py-2 px-2 text-(--text-secondary)">
                            {formatBytes(a.bytesAccessed)}
                          </td>
                          <td
                            className="py-2 px-2 font-mono text-(--text-secondary) text-[10px]"
                            title={a.contractId ?? ""}
                          >
                            {a.contractId
                              ? a.contractId.length > 14
                                ? a.contractId.slice(0, 12) + "…"
                                : a.contractId
                              : "—"}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr
                            className="border-b border-(--border) bg-(--surface)"
                            data-testid="access-log-detail"
                          >
                            <td colSpan={9} className="px-4 py-3">
                              <AccessLogDetail a={a} crit={crit} t={t} />
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
        </>
      )}
    </section>
  );
}

function AccessLogDetail({
  a,
  crit,
  t,
}: {
  a: AccessLog;
  crit: Criticality;
  t: (text: string, vars?: Record<string, string | number>) => string;
}) {
  const detail: [string, string | number | null | undefined][] = [
    [t("Event"), a.id],
    [t("Recorded"), a.accessedAt],
    [t("Consumer"), a.consumerDid],
    [t("Provider"), a.providerDid],
    [t("Dataset"), a.assetTitle ? `${a.assetTitle} (${a.assetId})` : a.assetId],
    [
      t("Request"),
      a.endpoint ? `${a.method ?? ""} ${a.endpoint}`.trim() : null,
    ],
    [t("Status"), a.statusCode],
    [t("Results"), a.resultCount],
    [t("Bytes"), a.bytesAccessed],
    [t("Duration"), a.durationMs != null ? `${a.durationMs} ms` : null],
    [t("Content type"), a.contentType],
    [t("Protocol"), a.protocol],
    [t("Purpose, Art. 53(1)"), a.purpose],
    [
      t("Data permit, Art. 68"),
      a.permitId
        ? `${a.permitId}${
            a.permitStatus
              ? ` (${a.permitStatus}${
                  a.permitValidUntil
                    ? `, ${t("valid until {date}", {
                        date: a.permitValidUntil.slice(0, 10),
                      })}`
                    : ""
                })`
              : ""
          }`
        : null,
    ],
    [t("Contract"), a.contractId],
    [t("Transfer"), a.transferId],
    [t("Error"), a.errorMessage],
    [
      t("Origin"),
      a.demo ? t("seeded demo event") : t("recorded by the neo4j-proxy"),
    ],
  ];
  return (
    <>
      {a.name && (
        <div className="text-xs font-semibold text-(--text-primary) mb-2">
          {a.name}
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-2 text-xs mb-2"
        data-testid="criticality-reasons"
      >
        <span className="text-(--text-secondary)">{t("Criticality")}</span>
        <CriticalityChip crit={crit} t={t} />
        <ul className="flex flex-wrap gap-x-3 gap-y-1 list-disc list-inside text-(--text-primary)">
          {crit.reasons.map((r) => (
            <li key={r}>{t(r)}</li>
          ))}
        </ul>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs">
        {detail
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([label, value]) => (
            <div key={label} className="flex gap-2 min-w-0">
              <dt className="text-(--text-secondary) shrink-0">{label}</dt>
              <dd className="font-mono text-(--text-primary) break-all">
                {String(value)}
              </dd>
            </div>
          ))}
      </dl>
    </>
  );
}
