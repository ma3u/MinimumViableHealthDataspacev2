"use client";

/**
 * WalletFlow — a generic animated phone mock-up that auto-cycles a list of
 * `WalletStep`s. Extracted from the old WalletSimulation so register / returning-login /
 * EHR-transfer flows share one phone frame (see ui/src/components/wallet/flows.tsx).
 * Illustrative only; synthetic data. See docs/planning/eudi-wallet-flows-2026.md.
 *
 * Two looks. `theme="dyou"` draws the chrome of the German national EUDI wallet,
 * d-you, as its published source renders it (2026-09-16 mirror, logic-ui design
 * system): white surface, a back arrow and a close cross, a segmented black
 * progress bar, and stacked pill buttons, the primary one in the mint
 * `primaryContainer` (#96F5AF) with dark text, the secondary one outlined. The
 * licensed EUDI Diatype typeface is not in the mirror, so the real app falls
 * back to the system font, and so does this. The classic theme keeps the
 * generic phone with a brand chip, used for the insurer's app.
 */
import { useEffect, useState } from "react";
import { Wifi, BatteryFull, SignalHigh, ArrowLeft, X } from "lucide-react";

export interface WalletStep {
  /** the step's body content */
  body: React.ReactNode;
  /** primary button label */
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

export type WalletTheme = "classic" | "dyou";

const DEFAULT_ACCENT = "#5b3df5";

/** The d-you palette, from logic-ui `Colors.swift` (light scheme). */
export const DYOU = {
  surface: "#FFFFFF",
  onSurface: "#1D1D1E",
  onSurfaceVariant: "#49454F",
  surfaceContainer: "#F4F4F4",
  surfaceContainerHighest: "#DEDEDE",
  outlineVariant: "#B9B9BD",
  primaryContainer: "#96F5AF",
  primaryOutline: "#329D77",
  onSuccess: "#0C4A37",
  pid: "#02818B",
} as const;

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

/** d-you's screen header: back arrow, close cross, one progress segment per step. */
function DyouHeader({
  step,
  total,
  interactive,
  onCancel,
}: {
  step: number;
  total: number;
  interactive: boolean;
  onCancel?: () => void;
}) {
  const Icon = ({ children }: { children: React.ReactNode }) =>
    interactive ? (
      <button
        type="button"
        onClick={onCancel}
        aria-label="Dismiss request"
        className="p-1 rounded-full hover:bg-gray-100"
        style={{ color: DYOU.onSurface }}
      >
        {children}
      </button>
    ) : (
      <span className="p-1" style={{ color: DYOU.onSurface }}>
        {children}
      </span>
    );
  return (
    <div className="px-4 pt-1 pb-2">
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="p-1"
          style={{ color: DYOU.onSurface }}
          aria-hidden="true"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </span>
        <Icon>
          <X size={18} strokeWidth={1.75} />
        </Icon>
      </div>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
      >
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: DYOU.surfaceContainerHighest }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: i < step ? "100%" : i === step ? "45%" : "0%",
                background: DYOU.onSurface,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Buttons({
  primary,
  accent,
  interactive = false,
  atEnd = false,
  theme = "classic",
  onPrimary,
  onCancel,
}: {
  primary: string;
  accent: string;
  interactive?: boolean;
  atEnd?: boolean;
  theme?: WalletTheme;
  onPrimary?: () => void;
  onCancel?: () => void;
}) {
  if (theme === "dyou") {
    // d-you stacks two full-width pills: the mint primary, the outlined secondary.
    const primaryStyle = {
      background: DYOU.primaryContainer,
      color: DYOU.onSurface,
    };
    const secondaryStyle = {
      background: DYOU.surface,
      color: DYOU.onSurface,
      border: `1.5px solid ${DYOU.onSurface}`,
    };
    const ring = (
      <span
        className="absolute inset-0 rounded-full animate-ping pointer-events-none"
        style={{ border: `2px solid ${DYOU.primaryOutline}99` }}
      />
    );
    if (!interactive) {
      return (
        <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
          <div
            className="text-center rounded-full text-[13px] font-semibold py-2.5 relative"
            style={primaryStyle}
          >
            {primary}
            {ring}
          </div>
          <div
            className="text-center rounded-full text-[13px] font-semibold py-2"
            style={secondaryStyle}
          >
            Cancel
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-full text-[13px] font-semibold py-2.5 relative transition-transform active:scale-95 hover:brightness-95"
          style={primaryStyle}
        >
          {primary}
          {ring}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full text-[13px] font-semibold py-2 hover:bg-gray-50 transition-colors"
          style={secondaryStyle}
        >
          {atEnd ? "Close" : "Cancel"}
        </button>
      </div>
    );
  }

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
  theme = "classic",
  interactive = false,
  onComplete,
  onCancel,
}: {
  steps: WalletStep[];
  loop?: boolean;
  ariaLabel?: string;
  brand?: BrandChip;
  /** "dyou" draws the German wallet's chrome; "classic" the generic phone with a brand chip */
  theme?: WalletTheme;
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
  const dyou = theme === "dyou";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-theme={theme}
      className="relative w-[clamp(228px,27vw,268px)] aspect-9/19.5 rounded-[2.6rem] border-[7px] border-gray-900 bg-white shadow-2xl overflow-hidden flex flex-col"
      style={dyou ? { color: DYOU.onSurface } : undefined}
    >
      <style>{`
        @keyframes wsimReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .wsim-step { opacity: 0; animation: wsimReveal 0.45s ease forwards; }
      `}</style>
      {/* Dynamic Island */}
      <div className="pointer-events-none absolute top-[7px] left-1/2 -translate-x-1/2 w-[32%] h-[15px] rounded-full bg-gray-900 z-20" />
      <StatusBar />
      {dyou ? (
        <DyouHeader
          step={step}
          total={steps.length}
          interactive={interactive}
          onCancel={onCancel}
        />
      ) : (
        <>
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
        </>
      )}

      <div
        key={step}
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 wsim-step"
      >
        {steps[step].body}
      </div>

      <Buttons
        primary={steps[step].primary}
        accent={accent}
        interactive={interactive}
        atEnd={atEnd}
        theme={theme}
        onPrimary={onPrimary}
        onCancel={onCancel}
      />
    </div>
  );
}
