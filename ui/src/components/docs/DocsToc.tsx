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
 * `DocsTocSidebar` is the sticky column at the right on wide screens;
 * `DocsTocInline` is the collapsible list at the top on narrow ones.
 */
import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { headingId } from "@/lib/docs/markdown";

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Headings that are navigation themselves, or boilerplate, stay out. */
const SKIP = new Set(["contents", "on this page", "related documentation"]);

export function collectHeadings(root: ParentNode): TocEntry[] {
  const seen = new Set<string>();
  const out: TocEntry[] = [];
  for (const h of Array.from(root.querySelectorAll("h2, h3"))) {
    if (h.closest("nav, [data-toc-skip]")) continue;
    const text = (h.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text || SKIP.has(text.toLowerCase())) continue;
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
    out.push({ id, text, level: h.tagName === "H3" ? 3 : 2 });
  }
  return out;
}

/** The headings of the page, and which one is current while scrolling. */
export function useDocsToc(): { entries: TocEntry[]; active: string } {
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
  if (entries.length < 2) return null;
  return (
    <aside
      aria-label="On this page"
      data-testid="docs-toc"
      className="hidden xl:block pr-6 py-12"
    >
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--text-secondary) mb-2 pl-3 inline-flex items-center gap-1.5">
          <List size={12} aria-hidden="true" /> On this page
        </p>
        <TocList entries={entries} active={active} />
      </nav>
    </aside>
  );
}

/** The same index folded into a disclosure at the top, for narrow screens. */
export function DocsTocInline() {
  const { entries, active } = useDocsToc();
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
        <List size={14} aria-hidden="true" /> On this page
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
