"use client";

import { fetchApi } from "@/lib/api";
import {
  CRITERIA,
  CRITERIA_LABELS,
  PURPOSES,
  PURPOSE_LABELS,
  type Criterion,
} from "@/lib/permits";
import { estimateFee } from "@/lib/fees";
import { useState } from "react";
import { ApplicationItemsList } from "./ApplicationItemsList";
import { ClockActions } from "./ClockActions";
import { RevokeForm } from "./RevokeForm";
import { isUndecided, shortDate } from "./helpers";
import type { DecisionResult, MatrixRow } from "./types";

export function ApplicationPanel({
  row,
  canDecide,
  onDecided,
}: {
  row: MatrixRow;
  canDecide: boolean;
  onDecided: () => Promise<void>;
}) {
  const [purpose, setPurpose] = useState<string>(
    row.requestedPurpose &&
      (PURPOSES as readonly string[]).includes(row.requestedPurpose)
      ? row.requestedPurpose
      : "SCIENTIFIC_RESEARCH",
  );
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [conditions, setConditions] = useState<string>(
    "Access only in the secure processing environment (Art. 73)\nAggregate output only; no re-identification (Art. 61(3))",
  );
  const [justification, setJustification] = useState<string>("");
  const [criteria, setCriteria] = useState<Record<Criterion, boolean>>(
    () =>
      Object.fromEntries(CRITERIA.map((c) => [c, true])) as Record<
        Criterion,
        boolean
      >,
  );
  const [statisticalAlternative, setStatisticalAlternative] = useState(false);
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!row.hasApplication || !row.applicationId) {
    return null;
  }

  const decide = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(decision);
    setError(null);
    try {
      const r = await fetchApi("/api/compliance/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: row.applicationId,
          decision,
          purpose,
          validUntil: `${validUntil}T23:59:59Z`,
          conditions,
          justification,
          criteria,
          statisticalAlternative,
          datasetId: row.requestedDatasetId ?? undefined,
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
      setResult(body as unknown as DecisionResult);
      await onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const undecided = isUndecided(row);

  return (
    <div className="mb-4 space-y-3" data-testid="application-panel">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-(--text-secondary)">Application </span>
          <span className="font-mono">{row.applicationId}</span>
        </div>
        <div>
          <span className="text-(--text-secondary)">Submitted </span>
          {shortDate(row.submittedAt) || "—"}
          {row.decisionDue && (
            <span className="text-(--text-secondary)">
              {" "}
              · the access body&apos;s permit decision is due{" "}
              {shortDate(row.decisionDue)}, three months after the application
              (Art. 68(4))
            </span>
          )}
        </div>
        <div>
          <span className="text-(--text-secondary)">Purpose </span>
          {row.requestedPurpose ?? "—"}
        </div>
        <div>
          <span className="text-(--text-secondary)">Dataset </span>
          {row.requestedDatasetTitle ?? row.requestedDatasetId ?? "—"}
        </div>
        <div className="md:col-span-2">
          <span className="text-(--text-secondary)">Justification </span>
          {row.justification ?? "—"}
        </div>
        {row.ethicsCommitteeRef && (
          <div>
            <span className="text-(--text-secondary)">Ethics </span>
            {row.ethicsCommitteeRef}
          </div>
        )}
        {row.completedAt && (
          <div>
            <span className="text-(--text-secondary)">Completed </span>
            {shortDate(row.completedAt)}
            <span className="text-(--text-secondary)">
              {" "}
              · the three months run from here (Art. 68(4))
            </span>
          </div>
        )}
        {row.hasApproval && (
          <div className="md:col-span-2">
            <span className="text-(--text-secondary)">Decision </span>
            {row.approvalStatus === "REJECTED"
              ? "refused"
              : row.approvalStatus === "REVOKED"
                ? "data permit revoked"
                : "data permit issued"}
            {row.decidedAt ? ` on ${shortDate(row.decidedAt)}` : ""}
            {row.validUntil ? `, valid until ${shortDate(row.validUntil)}` : ""}
            {row.decisionJustification ? ` · ${row.decisionJustification}` : ""}
            {row.revokedAt
              ? ` · revoked ${shortDate(row.revokedAt)}${
                  row.revocationReason ? `: ${row.revocationReason}` : ""
                }`
              : ""}
            {row.statisticalAlternativeOffered
              ? " · an anonymised statistical answer was offered instead (Art. 68(3))"
              : ""}
          </div>
        )}
      </div>

      <ApplicationItemsList row={row} />

      {undecided && (
        <p className="text-xs" data-testid="fee-estimate">
          <span className="text-(--text-secondary)">
            Fee estimate, Art. 62:{" "}
          </span>
          {(() => {
            const f = estimateFee(row);
            return `${f.totalEur.toLocaleString(
              "en-GB",
            )} EUR, access body ${f.bodyEur.toLocaleString(
              "en-GB",
            )} and data holder ${f.holderEur.toLocaleString("en-GB")}${
              f.reduction > 0
                ? `, reduced by ${Math.round(f.reduction * 100)}% for a ${
                    f.categoryLabel
                  } (Art. 62(3))`
                : ""
            }`;
          })()}
        </p>
      )}

      {canDecide && undecided && <ClockActions row={row} onDone={onDecided} />}

      {canDecide && (
        <form
          className="rounded-lg border border-(--border) bg-(--bg) p-3 space-y-3 text-xs"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Data permit decision"
        >
          <div className="font-semibold text-(--text-primary)">
            {undecided ? "Decide this application" : "Decide again"}
            <span className="font-normal text-(--text-secondary)">
              {" "}
              · Regulation (EU) 2025/327, Art. 68
            </span>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-(--text-secondary) mb-1">
              Criteria assessed, Art. 68(1)
            </legend>
            {CRITERIA.map((c) => (
              <label key={c} className="flex items-start gap-2">
                <input
                  id={`criterion-${row.applicationId}-${c}`}
                  type="checkbox"
                  checked={criteria[c]}
                  onChange={(e) =>
                    setCriteria({ ...criteria, [c]: e.target.checked })
                  }
                />
                <span>
                  ({c}) {CRITERIA_LABELS[c]}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-(--text-secondary)">
                Purpose, Art. 53(1)
              </span>
              <select
                id={`purpose-${row.applicationId}`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1"
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-(--text-secondary)">Valid until</span>
              <input
                id={`valid-until-${row.applicationId}`}
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-(--text-secondary)">
              Conditions, one per line
            </span>
            <textarea
              id={`conditions-${row.applicationId}`}
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-(--text-secondary)">
              Justification (required for a refusal; published with the
              decision, Art. 57(1)(j)(iii))
            </span>
            <textarea
              id={`justification-${row.applicationId}`}
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="rounded-sm border border-(--border) bg-(--surface) px-2 py-1"
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              id={`statistical-alternative-${row.applicationId}`}
              type="checkbox"
              checked={statisticalAlternative}
              onChange={(e) => setStatisticalAlternative(e.target.checked)}
            />
            <span>
              With a refusal, offer an anonymised statistical answer instead of
              the data (Art. 68(3); the applicant files a request under Art. 69)
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => decide("APPROVED")}
              className="px-3 py-1.5 rounded-sm font-semibold bg-(--accent) text-white disabled:opacity-60"
            >
              {busy === "APPROVED" ? "Issuing…" : "Issue data permit"}
            </button>
            <button
              type="button"
              disabled={busy !== null || !justification.trim()}
              onClick={() => decide("REJECTED")}
              className="px-3 py-1.5 rounded-sm font-semibold border border-(--danger-text) text-(--danger-text) disabled:opacity-50"
              title={
                justification.trim() ? "" : "A refusal needs a justification"
              }
            >
              {busy === "REJECTED" ? "Refusing…" : "Refuse"}
            </button>
          </div>
          {error && (
            <p className="text-(--danger-text)" role="alert">
              {error}
            </p>
          )}
          {result && (
            <p className="text-(--success-text)" role="status">
              {result.decision === "APPROVED"
                ? `Data permit ${
                    result.permitId
                  } issued, valid until ${shortDate(result.validUntil)}.`
                : `Application refused; ${
                    result.permitId
                  } records the justification${
                    result.statisticalAlternative
                      ? ", and an anonymised statistical answer is offered instead (Art. 68(3))"
                      : ""
                  }.`}{" "}
              Publish by {result.publishBy} (Art. 57(1)(j)(iii)).
            </p>
          )}
        </form>
      )}

      {canDecide &&
        row.hasApproval &&
        row.approvalStatus === "APPROVED" &&
        row.approvalId && (
          <RevokeForm permitId={row.approvalId} onDone={onDecided} />
        )}
    </div>
  );
}
