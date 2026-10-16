"use client";

/**
 * DocFigureViewer: the full-screen view of a diagram in a published report.
 *
 * The reports' Markdown is rendered to HTML at build time, so the figures are
 * plain `<a class="doc-figure"><img></a>` elements and not React components.
 * This wrapper listens for a click on one of them, or on a bare <img> such
 * as a screenshot, and opens the image in an overlay that fills the viewport, with zoom (buttons, mouse wheel, pinch,
 * double click, keyboard) and drag to pan. A click with a modifier key keeps
 * the link's own behaviour, so the file still opens in a new tab on request.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Scan,
  X,
} from "lucide-react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;

interface Figure {
  src: string;
  alt: string;
  /** The element that opened the viewer, to give focus back on close. */
  opener: HTMLElement | null;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export function DocFigureViewer({ children }: { children: ReactNode }) {
  const [figure, setFigure] = useState<Figure | null>(null);

  const onClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement;
    const anchor = target.closest?.("a.doc-figure");
    let img: HTMLImageElement | null = null;
    let opener: HTMLElement | null = null;
    if (anchor instanceof HTMLAnchorElement) {
      // A diagram: the link around it opens the file, a plain click the viewer.
      img = anchor.querySelector("img");
      opener = anchor;
    } else if (target instanceof HTMLImageElement && !target.closest("a")) {
      // A screenshot written as a bare <img> in the Markdown.
      img = target;
      opener = target;
    }
    if (!img) return;
    e.preventDefault();
    setFigure({
      src: img.getAttribute("src") ?? img.src,
      alt: img.alt || "Figure",
      opener,
    });
  }, []);

  const close = useCallback(() => {
    setFigure((f) => {
      f?.opener?.focus?.();
      return null;
    });
  }, []);

  return (
    <div onClick={onClick}>
      {children}
      {figure ? <FigureOverlay figure={figure} onClose={close} /> : null}
    </div>
  );
}

function FigureOverlay({
  figure,
  onClose,
}: {
  figure: Figure;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  const stageSize = useCallback(() => {
    const el = stageRef.current;
    return el
      ? { w: el.clientWidth, h: el.clientHeight }
      : { w: window.innerWidth, h: window.innerHeight };
  }, []);

  /** The scale at which the whole diagram fits the stage, centred. */
  const fit = useCallback(() => {
    if (!natural) return;
    const { w, h } = stageSize();
    const scale = clampScale(Math.min(w / natural.w, h / natural.h) * 0.96);
    setView({
      scale,
      x: (w - natural.w * scale) / 2,
      y: (h - natural.h * scale) / 2,
    });
  }, [natural, stageSize]);

  /** Zoom to `next`, keeping the stage point (px, py) over the same spot. */
  const zoomTo = useCallback(
    (next: number, px?: number, py?: number) => {
      setView((v) => {
        const scale = clampScale(next);
        const { w, h } = stageSize();
        const cx = px ?? w / 2;
        const cy = py ?? h / 2;
        const k = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    },
    [stageSize],
  );

  const zoomIn = useCallback(
    () => setView((v) => applyZoom(v, v.scale * STEP, stageSize())),
    [stageSize],
  );
  const zoomOut = useCallback(
    () => setView((v) => applyZoom(v, v.scale / STEP, stageSize())),
    [stageSize],
  );
  const actualSize = useCallback(() => {
    if (!natural) return;
    const { w, h } = stageSize();
    setView({
      scale: 1,
      x: Math.max(0, (w - natural.w) / 2),
      y: Math.max(0, (h - natural.h) / 2),
    });
  }, [natural, stageSize]);

  // Fit the diagram once its size is known, and again when the stage resizes.
  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  // Keyboard, scroll lock, focus, and the browser's fullscreen state.
  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => undefined);
          return;
        }
        onClose();
      } else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-" || e.key === "_") zoomOut();
      else if (e.key === "0") fit();
      else if (e.key === "1") actualSize();
      else if (e.key.startsWith("Arrow")) {
        const d = 60;
        setView((v) => ({
          ...v,
          x:
            v.x + (e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0),
          y: v.y + (e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0),
        }));
      } else return;
      e.preventDefault();
    };
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, [onClose, zoomIn, zoomOut, fit, actualSize]);

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const px = e.clientX - (rect?.left ?? 0);
    const py = e.clientY - (rect?.top ?? 0);
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
    zoomTo(view.scale * factor, px, py);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
      };
      drag.current = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = stageRef.current?.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - (rect?.left ?? 0);
      const my = (a.y + b.y) / 2 - (rect?.top ?? 0);
      zoomTo((pinch.current.scale * dist) / pinch.current.dist, mx, my);
    } else if (drag.current) {
      const d = drag.current;
      setView((v) => ({
        ...v,
        x: d.vx + (e.clientX - d.x),
        y: d.vy + (e.clientY - d.y),
      }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    stageRef.current?.releasePointerCapture?.(e.pointerId);
    pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, vx: view.x, vy: view.y };
    } else drag.current = null;
  };

  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const px = e.clientX - (rect?.left ?? 0);
    const py = e.clientY - (rect?.top ?? 0);
    if (!natural) return;
    const { w, h } = stageSize();
    const fitScale = Math.min(w / natural.w, h / natural.h) * 0.96;
    if (view.scale > fitScale * 1.05) fit();
    else zoomTo(fitScale * 2.5, px, py);
  };

  const toggleFullscreen = () => {
    const el = dialogRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
    } else {
      el.requestFullscreen?.().catch(() => undefined);
    }
  };

  const percent = Math.round(view.scale * 100);
  const btn =
    "grid place-items-center h-9 min-w-9 px-2 rounded-md text-gray-200 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={figure.alt}
      data-testid="doc-figure-viewer"
      className="fixed inset-0 z-100 flex flex-col bg-gray-950 text-gray-100 select-none"
    >
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10 bg-gray-900/95 text-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btn}
            onClick={zoomOut}
            aria-label="Zoom out"
            title="Zoom out (-)"
            disabled={view.scale <= MIN_SCALE}
          >
            <Minus size={16} />
          </button>
          <span
            className="tabular-nums w-14 text-center text-gray-300"
            aria-live="polite"
            data-testid="doc-figure-zoom"
          >
            {percent}%
          </span>
          <button
            type="button"
            className={btn}
            onClick={zoomIn}
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={view.scale >= MAX_SCALE}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className={btn}
            onClick={fit}
            aria-label="Fit to screen"
            title="Fit to screen (0)"
          >
            <Scan size={16} />
          </button>
          <button
            type="button"
            className={`${btn} text-xs font-medium`}
            onClick={actualSize}
            title="Actual size (1)"
          >
            1:1
          </button>
        </div>
        <p className="flex-1 min-w-0 truncate px-3 text-gray-400 hidden sm:block">
          {figure.alt}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={figure.src}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
            aria-label="Open the file in a new tab"
            title="Open the file in a new tab"
          >
            <ExternalLink size={16} />
          </a>
          <button
            type="button"
            className={btn}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Leave fullscreen" : "Fullscreen"}
            title={fullscreen ? "Leave fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            ref={closeRef}
            type="button"
            className={btn}
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 overflow-hidden touch-none cursor-grab active:cursor-grabbing bg-white"
        data-testid="doc-figure-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* The diagram is drawn at natural width times the scale, so a vector
            file stays sharp at every zoom level, and moved with a transform. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={figure.src}
          alt={figure.alt}
          draggable={false}
          data-testid="doc-figure-image"
          onLoad={(e) => {
            const img = e.currentTarget;
            const w = img.naturalWidth || img.clientWidth || 1200;
            const h = img.naturalHeight || img.clientHeight || 800;
            setNatural({ w, h });
          }}
          className="absolute top-0 left-0 max-w-none pointer-events-none"
          style={{
            width: natural ? natural.w * view.scale : undefined,
            height: natural ? natural.h * view.scale : undefined,
            transform: `translate(${view.x}px, ${view.y}px)`,
            visibility: natural ? "visible" : "hidden",
          }}
        />
        {!natural && (
          <p className="absolute inset-0 grid place-items-center text-gray-500">
            Loading the diagram
          </p>
        )}
      </div>
      <p className="px-3 py-1 text-xs text-gray-500 border-t border-white/10 bg-gray-900/95 hidden sm:block">
        Scroll or pinch to zoom, drag to move, double click to zoom in, 0 fits
        the screen, Esc closes.
      </p>
    </div>,
    document.body,
  );
}

function applyZoom(
  v: View,
  next: number,
  stage: { w: number; h: number },
): View {
  const scale = clampScale(next);
  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const k = scale / v.scale;
  return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}
