/**
 * A sliding-window limit kept in memory, per replica: at most `perKey`
 * calls per key and `inTotal` calls overall within `windowMs`. Enough for an
 * anonymous form (ADR-048); not a shared or durable quota.
 */
export function createRateLimiter(opts: {
  windowMs: number;
  perKey: number;
  inTotal: number;
}) {
  const byKey = new Map<string, number[]>();
  let all: number[] = [];

  return {
    /** Counts the call and returns true, or returns false over the limit. */
    allow(key: string, now: number = Date.now()): boolean {
      all = all.filter((t) => now - t < opts.windowMs);
      const mine = (byKey.get(key) ?? []).filter(
        (t) => now - t < opts.windowMs,
      );
      if (mine.length >= opts.perKey || all.length >= opts.inTotal) {
        if (mine.length) byKey.set(key, mine);
        else byKey.delete(key);
        return false;
      }
      mine.push(now);
      byKey.set(key, mine);
      all.push(now);
      return true;
    },
    reset(): void {
      byKey.clear();
      all = [];
    },
  };
}
