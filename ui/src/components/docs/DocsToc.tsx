"use client";

/**
 * DocsToc: the "On this page" index of a documentation page.
 *
 * The docs are written in three ways (hand-written React pages, Markdown
 * rendered at build time, Mermaid drawn on the client), so the index is read
 * from the page itself after it renders: every h2 and h3 inside <main>, except
 * those inside a <nav> or a card grid. A heading without an id gets one from
 * its text, so every entry is a working anchor. The entry whose heading was
 * scrolled past last is marked current.
 *
 * It also numbers the headings, h2 "1." and h3 "1.1", so the page and the
 * index show the same number. A heading that already shows one (a published
 * document's "doc-num", or a source that numbers itself, "## 6. Checks") keeps
 * it and the count goes on from there; any other gets the number as a
 * data-doc-num attribute, which globals.css draws in front of the text. An
 * attribute, not a node, so React's markup of the heading is left alone.
 *
 * `DocsTocSidebar` is the sticky column at the right on wide screens;
 * `DocsTocInline` is the collapsible list at the top on narrow ones.
 */
import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { headingId } from "@/lib/docs/markdown";
import { useT } from "@/lib/i18n/translate";

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
  /** The section number the heading shows, "2." or "2.1"; empty for an h3
   *  before the first h2. */
  num: string;
}

/** A number the heading's own text starts with, "7. Incidents" or "7.2 Clocks";
 *  never a bare figure such as "127 synthetic patients". */
const OWN_NUMBER = /^(\d+\.(?:\d+\.?)*)\s+/;

/** Headings that are navigation themselves, or boilerplate, stay out. */
const SKIP = new Set(["contents", "on this page", "related documentation"]);

export function collectHeadings(root: ParentNode): TocEntry[] {
  const found = [];
  for (const h of Array.from(root.querySelectorAll("h2, h3"))) {
    if (h.closest("nav, [data-toc-skip]")) continue;
    const raw = (h.textContent ?? "").replace(/\s+/g, " ").trim();
    const rendered = h.querySelector(".doc-num")?.textContent?.trim() ?? "";
    const own = rendered || (raw.match(OWN_NUMBER)?.[1] ?? "");
    const text = own ? raw.slice(raw.indexOf(own) + own.length).trim() : raw;
    if (!text || SKIP.has(text.toLowerCase())) continue;
    found.push({ h, own, text, level: h.tagName === "H3" ? 3 : 2 } as const);
  }
  // A page that numbers its own sections may open with unnumbered ones ("How
  // to read this model", then "1. System context"): those stay an
  // introduction, without a number, so no two sections share one.
  const firstOwn = found.findIndex((f) => f.level === 2 && f.own);

  const seen = new Set<string>();
  const out: TocEntry[] = [];
  let h2 = 0;
  let h3 = 0;
  for (const [i, { h, own, text, level }] of found.entries()) {
    let num = own;
    if (own) {
      const [major, minor] = own.replace(/\.$/, "").split(".").map(Number);
      h2 = major;
      h3 = level === 3 ? minor ?? h3 : 0;
    } else if (level === 2 && i < firstOwn) {
      h2 = 0;
      h3 = 0;
    } else if (level === 2) {
      h2 += 1;
      h3 = 0;
      num = `${h2}.`;
    } else if (h2 > 0) {
      h3 += 1;
      num = `${h2}.${h3}`;
    }
    // Only a number the heading does not show yet is drawn by the attribute.
    const drawn = own ? null : num || null;
    if (h.getAttribute("data-doc-num") !== drawn) {
      if (drawn) h.setAttribute("data-doc-num", drawn);
      else h.removeAttribute("data-doc-num");
    }
    let id = h.id || h.closest("section[id]")?.id || "";
    if (!id || seen.has(id)) {
      const base = headingId(text) || "section";
      id = base;
      for (let n = 2; seen.has(id) || document.getElementById(id); n++) {
        id = `${base}-${n}`;
      }
      h.id = id;
    } else if (!h.id) {
      // The section carries the id; let the heading carry it too, so a
      // click lands on the heading and the current-entry logic can read it.
      h.id = id;
    }
    seen.add(id);
    out.push({ id, text, level, num });
  }
  return out;
}

/** The headings of the page, and which one is current while scrolling. */
function useDocsToc(): { entries: TocEntry[]; active: string } {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const main = document.getElementById("main-content") ?? document.body;
    let frame = 0;
    const scan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setEntries(collectHeadings(main)));
    };
    scan();
    // Mermaid and other client-drawn parts arrive after the first paint.
    const observer = new MutationObserver(scan);
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const offset = 96; // below the sticky navigation
      let current = entries[0].id;
      for (const e of entries) {
        const el = document.getElementById(e.id);
        if (el && el.getBoundingClientRect().top <= offset) current = e.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [entries]);

  return { entries, active };
}

function TocList({
  entries,
  active,
  onPick,
}: {
  entries: TocEntry[];
  active: string;
  onPick?: () => void;
}) {
  return (
    <ul className="text-sm space-y-0.5">
      {entries.map((e) => (
        <li key={e.id} className={e.level === 3 ? "pl-3" : ""}>
          <a
            href={`#${e.id}`}
            onClick={onPick}
            aria-current={active === e.id ? "location" : undefined}
            className={`block py-1 border-l-2 pl-3 leading-snug transition-colors ${
              active === e.id
                ? "border-(--accent) text-(--text-primary) font-medium"
                : "border-transparent text-(--text-secondary) hover:text-(--text-primary) hover:border-(--border-ui)"
            }`}
          >
            {e.num && (
              <span className="tabular-nums text-(--text-secondary) mr-1.5">
                {e.num}
              </span>
            )}
            {e.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The sticky index at the right, on screens wide enough for a column. */
export function DocsTocSidebar() {
  const { entries, active } = useDocsToc();
  const t = useT("docsCommon");
  if (entries.length < 2) return null;
  return (
    <aside
      aria-label={t("On this page")}
      data-testid="docs-toc"
      className="hidden xl:block pr-6 py-12"
    >
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-secondary) mb-2 pl-3 inline-flex items-center gap-1.5">
          <List size={12} aria-hidden="true" /> {t("On this page")}
        </p>
        <TocList entries={entries} active={active} />
      </nav>
    </aside>
  );
}

/** The same index folded into a disclosure at the top, for narrow screens. */
export function DocsTocInline() {
  const { entries, active } = useDocsToc();
  const t = useT("docsCommon");
  const [open, setOpen] = useState(false);
  if (entries.length < 2) return null;
  return (
    <details
      className="xl:hidden mx-6 mt-6 -mb-6 border border-(--border) rounded-lg bg-(--surface-2) text-(--text-primary)"
      data-testid="docs-toc-inline"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium inline-flex items-center gap-2 select-none">
        <List size={14} aria-hidden="true" /> {t("On this page")}
      </summary>
      <div className="px-2 pb-3">
        <TocList
          entries={entries}
          active={active}
          onPick={() => setOpen(false)}
        />
      </div>
    </details>
  );
}
