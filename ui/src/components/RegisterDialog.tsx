"use client";

/**
 * RegisterDialog — a lightweight modal wrapping EudiApprovalFlow. Used by the
 * homepage "Register with EUDI Wallet" CTA and the /patient "Request EHR data"
 * button. No dialog dependency — plain Tailwind overlay with ESC/backdrop close,
 * role="dialog" + aria-modal, and body-scroll lock. z-[70] sits above the nav
 * (z-50) and UserMenu dropdown.
 */
import { useEffect } from "react";
import { X, ShieldCheck, ScanLine } from "lucide-react";
import {
  EudiApprovalFlow,
  type ApprovalMode,
} from "@/components/wallet/EudiApprovalFlow";

/** Eyebrow label per approval mode, so the dialog's intent is unmistakable. */
const EYEBROW: Record<ApprovalMode, string> = {
  register: "European Health Dataspace · Registration",
  login: "European Health Dataspace · Sign in",
  ehr: "Electronic Patient Record · ePA transfer",
};

export function RegisterDialog({
  mode = "register",
  title,
  subtitle,
  onClose,
  onComplete,
}: {
  mode?: ApprovalMode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Branded header — makes the registration intent unmistakable */}
        <div className="flex flex-col items-center text-center">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] px-3 py-1 rounded-full mb-3"
            style={{
              background: "rgba(36,113,163,0.12)",
              color: "var(--accent)",
            }}
          >
            <ShieldCheck size={13} /> {EYEBROW[mode]}
          </span>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)] leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
              {subtitle}
            </p>
          )}
          <span className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[var(--text-secondary)]">
            <ScanLine size={13} /> Scan the QR or approve on your phone — no
            password
          </span>
        </div>

        <div className="mt-5">
          <EudiApprovalFlow
            mode={mode}
            onComplete={onComplete}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
