/**
 * Recommendations on /patient/insights, chosen by the patient's own conditions.
 *
 * Each recommendation names the conditions it is for: code prefixes (ICD-10,
 * SNOMED CT) matched against the start of a Condition's code, and words
 * matched inside its display text. A patient gets the recommendations one of
 * whose conditions they have; with none, one general recommendation.
 */

export interface PatientCondition {
  code: string;
  display: string;
}

interface Recommendation {
  category: string;
  action: string;
  priority: "high" | "medium" | "low";
  basedOn: string;
  ehdsArticle: string;
}

interface CatalogueEntry extends Recommendation {
  codes: readonly string[];
  words: readonly string[];
}

const CARDIOVASCULAR = {
  codes: [
    "i10",
    "i11",
    "i20",
    "i21",
    "i25",
    "i48",
    "i50",
    "38341003", // hypertension
    "53741008", // coronary arteriosclerosis
    "22298006", // myocardial infarction
    "49436004", // atrial fibrillation
    "84114007", // heart failure
  ],
  words: [
    "hypertension",
    "coronary",
    "myocardial",
    "heart failure",
    "atrial fibrillation",
    "cardiac",
  ],
} as const;

const DIABETES = {
  codes: [
    "e10",
    "e11",
    "r73",
    "73211009", // diabetes mellitus
    "44054006", // type 2 diabetes mellitus
    "15777000", // prediabetes
  ],
  words: ["diabetes", "prediabetes", "hyperglycemia"],
} as const;

const RECOMMENDATION_CATALOGUE: readonly CatalogueEntry[] = [
  {
    category: "cardiovascular",
    action: "Annual cardiovascular risk assessment (ECG + lipid panel)",
    priority: "high",
    basedOn: "Study T2D Cohort 2020-2025",
    ehdsArticle: "EHDS Art. 3, informed health decisions",
    ...CARDIOVASCULAR,
  },
  {
    category: "diabetes",
    action: "Bi-annual HbA1c monitoring (LOINC 4548-4)",
    priority: "high",
    basedOn: "Study NL Cardio 2025",
    ehdsArticle: "EHDS Art. 3",
    ...DIABETES,
  },
  {
    category: "longevity",
    action: "Participate in the T2D Longevity research program",
    priority: "medium",
    basedOn: "Study T2D Cohort 2020-2025",
    ehdsArticle: "GDPR Art. 9(2)(a), consent to join a study",
    ...DIABETES,
  },
];

const GENERAL_RECOMMENDATION: Recommendation = {
  category: "general",
  action: "Discuss a yearly preventive check-up with your physician",
  priority: "medium",
  basedOn: "No condition in your record matches a study finding",
  ehdsArticle: "EHDS Art. 3, informed health decisions",
};

function matches(entry: CatalogueEntry, condition: PatientCondition): boolean {
  const code = condition.code.trim().toLowerCase();
  const display = condition.display.toLowerCase();
  return (
    (code !== "" && entry.codes.some((prefix) => code.startsWith(prefix))) ||
    entry.words.some((word) => display.includes(word))
  );
}

/** The recommendations for a patient with these conditions, never empty. */
export function recommendationsFor(
  conditions: readonly PatientCondition[],
): Recommendation[] {
  const chosen = RECOMMENDATION_CATALOGUE.filter((entry) =>
    conditions.some((condition) => matches(entry, condition)),
  ).map(
    ({ codes: _codes, words: _words, ...recommendation }) => recommendation,
  );
  return chosen.length > 0 ? chosen : [GENERAL_RECOMMENDATION];
}
