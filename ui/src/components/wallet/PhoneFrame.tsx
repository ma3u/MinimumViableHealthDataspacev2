"use client";

/**
 * WalletFlow — a generic animated phone mock-up that auto-cycles a list of
 * `WalletStep`s. Extracted from WalletSimulation so register / returning-login /
 * EHR-transfer flows share one phone frame (see ui/src/components/wallet/flows.tsx).
 * Illustrative only; synthetic data. See docs/planning/eudi-wallet-flows-2026.md.
 */
import { useEffect, useState } from "react";
import { Wifi, BatteryFull, SignalHigh } from "lucide-react";

export interface WalletStep {
  /** the step's body content */
  body: React.ReactNode;
  /** primary (black) button label */
  primary: string;
  /** dwell time in ms before advancing */
  ms: number;
  /** progress-bar + button-ring accent (default EUDI purple) */
  accent?: string;
  /** in interactive mode, auto-advance this (transitional) step after `ms` — e.g. a spinner */
  auto?: boolean;
}

export interface BrandChip {
  name: string;
  color: string;
}

const DEFAULT_ACCENT = "#5b3df5";

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-800">
      <span>10:55</span>
      <div className="flex items-center gap-1">
        <SignalHigh size={11} />
        <Wifi size={11} />
        <BatteryFull size={13} />
      </div>
    </div>
  );
}

function Buttons({
  primary,
  accent,
  interactive = false,
  atEnd = false,
  onPrimary,
  onCancel,
}: {
  primary: string;
  accent: string;
  interactive?: boolean;
  atEnd?: boolean;
  onPrimary?: () => void;
  onCancel?: () => void;
}) {
  // Presentation mode: decorative, non-clickable (unchanged).
  if (!interactive) {
    return (
      <div className="flex gap-2 px-3 pb-3 pt-2">
        <div className="flex-1 text-center rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold py-2.5">
          Stop
        </div>
        <div className="flex-1 text-center rounded-xl bg-gray-900 text-white text-sm font-semibold py-2.5 relative">
          {primary}
          <span
            className="absolute inset-0 rounded-xl animate-ping"
            style={{ border: `2px solid ${accent}99` }}
          />
        </div>
      </div>
    );
  }
  // Interactive mode: the user drives the approval with real buttons.
  return (
    <div className="flex gap-2 px-3 pb-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold py-2.5 hover:bg-gray-200 transition-colors"
      >
        {atEnd ? "Close" : "Cancel"}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        className="flex-1 rounded-xl bg-gray-900 text-white text-sm font-semibold py-2.5 relative hover:bg-black transition-colors active:scale-95"
      >
        {primary}
        <span
          className="absolute inset-0 rounded-xl animate-ping pointer-events-none"
          style={{ border: `2px solid ${accent}99` }}
        />
      </button>
    </div>
  );
}

export function WalletFlow({
  steps,
  loop = true,
  ariaLabel,
  brand,
  interactive = false,
  onComplete,
  onCancel,
}: {
  steps: WalletStep[];
  loop?: boolean;
  ariaLabel?: string;
  brand?: BrandChip;
  /** when true, the user advances each step via the primary button; the last
   *  step's button fires onComplete. Steps flagged `auto` still self-advance. */
  interactive?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const atEnd = step >= steps.length - 1;

  useEffect(() => {
    // Interactive steps wait for a click, except transitional `auto` steps.
    if (interactive && !steps[step].auto) return;
    if (atEnd && !loop) return;
    const t = setTimeout(
      () => setStep((s) => (s + 1) % steps.length),
      steps[step].ms,
    );
    return () => clearTimeout(t);
  }, [step, steps, loop, interactive, atEnd]);

  const onPrimary = () => {
    if (atEnd) onComplete?.();
    else setStep((s) => s + 1);
  };

  const accent = steps[step].accent ?? brand?.color ?? DEFAULT_ACCENT;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative w-[clamp(228px,27vw,268px)] aspect-[9/19.5] rounded-[2.6rem] border-[7px] border-gray-900 bg-white shadow-2xl overflow-hidden flex flex-col"
    >
      <style>{`
        @keyframes wsimReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .wsim-step { opacity: 0; animation: wsimReveal 0.45s ease forwards; }
      `}</style>
      {/* Dynamic Island */}
      <div className="pointer-events-none absolute top-[7px] left-1/2 -translate-x-1/2 w-[32%] h-[15px] rounded-full bg-gray-900 z-20" />
      <StatusBar />
      {brand && (
        <div className="px-4 pt-0.5 pb-1.5">
          <span
            className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
            style={{ background: brand.color }}
          >
            {brand.name}
          </span>
        </div>
      )}
      <div className="px-4">
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${((step + 1) / steps.length) * 100}%`,
              background: accent,
            }}
          />
        </div>
      </div>

      <div
        key={step}
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 wsim-step"
      >
        {steps[step].body}
      </div>

      <Buttons
        primary={steps[step].primary}
        accent={accent}
        interactive={interactive}
        atEnd={atEnd}
        onPrimary={onPrimary}
        onCancel={onCancel}
      />
    </div>
  );
}
