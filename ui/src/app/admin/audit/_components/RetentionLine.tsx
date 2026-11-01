"use client";

import { fetchApi } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import type { RetentionState } from "./types";
import { T, useT } from "@/lib/i18n/translate";

/**
 * Art. 73(1)(e): the logs are kept at least one year. Shows the state of
 * the records and lets the access body delete only what is past its date.
 */
export function RetentionLine() {
  const t = useT("admin");
  const [state, setState] = useState<RetentionState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetchApi("/api/admin/audit/retention")
      .then((r) => r.json())
      .then((d) => (d?.policy && d?.events ? setState(d) : setState(null)))
      .catch(() => setState(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!state?.policy || !state.events) return null;
  const purge = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetchApi("/api/admin/audit/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMsg(
        t(
          "Deleted {events} event(s) and {transfers} transfer(s) past their retention date; {kept} event(s) kept.",
          {
            events: d.deleted.events,
            transfers: d.deleted.transfers,
            kept: d.events.protectedCount,
          },
        ),
      );
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="mb-4 rounded-lg border border-(--border) bg-(--surface) p-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-2"
      data-testid="retention-line"
    >
      <span>
        <T
          area="admin"
          vars={{
            months: state.policy.months,
            article: state.policy.article.replace(
              "Regulation (EU) 2025/327, ",
              "",
            ),
            total: state.events.total,
            oldest: state.events.oldest
              ? state.events.oldest.slice(0, 10)
              : "—",
            expired: state.events.expired,
            kept: state.events.protectedCount,
          }}
          tags={{ b: <strong /> }}
        >
          {
            "<b>Retention:</b> at least {months} months ({article}) · {total} access event(s), oldest {oldest} · {expired} past their date, {kept} protected"
          }
        </T>
      </span>
      <button
        type="button"
        onClick={purge}
        disabled={busy}
        className="px-2 py-1 rounded-sm border border-(--border) disabled:opacity-50"
        title={state.policy.rule}
      >
        {busy ? t("Deleting…") : t("Delete expired records")}
      </button>
      {msg && <span role="status">{msg}</span>}
    </div>
  );
}
