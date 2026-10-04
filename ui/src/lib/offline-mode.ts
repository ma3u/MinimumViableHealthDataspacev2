/**
 * Off-hours mode of the live demo (ADR-053).
 *
 * The evening stop of `.github/workflows/aca-schedule.yml` stops every
 * Container App and the database, and leaves only the UI, at zero replicas
 * with `LIVE_DEMO_OFFLINE=true`. A visitor wakes the UI alone; the middleware
 * then answers every page with the offline notice and every data route with a
 * 503, so nothing tries to reach a backend that is not there. The morning
 * start sets the flag back to `false` once the stack is up.
 */

export const STATIC_SITE_URL =
  "https://ma3u.github.io/MinimumViableHealthDataspacev2";

/** Read at call time: the start and stop jobs flip it without a rebuild. */
export function isLiveDemoOffline(): boolean {
  return process.env.LIVE_DEMO_OFFLINE === "true";
}

/**
 * Routes that still answer while the demo is offline: the liveness probe the
 * platform wakes the replica with, the session endpoints NextAuth's client
 * polls on every page, and the Keycloak hint the user menu reads. None of
 * them needs a backend.
 */
const OFFLINE_ALLOWED_API = [
  "/api/health",
  "/api/auth/",
  "/api/keycloak-config",
];

export function apiAnswersOffline(pathname: string): boolean {
  return OFFLINE_ALLOWED_API.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

/** The same page on the static site, which has no sign-in and no backend. */
export function staticSiteUrl(pathAndQuery: string): string {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  if (path === "/" || path.startsWith("/offline") || path.startsWith("/auth")) {
    return `${STATIC_SITE_URL}/`;
  }
  return `${STATIC_SITE_URL}${path}`;
}

// The start cron is "0 5 * * 1-5" (UTC). It is 07:00 in Berlin in summer and
// 06:00 in winter; the page shows the local time the browser computes.
const START_HOUR_UTC = 5;
// The start job needs about ten minutes before the UI leaves offline mode.
const START_DURATION_MIN = 10;

/** Easter Sunday (Gregorian), anonymous algorithm. Month is 1-based. */
function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function isoDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * Public holidays of Land Berlin, the list the start job skips through the
 * Python `holidays` package with `subdiv='BE'`.
 */
export function berlinHolidays(year: number): Set<string> {
  const e = easter(year);
  const fromEaster = (offset: number) => isoDay(year, e.month, e.day + offset);
  return new Set([
    isoDay(year, 1, 1), // Neujahr
    isoDay(year, 3, 8), // Internationaler Frauentag
    fromEaster(-2), // Karfreitag
    fromEaster(1), // Ostermontag
    isoDay(year, 5, 1), // Tag der Arbeit
    fromEaster(39), // Christi Himmelfahrt
    fromEaster(50), // Pfingstmontag
    isoDay(year, 10, 3), // Tag der Deutschen Einheit
    isoDay(year, 12, 25),
    isoDay(year, 12, 26),
  ]);
}

/** The date in Berlin, as YYYY-MM-DD, of an instant. */
function berlinDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * When the morning start next brings the demo back: the next weekday that is
 * not a Berlin holiday, at the start cron plus the time the start takes.
 */
export function nextOpening(now: Date): Date {
  for (let ahead = 0; ahead < 14; ahead++) {
    const day = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + ahead,
        START_HOUR_UTC,
        START_DURATION_MIN,
      ),
    );
    if (day <= now) continue;
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const date = berlinDate(day);
    if (berlinHolidays(Number(date.slice(0, 4))).has(date)) continue;
    return day;
  }
  // Fourteen days of holidays do not occur; answer something sane anyway.
  return new Date(now.getTime() + 24 * 3600 * 1000);
}
