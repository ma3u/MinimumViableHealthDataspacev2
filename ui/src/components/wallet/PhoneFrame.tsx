"use client";

/**
 * WalletFlow — a generic animated phone mock-up that auto-cycles a list of
 * `WalletStep`s. Extracted from the old WalletSimulation so register / returning-login /
 * EHR-transfer flows share one phone frame (see ui/src/components/wallet/flows.tsx).
 * Illustrative only; synthetic data. See docs/planning/eudi-wallet-flows-2026.md.
 *
 * Two looks. `theme="dyou"` draws the chrome of the German national EUDI wallet,
 * d-you, as its published source renders it (2026-09-16 mirror, logic-ui design
 * system, checked against the app on the simulator): white surface, a header
 * with a back arrow and a close cross (`HeaderContentView`), the secondary and
 * the primary button side by side (`DSSecondaryButton` outlined,
 * `DSPrimaryButton` in the mint `primaryContainer` #96F5AF with dark text), and
 * on the dashboard the tab bar (Overview · Activity · Settings) with the round
 * scanner button. The licensed EUDI Diatype typeface is not in the mirror, so
 * the real app falls back to the system font, and so does this. The classic
 * theme keeps the generic phone with a brand chip, used for the insurer's app.
 */
import { useEffect, useState } from "react";
import {
  Wifi,
  BatteryFull,
  SignalHigh,
  ArrowLeft,
  X,
  LayoutGrid,
  History,
  Settings,
  ScanLine,
} from "lucide-react";

export interface WalletStep {
  /** the step's body content */
  body: React.ReactNode;
  /** primary button label */
  primary: string;
  /** secondary button label (d-you: shown beside the primary; classic: Cancel) */
  secondary?: string;
  /** dwell time in ms before advancing */
  ms: number;
  /** progress-bar + button-ring accent (default EUDI purple) */
  accent?: string;
  /** in interactive mode, auto-advance this (transitional) step after `ms` — e.g. a spinner */
  auto?: boolean;
  /**
   * d-you only. "flow": a screen in a flow (header, buttons at the bottom).
   * "dashboard": the wallet's start screen with the tab bar; the scanner
   * button is the primary action. "final": a result screen with one button.
   */
  layout?: "flow" | "dashboard" | "final";
  /** d-you only: which icons the header shows (default back and close) */
  header?: "close" | "back-close" | "none";
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

/** d-you's `HeaderContentView`: an optional back arrow on the left, the close cross on the right. */
function DyouHeader({
  variant,
  interactive,
  onCancel,
}: {
  variant: "close" | "back-close";
  interactive: boolean;
  onCancel?: () => void;
}) {
  const close = interactive ? (
    <button
      type="button"
      onClick={onCancel}
      aria-label="Dismiss request"
      className="p-1 rounded-full hover:bg-gray-100"
      style={{ color: DYOU.onSurface }}
    >
      <X size={18} strokeWidth={1.75} />
    </button>
  ) : (
    <span className="p-1" style={{ color: DYOU.onSurface }}>
      <X size={18} strokeWidth={1.75} />
    </span>
  );
  return (
    <div className="flex items-center justify-between px-4 pt-1 pb-2">
      <span
        className="p-1"
        style={{
          color: DYOU.onSurface,
          visibility: variant === "back-close" ? "visible" : "hidden",
        }}
        aria-hidden="true"
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
      </span>
      {close}
    </div>
  );
}

/** d-you's tab bar (Overview · Activity · Settings) with the round scanner button. */
function DyouTabBar({
  primary,
  interactive,
  onPrimary,
}: {
  primary: string;
  interactive: boolean;
  onPrimary?: () => void;
}) {
  const tabs = [
    { label: "Overview", Icon: LayoutGrid, active: true },
    { label: "Activity", Icon: History, active: false },
    { label: "Settings", Icon: Settings, active: false },
  ];
  const scanner = (
    <>
      <ScanLine size={18} strokeWidth={1.75} />
      <span className="sr-only">{primary}</span>
    </>
  );
  const ring = (
    <span
      className="absolute inset-0 rounded-full animate-ping pointer-events-none"
      style={{ border: `2px solid ${DYOU.primaryOutline}99` }}
    />
  );
  return (
    <div className="flex items-center gap-2 px-3 pb-3 pt-2">
      <div
        className="flex-1 flex items-center justify-around rounded-full py-1.5 px-1"
        style={{ background: DYOU.surfaceContainer }}
      >
        {tabs.map(({ label, Icon, active }) => (
          <span
            key={label}
            className="flex flex-col items-center gap-0.5 text-[8px] font-semibold px-2 py-1 rounded-full"
            style={{
              color: DYOU.onSurface,
              background: active ? DYOU.surfaceContainerHighest : "transparent",
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
            {label}
          </span>
        ))}
      </div>
      {interactive ? (
        <button
          type="button"
          onClick={onPrimary}
          className="relative grid place-items-center w-11 h-11 rounded-full shrink-0 hover:bg-gray-50 active:scale-95 transition-transform"
          style={{
            background: DYOU.surface,
            color: DYOU.onSurface,
            border: `1px solid ${DYOU.outlineVariant}`,
          }}
        >
          {scanner}
          {ring}
        </button>
      ) : (
        <span
          className="relative grid place-items-center w-11 h-11 rounded-full shrink-0"
          style={{
            background: DYOU.surface,
            color: DYOU.onSurface,
            border: `1px solid ${DYOU.outlineVariant}`,
          }}
        >
          {scanner}
          {ring}
        </span>
      )}
    </div>
  );
}

function Buttons({
  primary,
  secondary,
  accent,
  interactive = false,
  atEnd = false,
  theme = "classic",
  layout = "flow",
  onPrimary,
  onCancel,
}: {
  primary: string;
  secondary?: string;
  accent: string;
  interactive?: boolean;
  atEnd?: boolean;
  theme?: WalletTheme;
  layout?: "flow" | "dashboard" | "final";
  onPrimary?: () => void;
  onCancel?: () => void;
}) {
  if (theme === "dyou") {
    if (layout === "dashboard") {
      return (
        <DyouTabBar
          primary={primary}
          interactive={interactive}
          onPrimary={onPrimary}
        />
      );
    }
    // DSPrimaryButton (mint, dark text) and DSSecondaryButton (outlined) side
    // by side, as the request and consent screens lay them out; a result
    // screen has the primary alone.
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
    const withSecondary = layout !== "final" && Boolean(secondary);
    if (!interactive) {
      return (
        <div className="flex gap-2 px-3 pb-3 pt-2">
          {withSecondary && (
            <div
              className="flex-1 text-center rounded-full text-[12px] font-semibold py-2.5"
              style={secondaryStyle}
            >
              {secondary}
            </div>
          )}
          <div
            className="flex-1 text-center rounded-full text-[12px] font-semibold py-2.5 relative"
            style={primaryStyle}
          >
            {primary}
            {ring}
          </div>
        </div>
      );
    }
    return (
      <div className="flex gap-2 px-3 pb-3 pt-2">
        {withSecondary && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full text-[12px] font-semibold py-2.5 hover:bg-gray-50 transition-colors"
            style={secondaryStyle}
          >
            {secondary}
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          className="flex-1 rounded-full text-[12px] font-semibold py-2.5 relative transition-transform active:scale-95 hover:brightness-95"
          style={primaryStyle}
        >
          {primary}
          {ring}
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

  const current = steps[step];
  const accent = current.accent ?? brand?.color ?? DEFAULT_ACCENT;
  const dyou = theme === "dyou";
  const layout = current.layout ?? "flow";
  const header =
    current.header ??
    (layout === "dashboard" || layout === "final" ? "none" : "back-close");

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-theme={theme}
      data-step={step}
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
        header !== "none" && (
          <DyouHeader
            variant={header}
            interactive={interactive}
            onCancel={onCancel}
          />
        )
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
        {current.body}
      </div>

      <Buttons
        primary={current.primary}
        secondary={current.secondary}
        accent={accent}
        interactive={interactive}
        atEnd={atEnd}
        theme={theme}
        layout={layout}
        onPrimary={onPrimary}
        onCancel={onCancel}
      />
    </div>
  );
}
