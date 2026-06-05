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
    label: DEMO_TK ? "HealthGraph (fitness band)" : "Fitness tracker",
    sublabel: "Recovery · resting HR · HRV",
    brand: "#CA6F1E",
    // No third-party fitness-brand screenshot.
    screenshot: null,
  },
  {
    id: "labs",
    label: "Lab results",
    sublabel: "Ferritin · B12 · CRP · omega-3",
    brand: "#7D3C98",
    // No third-party lab-brand screenshot.
    screenshot: null,
  },
];

/** A single metric shown on a personal-health card. */
export interface HealthMetric {
  label: string;
  value: string;
}

/** A trend series shown in the detail view (3-month dashboards or multi-year NLQ). */
export interface TrendSeries {
  label: string;
  unit: string;
  color: string;
  current: string;
  /** oldest → newest, evenly spaced from `from` to `to` */
  points: number[];
  /** which direction is the healthy one (for the ▲/▼ chip) */
  goodDirection: "up" | "down";
  /** optional ISO date of points[0] — when set, ePA event markers can be placed */
  from?: string;
  /** optional ISO date of the last point */
  to?: string;
}

/** A day in the nutrition weekly plan. */
export interface NutritionDay {
  day: string;
  kcal: number;
  focus: string;
}

/** A personal-health data source displayed on the /patient record. */
export interface PersonalHealthSource {
  id: "fitness" | "labs" | "nutrition";
  /** generic, build-agnostic title */
  title: string;
  /** the source/app (real name only under DEMO_TK; no third-party trademark) */
  source: string;
  /** brand / graph-layer accent colour */
  brand: string;
  /** git-ignored personal screenshot under DEMO_TK, else null */
  screenshot: string | null;
  /** illustrative, synthetic metrics */
  metrics: HealthMetric[];
  /** one-line description shown in the clickable detail view */
  detail: string;
  /** 3-month weekly trends shown in the detail view */
  trends: TrendSeries[];
  /** optional weekly plan (nutrition) */
  weeklyPlan?: NutritionDay[];
}

/**
 * The patient's own health data shown on /patient. Under NEXT_PUBLIC_DEMO_TK the
 * fitness/labs cards show the git-ignored personal screenshots; the public
 * default keeps generic source labels and no images. No third-party trademark
 * is used in any label. Metric values and trends are synthetic / illustrative.
 */
export const personalHealth: PersonalHealthSource[] = [
  {
    id: "fitness",
    title: "Fitness & recovery",
    source: DEMO_TK ? "HealthGraph (fitness band)" : "Fitness tracker",
    brand: "#CA6F1E",
    // No third-party fitness-brand screenshot — the trend charts carry the story.
    screenshot: null,
    metrics: [
      { label: "Recovery", value: "62 %" },
      { label: "Resting HR", value: "54 bpm" },
      { label: "HRV", value: "48 ms" },
      { label: "Sleep", value: "7.0 h" },
    ],
    detail:
      "Last 3 months of recovery, cardio-fitness and sleep from my fitness band.",
    trends: [
      {
        label: "VO₂max",
        unit: "ml/kg/min",
        color: "#CA6F1E",
        current: "47",
        goodDirection: "up",
        points: [42, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 47],
      },
      {
        label: "HRV",
        unit: "ms",
        color: "#2471A3",
        current: "48",
        goodDirection: "up",
        points: [38, 40, 39, 42, 44, 43, 46, 45, 48, 47, 49, 48],
      },
      {
        label: "Sleep",
        unit: "h/night",
        color: "#7D3C98",
        current: "7.0",
        goodDirection: "up",
        points: [6.4, 6.6, 6.5, 6.8, 7.0, 6.9, 7.1, 7.0, 7.2, 7.1, 7.0, 7.0],
      },
    ],
  },
  {
    id: "labs",
    title: "Lab results",
    source: "Lab panel",
    brand: "#7D3C98",
    // No third-party lab-brand screenshot — the metrics + trend charts carry it.
    screenshot: null,
    metrics: [
      { label: "Ferritin", value: "112 ng/ml" },
      { label: "Vitamin D", value: "48 ng/ml" },
      { label: "CRP", value: "0.8 mg/l" },
      { label: "Omega-3", value: "9.2 %" },
    ],
    detail: "Quarterly blood panel — iron stores, vitamin D and inflammation.",
    trends: [
      {
        label: "Ferritin",
        unit: "ng/ml",
        color: "#7D3C98",
        current: "112",
        goodDirection: "up",
        points: [78, 82, 85, 90, 95, 98, 103, 106, 108, 110, 111, 112],
      },
      {
        label: "Vitamin D",
        unit: "ng/ml",
        color: "#1E8449",
        current: "48",
        goodDirection: "up",
        points: [28, 30, 32, 35, 38, 40, 42, 44, 45, 46, 47, 48],
      },
      {
        label: "CRP",
        unit: "mg/l",
        color: "#CA6F1E",
        current: "0.8",
        goodDirection: "down",
        points: [2.1, 1.9, 1.8, 1.6, 1.4, 1.3, 1.1, 1.0, 0.9, 0.9, 0.8, 0.8],
      },
    ],
  },
  {
    id: "nutrition",
    title: "Nutrition plan",
    source: "Mediterranean plan",
    brand: "#1E8449",
    screenshot: null,
    metrics: [
      { label: "Calories", value: "2,050/d" },
      { label: "Protein", value: "95 g/d" },
      { label: "Fibre", value: "34 g/d" },
      { label: "Adherence", value: "86 %" },
    ],
    detail: "This week's plan, plus a 3-month adherence trend.",
    trends: [
      {
        label: "Adherence",
        unit: "%",
        color: "#1E8449",
        current: "86",
        goodDirection: "up",
        points: [70, 72, 74, 73, 76, 78, 80, 79, 82, 84, 85, 86],
      },
    ],
    weeklyPlan: [
      { day: "Mon", kcal: 2010, focus: "Oats · salmon · greens" },
      { day: "Tue", kcal: 2080, focus: "Lentils · chicken · olive oil" },
      { day: "Wed", kcal: 1980, focus: "Yoghurt · mackerel · veg" },
      { day: "Thu", kcal: 2100, focus: "Eggs · turkey · quinoa" },
      { day: "Fri", kcal: 2040, focus: "Berries · sardines · beans" },
      { day: "Sat", kcal: 2160, focus: "Nuts · tuna · whole grain" },
      { day: "Sun", kcal: 1950, focus: "Fruit · cod · leafy greens" },
    ],
  },
];
