"use client";

import { useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Diagnosis {
  name: string;
  severity: "critical" | "warning" | "healthy" | "unknown";
  summary: string;
  cause: string;
  bootError?: string;
  remediation?: string;
  trackingIssue?: string;
}

interface Props {
  name: string; // ACA app name (e.g. mvhd-controlplane)
  isBroken: boolean; // caller determines this from live status
}

export function ComponentActions({ name, isBroken }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartState, setRestartState] = useState<
    "idle" | "running" | "ok" | "failed"
  >("idle");
  const [restartMessage, setRestartMessage] = useState<string>("");

  if (!isBroken) return null;

  const loadDiagnosis = async () => {
    if (diagnosis || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/components/${encodeURIComponent(name)}/diagnosis`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setDiagnosis((await res.json()) as Diagnosis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadDiagnosis();
  };

  const onRestart = async () => {
    if (restartState === "running") return;
    setRestartState("running");
    setRestartMessage("");
    try {
      const res = await fetch(
        `/api/admin/components/${encodeURIComponent(name)}/restart`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      }
      setRestartState("ok");
      setRestartMessage(data.message || "Restart triggered.");
    } catch (err) {
      setRestartState("failed");
      setRestartMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="flex items-center gap-1 text-[var(--danger-text)] font-medium">
          <AlertTriangle size={11} />
          Broken
        </span>
        <button
          type="button"
          onClick={onRestart}
          disabled={restartState === "running"}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] disabled:opacity-50"
          title="Restart this Container App"
        >
          <RefreshCw
            size={10}
            className={restartState === "running" ? "animate-spin" : ""}
          />
          {restartState === "running" ? "Restarting…" : "Restart"}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-primary)]"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          Why broken?
        </button>
      </div>

      {restartMessage && (
        <p
          className={`text-[10px] mt-1 ${
            restartState === "failed"
              ? "text-[var(--danger-text)]"
              : "text-[var(--success-text)]"
          }`}
        >
          {restartMessage}
        </p>
      )}

      {expanded && (
        <div className="mt-2 p-2 rounded bg-[var(--surface-2)]/60 border border-[var(--border)] text-[10px] space-y-1.5 leading-relaxed">
          {loading && (
            <p className="text-[var(--text-secondary)]">Loading diagnosis…</p>
          )}
          {error && (
            <p className="text-[var(--danger-text)]">
              Failed to load diagnosis: {error}
            </p>
          )}
          {diagnosis && (
            <>
              <p className="font-medium text-[var(--text-primary)]">
                {diagnosis.summary}
              </p>
              <p className="text-[var(--text-secondary)]">{diagnosis.cause}</p>
              {diagnosis.bootError && (
                <pre className="font-mono text-[9px] bg-[var(--surface)]/80 p-1.5 rounded border border-[var(--border)] overflow-x-auto whitespace-pre-wrap">
                  {diagnosis.bootError}
                </pre>
              )}
              {diagnosis.remediation && (
                <p className="text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">
                    Remediation:
                  </span>{" "}
                  {diagnosis.remediation}
                </p>
              )}
              {diagnosis.trackingIssue && (
                <a
                  href={diagnosis.trackingIssue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--success-text)] hover:underline"
                >
                  <ExternalLink size={10} />
                  Tracking issue
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
