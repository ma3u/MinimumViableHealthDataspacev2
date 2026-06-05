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

/** A discrete clinical event from the patient's ePA (electronic patient record). */
export interface EpaEvent {
  date: string;
  label: string;
  type: "Infection" | "Surgery" | "Vaccination" | "Diagnosis";
}

export interface ResearchQA {
  id:
    | "sport"
    | "nutrition"
    | "breathing"
    | "infections"
    | "surgeries"
    | "vaccines";
  question: string;
  answer: string;
  /** provenance line — always "own data only" */
  source: string;
  /** keywords used to resolve a free-text question to this answer */
  keywords: string[];
  /** trend series shown beneath the answer (metric questions) */
  trends?: TrendSeries[];
  /** discrete ePA events shown beneath the answer (record questions) */
  events?: EpaEvent[];
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
  {
    id: "infections",
    question: "Which infections are recorded in my ePA?",
    answer:
      "Your ePA lists three infections over the past few years — seasonal influenza (2024), acute bronchitis (2023) and a mild COVID-19 episode (2022). All are marked resolved.",
    source: "From your ePA (elektronische Patientenakte) — your own data only.",
    keywords: [
      "infection",
      "infections",
      "flu",
      "influenza",
      "covid",
      "bronchitis",
      "sick",
      "illness",
      "fever",
      "virus",
    ],
    events: [
      {
        date: "2024-12-03",
        label: "Influenza (seasonal) — resolved",
        type: "Infection",
      },
      {
        date: "2023-03-20",
        label: "Acute bronchitis — resolved",
        type: "Infection",
      },
      {
        date: "2022-11-08",
        label: "COVID-19, mild — recovered",
        type: "Infection",
      },
    ],
  },
  {
    id: "surgeries",
    question: "What surgeries or operations have I had?",
    answer:
      "Your ePA shows two surgical procedures, both completed without recorded complications: a knee arthroscopy (2020) and a laparoscopic appendectomy (2018).",
    source: "From your ePA (elektronische Patientenakte) — your own data only.",
    keywords: [
      "surgery",
      "surgeries",
      "operation",
      "operations",
      "operated",
      "procedure",
      "appendectomy",
      "arthroscopy",
      "knee",
      "operative",
    ],
    events: [
      {
        date: "2020-09-22",
        label: "Knee arthroscopy (meniscus repair)",
        type: "Surgery",
      },
      {
        date: "2018-06-14",
        label: "Laparoscopic appendectomy",
        type: "Surgery",
      },
    ],
  },
  {
    id: "vaccines",
    question: "Am I up to date on my vaccinations?",
    answer:
      "Mostly — your ePA shows seasonal influenza vaccines for 2024/25 and 2025/26 and a COVID-19 booster (2024). Your tetanus-diphtheria booster is from 2021, so the next one is due around 2031.",
    source: "From your ePA (elektronische Patientenakte) — your own data only.",
    keywords: [
      "vaccine",
      "vaccines",
      "vaccination",
      "vaccinations",
      "immunization",
      "immunisation",
      "jab",
      "shot",
      "booster",
      "flu shot",
      "tetanus",
    ],
    events: [
      {
        date: "2025-10-15",
        label: "Influenza vaccine 2025/26",
        type: "Vaccination",
      },
      {
        date: "2024-10-08",
        label: "Influenza vaccine 2024/25",
        type: "Vaccination",
      },
      {
        date: "2024-04-02",
        label: "COVID-19 mRNA booster",
        type: "Vaccination",
      },
      {
        date: "2021-05-18",
        label: "Tetanus-diphtheria (Td) booster",
        type: "Vaccination",
      },
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
