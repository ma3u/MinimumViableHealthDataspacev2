"use client";

/**
 * A step's preview on the full-screen journeys page.
 *
 * A hub page is a full-page screenshot in a browser window that tours it: it
 * starts at the top, then glides and zooms to each of the page's core
 * features (a ring marks it), and back. The screenshots and the features'
 * boxes come from __tests__/e2e/capture-journey-previews.spec.ts, through
 * scripts/build-journey-previews.py, into src/content/journey-previews.json.
 * The Klarbefund screens are a phone that crossfades through them. Several
 * pages or screens take turns. Without motion (prefers-reduced-motion) the
 * first view stands still.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BASE_PATH } from "@/lib/static-export";
import { guideScreenshotSrc } from "@/lib/guide-screenshots";
import { localizedImagePath } from "@/lib/i18n/localized-images";
import { useLanguage } from "@/lib/use-language";
import type { StepPreview as Preview } from "@/lib/journey-steps";
import previews from "@/content/journey-previews.json";

/** The browser window's view and the phone's screen, as height / width. */
const WEB_ASPECT = 750 / 1200;
const APP_ASPECT = 1434 / 660;
/** The browser window's title bar and the phone's bezel, in pixels. */
const WEB_CHROME = 28;
const PHONE_BEZEL = 8;

/** How long the view rests on a stop, and how long it takes to glide on. */
const REST_MS = 2600;
const GLIDE_MS = 1400;
const APP_FRAME_MS = 3800;
/** The closest the tour zooms in. */
const MAX_ZOOM = 2.4;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageShot {
  src: string;
  width: number;
  height: number;
  /** The core features, as fractions of the image. */
  focus: Box[];
}

const SHOTS = previews.pages as Record<string, PageShot>;

/** A page's full-page screenshot, or its guide screenshot when it has none. */
export function pageShot(page: string): PageShot {
  return (
    SHOTS[page] ?? {
      src: guideScreenshotSrc(page) ?? "",
      width: 1200,
      height: 750,
      focus: [],
    }
  );
}

/** One view of the tour: the image's offset and zoom, and the feature ringed. */
export interface Stop {
  x: number;
  y: number;
  zoom: number;
  ring: Box | null;
}

/**
 * The tour of a page shown in a view of vw x vh pixels, the image fitted to
 * the view's width: the top, each feature zoomed to fit (centred, never past
 * the image's edge), then, when the page names fewer than three features,
 * views further down so the tour still scrolls it.
 */
export function tourStops(shot: PageShot, vw: number, vh: number): Stop[] {
  const W = vw;
  const H = (vw * shot.height) / shot.width;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  const view = (cx: number, cy: number, zoom: number, ring: Box | null) => ({
    x: clamp(vw / 2 - cx * zoom, vw - W * zoom, 0),
    y: H * zoom <= vh ? 0 : clamp(vh / 2 - cy * zoom, vh - H * zoom, 0),
    zoom,
    ring,
  });
  const stops: Stop[] = [{ x: 0, y: 0, zoom: 1, ring: null }];
  for (const f of shot.focus) {
    const bw = f.w * W;
    const bh = f.h * H;
    const zoom = clamp(
      Math.min(vw / (bw * 1.12), vh / (bh * 1.12)),
      1,
      MAX_ZOOM,
    );
    stops.push(view((f.x + f.w / 2) * W, (f.y + f.h / 2) * H, zoom, f));
  }
  if (shot.focus.length < 3 && H > vh * 1.4) {
    for (const part of [0.45, 0.85]) {
      stops.push(view(W / 2, vh / 2 + part * (H - vh), 1, null));
    }
  }
  return stops;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** The width and height of an element, kept up to date. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const TOP: Stop = { x: 0, y: 0, zoom: 1, ring: null };

/** The browser window's view: the pages in turn, each toured. */
function PageTour({
  pages,
  label,
  reduced,
  onPage,
}: {
  pages: readonly string[];
  label: string;
  reduced: boolean;
  onPage: (page: string) => void;
}) {
  const lang = useLanguage();
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [at, setAt] = useState({ page: 0, stop: 0 });
  const pagesKey = pages.join("|");

  useEffect(() => setAt({ page: 0, stop: 0 }), [pagesKey]);
  useEffect(() => onPage(pages[at.page] ?? pages[0]), [at.page, pages, onPage]);

  useEffect(() => {
    if (reduced || w === 0) return;
    const count = tourStops(pageShot(pages[at.page]), w, h).length;
    const id = window.setTimeout(
      () =>
        setAt(({ page, stop }) =>
          stop + 1 < count
            ? { page, stop: stop + 1 }
            : { page: (page + 1) % pages.length, stop: 0 },
        ),
      at.stop === 0 ? REST_MS : REST_MS + GLIDE_MS,
    );
    return () => window.clearTimeout(id);
  }, [at, reduced, w, h, pages]);

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden bg-white"
      data-testid="journey-step-tour"
      data-stop={at.stop}
    >
      {pages.map((page, i) => {
        const shot = pageShot(page);
        const stops = w ? tourStops(shot, w, h) : [];
        // Before the view is measured, the top of the page.
        const stop = (i === at.page ? stops[at.stop] : stops[0]) ?? TOP;
        const H = w ? (w * shot.height) / shot.width : 0;
        return (
          <div
            key={page}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === at.page ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={i === at.page ? undefined : true}
          >
            {stop && (
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: w || "100%",
                  height: H || undefined,
                  transform: `translate(${stop.x}px, ${stop.y}px) scale(${stop.zoom})`,
                  transition: reduced
                    ? "none"
                    : `transform ${GLIDE_MS}ms cubic-bezier(0.45, 0, 0.25, 1)`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a static export cannot optimise images */}
                <img
                  src={`${BASE_PATH}${localizedImagePath(shot.src, lang)}`}
                  alt={i === at.page ? label : ""}
                  className="block h-full w-full"
                  decoding="async"
                />
                {shot.focus.map((f, j) => (
                  <div
                    key={j}
                    className="absolute rounded-md transition-opacity duration-500"
                    style={{
                      left: `${f.x * 100}%`,
                      top: `${f.y * 100}%`,
                      width: `${f.w * 100}%`,
                      height: `${f.h * 100}%`,
                      boxShadow: "0 0 0 3px rgba(240,178,122,0.95)",
                      opacity: i === at.page && stop.ring === f ? 1 : 0,
                    }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StepPreview({
  preview,
  label,
  style,
  className = "",
}: {
  preview: Preview;
  /** What the picture shows, for a screen reader: the step's title. */
  label: string;
  style?: CSSProperties;
  className?: string;
}) {
  const lang = useLanguage();
  const reduced = useReducedMotion();
  const [page, setPage] = useState(
    preview.kind === "web" ? preview.pages[0] : "",
  );
  const [shown, setShown] = useState(0);
  const screens = preview.kind === "app" ? preview.screens : [];
  const screensKey = screens.join("|");

  useEffect(() => {
    setShown(0);
    if (reduced || screens.length < 2) return;
    const id = window.setInterval(
      () => setShown((i) => (i + 1) % screens.length),
      APP_FRAME_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, screens.length, screensKey]);

  if (preview.kind === "web") {
    return (
      <figure
        className={`jp-pop m-0 flex flex-col overflow-hidden rounded-lg border border-white/25 bg-[#0d162b] shadow-2xl shadow-black/60 ${className}`}
        style={style}
        data-testid="journey-step-preview"
        data-kind="web"
      >
        <div
          className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-[#15203a] px-2.5"
          style={{ height: WEB_CHROME }}
          aria-hidden="true"
        >
          <span className="h-2 w-2 rounded-full bg-[#e07a5f]" />
          <span className="h-2 w-2 rounded-full bg-[#f0b27a]" />
          <span className="h-2 w-2 rounded-full bg-[#58d68d]" />
          <span
            className="ml-2 truncate rounded bg-black/30 px-2 py-0.5 font-mono text-[10px] text-[#aab4bf]"
            data-testid="journey-step-preview-url"
          >
            ehds.mabu.red{page}
          </span>
        </div>
        <div
          className="relative w-full"
          style={{ aspectRatio: `${1 / WEB_ASPECT}` }}
        >
          <PageTour
            pages={preview.pages}
            label={label}
            reduced={reduced}
            onPage={setPage}
          />
        </div>
      </figure>
    );
  }
  return (
    <figure
      className={`jp-pop m-0 rounded-[28px] border border-white/25 bg-[#05080f] shadow-2xl shadow-black/60 ${className}`}
      style={{ padding: PHONE_BEZEL, ...style }}
      data-testid="journey-step-preview"
      data-kind="app"
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-[20px] bg-white"
        style={{ aspectRatio: `${1 / APP_ASPECT}` }}
      >
        {screens.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- a static export cannot optimise images
          <img
            key={s}
            src={`${BASE_PATH}${localizedImagePath(
              `/published-docs/${s}.png`,
              lang,
            )}`}
            alt={i === shown ? label : ""}
            aria-hidden={i === shown ? undefined : true}
            className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${
              i === shown ? "opacity-100" : "opacity-0"
            } ${reduced ? "" : "jp-drift"}`}
            decoding="async"
          />
        ))}
      </div>
    </figure>
  );
}
