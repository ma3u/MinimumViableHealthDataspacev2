/**
 * Predefined personal-research questions for the patient's own data (NLQ page).
 * Three questions, each answered from the patient's own data — multi-year
 * fitness / lab / nutrition trends PLUS the ePA (elektronische Patientenakte)
 * events that shaped them (infections spike CRP, the knee surgery dips VO₂max,
 * etc.). The events are also marked on the trend charts. EHDS Art. 3 / GDPR
 * Art. 15 primary use, own records only. Synthetic · illustrative.
 */
import type { TrendSeries } from "@/lib/journey-config";

/** A discrete clinical event from the patient's ePA (electronic patient record). */
export interface EpaEvent {
  date: string;
  label: string;
  type: "Infection" | "Surgery" | "Vaccination" | "Diagnosis";
}

export interface ResearchQA {
  id: "sport" | "nutrition" | "breathing";
  question: string;
  answer: string;
  /** provenance line — always "own data only" */
  source: string;
  /** keywords used to resolve a free-text question to this answer */
  keywords: string[];
  /** multi-year trend series (events from `events` are marked on them) */
  trends: TrendSeries[];
  /** ePA events shown beneath, and marked on, the trends */
  events: EpaEvent[];
}

/** Fraction (0–1) of `date` within [from, to]. */
function frac(from: string, to: string, date: string): number {
  const f = Date.parse(from);
  const t = Date.parse(to);
  return (Date.parse(date) - f) / (t - f);
}

/**
 * Generate `n` evenly-spaced points from `start` → `end`, adding a transient
 * bump near each event date (positive = spike, negative = dip), so the curve
 * reflects the ePA events.
 */
function gen(
  from: string,
  to: string,
  start: number,
  end: number,
  n: number,
  bumps: { date: string; mag: number }[] = [],
  decimals = 0,
): number[] {
  const f = Math.pow(10, decimals);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let v = start + (end - start) * x;
    for (const b of bumps) {
      const dist = Math.abs(x - frac(from, to, b.date)) * (n - 1);
      v += b.mag * Math.max(0, 1 - dist / 1.5);
    }
    out.push(Math.round(Math.max(0, v) * f) / f);
  }
  return out;
}

const SPORT_FROM = "2020-06-01";
const SPORT_TO = "2026-03-01";
const NUTR_FROM = "2023-06-01";
const NUTR_TO = "2026-03-01";
const BREATH_FROM = "2021-06-01";
const BREATH_TO = "2026-03-01";

export const personalResearchQA: ResearchQA[] = [
  {
    id: "sport",
    question:
      "I increased my daily sport routine over the last 3 months — do you see any effect?",
    answer:
      "Yes — your cardio-fitness improved: VO₂max recovered after your 2020 knee arthroscopy and has climbed to 47 ml/kg/min, with heart-rate variability up too. The dip on the graph marks the surgery; you're now fitter than before it.",
    source:
      "From your fitness band + ePA (elektronische Patientenakte) — your own data only.",
    keywords: [
      "sport",
      "exercise",
      "run",
      "running",
      "training",
      "workout",
      "fitness",
      "vo2",
      "vo₂",
      "cardio",
      "heart rate",
      "resting hr",
      "gym",
      "active",
      "steps",
      "knee",
    ],
    trends: [
      {
        label: "VO₂max",
        unit: "ml/kg/min",
        color: "#CA6F1E",
        current: "47",
        goodDirection: "up",
        from: SPORT_FROM,
        to: SPORT_TO,
        points: gen(SPORT_FROM, SPORT_TO, 43, 47, 18, [
          { date: "2020-09-22", mag: -6 },
        ]),
      },
      {
        label: "HRV",
        unit: "ms",
        color: "#2471A3",
        current: "48",
        goodDirection: "up",
        from: SPORT_FROM,
        to: SPORT_TO,
        points: gen(SPORT_FROM, SPORT_TO, 40, 48, 18, [
          { date: "2020-09-22", mag: -7 },
        ]),
      },
    ],
    events: [
      {
        date: "2020-09-22",
        label: "Knee arthroscopy (meniscus repair)",
        type: "Surgery",
      },
    ],
  },
  {
    id: "nutrition",
    question:
      "I changed my nutrition over 3 months — how are my cardiovascular and pre-diabetes markers?",
    answer:
      "Trending the right way — inflammation (CRP) is down and your Mediterranean-plan adherence reached 86%. The markers show when your pre-diabetes (2023) and mixed hyperlipidaemia (2024) were diagnosed; both are improving since you changed your nutrition.",
    source: "From your lab panel, nutrition plan + ePA — your own data only.",
    keywords: [
      "nutrition",
      "diet",
      "food",
      "eat",
      "eating",
      "meal",
      "cardiovascular",
      "cardio risk",
      "diabetes",
      "pre-diabetes",
      "prediabetes",
      "cholesterol",
      "ldl",
      "hyperlipidaemia",
      "weight",
      "mediterranean",
      "vitamin d",
    ],
    trends: [
      {
        label: "CRP",
        unit: "mg/l",
        color: "#7D3C98",
        current: "0.8",
        goodDirection: "down",
        from: NUTR_FROM,
        to: NUTR_TO,
        points: gen(NUTR_FROM, NUTR_TO, 1.8, 0.8, 14, [], 1),
      },
      {
        label: "Adherence",
        unit: "%",
        color: "#1E8449",
        current: "86",
        goodDirection: "up",
        from: NUTR_FROM,
        to: NUTR_TO,
        points: gen(NUTR_FROM, NUTR_TO, 68, 86, 14),
      },
    ],
    events: [
      {
        date: "2023-10-02",
        label: "Pre-diabetes (impaired fasting glucose)",
        type: "Diagnosis",
      },
      {
        date: "2024-03-15",
        label: "Mixed hyperlipidaemia",
        type: "Diagnosis",
      },
    ],
  },
  {
    id: "breathing",
    question:
      "I've been doing daily breathing exercises — any effect on stress and inflammation?",
    answer:
      "Likely yes — CRP fell to 0.8 mg/L and your HRV improved. The spikes on the graph line up with your ePA infections (COVID-19 in 2022, bronchitis in 2023, flu in 2024); between them, and since the breathing exercises, your inflammation is low. Your seasonal influenza vaccinations are up to date.",
    source: "From your lab panel, fitness band + ePA — your own data only.",
    keywords: [
      "breath",
      "breathing",
      "stress",
      "inflammation",
      "crp",
      "oxygen",
      "spo2",
      "meditation",
      "relax",
      "calm",
      "anxiety",
      "hrv",
      "recovery",
      "asthma",
      "respiratory",
      "infection",
      "infections",
      "covid",
      "flu",
      "bronchitis",
      "vaccine",
      "vaccination",
      "immunization",
    ],
    trends: [
      {
        label: "CRP",
        unit: "mg/l",
        color: "#7D3C98",
        current: "0.8",
        goodDirection: "down",
        from: BREATH_FROM,
        to: BREATH_TO,
        points: gen(
          BREATH_FROM,
          BREATH_TO,
          1.4,
          0.8,
          20,
          [
            { date: "2022-11-08", mag: 4.5 },
            { date: "2023-03-20", mag: 3.5 },
            { date: "2024-12-03", mag: 2.2 },
          ],
          1,
        ),
      },
      {
        label: "HRV",
        unit: "ms",
        color: "#2471A3",
        current: "48",
        goodDirection: "up",
        from: BREATH_FROM,
        to: BREATH_TO,
        points: gen(BREATH_FROM, BREATH_TO, 36, 48, 20, [
          { date: "2022-11-08", mag: -7 },
          { date: "2024-12-03", mag: -4 },
        ]),
      },
    ],
    events: [
      {
        date: "2022-11-08",
        label: "COVID-19, mild — recovered",
        type: "Infection",
      },
      {
        date: "2023-03-20",
        label: "Acute bronchitis — resolved",
        type: "Infection",
      },
      {
        date: "2024-12-03",
        label: "Influenza (seasonal) — resolved",
        type: "Infection",
      },
      {
        date: "2025-10-15",
        label: "Influenza vaccine 2025/26",
        type: "Vaccination",
      },
      {
        date: "2021-09-09",
        label: "Mild intermittent asthma",
        type: "Diagnosis",
      },
    ],
  },
];

/**
 * Resolve a free-text question to one of the predefined answers by keyword
 * overlap (the static demo has no LLM). Returns the best match, or null.
 */
export function matchPersonalResearch(text: string): ResearchQA | null {
  const t = text.toLowerCase();
  // Word-boundary match so "run" → "running" but not "drunk", and "eat" does
  // not match "weather".
  const hit = (k: string) =>
    new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(t);
  let best: ResearchQA | null = null;
  let bestHits = 0;
  for (const qa of personalResearchQA) {
    const hits = qa.keywords.filter(hit).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = qa;
    }
  }
  return bestHits > 0 ? best : null;
}

/** Markers for an event list on a series with a date range (for TrendChart). */
export function eventMarkers(
  s: TrendSeries,
  events: EpaEvent[],
  colorOf: (type: EpaEvent["type"]) => string,
) {
  if (!s.from || !s.to) return [];
  return events
    .map((e) => ({
      x: frac(s.from!, s.to!, e.date),
      color: colorOf(e.type),
      label: `${e.type}: ${e.label}`,
    }))
    .filter((m) => m.x >= -0.02 && m.x <= 1.02)
    .map((m) => ({ ...m, x: Math.max(0, Math.min(1, m.x)) }));
}
