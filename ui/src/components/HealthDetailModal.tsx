"use client";

/**
 * HealthDetailModal — the clickable detail view for a personal-health dashboard
 * card (fitness / labs / nutrition). Shows ~3-month weekly trends (TrendChart)
 * with an improving/declining chip, plus the weekly plan for nutrition.
 * Synthetic, illustrative data from journey-config.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, TrendingUp, TrendingDown, CalendarDays } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import type { PersonalHealthSource, TrendSeries } from "@/lib/journey-config";

function deltaChip(s: TrendSeries) {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const rising = last >= first;
  const improving = rising === (s.goodDirection === "up");
  const pct =
    first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100);
  const Icon = rising ? TrendingUp : TrendingDown;
  const colour = improving ? "#1E8449" : "#CA6F1E";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: colour, background: `${colour}1a` }}
    >
      <Icon size={12} />
      {pct > 0 ? "+" : ""}
      {pct}% · 3 mo
    </span>
  );
}

export function HealthDetailModal({
  source,
  onClose,
}: {
  source: PersonalHealthSource;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${source.title} detail`}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div
        className="relative z-10 w-full max-w-2xl rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] ring-1 ring-black/10 shadow-[0_24px_70px_rgba(0,0,0,0.45)] p-6 sm:p-8 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-1 pr-8">
          <span
            className="w-2.5 h-8 rounded-full shrink-0"
            style={{ background: source.brand }}
          />
          <div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">
              {source.title}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {source.source}
            </p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          {source.detail}
        </p>

        {/* 3-month weekly trends */}
        <div className="space-y-4">
          {source.trends.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {s.label}
                  </span>
                  <span className="text-lg font-black text-[var(--text-primary)]">
                    {s.current}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {s.unit}
                  </span>
                </div>
                {deltaChip(s)}
              </div>
              <TrendChart points={s.points} color={s.color} />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1 text-right">
                last 12 weeks
              </p>
            </div>
          ))}
        </div>

        {/* Nutrition weekly plan */}
        {source.weeklyPlan && (
          <div className="mt-5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] mb-2">
              <CalendarDays size={15} style={{ color: source.brand }} />
              This week&rsquo;s plan
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {source.weeklyPlan.map((d) => (
                <div
                  key={d.day}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] w-9 shrink-0">
                    {d.day}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
                    {d.focus}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                    {d.kcal.toLocaleString()} kcal
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[var(--text-secondary)] mt-5 text-center">
          Synthetic · illustrative — not medical advice.
        </p>
      </div>
    </div>,
    document.body,
  );
}
