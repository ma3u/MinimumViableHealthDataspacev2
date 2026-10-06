/**
 * Tiny in-memory stale-while-revalidate cache for slow server routes.
 *
 * - First call for a key blocks until the loader resolves. Callers that
 *   arrive while it runs wait for the same load: under load test, 50 users
 *   opening /graph at once ran the 34-query graph build 50 times (#540).
 * - Subsequent calls within TTL return the cached value immediately.
 * - After TTL expires, callers receive the stale value and a background
 *   refresh fires; the next caller after refresh sees the new value.
 *
 * In-memory, per process: each UI replica keeps its own copy and loads it
 * once per TTL, which suits read-mostly answers that may be a minute old.
 * Not for state one request writes and another reads (docs/gotchas.md,
 * 2026-10-04). The caller-supplied key should encode anything that varies
 * per request (auth role, query params).
 */

interface CacheEntry<T> {
  value: T;
  freshUntil: number; // epoch ms
  refreshing?: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();
const loading = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.freshUntil > now) {
    return entry.value;
  }

  // Stale-but-present: serve stale, kick off background refresh once.
  if (entry) {
    if (!entry.refreshing) {
      entry.refreshing = loader()
        .then((v) => {
          cache.set(key, { value: v, freshUntil: Date.now() + ttlMs });
          return v;
        })
        .catch(() => {
          // Refresh failed: keep the stale entry so callers don't get a
          // stampede of failures, and let a later caller retry. Not
          // rethrown: nobody awaits this promise, so a rethrow would be an
          // unhandled rejection.
          entry.refreshing = undefined;
          return entry.value;
        });
    }
    return entry.value;
  }

  // Cold cache: wait for the loader, the same one for every caller.
  const pending = loading.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const load = loader()
    .then((value) => {
      cache.set(key, { value, freshUntil: Date.now() + ttlMs });
      return value;
    })
    .finally(() => loading.delete(key));
  loading.set(key, load);
  return load;
}

/** Test-only helper to clear the cache between specs. */
export function __resetCacheForTests() {
  cache.clear();
  loading.clear();
}
