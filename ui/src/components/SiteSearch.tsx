"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { FileText, Hash, History, LayoutGrid, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/translate";
import { useLanguage } from "@/lib/use-language";
import { searchSite, type SearchHit } from "@/lib/site-search";
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from "@/lib/recent-searches";

/** What an option does: open a page, or run a recent search again. */
type Option = { kind: "url"; url: string } | { kind: "recent"; query: string };

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
}

/** The panel's widest, and its distance from the edges of the screen. */
const PANEL_WIDTH = 576;
const EDGE = 8;

/**
 * Where the panel goes: under the magnifier, its right edge at the icon's,
 * moved left or narrowed as far as it must to stay on screen. Where the icon
 * sits depends on the width and the language (the desktop menu appears only
 * from 1280 px), so it is measured rather than set by a breakpoint.
 */
export function panelPosition(
  icon: { right: number; bottom: number },
  viewportWidth: number,
): { left: number; top: number; width: number } {
  const width = Math.min(PANEL_WIDTH, viewportWidth - 2 * EDGE);
  const left = Math.min(
    Math.max(icon.right - width, EDGE),
    viewportWidth - width - EDGE,
  );
  return { left, top: icon.bottom + EDGE, width };
}

const MARK =
  "[&_mark]:bg-amber-300/40 [&_mark]:text-inherit text-(--text-secondary)";

/**
 * Search over every page and document of the site (ADR-082), opened at the
 * magnifier in the menu bar: under it, kept on screen, across the width of
 * a phone. Ctrl+K, Cmd+K or "/" opens it; the arrow keys move
 * through the results, Enter opens one, Escape or a click elsewhere closes.
 * With the field empty it lists the last five searches, kept in this browser
 * only. It searches the index of the interface language, in the browser.
 */
export default function SiteSearch() {
  const t = useT("common");
  const lang = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [mac, setMac] = useState(false);
  const [pos, setPos] = useState<ReturnType<typeof panelPosition> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // The last query that found something; kept as a recent search when the
  // reader opens a result or closes the search after reading the results.
  const found = useRef("");

  const close = useCallback((focusButton = true) => {
    if (found.current) setRecent(rememberSearch(found.current));
    found.current = "";
    // The next open starts empty, with the last searches listed.
    setQuery("");
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  // The shortcut as the reader's keyboard labels it; read after mount, so
  // the server and the first render agree.
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Ctrl+K / Cmd+K anywhere, "/" when the reader is not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !isTyping(e.target);
      if (combo || slash) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Measured before paint, and again when the window changes size.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setPos(panelPosition(r, window.innerWidth));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // A click outside the search closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecentSearches());
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearched("");
      setActive(0);
      return;
    }
    let current = true;
    searchSite(lang, q)
      .then((res) => {
        if (!current || res === null) return;
        setFailed(false);
        setHits(res);
        setSearched(q);
        found.current = res.length ? q : "";
        setActive(0);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [open, query, lang]);

  const showRecent = !query.trim() && recent.length > 0;
  const options: Option[] = showRecent
    ? recent.map((q) => ({ kind: "recent", query: q }))
    : hits.flatMap((h) => [
        { kind: "url" as const, url: h.url },
        ...h.anchors.map((a) => ({ kind: "url" as const, url: a.url })),
      ]);

  const choose = (o: Option) => {
    if (o.kind === "recent") {
      setQuery(o.query);
      inputRef.current?.focus();
      return;
    }
    setRecent(rememberSearch(query));
    found.current = "";
    setOpen(false);
    setQuery("");
    router.push(o.url);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let index = -1;
  const option = (
    key: string,
    o: Option,
    children: React.ReactNode,
    sub = false,
  ) => {
    index += 1;
    const i = index;
    return (
      <li
        key={key}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
        className={`cursor-pointer rounded-md px-3 py-2 ${sub ? "ml-6" : ""} ${
          i === active ? "bg-(--surface-2)" : ""
        }`}
      >
        {children}
      </li>
    );
  };

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={t("Search")}
        aria-keyshortcuts="Control+K Meta+K /"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="site-search-button"
        className={`flex items-center gap-1.5 p-2 rounded-md touch-target-sm hover:text-(--text-primary) hover:bg-(--surface-2) transition-colors ${
          open
            ? "text-(--text-primary) bg-(--surface-2)"
            : "text-(--text-secondary)"
        }`}
      >
        <Search size={18} aria-hidden="true" />
        <kbd className="hidden 2xl:inline text-[10px] font-sans border border-(--border) rounded-sm px-1">
          {mac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Search")}
          data-testid="site-search"
          // Under the magnifier (panelPosition). Fixed, so it is placed in
          // the coordinates the icon was measured in.
          style={pos ?? undefined}
          className="fixed z-100 rounded-lg border border-(--border) bg-(--surface) text-(--text-primary) shadow-2xl animate-fade-in-up"
        >
          <div className="flex items-center gap-2 border-b border-(--border) px-4">
            <Search
              size={18}
              aria-hidden="true"
              className="text-(--text-secondary)"
            />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded={options.length > 0}
              aria-controls={listId}
              aria-activedescendant={
                options.length ? optionId(active) : undefined
              }
              aria-autocomplete="list"
              aria-label={t("Search pages and documentation")}
              placeholder={t("Search pages and documentation")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              className="flex-1 bg-transparent py-3 text-base outline-hidden"
            />
            <button
              type="button"
              onClick={() => close()}
              aria-label={t("Close")}
              className="p-1 rounded-sm text-(--text-secondary) hover:text-(--text-primary)"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {failed && query.trim() ? (
              <p className="px-3 py-6 text-sm text-(--text-secondary)">
                {t("Search is not available right now.")}
              </p>
            ) : searched && query.trim() && hits.length === 0 ? (
              <p className="px-3 py-6 text-sm text-(--text-secondary)">
                {t("No results for “{query}”", { query: searched })}
              </p>
            ) : showRecent ? (
              <>
                <div className="flex items-center justify-between px-3 pt-1 pb-2">
                  <span
                    id={`${listId}-recent`}
                    className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)"
                  >
                    {t("Recent searches")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentSearches();
                      setRecent([]);
                      inputRef.current?.focus();
                    }}
                    className="text-xs text-(--text-secondary) underline hover:text-(--text-primary)"
                  >
                    {t("Clear")}
                  </button>
                </div>
                <ul
                  id={listId}
                  role="listbox"
                  aria-labelledby={`${listId}-recent`}
                >
                  {recent.map((q) =>
                    option(
                      `recent:${q}`,
                      { kind: "recent", query: q },
                      <span className="flex items-center gap-2 text-sm">
                        <History
                          size={14}
                          aria-hidden="true"
                          className="text-(--text-secondary)"
                        />
                        {q}
                      </span>,
                    ),
                  )}
                </ul>
              </>
            ) : (
              <ul id={listId} role="listbox" aria-label={t("Search results")}>
                {hits.flatMap((h) => [
                  option(
                    h.url,
                    { kind: "url", url: h.url },
                    <>
                      <span className="flex items-center gap-2 font-medium">
                        {h.kind === "doc" ? (
                          <FileText size={14} aria-hidden="true" />
                        ) : (
                          <LayoutGrid size={14} aria-hidden="true" />
                        )}
                        {h.title}
                        <span className="ml-auto text-xs font-normal text-(--text-secondary)">
                          {h.kind === "doc" ? t("Documentation") : t("Page")}
                        </span>
                      </span>
                      <span
                        className={`block text-sm ${MARK}`}
                        // Pagefind escapes the indexed text; the only markup
                        // in an excerpt is its <mark>.
                        dangerouslySetInnerHTML={{ __html: h.excerpt }}
                      />
                    </>,
                  ),
                  ...h.anchors.map((a) =>
                    option(
                      a.url,
                      { kind: "url", url: a.url },
                      <>
                        <span className="flex items-center gap-2 text-sm">
                          <Hash size={12} aria-hidden="true" />
                          {a.title}
                        </span>
                        <span
                          className={`block text-xs ${MARK}`}
                          dangerouslySetInnerHTML={{ __html: a.excerpt }}
                        />
                      </>,
                      true,
                    ),
                  ),
                ])}
              </ul>
            )}
          </div>
          <p className="border-t border-(--border) px-4 py-2 text-xs text-(--text-secondary)">
            {t(
              "The search runs in your browser; nothing you type leaves it. Your last searches are kept in this browser only.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
