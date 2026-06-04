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

/** One real data source the patient contributes on the donate slide. */
export interface DataSource {
  /** stable id → icon mapping in the slide */
  id: "ehr" | "fitness" | "labs";
  /** short brand/source label (real app name only under DEMO_TK) */
  label: string;
  /** the data it carries */
  sublabel: string;
  /** brand / graph-layer accent colour */
  brand: string;
  /** path to the (git-ignored) real screenshot, or null in the fictional default */
  screenshot: string | null;
}

/**
 * The three real sources Maria donates: her insurer ePA, her fitness tracker,
 * and her lab panel. Under NEXT_PUBLIC_DEMO_TK these show real app names and the
 * git-ignored personal screenshots (TK ePA, Whoop HealthGraph, Blood Test
 * Oracle); the public default keeps generic, fictional labels and no images.
 */
export const donationSources: DataSource[] = [
  {
    id: "ehr",
    label: `${insurer.short} · ePA`,
    sublabel: "Diagnoses · medications",
    brand: insurer.brand,
    screenshot: insurer.screenshot,
  },
  {
    id: "fitness",
    label: DEMO_TK ? "Whoop · HealthGraph" : "Fitness tracker",
    sublabel: "Recovery · resting HR · HRV",
    brand: "#CA6F1E",
    screenshot: DEMO_TK ? `${BASE_PATH}/journey/whoop-fitness.png` : null,
  },
  {
    id: "labs",
    label: DEMO_TK ? "Blood Test Oracle" : "Lab results",
    sublabel: "Ferritin · B12 · CRP · omega-3",
    brand: "#7D3C98",
    screenshot: DEMO_TK ? `${BASE_PATH}/journey/bloodtest-labs.png` : null,
  },
];
