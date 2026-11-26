/**
 * The medication a MedicationRequest or MedicationStatement names, as a
 * CodeableConcept: its own `medicationCodeableConcept`, or the code of the
 * Medication its `medicationReference` points to. The hub sends a
 * prescription's medication as a contained Medication (`#medication`), as the
 * gematik ePA medication profile requires; `resolveEntry` finds one that sits
 * elsewhere in a bundle.
 */
export type CodeableConceptLike = {
  text?: string;
  coding?: Array<{ system?: string; code?: string; display?: string }>;
};

export function medicationConcept(
  r: Record<string, unknown>,
  resolveEntry?: (ref: unknown) => Record<string, unknown> | undefined,
): CodeableConceptLike | undefined {
  if (r.medicationCodeableConcept) {
    return r.medicationCodeableConcept as CodeableConceptLike;
  }
  const ref = r.medicationReference as
    | { reference?: string; display?: string }
    | undefined;
  if (!ref) return undefined;
  const target = ref.reference?.startsWith("#")
    ? (r.contained as Array<Record<string, unknown>> | undefined)?.find(
        (c) => c.id === ref.reference?.slice(1),
      )
    : resolveEntry?.(ref);
  const code = target?.code as CodeableConceptLike | undefined;
  if (code && (code.text || code.coding?.length)) return code;
  return ref.display ? { text: ref.display } : undefined;
}
