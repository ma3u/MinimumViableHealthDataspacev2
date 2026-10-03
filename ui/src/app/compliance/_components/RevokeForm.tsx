"use client";

import { fetchApi } from "@/lib/api";
import { useState } from "react";

/**
 * Revocation of an issued permit (Art. 63(3)). A refusal of a later
 * application changes nothing for a permit already issued; only this stops
 * the transfers, and the public register lists it (Art. 57(1)(j)(iv)).
 */
export function RevokeForm({
  permitId,
  onDone,
}: {
  permitId: string;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchApi("/api/compliance/permits/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permitId, reason }),
      });
      const body = (await r.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!r.ok) {
        setError(String(body.error ?? `HTTP ${r.status}`));
        return;
      }
      setDone(
        `Data permit ${permitId} revoked; transfers under it stop now and the register lists the measure (Art. 63(3)).`,
      );
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="rounded-lg border border-(--danger-text)/40 bg-(--bg) p-3 space-y-2 text-xs"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Revoke data permit"
    >
      <div className="font-semibold text-(--text-primary)">
        Revoke this permit
        <span className="font-normal text-(--text-secondary)">
          {" "}
          · Art. 63(3), on non-compliance by the data user
        </span>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-(--text-secondary)">
          Reason (published with the measure, Art. 57(1)(j)(iv))
        </span>
        <textarea
          id={`revoke-reason-${permitId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1"
        />
      </label>
      <button
        type="button"
        disabled={busy || !reason.trim() || done !== null}
        onClick={revoke}
        className="px-3 py-1.5 rounded-sm font-semibold border border-(--danger-text) text-(--danger-text) disabled:opacity-50"
        title={reason.trim() ? "" : "A revocation needs a reason"}
      >
        {busy ? "Revoking…" : "Revoke permit"}
      </button>
      {error && (
        <p className="text-(--danger-text)" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="text-(--success-text)" role="status">
          {done}
        </p>
      )}
    </form>
  );
}
