import { describe, expect, it } from "vitest";
import { medicationConcept } from "@/lib/fhir-medication";

const METFORMIN = {
  coding: [
    { system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "860975" },
  ],
  text: "Metformin 500mg",
};

describe("medicationConcept", () => {
  it("reads a medicationCodeableConcept as it stands", () => {
    expect(medicationConcept({ medicationCodeableConcept: METFORMIN })).toBe(
      METFORMIN,
    );
  });

  it("follows #medication to the contained Medication, as the hub sends it", () => {
    expect(
      medicationConcept({
        contained: [
          { resourceType: "Medication", id: "medication", code: METFORMIN },
        ],
        medicationReference: { reference: "#medication" },
      }),
    ).toEqual(METFORMIN);
  });

  it("follows a reference to another bundle entry when given a resolver", () => {
    const entry = { resourceType: "Medication", code: METFORMIN };
    expect(
      medicationConcept(
        { medicationReference: { reference: "urn:uuid:m1" } },
        (ref) =>
          (ref as { reference?: string }).reference === "urn:uuid:m1"
            ? entry
            : undefined,
      ),
    ).toEqual(METFORMIN);
  });

  it("falls back to the reference's display, and to nothing", () => {
    expect(
      medicationConcept({
        medicationReference: { reference: "#gone", display: "Metformin" },
      }),
    ).toEqual({ text: "Metformin" });
    expect(medicationConcept({})).toBeUndefined();
  });
});
