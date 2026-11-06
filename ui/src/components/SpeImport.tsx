"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Database,
  Loader2,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import {
  DEFAULT_IMPORT_SPE,
  IMPORT_SPES,
  importViewUrl,
  type ExistingImport,
  type SpeImportResult,
} from "@/lib/spe-import";
import { useT } from "@/lib/i18n/translate";

/**
 * Ends an open transfer in a secure processing environment (#876): the user
 * picks the SPE (SPE-1 unless they choose another), the hub imports the
 * transfer's data into that workspace's graph, and the result links to the
 * 3D overview of the import. A transfer an SPE holds already says so, and a
 * second import asks first: replace it in the same SPE, or add it to another.
 */
export default function SpeImport({
  transferId,
  participantId,
  known,
  onImported,
  onRestart,
}: {
  transferId: string;
  participantId: string;
  /** What the page already knows the SPEs hold; without it the row asks itself. */
  known?: ExistingImport[];
  /** After an import, so the page can move the row to its new stage. */
  onImported?: () => void;
  /** Starts a new transfer under the same contract, when the access expired. */
  onRestart?: () => void;
}) {
  const t = useT("research");
  const [speId, setSpeId] = useState<string>(DEFAULT_IMPORT_SPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SpeImportResult | null>(null);
  const [existing, setExisting] = useState<ExistingImport[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [expired, setExpired] = useState(false);
  /** Minutes until a workspace that is starting can take the import (ADR-072). */
  const [startingIn, setStartingIn] = useState<number | null>(null);

  const loadExisting = useCallback(() => {
    fetchApi(`/api/spe-imports?ids=${encodeURIComponent(transferId)}`)
      .then((r) => (r.ok ? r.json() : { imports: [] }))
      .then((b: { imports?: ExistingImport[] }) =>
        setExisting(
          (b.imports ?? []).filter((i) => i.datasetId === transferId),
        ),
      )
      .catch(() => setExisting([]));
  }, [transferId]);

  useEffect(() => {
    if (known) setExisting(known);
    else loadExisting();
  }, [known, loadExisting]);

  const inChosen = existing.find((e) => e.speId === speId);
  const elsewhere = existing.filter((e) => e.speId !== speId);

  const runImport = async (overwrite: boolean) => {
    setBusy(true);
    setError("");
    setExpired(false);
    setStartingIn(null);
    setResult(null);
    setConfirming(false);
    try {
      const res = await fetchApi(
        `/api/transfers/${encodeURIComponent(transferId)}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, speId, overwrite }),
        },
      );
      const body = (await res.json()) as Partial<SpeImportResult> & {
        error?: string;
        detail?: string;
        existing?: ExistingImport;
        expired?: boolean;
        spe?: { state?: string; etaSeconds?: number };
      };
      if (!res.ok) {
        // Imported in the meantime: show it and ask, as for a known one.
        if (body.existing) {
          setExisting((cur) => [
            ...cur.filter((e) => e.speId !== body.existing!.speId),
            body.existing!,
          ]);
          setConfirming(true);
          return;
        }
        // A stopped workspace was started for this import (Azure, ADR-072).
        if (res.status === 503 && body.spe?.state === "starting") {
          setStartingIn(
            Math.max(1, Math.ceil((body.spe.etaSeconds ?? 240) / 60)),
          );
          return;
        }
        setExpired(!!body.expired);
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
        untilStopped: body.untilStopped ?? false,
        graphUrl: body.graphUrl ?? importViewUrl(transferId, speId),
      });
      loadExisting();
      onImported?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    if (existing.length) setConfirming(true);
    else void runImport(false);
  };

  return (
    <div data-testid="spe-import" className="mt-3 space-y-2 text-xs">
      {existing.length > 0 && !result && (
        <ul data-testid="spe-import-existing" className="space-y-1">
          {existing.map((e) => (
            <li
              key={e.speId}
              className="flex flex-wrap items-center gap-2 text-(--text-primary)"
            >
              <CheckCircle2 size={14} className="text-green-500" />
              {t("Imported into {spe} on {date}: {records} records.", {
                spe: e.speId,
                date: e.importedAt.slice(0, 10),
                records: String(e.records),
              })}
              <Link
                href={importViewUrl(transferId, e.speId)}
                className="flex items-center gap-1 underline text-(--accent)"
              >
                <Box size={12} />
                {t("Show in 3D")}
              </Link>
            </li>
          ))}
        </ul>
      )}

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
          onChange={(e) => {
            setSpeId(e.target.value);
            setConfirming(false);
          }}
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
          onClick={onImport}
          disabled={busy || confirming}
          className="flex items-center gap-1 px-2 py-1 rounded bg-(--accent) text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Database size={12} />
          )}
          {busy
            ? t("Importing…")
            : existing.length
              ? t("Import again")
              : t("Import into SPE")}
        </button>
      </div>

      {confirming && (
        <div
          data-testid="spe-import-confirm"
          role="alertdialog"
          aria-label={t("Import again?")}
          className="rounded border border-amber-600/50 bg-amber-900/20 px-2 py-2 text-(--text-primary) space-y-2"
        >
          <p className="flex items-start gap-1.5">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-amber-500"
            />
            {inChosen
              ? t(
                  "{spe} holds this transfer already ({records} records, imported on {date}). Overwrite it? Its records are replaced by the data as it is now.",
                  {
                    spe: inChosen.speId,
                    records: String(inChosen.records),
                    date: inChosen.importedAt.slice(0, 10),
                  },
                )
              : t(
                  "This transfer is in {others} already. Import it into {spe} as well? It is then held twice.",
                  {
                    others: elsewhere.map((e) => e.speId).join(", "),
                    spe: speId,
                  },
                )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="spe-import-confirm-yes"
              onClick={() => void runImport(!!inChosen)}
              className="px-2 py-1 rounded bg-amber-600 text-white hover:opacity-90"
            >
              {inChosen ? t("Overwrite") : t("Import as well")}
            </button>
            <button
              type="button"
              data-testid="spe-import-confirm-no"
              onClick={() => setConfirming(false)}
              className="px-2 py-1 rounded border border-(--border) text-(--text-primary)"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {startingIn !== null && (
        <p
          data-testid="spe-import-starting"
          className="flex items-center gap-1.5 text-(--text-secondary)"
        >
          <Loader2 size={12} className="animate-spin" />
          {t(
            "{spe} is starting. That takes about {minutes} minutes; import again then.",
            { spe: speId, minutes: String(startingIn) },
          )}
        </p>
      )}

      {error &&
        (expired ? (
          <p
            data-testid="spe-import-error"
            className="flex flex-wrap items-center gap-2 text-(--badge-inactive-text)"
          >
            {t(
              "The access to this transfer has expired. Start a new transfer to get the data again.",
            )}
            {onRestart && (
              <button
                type="button"
                data-testid="spe-import-restart"
                onClick={onRestart}
                className="px-2 py-1 rounded bg-(--accent) text-white hover:opacity-90"
              >
                {t("Start a new transfer")}
              </button>
            )}
          </p>
        ) : (
          <p
            data-testid="spe-import-error"
            className="text-(--badge-inactive-text)"
          >
            {t("The import failed: {detail}", { detail: error })}
          </p>
        ))}

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
            {result.untilStopped &&
              ` ${t(
                "The workspace keeps the data in memory until it stops; it is a demo import, not loaded through the Trustee.",
              )}`}
          </span>
          <Link
            href={result.graphUrl}
            data-testid="spe-import-graph"
            className="flex items-center gap-1 underline text-(--accent)"
          >
            <Box size={12} />
            {t("Show in 3D")}
          </Link>
        </div>
      )}
    </div>
  );
}
