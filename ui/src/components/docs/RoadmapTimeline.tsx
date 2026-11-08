"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Pencil,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  DataGroup,
  DataItem,
  Timeline,
  TimelineOptions,
} from "vis-timeline";
import type { DataSet } from "vis-data";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import { LinkedText } from "@/components/docs/LinkedText";
import {
  ITEMS,
  LANES,
  MILESTONES,
  ROADMAP_PROJECT,
  STATUS_LABEL,
  issueUrl,
  itemTaskId,
  milestoneTaskId,
  roadmapTargets,
  type Milestone,
  type Priority,
  type RoadmapItem,
  type Status,
  type Translate,
} from "@/lib/docs/roadmap";
import { translate } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";

const DAY = 24 * 60 * 60 * 1000;

/** moment's month names for the axis, loaded only for the language picked. */
const MOMENT_LOCALES: Record<string, () => Promise<unknown>> = {
  de: () => import("moment/locale/de"),
  fr: () => import("moment/locale/fr"),
  nl: () => import("moment/locale/nl"),
  es: () => import("moment/locale/es"),
};

const itemId = (i: RoadmapItem) => itemTaskId(i.issue);
const milestoneId = (m: Milestone) => milestoneTaskId(m.id);

type Selected =
  | { kind: "item"; item: RoadmapItem }
  | { kind: "milestone"; milestone: Milestone };

function find(id: string | null): Selected | null {
  if (!id) return null;
  const item = ITEMS.find((i) => itemId(i) === id);
  if (item) return { kind: "item", item };
  const milestone = MILESTONES.find((m) => milestoneId(m) === id);
  return milestone ? { kind: "milestone", milestone } : null;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

/** What a filter leaves bright: the rest is dimmed, so the lanes keep their shape. */
function matches(
  i: RoadmapItem,
  status: Status | "",
  priority: Priority | "",
  query: string,
  tr: Translate,
): boolean {
  const q = query.trim().toLowerCase();
  return (
    (!status || i.status === status) &&
    (!priority || i.priority === priority) &&
    (!q ||
      `${i.issue} ${i.short} ${tr(i.short)} ${i.title} ${tr(i.title)}`
        .toLowerCase()
        .includes(q))
  );
}

/**
 * The roadmap as an interactive timeline (vis-timeline): a lane per driver,
 * a bar per issue, a diamond per date set by law or by a programme. Drag to
 * pan, Ctrl or ⌘ and the wheel to zoom; a click shows the details with every
 * source the note cites, a double click opens the issue or the source, and
 * #i934 in the address selects #934. Full screen takes the whole block. The
 * plan is edited in the GitHub Project (ROADMAP_PROJECT).
 */
export default function RoadmapTimeline() {
  const lang = useLanguage();
  const tr = useCallback<Translate>(
    (text, vars) => translate(lang, "docsCommon", text, vars),
    [lang],
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const itemsRef = useRef<DataSet<DataItem> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [query, setQuery] = useState("");
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);

  const tooltips = useMemo(
    () =>
      new Map(
        roadmapTargets(lang === "en" ? undefined : tr).map((t) => [
          t.taskId,
          t.label,
        ]),
      ),
    [lang, tr],
  );

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setCopied(false);
    const url = `${location.pathname}${location.search}${id ? `#${id}` : ""}`;
    history.replaceState(null, "", url);
  }, []);

  // The chart is drawn again when the language changes; the selection stays.
  useEffect(() => {
    let cancelled = false;
    let timeline: Timeline | null = null;
    (async () => {
      const [{ Timeline }, { DataSet }] = await Promise.all([
        import("vis-timeline/peer"),
        import("vis-data/peer"),
        // The axis names its months in the page's language.
        lang !== "en" ? MOMENT_LOCALES[lang]?.() : undefined,
      ]);
      if (cancelled || !chartRef.current) return;
      const groups = new DataSet<DataGroup>(
        LANES.map((l, order) => ({
          id: l.id,
          order,
          content: `<div class="rt-lane"><b>${esc(tr(l.label))}</b></div>`,
        })),
      );
      const rows: DataItem[] = [
        ...MILESTONES.map((m, order) => ({
          id: milestoneId(m),
          order,
          group: m.lane,
          start: m.date,
          type: "point" as const,
          className: "rt-milestone",
          content: esc(tr(m.label)),
          title: esc(tooltips.get(milestoneId(m)) ?? ""),
        })),
        ...ITEMS.map((i, order) => ({
          id: itemId(i),
          order: 100 + order,
          group: i.lane,
          start: i.start,
          end: i.end,
          type: "range" as const,
          className: `rt-${i.status}`,
          content: `<span class="rt-prio rt-${i.priority}">${
            i.priority
          }</span>${i.issue} ${esc(tr(i.short))}`,
          title: esc(tooltips.get(itemId(i)) ?? ""),
        })),
      ];
      const items = new DataSet<DataItem>(rows);
      const now = new Date();
      const options: TimelineOptions = {
        stack: true,
        showCurrentTime: true,
        zoomKey: "ctrlKey",
        horizontalScroll: true,
        verticalScroll: true,
        height: "100%",
        orientation: { axis: "both", item: "top" },
        margin: { item: { horizontal: 4, vertical: 6 } },
        min: "2026-01-01",
        max: "2032-01-01",
        zoomMin: 14 * DAY,
        zoomMax: 6 * 365 * DAY,
        start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        end: new Date(now.getFullYear() + 2, now.getMonth(), 1),
        tooltip: { followMouse: true, overflowMethod: "cap", delay: 250 },
        groupOrder: "order",
        order: (a: DataItem, b: DataItem) =>
          Number((a as { order?: number }).order) -
          Number((b as { order?: number }).order),
        locale: lang,
        xss: {
          disabled: false,
          filterOptions: {
            whiteList: { span: ["class"], div: ["class"], b: [] },
          },
        },
      };
      timeline = new Timeline(chartRef.current, items, groups, options);
      timelineRef.current = timeline;
      itemsRef.current = items;
      timeline.on("select", (p: { items: string[] }) =>
        select(p.items[0] ?? null),
      );
      timeline.on("doubleClick", (p: { item: string | null }) => {
        const s = find(p.item);
        if (!s) return;
        window.open(
          s.kind === "item" ? issueUrl(s.item.issue) : s.milestone.href,
          "_blank",
          "noopener,noreferrer",
        );
      });
      const fromHash = location.hash.slice(1);
      if (find(fromHash)) {
        timeline.setSelection([fromHash]);
        timeline.focus(fromHash, { animation: false });
        setSelected(fromHash);
      }
    })();
    return () => {
      cancelled = true;
      timeline?.destroy();
      timelineRef.current = null;
      itemsRef.current = null;
    };
  }, [lang, tr, tooltips, select]);

  // Filters dim the bars that do not match, and the diamonds while one is set.
  useEffect(() => {
    const filtered = Boolean(status || priority || query.trim());
    itemsRef.current?.update([
      ...ITEMS.map((i) => ({
        id: itemId(i),
        className: `rt-${i.status}${
          matches(i, status, priority, query, tr) ? "" : " rt-dim"
        }`,
      })),
      ...MILESTONES.map((m) => ({
        id: milestoneId(m),
        className: `rt-milestone${filtered ? " rt-dim" : ""}`,
      })),
    ]);
  }, [status, priority, query, tr, lang]);

  // Full screen takes the whole block; where the browser refuses it (an
  // embedded view), the block fills the window instead.
  const toggleFull = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (full) setFull(false);
    else {
      try {
        await frame.requestFullscreen();
      } catch {
        setFull(true);
      }
    }
  }, [full]);
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => timelineRef.current?.redraw(), 50);
    return () => clearTimeout(t);
  }, [full, selected]);

  const zoom = (by: number) =>
    by > 0
      ? timelineRef.current?.zoomIn(0.4)
      : timelineRef.current?.zoomOut(0.4);
  const showYears = (years: number | "all") => {
    const t = timelineRef.current;
    if (!t) return;
    if (years === "all") return t.fit();
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    t.setWindow(
      start,
      new Date(start.getFullYear() + years, start.getMonth(), 1),
    );
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input, select")) return;
    if (e.key === "f") void toggleFull();
    else if (e.key === "+" || e.key === "=") zoom(1);
    else if (e.key === "-") zoom(-1);
    else if (e.key === "Escape") {
      if (full && !document.fullscreenElement) setFull(false);
      else {
        timelineRef.current?.setSelection([]);
        select(null);
      }
    }
  };

  const shown = find(selected);
  const button =
    "inline-flex items-center gap-1 rounded-md border border-(--border-ui) px-2.5 py-1 text-xs hover:border-(--accent)";
  const field =
    "rounded-md border border-(--border-ui) bg-(--surface-card) px-2 py-1 text-xs";

  return (
    <div
      ref={frameRef}
      data-testid="roadmap-timeline"
      className={`roadmap-timeline flex flex-col gap-2 bg-(--bg) ${
        full ? "rt-full" : ""
      }`}
      onKeyDown={onKey}
    >
      <div
        role="toolbar"
        aria-label={tr("Roadmap controls")}
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          className={button}
          onClick={() => zoom(1)}
          aria-label={tr("Zoom in")}
          title={tr("Zoom in")}
        >
          <ZoomIn size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => zoom(-1)}
          aria-label={tr("Zoom out")}
          title={tr("Zoom out")}
        >
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => timelineRef.current?.moveTo(new Date())}
        >
          {tr("Today")}
        </button>
        <button type="button" className={button} onClick={() => showYears(1)}>
          {tr("1 year")}
        </button>
        <button type="button" className={button} onClick={() => showYears(3)}>
          {tr("3 years")}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => showYears("all")}
        >
          {tr("To 2031")}
        </button>
        <select
          className={field}
          aria-label={tr("Filter by status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "")}
        >
          <option value="">{tr("All statuses")}</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {tr(STATUS_LABEL[s])}
            </option>
          ))}
        </select>
        <select
          className={field}
          aria-label={tr("Filter by priority")}
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
        >
          <option value="">{tr("All priorities")}</option>
          {(["P1", "P2", "P3"] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input
          type="search"
          className={`${field} w-48`}
          placeholder={tr("Search an issue or a title")}
          aria-label={tr("Search an issue or a title")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="ml-auto flex flex-wrap gap-2">
          <a
            href={ROADMAP_PROJECT}
            target="_blank"
            rel="noopener noreferrer"
            className={button}
          >
            <Pencil size={14} aria-hidden="true" />{" "}
            {tr("Edit in the GitHub Project")}
          </a>
          <button
            type="button"
            className={button}
            onClick={() => void toggleFull()}
            aria-pressed={full}
          >
            {full ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}{" "}
            {full ? tr("Exit full screen") : tr("Full screen")}
          </button>
        </span>
      </div>

      <div className="rt-stage flex min-h-0 flex-1 gap-3">
        <div
          ref={chartRef}
          className="rt-chart min-w-0 flex-1 overflow-hidden rounded-lg border border-(--border)"
          role="region"
          aria-label={tr("Roadmap timeline")}
        />
        {shown && (
          <aside
            aria-live="polite"
            data-testid="roadmap-detail"
            className="rt-detail w-80 shrink-0 overflow-auto rounded-lg border border-(--border) bg-(--surface) p-4 text-sm"
          >
            <button
              type="button"
              className="float-right p-1 text-(--text-secondary) hover:text-(--text-primary)"
              aria-label={tr("Close")}
              onClick={() => {
                timelineRef.current?.setSelection([]);
                select(null);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
            {shown.kind === "item" ? (
              <>
                <p className="text-xs text-(--text-secondary)">
                  #{shown.item.issue} ·{" "}
                  {tr(LANES.find((l) => l.id === shown.item.lane)!.label)}
                </p>
                <p className="mt-1 mb-2 font-semibold text-(--text-primary)">
                  <LinkedText
                    area="docsCommon"
                    text={shown.item.title}
                    links={shown.item.links}
                  />
                </p>
                <p className="mb-2 flex flex-wrap gap-1 text-xs">
                  <span className="rounded-full border border-(--border-ui) px-2">
                    {shown.item.priority}
                  </span>
                  <span className="rounded-full border border-(--border-ui) px-2">
                    {tr(STATUS_LABEL[shown.item.status])}
                  </span>
                  <span className="rounded-full border border-(--border-ui) px-2">
                    {tr("{start} to {end}", {
                      start: shown.item.start,
                      end: shown.item.end,
                    })}
                  </span>
                </p>
                <p className="text-(--text-secondary)">
                  <LinkedText
                    area="docsCommon"
                    text={shown.item.note}
                    links={shown.item.links}
                  />
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-(--text-secondary)">
                  {tr("Milestone")} · {shown.milestone.date}
                </p>
                <p className="mt-1 mb-2 font-semibold text-(--text-primary)">
                  {tr(shown.milestone.label)}
                </p>
                <p className="text-(--text-secondary)">
                  {tr(shown.milestone.detail)}
                </p>
              </>
            )}
            <p className="mt-3 flex flex-wrap gap-2">
              <a
                href={
                  shown.kind === "item"
                    ? issueUrl(shown.item.issue)
                    : shown.milestone.href
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-(--accent) px-2.5 py-1 text-xs text-(--bg)"
              >
                {shown.kind === "item"
                  ? tr("Open issue #{n}", { n: shown.item.issue })
                  : tr("Open the source")}{" "}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
              <button
                type="button"
                className={button}
                onClick={() => {
                  void navigator.clipboard?.writeText(location.href);
                  setCopied(true);
                }}
              >
                {copied ? tr("Copied") : tr("Copy link")}
              </button>
            </p>
          </aside>
        )}
      </div>
      <p className="text-center text-xs italic text-(--text-secondary)">
        {tr(
          "Drag to pan, Ctrl or ⌘ and the wheel to zoom. Click a bar or a diamond for its details; a double click opens its issue or source. The red line is today.",
        )}
      </p>
    </div>
  );
}
