"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import type { SpeStatusResponse } from "@/lib/spe";

/**
 * Reads `/api/admin/spe` once. Every admin page that shows an SPE uses this,
 * so there is one source for what the SPEs are (#774).
 */
export function useSpeStatus(): {
  data: SpeStatusResponse | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<SpeStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return { data, loading, error };
}
