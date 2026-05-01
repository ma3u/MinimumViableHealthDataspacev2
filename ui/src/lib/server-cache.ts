/**
 * Tiny in-memory stale-while-revalidate cache for slow server routes.
 *
 * - First call for a key blocks until the loader resolves.
 * - Subsequent calls within TTL return the cached value immediately.
 * - After TTL expires, callers receive the stale value and a background
 *   refresh fires; the next caller after refresh sees the new value.
 *
 * In-memory only — fine for single-replica ACA Container Apps. If we ever
 * scale the UI horizontally we should swap this for a shared cache (Redis
 * or NATS-backed). The caller-supplied key should encode anything that
 * varies per request (auth role, query params).
 */

interface CacheEntry<T> {
  value: T;
  freshUntil: number; // epoch ms
  refreshing?: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

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
        .catch((err) => {
          // Refresh failed — keep the stale entry so callers don't get a
          // stampede of failures. Reset the refreshing flag so a later
          // caller can retry.
          if (entry) entry.refreshing = undefined;
          throw err;
        });
    }
    return entry.value;
  }

  // Cold cache: must wait for the loader.
  const value = await loader();
  cache.set(key, { value, freshUntil: Date.now() + ttlMs });
  return value;
}

/** Test-only helper to clear the cache between specs. */
export function __resetCacheForTests() {
  cache.clear();
}
