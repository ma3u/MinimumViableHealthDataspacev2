import { createRateLimiter } from "@/lib/rate-limit";

/**
 * The one limit on creating sandbox accounts, per address and in all, per
 * hour (ADR-054). The Klarbefund app's route and the PID register route of
 * ADR-067 draw on the same budget, so a second way in is not a second
 * allowance.
 *
 * Anchored on globalThis: Next.js compiles each route on its own, and a
 * module-level instance would give each route its own count.
 */
const g = globalThis as unknown as {
  __accountLimiter?: ReturnType<typeof createRateLimiter>;
};

export const accountLimiter =
  g.__accountLimiter ??
  (g.__accountLimiter = createRateLimiter({
    windowMs: 60 * 60_000,
    perKey: 5,
    inTotal: 100,
  }));

/** The caller's address as the ingress reports it, or "unknown". */
export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
