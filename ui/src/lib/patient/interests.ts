/**
 * The health interests a patient can name on their profile. The profile
 * suggests some from the record (a cardiac condition suggests cardiology);
 * the patient may choose others from this list and keep their choice. Only
 * these ids are accepted, so the record holds no free text.
 */
export const HEALTH_INTERESTS = [
  { id: "preventive-care", label: "Preventive care" },
  { id: "cardiology", label: "Heart and circulation" },
  { id: "endocrinology", label: "Diabetes and hormones" },
  {
    id: "chronic-disease-management",
    label: "Living with a chronic condition",
  },
  { id: "mental-health", label: "Mental health" },
  { id: "longevity", label: "Healthy ageing" },
  { id: "nutrition", label: "Nutrition" },
  { id: "sleep", label: "Sleep" },
  { id: "fitness", label: "Fitness and activity" },
  { id: "cancer-screening", label: "Cancer screening" },
  { id: "respiratory", label: "Lungs and breathing" },
  { id: "rare-diseases", label: "Rare diseases" },
] as const;

export type HealthInterestId = (typeof HEALTH_INTERESTS)[number]["id"];

const IDS = new Set<string>(HEALTH_INTERESTS.map((i) => i.id));

/** The label for an id; an unknown one (older data, fixtures) as words. */
export function interestLabel(id: string): string {
  return (
    HEALTH_INTERESTS.find((i) => i.id === id)?.label ?? id.replace(/-/g, " ")
  );
}

/**
 * The ids of a chosen list, in the list's order, without repeats. Null when
 * the input is not a list of known ids.
 */
export function validInterests(input: unknown): HealthInterestId[] | null {
  if (!Array.isArray(input) || input.length > HEALTH_INTERESTS.length) {
    return null;
  }
  if (!input.every((i) => typeof i === "string" && IDS.has(i))) return null;
  return HEALTH_INTERESTS.map((i) => i.id).filter((id) => input.includes(id));
}
