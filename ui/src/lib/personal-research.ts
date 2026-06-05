/**
 * Predefined personal-research questions for the patient's own data (NLQ page).
 * Three questions, each answered from the patient's own data — fitness / lab /
 * nutrition trends PLUS relevant ePA (elektronische Patientenakte) events
 * (infections, surgery, vaccinations, diagnoses). EHDS Art. 3 / GDPR Art. 15
 * primary use, own records only. Synthetic · illustrative.
 *
 * Free-text questions are resolved to one of these by keyword (no LLM in the
 * static demo).
 */
import { personalHealth, type TrendSeries } from "@/lib/journey-config";

const fitness = personalHealth.find((s) => s.id === "fitness")!;
const labs = personalHealth.find((s) => s.id === "labs")!;
const nutrition = personalHealth.find((s) => s.id === "nutrition")!;

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
  /** trend series shown beneath the answer */
  trends: TrendSeries[];
  /** relevant ePA events shown beneath the answer */
  events: EpaEvent[];
}

export const personalResearchQA: ResearchQA[] = [
  {
    id: "sport",
    question:
      "I increased my daily sport routine over the last 3 months — do you see any effect?",
    answer:
      "Yes — your cardio-fitness improved: VO₂max rose from 42 to 47 ml/kg/min and your heart-rate variability climbed. Your ePA confirms you fully recovered from your 2020 knee arthroscopy and trained through the period without setbacks — you're fitter than before.",
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
    trends: [fitness.trends[0], fitness.trends[1]],
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
      "Trending the right way — inflammation (CRP) is down and your Mediterranean-plan adherence reached 86%. That directly helps the conditions on your ePA: your pre-diabetes (2023) and mixed hyperlipidaemia (2024), now managed alongside atorvastatin.",
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
    trends: [labs.trends[2], nutrition.trends[0]],
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
      "Likely yes — CRP fell from 2.1 to 0.8 mg/L and your HRV improved. Set against your ePA respiratory history — mild asthma, plus a resolved bronchitis (2023) and COVID-19 (2022) — your inflammation is now low, and your seasonal influenza vaccinations are up to date.",
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
    trends: [labs.trends[2], fitness.trends[1]],
    events: [
      {
        date: "2024-12-03",
        label: "Influenza (seasonal) — resolved",
        type: "Infection",
      },
      {
        date: "2022-11-08",
        label: "COVID-19, mild — recovered",
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
 * overlap (the static demo has no LLM). Returns the best match, or null when the
 * question is outside the patient's own data.
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
