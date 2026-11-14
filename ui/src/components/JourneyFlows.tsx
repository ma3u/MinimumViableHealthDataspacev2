"use client";

/**
 * The two journeys of the HL7 showcase deck on the start page: the person's
 * (primary use) and the researcher's (secondary use), as swimlanes that draw
 * themselves when they scroll into view. Every box with a page opens it, on
 * this site or on the other one (the live hub or the static demo, which needs
 * no sign-in), as the deck's live and static switch does.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ListChecks, Maximize2, Play, Presentation } from "lucide-react";
import { BASE_PATH, IS_STATIC } from "@/lib/static-export";
import { T, useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";
import {
  BOX,
  FLOW_VIEWBOX,
  JOURNEY_FLOWS,
  LANE,
  arrowHead,
  pathOf,
  type FlowId,
  type FlowNode,
  type JourneyFlow,
  type StepStatus,
} from "@/lib/journey-flows";

export const DEMO_SITES = {
  live: "https://ehds.mabu.red",
  static: "https://ma3u.github.io/MinimumViableHealthDataspacev2",
} as const;
export type DemoSite = keyof typeof DEMO_SITES;

const THIS_SITE: DemoSite = IS_STATIC ? "static" : "live";
const DECK = `${BASE_PATH}/presentations/hl7-showcase-2026/index.html`;

/** The mark in a box's corner: filled when the step works end to end, amber
 *  when part of it does, an open ring when it is planned. Its words are in
 *  the legend and in the box's accessible name, never only in the colour. */
export const STATUS_MARK: Record<
  StepStatus,
  { label: string; fill: string; stroke: string; dash?: string }
> = {
  implemented: { label: "Implemented", fill: "#58d68d", stroke: "#58d68d" },
  partial: { label: "Partial", fill: "#f5b041", stroke: "#f5b041" },
  planned: { label: "Planned", fill: "none", stroke: "#aab4bf", dash: "3 2" },
};

function StatusMark({
  status,
  cx,
  cy,
}: {
  status: StepStatus;
  cx: number;
  cy: number;
}) {
  const m = STATUS_MARK[status];
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={m.fill}
      stroke={m.stroke}
      strokeWidth={2}
      strokeDasharray={m.dash}
      data-status={status}
      aria-hidden="true"
    />
  );
}

/** Widest a box's text may be before it is squeezed to fit, in viewBox units. */
const TEXT_MAX = BOX.width - 16;
const LANE_LABEL_MAX = 170;

/** Where a box leads: a page on this site, the same page on the other one, or an anchor here. */
export function nodeTarget(
  href: string,
  site: DemoSite,
): { href: string; external: boolean } {
  if (href.startsWith("#") || site === THIS_SITE) {
    return { href, external: false };
  }
  return { href: `${DEMO_SITES[site]}${href}`, external: true };
}

function NodeBox({
  node,
  color,
  site,
  label,
  title,
  sub,
  selected,
  onSelect,
}: {
  node: FlowNode;
  color: string;
  site: DemoSite;
  /** In select mode (the full-screen page) the box picks its step instead
   *  of opening a page, and the picked one is drawn brighter. */
  selected?: boolean;
  onSelect?: () => void;
  label: string;
  title: string;
  sub: string;
}) {
  const cx = node.x + BOX.width / 2;
  const box = (
    <>
      <rect
        x={node.x}
        y={node.y}
        width={BOX.width}
        height={BOX.height}
        rx={12}
        fill={selected ? "#16264a" : "#0d162b"}
        stroke={selected ? "#fbfbf8" : color}
        strokeWidth={selected ? 4 : 2}
      />
      <text
        x={cx}
        y={node.y + 29}
        textAnchor="middle"
        fill="#fbfbf8"
        fontSize={17}
        fontWeight={600}
        data-fit={TEXT_MAX}
      >
        {title}
      </text>
      <text
        x={cx}
        y={node.y + 49}
        textAnchor="middle"
        fill="#aab4bf"
        fontSize={15}
        data-fit={TEXT_MAX}
      >
        {sub}
      </text>
      {node.status && (
        <StatusMark
          status={node.status}
          cx={node.x + BOX.width - 13}
          cy={node.y + 13}
        />
      )}
    </>
  );
  const style = { animationDelay: `${node.delay}s` };
  if (onSelect) {
    return (
      <g
        className="jf-n jf-link"
        style={style}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={selected ? "true" : "false"}
        data-testid="journey-flow-step"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        {box}
      </g>
    );
  }
  if (!node.href) {
    return (
      <g className="jf-n" style={style} data-testid="journey-flow-step">
        {box}
      </g>
    );
  }
  const target = nodeTarget(node.href, site);
  const common = {
    className: "jf-n jf-link",
    style,
    "aria-label": label,
    "data-testid": "journey-flow-step",
  };
  return target.external ? (
    <a {...common} href={target.href} target="_blank" rel="noopener noreferrer">
      {box}
    </a>
  ) : target.href.startsWith("#") ? (
    <a {...common} href={target.href}>
      {box}
    </a>
  ) : (
    <Link {...common} href={target.href}>
      {box}
    </Link>
  );
}

export function FlowDiagram({
  flow,
  play,
  site,
  selected,
  onSelect,
}: {
  flow: JourneyFlow;
  play: boolean;
  site: DemoSite;
  /** The picked box, by index, in select mode. */
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  const t = useT("home");
  const lang = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);

  // A translation can be wider than the deck's English: squeeze it into its
  // box rather than let it run over the border.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll<SVGTextElement>("text[data-fit]").forEach((el) => {
      el.removeAttribute("textLength");
      el.removeAttribute("lengthAdjust");
      const max = Number(el.dataset.fit);
      const width =
        typeof el.getComputedTextLength === "function"
          ? el.getComputedTextLength()
          : 0;
      if (width > max) {
        el.setAttribute("textLength", String(max));
        el.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    });
  }, [lang, flow.id]);

  const stepTitle = (n: FlowNode) =>
    n.step ? `${n.step} · ${t(n.title)}` : t(n.title);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${FLOW_VIEWBOX.width} ${FLOW_VIEWBOX.height}`}
      className={`journey-flow${play ? " is-playing" : ""}`}
      role="group"
      aria-label={t(flow.title)}
      data-testid={`journey-flow-${flow.id}`}
      fontFamily="inherit"
    >
      {flow.lanes.map((lane, i) => {
        const y = LANE.top + i * (LANE.height + LANE.gap);
        // A translation may break a line once more ("\n"): three lines fit.
        const lines = lane.label.flatMap((l) => t(l).split("\n"));
        const step = lines.length > 2 ? 22 : 24;
        return (
          <g key={i} aria-hidden="true">
            <rect
              x={0}
              y={y}
              width={FLOW_VIEWBOX.width}
              height={LANE.height}
              rx={10}
              fill="rgba(255,255,255,0.035)"
              stroke="rgba(255,255,255,0.10)"
            />
            <rect
              x={0}
              y={y}
              width={8}
              height={LANE.height}
              rx={4}
              fill={lane.color}
            />
            {lines.map((line, j) => (
              <text
                key={j}
                x={22}
                y={y + (lines.length > 2 ? 30 : 34) + j * step}
                fill={lane.color}
                fontSize={lines.length > 2 ? 17 : 19}
                fontWeight={600}
                data-fit={LANE_LABEL_MAX}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
      <g aria-hidden="true">
        {flow.edges.map((edge, i) => {
          const head = arrowHead(edge.points);
          return (
            <g key={i}>
              <path
                className={`jf-e${edge.dashed ? " jf-dashed" : ""}`}
                d={pathOf(edge.points)}
                pathLength={edge.dashed ? undefined : 1}
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={2.5}
                strokeDasharray={edge.dashed ? "8 6" : undefined}
                style={{ animationDelay: `${edge.delay}s` }}
              />
              {/* The pop-in animates a CSS transform, which would replace
                  a transform attribute on the same element. */}
              <g
                transform={`translate(${head.x},${head.y}) rotate(${head.angle})`}
              >
                <path
                  className="jf-n"
                  d="M-15,-7.5 L1,0 L-15,7.5 z"
                  fill="rgba(255,255,255,0.7)"
                  style={{ animationDelay: `${edge.delay + 0.9}s` }}
                />
              </g>
              {edge.label ? (
                <text
                  className="jf-n"
                  x={edge.label.x}
                  y={edge.label.y}
                  textAnchor={edge.label.anchor}
                  fontSize={15}
                  fill="#aab4bf"
                  style={{ animationDelay: `${edge.delay + 0.2}s` }}
                >
                  {t(edge.label.text)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      {flow.nodes.map((node, i) => {
        const title = stepTitle(node);
        const sub = t(node.sub);
        const status = node.status
          ? ` (${t(STATUS_MARK[node.status].label)})`
          : "";
        return (
          <NodeBox
            key={i}
            node={node}
            color={flow.lanes[node.lane].color}
            site={site}
            label={`${title}: ${sub}${status}`}
            title={title}
            sub={sub}
            selected={selected === i}
            onSelect={onSelect ? () => onSelect(i) : undefined}
          />
        );
      })}
    </svg>
  );
}

export function JourneyFlows() {
  const t = useT("home");
  const [active, setActive] = useState<FlowId>("primary");
  const [site, setSite] = useState<DemoSite>(THIS_SITE);
  const [run, setRun] = useState(0);
  const [inView, setInView] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Draw once the drawing is on screen, and only with the page's font in:
  // text laid out in the fallback font keeps that width (the deck's note).
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts?.ready) {
      setFontsReady(true);
      return;
    }
    fonts.ready.then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const flow = JOURNEY_FLOWS.find((f) => f.id === active) ?? JOURNEY_FLOWS[0];

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = JOURNEY_FLOWS.length;
    const next = (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
    setActive(JOURNEY_FLOWS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      className="mb-12 sm:mb-16 animate-fade-in-up"
      style={{ animationDelay: "120ms" }}
      aria-labelledby="journeys-title"
      data-testid="journey-flows"
    >
      <h2 id="journeys-title" className="text-lg sm:text-xl font-bold mb-2">
        <T area="home">{"Two journeys through one dataspace"}</T>
      </h2>
      <p className="text-(--text-secondary) text-sm leading-relaxed max-w-3xl mb-4">
        {t(
          "Primary use: a person turns a paper lab result into a coded record they control. Secondary use: a researcher reaches an audited result without seeing who the patients are. Every box opens that step in the demo.",
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div
          role="tablist"
          aria-label={t("Two journeys through one dataspace")}
          className="inline-flex rounded-lg border border-(--border) bg-(--surface-2)/60 p-1"
        >
          {JOURNEY_FLOWS.map((f, i) => (
            <button
              key={f.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`journey-tab-${f.id}`}
              aria-selected={f.id === active}
              aria-controls="journey-panel"
              tabIndex={f.id === active ? 0 : -1}
              onClick={() => setActive(f.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors touch-target-sm ${
                f.id === active
                  ? "bg-blue-700 text-white font-semibold"
                  : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
            >
              {t(f.tab)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-(--text-secondary)">
          <span>
            <T area="home">{"Boxes open the demo:"}</T>
          </span>
          <div
            role="radiogroup"
            aria-label={t("Boxes open the demo:")}
            className="inline-flex rounded-full border border-(--border) overflow-hidden"
          >
            {(Object.keys(DEMO_SITES) as DemoSite[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={site === s}
                onClick={() => setSite(s)}
                data-testid={`journey-site-${s}`}
                className={`px-2.5 py-1 transition-colors ${
                  site === s
                    ? "bg-teal-700 text-white"
                    : "hover:text-(--text-primary)"
                }`}
              >
                {s === "live" ? t("live") : t("static")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        id="journey-panel"
        role="tabpanel"
        aria-labelledby={`journey-tab-${flow.id}`}
        ref={panelRef}
        className="rounded-xl border border-(--border) p-3 sm:p-5"
        style={{ background: flow.background }}
      >
        <p
          className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] mb-1"
          style={{ color: flow.accent }}
        >
          {t(flow.eyebrow)}
        </p>
        <h3 className="text-base sm:text-xl font-semibold text-[#fbfbf8] mb-3">
          {t(flow.title)}
        </h3>
        <p className="sm:hidden text-xs text-[#aab4bf] mb-2">
          {t("Swipe sideways to see the whole journey.")}
        </p>
        {/* Below sm the drawing keeps a readable size and scrolls sideways. */}
        <div className="overflow-x-auto -mx-1 px-1" tabIndex={-1}>
          <div className="min-w-[880px] sm:min-w-0">
            <FlowDiagram
              key={`${flow.id}-${run}`}
              flow={flow}
              play={inView && fontsReady}
              site={site}
            />
          </div>
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#aab4bf]"
          data-testid="journey-status-legend"
        >
          <span>{t("Status of each step:")}</span>
          {(Object.keys(STATUS_MARK) as StepStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <svg
                width={14}
                height={14}
                viewBox="0 0 14 14"
                aria-hidden="true"
              >
                <StatusMark status={s} cx={7} cy={7} />
              </svg>
              {t(STATUS_MARK[s].label)}
            </span>
          ))}
          <Link
            href={flow.details}
            className="inline-flex items-center gap-1 font-semibold text-[#fbfbf8] underline underline-offset-2 hover:text-white"
            data-testid="journey-details"
          >
            <ListChecks size={13} aria-hidden="true" />
            {t("Step by step: what is implemented and what is planned")}
          </Link>
          <Link
            href={`/journeys?flow=${flow.id}`}
            className="inline-flex items-center gap-1 font-semibold text-[#fbfbf8] underline underline-offset-2 hover:text-white"
            data-testid="journey-fullscreen"
          >
            <Maximize2 size={13} aria-hidden="true" />
            {t("Full screen, every step described")}
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#aab4bf]">
          <span>{t(flow.footnote)}</span>
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-white"
            data-testid="journey-replay"
          >
            <Play size={12} aria-hidden="true" />
            {t("Replay")}
          </button>
          <a
            href={`${DECK}${flow.deckSlide}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-white"
          >
            <Presentation size={12} aria-hidden="true" />
            {t("In the HL7 showcase deck")}
          </a>
        </div>
      </div>
    </section>
  );
}
