"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useT } from "@/lib/i18n/translate";
import { formatSpeTime } from "@/lib/spe";
import type { StagedImport } from "@/lib/spe-import";

/**
 * Imports that wait in a workspace's staging area for the health data
 * access body (#1236, draft SPE implementing act Art. 4(2), (3)). The body
 * checks what a user brings into a secure processing environment against
 * the permit before it joins the workspace's data; a refusal removes it.
 * Every decision is on the admin audit chain first.
 */
export function StagedImports() {
  const t = useT("compliance");
  const [rows, setRows] = useState<StagedImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetchApi("/api/spe-imports/staged");
      const body = (await res.json()) as {
        staged?: StagedImport[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? String(res.status));
      setRows(body.staged ?? []);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: StagedImport, decision: "approve" | "reject") => {
    setBusy(row.importId);
    try {
      const res = await fetchApi(
        `/api/spe-imports/staged/${encodeURIComponent(row.importId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speId: row.speId,
            decision,
            ...(decision === "reject" ? { reason } : {}),
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? String(res.status));
      setDone((d) => ({
        ...d,
        [row.importId]:
          decision === "approve"
            ? t("Approved: the data is in {spe}.", { spe: row.speId })
            : t("Refused: the staged data was removed from {spe}.", {
                spe: row.speId,
              }),
      }));
      setRejecting(null);
      setReason("");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      id="import-review"
      aria-labelledby="import-review-title"
      className="mt-12 border-t border-(--border) pt-8"
      data-testid="staged-imports"
    >
      <h2
        id="import-review-title"
        className="flex items-center gap-2 text-xl font-bold"
      >
        <Inbox size={18} aria-hidden="true" />
        {t("Imports waiting for review")}
      </h2>
      <p className="text-sm text-(--text-secondary) mt-1 mb-4">
        {t(
          "What a data user brings into a secure processing environment waits in its staging area until you have checked it against the data permit. Approve it to place it in the workspace, or refuse it with a reason to remove it. Every decision is recorded on the audit chain.",
        )}
      </p>
      {error && (
        <p role="alert" className="text-sm text-(--danger-text) mb-3">
          {error}
        </p>
      )}
      {rows === null ? (
        <p className="text-sm text-(--text-secondary)">{t("Loading…")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-(--text-secondary)">
          {t("No import waits for review.")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.importId}
              data-testid="staged-import"
              className="rounded-lg border border-(--border) bg-(--surface) p-4 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-(--text-primary)">
                  {t("{records} records for {spe}", {
                    records: String(row.records),
                    spe: row.speId,
                  })}
                </span>
                <span className="text-xs text-(--text-secondary)">
                  {formatSpeTime(row.stagedAt)}
                </span>
              </div>
              <p className="text-xs text-(--text-secondary) mt-1">
                {t("Transfer {transfer} from {provider}, imported by {who}", {
                  transfer: row.transferId || row.datasetId,
                  provider: row.provider || "?",
                  who: row.importedBy || row.consumer || "?",
                })}
                {row.pseudonymised && ` · ${t("pseudonymised")}`}
                {row.overwrite && ` · ${t("replaces an earlier import")}`}
              </p>
              <p className="text-xs text-(--text-secondary) mt-1">
                {Object.entries(row.byType)
                  .map(([type, n]) => `${type} ${n}`)
                  .join(", ")}
              </p>
              {done[row.importId] ? (
                <p className="mt-2 text-xs font-semibold text-(--text-primary)">
                  {done[row.importId]}
                </p>
              ) : rejecting === row.importId ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`reason-${row.importId}`}>
                    {t("Reason for the refusal")}
                  </label>
                  <input
                    id={`reason-${row.importId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("Reason for the refusal")}
                    className="flex-1 min-w-48 rounded border border-(--border) bg-(--surface-2) px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!reason.trim() || busy === row.importId}
                    onClick={() => void decide(row, "reject")}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t("Refuse")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(null)}
                    className="text-xs text-(--text-secondary) underline"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === row.importId}
                    onClick={() => void decide(row, "approve")}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t("Approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === row.importId}
                    onClick={() => {
                      setRejecting(row.importId);
                      setReason("");
                    }}
                    className="rounded border border-(--border) px-3 py-1 text-xs font-semibold text-(--text-primary)"
                  >
                    {t("Refuse")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
