/**
 * The reader's last site searches (ADR-082), kept in this browser's local
 * storage and nowhere else. Every access is guarded: storage can be blocked,
 * full or missing, and the search works without it.
 */
export const RECENT_SEARCHES_KEY = "site-search-recent";
const RECENT_SEARCHES_MAX = 5;

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list
          .filter((s): s is string => typeof s === "string" && s.trim() !== "")
          .slice(0, RECENT_SEARCHES_MAX)
      : [];
  } catch {
    return [];
  }
}

/** Put a search first, without a second copy of it; newest first, five kept. */
export function rememberSearch(query: string): string[] {
  const q = query.trim();
  if (!q) return readRecentSearches();
  const next = [
    q,
    ...readRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase()),
  ].slice(0, RECENT_SEARCHES_MAX);
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Not kept this time; the search itself is unaffected.
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
