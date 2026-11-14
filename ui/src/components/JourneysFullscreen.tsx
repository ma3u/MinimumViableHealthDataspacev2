"use client";

/**
 * The two journeys of the start page as a full-screen view (/journeys): the
 * diagram fills the screen, a box picks its step, and the panel describes the
 * step in detail with its status, the articles of Regulation (EU) 2025/327,
 * the demo user to sign in as, and the step's page on the static demo and on
 * the live app. The arrow keys walk the steps; ?flow= and ?step= keep the
 * place, so a step can be linked.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ListChecks,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import {
  DEMO_SITES,
  FlowDiagram,
  STATUS_MARK,
} from "@/components/JourneyFlows";
import { IS_STATIC } from "@/lib/static-export";
import { useT } from "@/lib/i18n/translate";
import {
  JOURNEY_FLOWS,
  type FlowId,
  type FlowNode,
  type JourneyFlow,
} from "@/lib/journey-flows";
import {
  SIGN_IN_LABEL,
  articleUrl,
  isDemoUser,
  stepInfo,
  stepPage,
  type SignIn,
} from "@/lib/journey-steps";

const THIS_SITE = IS_STATIC ? "static" : "live";

/** The step's page on one of the two sites; the static demo takes the user from ?persona=. */
export function siteUrl(
  site: keyof typeof DEMO_SITES,
  page: string,
  signIn?: SignIn,
): string {
  const persona =
    site === "static" && signIn && isDemoUser(signIn)
      ? `${page.includes("?") ? "&" : "?"}persona=${signIn}`
      : "";
  const [path, hash] = page.split("#");
  return `${DEMO_SITES[site]}${path}${persona}${hash ? `#${hash}` : ""}`;
}

function stepLabel(n: FlowNode, t: (s: string) => string): string {
  return n.step ? `${n.step} · ${t(n.title)}` : t(n.title);
}

/** A step's name in the address: its number, or its title as a slug when
 *  it has none ("provision-spe"), never its position, which a number of
 *  another step could equal. */
export function stepKey(n: FlowNode): string {
  return (
    n.step ??
    n.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/** Read ?flow= and ?step=. */
export function placeFromUrl(search: string): { flow: FlowId; index: number } {
  const q = new URLSearchParams(search);
  const flow: FlowId = q.get("flow") === "secondary" ? "secondary" : "primary";
  const nodes = JOURNEY_FLOWS.find((f) => f.id === flow)!.nodes;
  const step = q.get("step");
  const index = step ? nodes.findIndex((n) => stepKey(n) === step) : 0;
  return { flow, index: Math.max(0, index) };
}

function SiteLinks({
  page,
  signIn,
  t,
}: {
  page: string;
  signIn?: SignIn;
  t: (s: string) => string;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={siteUrl("static", page, signIn)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} bg-[#fbfbf8] text-[#0b1220] hover:bg-white`}
        data-testid="journey-open-static"
      >
        {t("Open in the static demo")}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
      <a
        href={siteUrl("live", page)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} border border-[#fbfbf8]/60 text-[#fbfbf8] hover:bg-white/10`}
        data-testid="journey-open-live"
      >
        {t("Open in the live app")}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </div>
  );
}

function StepPanel({
  flow,
  index,
  t,
}: {
  flow: JourneyFlow;
  index: number;
  t: (s: string, vars?: Record<string, string | number>) => string;
}) {
  const node = flow.nodes[index];
  const info = stepInfo(flow.id, node);
  const lane = flow.lanes[node.lane];
  const mark = node.status ? STATUS_MARK[node.status] : null;
  const page = stepPage(node);
  return (
    <div data-testid="journey-step-panel">
      <p className="text-xs uppercase tracking-[0.16em] text-[#aab4bf]">
        {t("Step {n} of {m}", { n: index + 1, m: flow.nodes.length })}
      </p>
      <h2 className="mt-1 text-2xl font-bold leading-tight">
        {stepLabel(node, t)}
      </h2>
      <p className="mt-1 text-[#aab4bf]">{t(node.sub)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {mark && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-0.5"
            data-testid="journey-step-status"
          >
            <svg width={12} height={12} viewBox="0 0 14 14" aria-hidden="true">
              <circle
                cx={7}
                cy={7}
                r={5}
                fill={mark.fill}
                stroke={mark.stroke}
                strokeWidth={2}
                strokeDasharray={mark.dash}
              />
            </svg>
            {t(mark.label)}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
          style={{ color: lane.color, border: `1px solid ${lane.color}` }}
        >
          {lane.label.map((l) => t(l).replaceAll("\n", " ")).join(" ")}
        </span>
      </div>

      {info && (
        <p className="mt-4 text-base leading-relaxed text-[#e5e9ee]">
          {t(info.detail)}
        </p>
      )}

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {info && info.ehds.length > 0 && (
          <>
            <dt className="text-[#aab4bf]">{t("EHDS")}</dt>
            <dd className="flex flex-wrap gap-x-2">
              {info.ehds.map((a) => (
                <a
                  key={a}
                  href={articleUrl(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-white"
                >
                  {t("Art. {a}", { a })}
                </a>
              ))}
            </dd>
          </>
        )}
        {info && (
          <>
            <dt className="text-[#aab4bf]">{t("Sign in as")}</dt>
            <dd data-testid="journey-step-signin">
              {t(SIGN_IN_LABEL[info.signIn])}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <SiteLinks page={page} signIn={info?.signIn} t={t} />
        {page !== node.href && (
          <p className="mt-2 text-xs text-[#aab4bf]">
            {t("This step happens in the app; the links open its user guide.")}
          </p>
        )}
      </div>

      {info?.extra && (
        <div className="mt-5 rounded-lg border border-white/15 p-3">
          <p className="text-sm font-semibold">{t(info.extra.label)}</p>
          {info.extra.signIn && (
            <p className="mb-2 text-xs text-[#aab4bf]">
              {t("Sign in as")}: {t(SIGN_IN_LABEL[info.extra.signIn])}
            </p>
          )}
          <SiteLinks page={info.extra.href} signIn={info.extra.signIn} t={t} />
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-[#aab4bf]">
        {t(
          "The static demo needs no password and opens as the user named here. On the live app the demo users' password is their username; it is stopped in the evening, at weekends and on Berlin holidays.",
        )}
      </p>
    </div>
  );
}

export function JourneysFullscreen() {
  const t = useT("home");
  const [flowId, setFlowId] = useState<FlowId>("primary");
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const flow = JOURNEY_FLOWS.find((f) => f.id === flowId)!;

  useEffect(() => {
    const place = placeFromUrl(window.location.search);
    setFlowId(place.flow);
    setIndex(place.index);
  }, []);

  // Keep the place in the address, so a step can be linked.
  useEffect(() => {
    const node = flow.nodes[index];
    if (!node) return;
    const step = stepKey(node);
    const url = `${
      window.location.pathname
    }?flow=${flowId}&step=${encodeURIComponent(step)}`;
    window.history.replaceState(null, "", url);
  }, [flowId, index, flow.nodes]);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const go = useCallback(
    (delta: number) =>
      setIndex((i) => Math.min(flow.nodes.length - 1, Math.max(0, i + delta))),
    [flow.nodes.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The tabs switch the journey with the same keys.
      const target = e.target;
      if (target instanceof Element && target.closest("[role=tablist]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const pick = (id: FlowId) => {
    setFlowId(id);
    setIndex(0);
  };

  const toggleFull = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] flex flex-col bg-[#0b1220] text-[#fbfbf8]"
      data-testid="journeys-fullscreen"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-5">
        <h1 className="mr-2 text-sm font-semibold sm:text-base">
          {t("Two journeys through one dataspace")}
        </h1>
        <div
          role="tablist"
          aria-label={t("Two journeys through one dataspace")}
          className="flex gap-1"
        >
          {JOURNEY_FLOWS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === flowId}
              onClick={() => pick(f.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  pick(f.id === "primary" ? "secondary" : "primary");
                }
              }}
              className={`rounded-md px-3 py-1 text-sm ${
                f.id === flowId
                  ? "bg-[#fbfbf8] font-semibold text-[#0b1220]"
                  : "text-[#aab4bf] hover:text-white"
              }`}
              data-testid={`journeys-tab-${f.id}`}
            >
              {t(f.tab)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleFull}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-[#aab4bf] hover:bg-white/10 hover:text-white"
            data-testid="journeys-fullscreen-toggle"
          >
            {full ? (
              <Minimize2 size={15} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} aria-hidden="true" />
            )}
            {full ? t("Exit full screen") : t("Full screen")}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-[#aab4bf] hover:bg-white/10 hover:text-white"
            data-testid="journeys-close"
          >
            <X size={15} aria-hidden="true" />
            {t("Close")}
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          className="flex shrink-0 flex-col p-3 sm:p-5 lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-auto"
          style={{ background: flow.background }}
          aria-label={t(flow.title)}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em] sm:text-xs"
            style={{ color: flow.accent }}
          >
            {t(flow.eyebrow)}
          </p>
          <p className="mb-3 text-base font-semibold sm:text-xl">
            {t(flow.title)}
          </p>
          <div className="my-auto overflow-x-auto py-2">
            <div className="min-w-[880px]">
              <FlowDiagram
                key={flow.id}
                flow={flow}
                play
                site={THIS_SITE}
                selected={index}
                onSelect={setIndex}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#aab4bf]">
            <span>{t("Status of each step:")}</span>
            {Object.values(STATUS_MARK).map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1">
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                >
                  <circle
                    cx={7}
                    cy={7}
                    r={5}
                    fill={m.fill}
                    stroke={m.stroke}
                    strokeWidth={2}
                    strokeDasharray={m.dash}
                  />
                </svg>
                {t(m.label)}
              </span>
            ))}
            <span>
              {t("Pick a box, or walk the steps with the arrow keys.")}
            </span>
            <Link
              href={flow.details}
              className="inline-flex items-center gap-1 font-semibold text-[#fbfbf8] underline underline-offset-2"
            >
              <ListChecks size={13} aria-hidden="true" />
              {t("Step by step: what is implemented and what is planned")}
            </Link>
          </div>
        </section>

        <aside
          className="shrink-0 border-t lg:min-h-0 lg:shrink lg:overflow-y-auto border-white/10 p-4 sm:p-6 lg:w-[440px] lg:border-l lg:border-t-0"
          aria-live="polite"
        >
          <StepPanel flow={flow} index={index} t={t} />
          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40"
              data-testid="journeys-prev"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t("Previous step")}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === flow.nodes.length - 1}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40"
              data-testid="journeys-next"
            >
              {t("Next step")}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
