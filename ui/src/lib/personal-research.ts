/**
 * Predefined personal-research questions for the patient's own data (NLQ page).
 * Each question maps to trend series from `personalHealth` (the patient's own
 * fitness / lab / nutrition data) — EHDS Art. 3 / GDPR Art. 15 primary use, own
 * records only. Synthetic · illustrative.
 *
 * The NLQ page accepts free-text questions; `matchPersonalResearch` resolves a
 * typed question to one of these answers by keyword (no LLM in the static demo).
 */
import { personalHealth, type TrendSeries } from "@/lib/journey-config";

const fitness = personalHealth.find((s) => s.id === "fitness")!;
const labs = personalHealth.find((s) => s.id === "labs")!;
const nutrition = personalHealth.find((s) => s.id === "nutrition")!;

export interface ResearchQA {
  id: "sport" | "nutrition" | "breathing";
  question: string;
  answer: string;
  /** provenance line — always "own data only" */
  source: string;
  /** trend series shown beneath the answer */
  trends: TrendSeries[];
  /** keywords used to resolve a free-text question to this answer */
  keywords: string[];
}

export const personalResearchQA: ResearchQA[] = [
  {
    id: "sport",
    question:
      "I increased my daily sport routine over the last 3 months — do you see any effect?",
    answer:
      "Yes — your cardio-fitness improved. VO₂max rose from 42 to 47 ml/kg/min and your heart-rate variability climbed, both signs of better recovery and a lower resting heart rate.",
    source: "Computed from your fitness band — your own data only.",
    trends: [fitness.trends[0], fitness.trends[1]],
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
    ],
  },
  {
    id: "nutrition",
    question:
      "I changed my nutrition over 3 months — how are my cardiovascular and pre-diabetes markers?",
    answer:
      "Trending the right way — inflammation (CRP) is down and vitamin D is up, both consistent with lower cardiovascular risk. Your Mediterranean-plan adherence reached 86%.",
    source:
      "Computed from your lab panel and nutrition plan — your own data only.",
    trends: [labs.trends[2], nutrition.trends[0]],
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
      "weight",
      "mediterranean",
      "vitamin d",
    ],
  },
  {
    id: "breathing",
    question:
      "I've been doing daily breathing exercises — any effect on stress and inflammation?",
    answer:
      "Likely yes — your inflammation marker (CRP) fell from 2.1 to 0.8 mg/L this quarter and your HRV improved. Lower CRP and higher HRV both point to a reduced stress load.",
    source:
      "Computed from your lab panel and fitness band — your own data only.",
    trends: [labs.trends[2], fitness.trends[1]],
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
    ],
  },
];

/**
 * Resolve a free-text question to one of the predefined answers by keyword
 * overlap (the static demo has no LLM). Returns the best match, or null when the
 * question is outside the patient's own fitness / lab / nutrition data.
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
