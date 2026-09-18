"use client";

import { fetchApi } from "@/lib/api";
import {
  ITEM_TITLES,
  toMarkdown,
  type ActivityReport,
} from "@/lib/activity-report";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileBarChart, Download } from "lucide-react";

/**
 * The activity report of the health data access body, Regulation (EU)
 * 2025/327 Art. 59(1)(a) to (k), generated from the graph. Public, no
 * sign-in: the regulation wants it on the body's website. Issue #206, M6.
 */

type ItemKey = keyof ActivityReport["items"];
const ITEM_KEYS = Object.keys(ITEM_TITLES) as ItemKey[];

function day(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

function Pairs({ map }: { map: Record<string, number> }) {
  const rows = Object.entries(map);
  if (rows.length === 0) {
    return <span className="text-[var(--text-secondary)]">none</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {rows.map(([k, v]) => (
        <span
          key={k}
          className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-primary)] text-xs"
        >
          {k}: {v}
        </span>
      ))}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="text-xs text-[var(--text-secondary)] mt-3">{children}</p>
  );
}

function ItemBody({
  itemKey,
  report,
}: {
  itemKey: ItemKey;
  report: ActivityReport;
}) {
  const { items } = report;
  switch (itemKey) {
    case "a":
      return (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Applications" value={items.a.applications} />
            <Stat label="Permits issued" value={items.a.permitsIssued} />
            <Stat label="Refused" value={items.a.refused} />
            <Stat label="Revoked" value={items.a.revoked} />
            <Stat label="Pending" value={items.a.pending} />
          </div>
          <dl className="mt-3 text-sm space-y-2">
            <div className="flex gap-2 flex-wrap">
              <dt className="text-[var(--text-secondary)] w-44 shrink-0">
                Types of applicants
              </dt>
              <dd>
                <Pairs map={items.a.byApplicantType} />
              </dd>
            </div>
            <div className="flex gap-2 flex-wrap">
              <dt className="text-[var(--text-secondary)] w-44 shrink-0">
                Purposes requested
              </dt>
              <dd>
                <Pairs map={items.a.byPurpose} />
              </dd>
            </div>
            <div className="flex gap-2 flex-wrap">
              <dt className="text-[var(--text-secondary)] w-44 shrink-0">
                Data categories accessed
              </dt>
              <dd className="text-[var(--text-primary)]">
                {items.a.dataCategoriesAccessed.length === 0
                  ? "none"
                  : items.a.dataCategoriesAccessed
                      .map((d) => `${d.title ?? d.datasetId} (${d.permits})`)
                      .join(", ")}
              </dd>
            </div>
            <div className="flex gap-2 flex-wrap">
              <dt className="text-[var(--text-secondary)] w-44 shrink-0">
                Health data requests
              </dt>
              <dd className="text-[var(--text-primary)]">
                {items.a.healthDataRequests} received,{" "}
                {items.a.healthDataRequestsAnswered} answered (Art. 69)
              </dd>
            </div>
            <div className="flex gap-2 flex-wrap">
              <dt className="text-[var(--text-secondary)] w-44 shrink-0">
                Results communicated
              </dt>
              <dd className="text-[var(--text-primary)]">
                {items.a.resultsCommunicated}
              </dd>
            </div>
          </dl>
          <Note>{items.a.note}</Note>
        </>
      );
    case "b":
      return (
        <>
          {items.b.measures.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No measure taken in the period.
            </p>
          ) : (
            <ul className="text-sm space-y-1">
              {items.b.measures.map((m) => (
                <li key={m.permitId} className="text-[var(--text-primary)]">
                  <span className="font-mono">{m.permitId}</span> of{" "}
                  {m.applicant ?? "?"} revoked on {day(m.revokedAt)}
                  {m.reason && (
                    <span className="text-[var(--text-secondary)]">
                      : {m.reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <Stat
              label="Administrative fines"
              value={items.b.administrativeFines.count}
            />
            <Stat
              label="Amount (EUR)"
              value={items.b.administrativeFines.amountEur}
            />
          </div>
          <Note>{items.b.note}</Note>
        </>
      );
    case "c":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Access events" value={items.c.accessEvents} />
            <Stat label="Under a permit" value={items.c.underPermit} />
            <Stat label="Refused" value={items.c.refused} />
          </div>
          {items.c.byUser.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--text-secondary)] text-left">
                  <tr>
                    <th className="py-1 pr-3">Data user</th>
                    <th className="py-1 pr-3">Events</th>
                    <th className="py-1 pr-3">Permits</th>
                    <th className="py-1 pr-3">Refused</th>
                  </tr>
                </thead>
                <tbody>
                  {items.c.byUser.map((u) => (
                    <tr
                      key={u.consumer ?? "unknown"}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="py-1 pr-3 text-[var(--text-primary)]">
                        {u.consumerName ?? u.consumer ?? "unknown"}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">{u.events}</td>
                      <td className="py-1 pr-3 tabular-nums">{u.permits}</td>
                      <td className="py-1 pr-3 tabular-nums">{u.refused}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Note>{items.c.note}</Note>
        </>
      );
    case "h":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Average days"
              value={items.h.averageDays === null ? "n/a" : items.h.averageDays}
            />
            <Stat label="Permits counted" value={items.h.basis} />
          </div>
          {items.h.detail.length > 0 && (
            <ul className="text-sm mt-3 space-y-1">
              {items.h.detail.map((d) => (
                <li
                  key={d.applicationId}
                  className="text-[var(--text-primary)]"
                >
                  <span className="font-mono">{d.applicationId}</span> (
                  {d.applicant ?? "?"}): applied {day(d.submittedAt)}, first
                  access {day(d.accessAt)}, {d.days} days
                </li>
              ))}
            </ul>
          )}
          <Note>{items.h.note}</Note>
        </>
      );
    case "i":
      return (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Stat label="Labels" value={items.i.total} />
            <div className="text-sm">
              <div className="text-xs text-[var(--text-secondary)] mb-1">
                By EEHRxF coverage
              </div>
              <Pairs map={items.i.byCoverage} />
            </div>
          </div>
          {items.i.labels.length > 0 && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--text-secondary)] text-left">
                  <tr>
                    <th className="py-1 pr-3">Dataset</th>
                    <th className="py-1 pr-3">Holder</th>
                    <th className="py-1 pr-3">Completeness</th>
                    <th className="py-1 pr-3">Conformance</th>
                    <th className="py-1 pr-3">Timeliness</th>
                    <th className="py-1 pr-3">Coverage</th>
                    <th className="py-1 pr-3">Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.i.labels.map((l) => (
                    <tr
                      key={l.credentialId}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="py-1 pr-3 text-[var(--text-primary)]">
                        {l.datasetId ?? l.credentialId}
                      </td>
                      <td className="py-1 pr-3">{l.holder ?? "—"}</td>
                      <td className="py-1 pr-3 tabular-nums">
                        {l.completeness ?? "—"}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {l.conformance ?? "—"}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        {l.timeliness ?? "—"}
                      </td>
                      <td className="py-1 pr-3">{l.coverage ?? "—"}</td>
                      <td className="py-1 pr-3">{day(l.assessmentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Note>{items.i.note}</Note>
        </>
      );
    case "e":
      return (
        <>
          <Stat label="Requests handled" value={items.e.requests} />
          <Note>{items.e.note}</Note>
        </>
      );
    case "g":
      return (
        <>
          <Stat label="Revenue (EUR)" value={items.g.amountEur} />
          <Note>{items.g.note}</Note>
        </>
      );
    case "d":
    case "f":
    case "j":
    case "k": {
      const list =
        itemKey === "d"
          ? items.d.audits
          : itemKey === "f"
            ? items.f.activities
            : items[itemKey].entries;
      const note = items[itemKey].note;
      return list.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{note}</p>
      ) : (
        <ul className="text-sm list-disc pl-5 text-[var(--text-primary)]">
          {list.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      );
    }
  }
}

function save(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ActivityReportPage() {
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi("/api/activity-report")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body?.error) {
          throw new Error(body?.detail || body?.error || `HTTP ${r.status}`);
        }
        return body as ActivityReport;
      })
      .then((d) => {
        setReport(d);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const stamp = report ? report.period.to.slice(0, 10) : "";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="page-header flex items-center gap-2">
            <FileBarChart size={28} />
            Activity report of the health data access body
          </h1>
          <p className="text-[var(--text-secondary)] text-lg mt-1">
            Regulation (EU) 2025/327, Art. 59 · public, no sign-in
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-8 text-sm text-[var(--text-secondary)] space-y-2">
          <p>
            Every two years the health data access body publishes a report on
            its activity with the items of Art. 59(1)(a) to (k): the
            applications and permits, the data accessed, how data users and
            holders kept their obligations, the audits, the requests from
            natural persons, revenues, the time from application to access, the
            quality labels, and what came out of the data. This report is
            generated from the graph for the period shown; where nothing is
            recorded for an item, it says so.
          </p>
          <p>
            Participants are fictional. Decisions are taken on{" "}
            <Link
              href="/compliance"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              EHDS Approval
            </Link>{" "}
            and published in the{" "}
            <Link
              href="/permits"
              className="font-bold text-[var(--accent)] hover:underline"
            >
              permits register
            </Link>
            .
          </p>
        </div>

        {loading ? (
          <p className="text-[var(--text-secondary)] text-sm">
            Generating the report…
          </p>
        ) : error ? (
          <div className="text-sm" data-testid="report-error">
            <p className="text-[var(--text-secondary)]">
              The report could not be generated.
            </p>
            <p className="text-red-300 mt-1">{error}</p>
          </div>
        ) : report ? (
          <>
            <div
              className="flex flex-wrap items-center gap-3 mb-6 text-sm"
              data-testid="report-period"
            >
              <span className="text-[var(--text-secondary)]">
                Period{" "}
                <span className="text-[var(--text-primary)]">
                  {day(report.period.from)}
                </span>{" "}
                to{" "}
                <span className="text-[var(--text-primary)]">
                  {day(report.period.to)}
                </span>
                {" · "}generated {day(report.generatedAt)}
                {report.accessBodies.length > 0 && (
                  <>
                    {" · "}
                    {report.accessBodies
                      .map((b) => b.name ?? b.did ?? "?")
                      .join(", ")}
                  </>
                )}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() =>
                  save(
                    `activity-report-${stamp}.md`,
                    "text/markdown",
                    toMarkdown(report),
                  )
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-primary)]"
              >
                <Download size={14} /> Markdown
              </button>
              <button
                type="button"
                onClick={() =>
                  save(
                    `activity-report-${stamp}.json`,
                    "application/json",
                    JSON.stringify(report, null, 2),
                  )
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-primary)]"
              >
                <Download size={14} /> JSON
              </button>
            </div>

            <div className="space-y-4">
              {ITEM_KEYS.map((k) => (
                <section
                  key={k}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                  data-testid={`report-item-${k}`}
                >
                  <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3 flex items-baseline gap-2">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border border-[var(--role-hdab-border)]">
                      ({k})
                    </span>
                    {report.items[k].title}
                  </h2>
                  <ItemBody itemKey={k} report={report} />
                </section>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
