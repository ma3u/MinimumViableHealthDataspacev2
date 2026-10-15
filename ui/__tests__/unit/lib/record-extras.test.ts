/**
 * The record's non-Observation resources as FHIR R4 (ADR-059): the mappers
 * from graph rows to DiagnosticReport, Immunization and MedicationStatement,
 * and that bundleToParameters skips them rather than choking on them.
 */
import { describe, it, expect } from "vitest";
import {
  immunizationToFhir,
  medicationStatementToFhir,
  reportToFhir,
} from "@/lib/patient/record-extras";
import {
  bundleToParameters,
  type FhirBundle,
} from "@/lib/overview/observations";

describe("record extras as FHIR R4", () => {
  it("maps an imaging report with its result reference and conclusion", () => {
    const r = reportToFhir({
      id: "dr-img-1002-2025-11-18",
      code: "34552-0",
      display: "Cardiac 2D echo panel",
      category: "RAD",
      categoryDisplay: "Radiology",
      status: "final",
      effective: "2025-11-18",
      issued: "2025-11-18T15:30:00Z",
      performer: "AlphaKlinik Berlin, Kardiologie (fictional)",
      conclusion: "Normal left ventricular size and systolic function.",
      results: ["dr-img-1002-2025-11-18-10230-1"],
    });
    expect(r.resourceType).toBe("DiagnosticReport");
    expect(r.status).toBe("final");
    expect(r.effectiveDateTime).toBe("2025-11-18");
    expect(r.result).toEqual([
      { reference: "urn:uuid:dr-img-1002-2025-11-18-10230-1" },
    ]);
    expect(r.conclusion).toMatch(/Normal left ventricular/);
    expect(r.performer).toEqual([
      { display: "AlphaKlinik Berlin, Kardiologie (fictional)" },
    ]);
  });

  it("maps a vaccination with CVX code, date and lot", () => {
    const i = immunizationToFhir({
      id: "imm-p1-2024-11-05-216",
      code: "216",
      system: "http://hl7.org/fhir/sid/cvx",
      display: "Pneumococcal conjugate vaccine 20 valent",
      status: null,
      occurrence: "2024-11-05",
      lot: "PCV20-4410",
      performer: null,
    });
    expect(i.resourceType).toBe("Immunization");
    expect(i.status).toBe("completed");
    expect(i.vaccineCode).toEqual({
      coding: [
        {
          system: "http://hl7.org/fhir/sid/cvx",
          code: "216",
          display: "Pneumococcal conjugate vaccine 20 valent",
        },
      ],
      text: "Pneumococcal conjugate vaccine 20 valent",
    });
    expect(i.occurrenceDateTime).toBe("2024-11-05");
    expect(i.lotNumber).toBe("PCV20-4410");
    expect(i.performer).toBeUndefined();
  });

  it("maps a medication plan line with the 1-0-1 dosing and the plan id", () => {
    const m = medicationStatementToFhir({
      id: "ms-1005-H03AA01",
      code: "H03AA01",
      system: "http://www.whocc.no/atc",
      display: "Levothyroxine 75 mcg",
      status: "active",
      dosage: "1-0-0",
      dose: 75,
      doseUnit: "ug",
      reason: "Hypothyroidism",
      since: "2012-03-01",
      planId: "bmp-1005-2026-04-09",
      planPrinted: "2026-04-09",
      source: "Bundeseinheitlicher Medikationsplan (fictional)",
    });
    expect(m.resourceType).toBe("MedicationStatement");
    expect(m.effectivePeriod).toEqual({ start: "2012-03-01" });
    expect(m.reasonCode).toEqual([{ text: "Hypothyroidism" }]);
    expect(m.dosage).toEqual([
      {
        text: "1-0-0",
        doseAndRate: [{ doseQuantity: { value: 75, unit: "ug" } }],
      },
    ]);
    expect(m.identifier).toEqual([
      {
        system: "urn:klarbefund:medication-plan",
        value: "bmp-1005-2026-04-09",
      },
    ]);
    expect(m.note).toEqual([
      {
        text: "Bundeseinheitlicher Medikationsplan (fictional), printed 2026-04-09",
      },
    ]);
  });

  it("bundleToParameters skips the extras and keeps the Observations", () => {
    const bundle: FhirBundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: 2,
      entry: [
        {
          resource: {
            resourceType: "Observation",
            id: "o1",
            status: "final",
            effectiveDateTime: "2026-02-10T08:30:00Z",
            code: {
              coding: [
                {
                  system: "http://loinc.org",
                  code: "4548-4",
                  display: "HbA1c",
                },
              ],
            },
            valueQuantity: { value: 6.1, unit: "%" },
          } as never,
        },
        {
          resource: immunizationToFhir({
            id: "imm",
            code: "150",
            system: null,
            display: "Influenza",
            status: "completed",
            occurrence: "2025-10-14",
            lot: null,
            performer: null,
          }),
        },
      ],
    } as FhirBundle;
    const params = bundleToParameters(bundle);
    expect(params).toHaveLength(1);
    expect(params[0].code).toBe("4548-4");
  });
});
