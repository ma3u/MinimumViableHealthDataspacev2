"use client";

import { useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { IS_STATIC } from "@/lib/static-export";
import {
  formatSpeTime,
  type SpeEntry,
  type SpePowerState,
  type SpeStatusResponse,
} from "@/lib/spe";
import { useT } from "@/lib/i18n/translate";

const POWER_CLASSES: Record<SpePowerState, string> = {
  running: "text-(--success-text) border-(--success)/40",
  starting: "text-(--warning-text) border-(--warning)/40",
  stopped: "text-(--text-secondary) border-(--border)",
  unreachable: "text-(--danger-text) border-(--danger)/40",
};

interface PowerError {
  error: string;
  command?: string;
}

/**
 * A workspace's power state, Start and Stop for the operator and the access
 * body, and while it starts the progress line (ADR-072). `onChange` is the
 * page's `watch()` from useSpeStatus, which polls until the workspace runs.
 */
export function SpePowerControls({
  spe,
  power,
  onChange,
}: {
  spe: SpeEntry;
  power: SpeStatusResponse["power"];
  onChange: () => void;
}) {
  const t = useT("admin");
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [requested, setRequested] = useState<"start" | "stop" | null>(null);
  const [failure, setFailure] = useState<PowerError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const state: SpePowerState = spe.powerState ?? "unreachable";
  const showProgress =
    state === "starting" || (requested === "start" && state !== "running");
  const mayPower = IS_STATIC || power?.available === true;

  async function act(action: "start" | "stop") {
    setBusy(action);
    setFailure(null);
    setNote(null);
    try {
      const r = await fetchApi("/api/admin/spe/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, spe: spe.id }),
      });
      const body = (await r.json().catch(() => null)) as
        | (PowerError & { static?: boolean })
        | null;
      if (IS_STATIC) {
        setNote(t("Static demo: nothing is started or stopped."));
        return;
      }
      if (!r.ok) {
        setFailure({
          error: body?.error ?? `HTTP ${r.status}`,
          command: body?.command,
        });
        return;
      }
      setRequested(action);
      onChange();
    } catch (e: unknown) {
      setFailure({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      aria-label={t("Power of {id}", { id: spe.id })}
      className="space-y-1.5 text-xs"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${POWER_CLASSES[state]}`}
        >
          {t("Workspace: {state}", { state: t(state) })}
        </span>
        {spe.armState && (
          <span className="text-[10px] text-(--text-secondary) font-mono">
            ACI {spe.armState}
          </span>
        )}
        {mayPower && (state === "stopped" || state === "unreachable") && (
          <button
            type="button"
            onClick={() => void act("start")}
            disabled={busy !== null}
            aria-label={t("Start {id}", { id: spe.id })}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-(--border) hover:bg-(--surface-2) disabled:opacity-50"
          >
            {busy === "start" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={12} aria-hidden="true" />
            )}
            {t("Start")}
          </button>
        )}
        {mayPower && (state === "running" || state === "starting") && (
          <button
            type="button"
            onClick={() => void act("stop")}
            disabled={busy !== null}
            aria-label={t("Stop {id}", { id: spe.id })}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-(--border) hover:bg-(--surface-2) disabled:opacity-50"
          >
            {busy === "stop" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Square size={12} aria-hidden="true" />
            )}
            {t("Stop")}
          </button>
        )}
      </div>
      {showProgress && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-(--warning-text)"
        >
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          {t(
            "Starting: attesting to Trustee, releasing the key, loading the data; about 3 to 4 minutes",
          )}
        </p>
      )}
      <p className="text-[11px] text-(--text-secondary)">
        {spe.lastQueriedAt
          ? t("Last queried {when}", { when: formatSpeTime(spe.lastQueriedAt) })
          : t("No query recorded yet")}
        {" · "}
        {t(
          "Stopped by default, starts on demand, stops itself after 30 minutes without a query (ADR-072)",
        )}
      </p>
      {!mayPower && power?.reason && (
        <p className="text-[11px] text-(--text-secondary)">{t(power.reason)}</p>
      )}
      {note && (
        <p role="note" className="text-[11px] text-(--text-secondary)">
          {note}
        </p>
      )}
      {failure && (
        <div
          role="alert"
          className="text-[11px] text-(--danger-text) bg-(--danger)/10 border border-(--danger)/30 rounded px-2 py-1.5 space-y-1"
        >
          <p>
            {t("Could not change the workspace: {error}", {
              error: failure.error,
            })}
          </p>
          {failure.command && (
            <>
              <p>{t("An owner of the resource group runs once:")}</p>
              <code className="block font-mono break-all text-(--text-primary)">
                {failure.command}
              </code>
            </>
          )}
        </div>
      )}
    </div>
  );
}
