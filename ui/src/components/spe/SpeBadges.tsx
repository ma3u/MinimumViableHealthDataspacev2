"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  ADR_068_URL,
  shortPolicyHash,
  speLabelText,
  speLabelTone,
  type SpeStatusValue,
} from "@/lib/spe";

const TONE_CLASSES = {
  simulated:
    "bg-(--warning)/10 text-(--warning-text) border border-(--warning)/30",
  node: "bg-(--success)/10 text-(--success-text) border border-(--success)/30",
  workload:
    "bg-(--success)/20 text-(--success-text) border border-(--success)/50",
} as const;

/**
 * The attestation label of ADR-068 decision 5, linked to the ADR: amber for
 * "Simulated attestation", green for the two attested depths.
 */
export function SpeLabelBadge({
  spe,
}: {
  spe: {
    label?: string | null;
    simulated?: boolean | null;
    attestationScope?: string | null;
  };
}) {
  const tone = speLabelTone(spe);
  const text = speLabelText(spe);
  const Icon = tone === "simulated" ? ShieldAlert : ShieldCheck;
  return (
    <a
      href={ADR_068_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${text}, see ADR-068`}
      title="What each label proves: ADR-068, decision 5"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold hover:underline ${TONE_CLASSES[tone]}`}
    >
      <Icon size={11} aria-hidden="true" />
      {text}
    </a>
  );
}

const STATUS_CLASSES: Record<string, string> = {
  ready: "text-(--success-text)",
  loading: "text-(--accent)",
  refused: "text-(--danger-text)",
  unreachable: "text-(--text-secondary)",
};

export function SpeStatusText({ status }: { status: SpeStatusValue | string }) {
  return (
    <span
      className={`font-semibold ${
        STATUS_CLASSES[status] ?? "text-(--text-secondary)"
      }`}
    >
      {status}
    </span>
  );
}

/**
 * A policy hash, shortened; the full value is in the title and goes to the
 * clipboard with the copy button.
 */
export function PolicyHash({ hash }: { hash: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!hash) {
    return <span className="text-(--text-secondary)">none recorded</span>;
  }
  const copy = () => {
    void navigator.clipboard
      ?.writeText(hash)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <span className="inline-flex items-center gap-1">
      <code
        title={hash}
        data-testid="policy-hash"
        className="font-mono text-[11px] text-(--text-primary)"
      >
        {shortPolicyHash(hash)}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy policy hash ${hash}`}
        title="Copy the full hash"
        className="p-0.5 rounded-sm text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-2)"
      >
        {copied ? (
          <Check size={11} aria-hidden="true" />
        ) : (
          <Copy size={11} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
