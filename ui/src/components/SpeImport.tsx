"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Database, Loader2, Network } from "lucide-react";
import { fetchApi } from "@/lib/api";
import {
  DEFAULT_IMPORT_SPE,
  IMPORT_SPES,
  importGraphUrl,
  type SpeImportResult,
} from "@/lib/spe-import";
import { useT } from "@/lib/i18n/translate";

/**
 * Ends an open transfer in a secure processing environment (#876): the user
 * picks the SPE (SPE-1 unless they choose another), the hub imports the
 * transfer's data into that workspace's graph, and the result links to the
 * graph viewer focused on the new dataset.
 */
export default function SpeImport({
  transferId,
  participantId,
}: {
  transferId: string;
  participantId: string;
}) {
  const t = useT("research");
  const [speId, setSpeId] = useState<string>(DEFAULT_IMPORT_SPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SpeImportResult | null>(null);

  const runImport = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetchApi(
        `/api/transfers/${encodeURIComponent(transferId)}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, speId }),
        },
      );
      const body = (await res.json()) as Partial<SpeImportResult> & {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError([body.error, body.detail].filter(Boolean).join(": "));
        return;
      }
      // The static build answers every POST with {ok: true}; the link and
      // the SPE are still the ones the user chose.
      setResult({
        datasetId: body.datasetId ?? transferId,
        speId: body.speId ?? speId,
        records: body.records ?? 0,
        relationships: body.relationships ?? 0,
        byType: body.byType ?? {},
        importedAt: body.importedAt ?? "",
        pseudonymised: body.pseudonymised ?? true,
        graphUrl: body.graphUrl ?? importGraphUrl(transferId, speId),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="spe-import" className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`spe-${transferId}`}
          className="text-(--text-secondary)"
        >
          {t("Import into")}
        </label>
        <select
          id={`spe-${transferId}`}
          data-testid="spe-import-target"
          value={speId}
          onChange={(e) => setSpeId(e.target.value)}
          disabled={busy}
          className="px-2 py-1 rounded border border-(--border) bg-(--surface) text-(--text-primary)"
        >
          {IMPORT_SPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} ({s.holder})
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="spe-import-run"
          onClick={() => void runImport()}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded bg-(--accent) text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Database size={12} />
          )}
          {busy ? t("Importing…") : t("Import into SPE")}
        </button>
      </div>

      {error && (
        <p
          data-testid="spe-import-error"
          className="text-(--badge-inactive-text)"
        >
          {t("The import failed: {detail}", { detail: error })}
        </p>
      )}

      {result && (
        <div
          data-testid="spe-import-done"
          className="flex flex-wrap items-center gap-2 rounded border border-green-700/50 bg-green-900/20 px-2 py-1.5 text-(--text-primary)"
        >
          <CheckCircle2 size={14} className="text-green-500" />
          <span>
            {t(
              "Imported {records} records with {relationships} references into {spe}.",
              {
                records: String(result.records),
                relationships: String(result.relationships),
                spe: result.speId,
              },
            )}
            {result.pseudonymised && ` ${t("Patients are pseudonymised.")}`}
          </span>
          <Link
            href={result.graphUrl}
            data-testid="spe-import-graph"
            className="flex items-center gap-1 underline text-(--accent)"
          >
            <Network size={12} />
            {t("Show in the graph")}
          </Link>
        </div>
      )}
    </div>
  );
}
