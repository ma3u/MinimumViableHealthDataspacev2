"use client";

import { fetchApi } from "@/lib/api";
import { useState } from "react";
import { shortDate } from "./helpers";
import type { MatrixRow } from "./types";

/**
 * The access body's two actions on the Art. 68(4) clock: send the applicant
 * back for the missing items (four weeks), or extend the three months once.
 */
export function ClockActions({
  row,
  onDone,
}: {
  row: MatrixRow;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState<string>(
    row.completeness && !row.completeness.complete
      ? `Missing: ${row.completeness.missing
          .map((m) => `(${m.item}) ${m.label}`)
          .join("; ")}`
      : "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!row.applicationId) return null;

  const act = async (action: "INCOMPLETE" | "EXTEND") => {
    setBusy(action);
    setError(null);
    setMsg(null);
    try {
      const r = await fetchApi("/api/compliance/applications/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: row.applicationId,
          action,
          reason,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setError(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setMsg(
        action === "EXTEND"
          ? `Extended once by three months; the decision is now due ${shortDate(
              String(body.decisionDue ?? ""),
            )} (Art. 68(4)).`
          : `Applicant notified; the application must be completed by ${shortDate(
              String(body.completeBy ?? ""),
            )}; the three months run again from the complete application (Art. 68(4)).`,
      );
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const paused = row.clockState === "paused";
  return (
    <div
      className="rounded-lg border border-(--border) bg-(--bg) p-3 space-y-2 text-xs"
      data-testid="clock-actions"
    >
      <div className="font-semibold text-(--text-primary)">
        The clock, Art. 68(4)
        <span className="font-normal text-(--text-secondary)">
          {" "}
          ·{" "}
          {paused
            ? `stopped since ${shortDate(row.incompleteNoticeAt)}: ${
                row.incompleteReason ?? "incomplete"
              }`
            : row.extended
              ? `extended once: ${row.extensionReason ?? ""}`
              : "running"}
        </span>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-(--text-secondary)">
          Reasons (what is missing, or why the extension)
        </span>
        <textarea
          id={`clock-reason-${row.applicationId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || paused || !reason.trim()}
          onClick={() => act("INCOMPLETE")}
          className="px-3 py-1.5 rounded-sm font-semibold border border-(--border) disabled:opacity-50"
          title={
            paused
              ? "The applicant has already been asked to complete the application"
              : "Send the applicant back for the missing items; four weeks"
          }
        >
          {busy === "INCOMPLETE" ? "Notifying…" : "Notify incomplete"}
        </button>
        <button
          type="button"
          disabled={busy !== null || paused || row.extended || !reason.trim()}
          onClick={() => act("EXTEND")}
          className="px-3 py-1.5 rounded-sm font-semibold border border-(--border) disabled:opacity-50"
          title={
            row.extended
              ? "Art. 68(4) allows one extension"
              : "Extend the three months once, by three, with reasons"
          }
        >
          {busy === "EXTEND" ? "Extending…" : "Extend by three months"}
        </button>
      </div>
      {error && (
        <p className="text-(--danger-text)" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-(--success-text)" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
