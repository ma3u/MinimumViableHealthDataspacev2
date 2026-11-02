"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/api";
import type { SpeStatusResponse } from "@/lib/spe";

/** How often a page asks again while a workspace starts (ADR-072). */
export const SPE_POLL_MS = 10_000;
/** How long a page keeps asking after a Start or Stop, at most. */
const SPE_WATCH_MS = 10 * 60_000;
/** Polls after a Start or Stop even before ARM reports the change. */
const SPE_WATCH_MIN_POLLS = 3;

/**
 * Reads `/api/admin/spe`. Every admin page that shows an SPE uses this,
 * so there is one source for what the SPEs are (#774).
 *
 * While a workspace is starting it asks again every 10 s until it runs
 * (ADR-072), for at most ten minutes after the page opened or the last
 * `watch()`. `watch()` is what a Start or Stop button calls: it asks at once
 * and keeps asking, so the page follows the workspace from the button to
 * running or stopped.
 */
export function useSpeStatus(): {
  data: SpeStatusResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  watch: () => void;
} {
  const [data, setData] = useState<SpeStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const watchUntil = useRef(Date.now() + SPE_WATCH_MS);
  const watchPolls = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchApi("/api/admin/spe")
      .then(async (r) => {
        const body = (await r.json()) as
          | (SpeStatusResponse & { error?: string })
          | null;
        if (!r.ok || !body || body.error || !Array.isArray(body.spes)) {
          throw new Error(body?.error || `HTTP ${r.status}`);
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const starting = Boolean(data?.spes.some((s) => s.powerState === "starting"));
  useEffect(() => {
    if (loading) return;
    if (!starting && watchPolls.current === 0) return;
    if (Date.now() > watchUntil.current) return;
    const timer = setTimeout(() => {
      if (watchPolls.current > 0) watchPolls.current -= 1;
      setTick((n) => n + 1);
    }, SPE_POLL_MS);
    return () => clearTimeout(timer);
    // tick: a failed read leaves data as it was, and must not end the polling.
  }, [data, loading, starting, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const watch = useCallback(() => {
    watchUntil.current = Date.now() + SPE_WATCH_MS;
    watchPolls.current = SPE_WATCH_MIN_POLLS;
    setTick((n) => n + 1);
  }, []);

  return { data, loading, error, reload, watch };
}
