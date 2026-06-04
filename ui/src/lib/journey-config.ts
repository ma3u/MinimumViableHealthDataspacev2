/**
 * Gated insurer config for the patient journey.
 *
 * Policy (CLAUDE.md): the default build, committed repo, and public github.io
 * site use FICTIONAL orgs only. A real org (TK · Techniker Krankenkasse) may be
 * shown ONLY behind the NEXT_PUBLIC_DEMO_TK build flag, for live interoperability
 * demos. The real TK screenshot is git-ignored and never committed; the UI
 * tolerates its absence (falls back to the synthetic screen).
 *
 * Live talk:  NEXT_PUBLIC_DEMO_TK=true npm run dev
 */
const DEMO_TK = process.env.NEXT_PUBLIC_DEMO_TK === "true";
const BASE_PATH =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
    ? "/MinimumViableHealthDataspacev2"
    : "";

export interface Insurer {
  /** full label shown on the slide + brand chip */
  name: string;
  /** short label (e.g. for "X cannot read it") */
  short: string;
  /** brand colour for the TK transfer phone frame */
  brand: string;
  /** path to the (git-ignored) real screenshot, or null in the fictional default */
  screenshot: string | null;
}

export const insurer: Insurer = DEMO_TK
  ? {
      name: "TK · Techniker Krankenkasse",
      short: "TK",
      brand: "#1d3f8a",
      screenshot: `${BASE_PATH}/journey/tk-transfer.png`,
    }
  : {
      name: "AlphaKasse DE",
      short: "AlphaKasse",
      brand: "#148F77",
      screenshot: null,
    };
