/**
 * A graph node as a FHIR R4 resource (#876, #1144): an id a consumer can key
 * on, R4 elements instead of graph properties, and a reference to the
 * patient. Whether the output validates is proven by
 * scripts/eehrxf/validate.py over the facade sample
 * (fhir-facade-sample.test.ts keeps that sample equal to this mapper).
 */
import { describe, it, expect } from "vitest";
import neo4j from "neo4j-driver";
import {
  FACADE_TYPES,
  fhirDate,
  fhirDateTime,
  fhirInstant,
  toFhirEntry,
  toFhirResource,
} from "../src/fhir-resource.js";

const DAR = {
  extension: [
    {
      url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
      valueCode: "unknown",
    },
  ],
};

describe("toFhirResource", () => {
  it("takes the id from fhirId, id or resourceId, in that order", () => {
    expect(toFhirResource("Patient", { resourceId: "fhir-pat-1" }).id).toBe(
      "fhir-pat-1",
    );
    expect(
      toFhirResource("Patient", { fhirId: "f1", resourceId: "r1" }).id,
    ).toBe("f1");
  });

  it("writes a driver date as an R4 date and drops graph-only properties", () => {
    const r = toFhirResource("Patient", {
      resourceId: "P1",
      name: "Maria Schmidt",
      gender: "female",
      birthDate: new neo4j.types.Date(1979, 3, 15),
      city: "Berlin",
      country: "DE",
      fictional: true,
      demo: true,
      pvCohort: true,
      age: neo4j.int(47),
      interests: ["sleep"],
    });
    expect(r).toEqual({
      resourceType: "Patient",
      id: "P1",
      meta: r.meta,
      name: [{ text: "Maria Schmidt" }],
      gender: "female",
      birthDate: "1979-03-15",
      address: [{ city: "Berlin", country: "DE" }],
    });
  });

  it("says a patient's name and birth date are unknown rather than leaving them out", () => {
    const r = toFhirResource("Patient", { id: "x", gender: "diverse" });
    expect(r.name).toEqual([DAR]);
    expect(r._birthDate).toEqual(DAR);
    expect(r.gender).toBe("unknown");
  });

  it("refers a record to its patient: subject, or patient for an Immunization", () => {
    expect(
      toFhirResource("Condition", { resourceId: "c1" }, "p1").subject,
    ).toEqual({ reference: "Patient/p1" });
    const imm = toFhirResource("Immunization", { resourceId: "i1" }, "p1");
    expect(imm.patient).toEqual({ reference: "Patient/p1" });
    expect(imm).not.toHaveProperty("subject");
    expect(
      toFhirResource("Patient", { resourceId: "p1" }, "p1"),
    ).not.toHaveProperty("subject");
  });

  it("maps a seeded lab Observation to a coded value in UCUM with its range", () => {
    const r = toFhirResource(
      "Observation",
      {
        resourceId: "obs-p1-4548-4-2024-09-12",
        code: "4548-4",
        codeSystem: "http://loinc.org",
        display: "Hemoglobin A1c/Hemoglobin.total in Blood",
        name: "Hemoglobin A1c 6.4 %",
        category: "laboratory",
        status: "final",
        value: 6.4,
        valueQuantity: 6.4,
        unit: "%",
        valueUnit: "%",
        referenceLow: 4.0,
        referenceHigh: 6.0,
        referenceText: "4.0 - 6.0 %",
        performer: "AlphaKlinik Berlin, Zentrallabor (fictional)",
        dateTime: "2024-09-12T08:30:00Z",
        effectiveDate: new neo4j.types.Date(2024, 9, 12),
        fictional: true,
      },
      "P1",
    );
    const { meta: _meta, ...rest } = r;
    expect(rest).toEqual({
      resourceType: "Observation",
      id: "obs-p1-4548-4-2024-09-12",
      // The graph's id as an OBI identifier, and LOINC's lab class next to
      // `laboratory`: the MII Kerndatensatz lab profile wants both.
      identifier: [
        {
          type: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "OBI",
                display: "Observation Instance Identifier",
              },
            ],
          },
          system: "https://ehds.mabu.red/fhir/sid/graph-observation",
          value: "obs-p1-4548-4-2024-09-12",
          assigner: { display: "Minimum Viable Health Dataspace FHIR facade" },
        },
      ],
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory",
            },
            {
              system: "http://loinc.org",
              code: "26436-6",
              display: "Laboratory studies (set)",
            },
          ],
        },
      ],
      code: {
        coding: [{ system: "http://loinc.org", code: "4548-4" }],
        text: "Hemoglobin A1c/Hemoglobin.total in Blood",
      },
      subject: { reference: "Patient/P1" },
      effectiveDateTime: "2024-09-12T08:30:00Z",
      performer: [{ display: "AlphaKlinik Berlin, Zentrallabor (fictional)" }],
      valueQuantity: {
        value: 6.4,
        unit: "%",
        system: "http://unitsofmeasure.org",
        code: "%",
      },
      referenceRange: [
        {
          low: {
            value: 4,
            unit: "%",
            system: "http://unitsofmeasure.org",
            code: "%",
          },
          high: {
            value: 6,
            unit: "%",
            system: "http://unitsofmeasure.org",
            code: "%",
          },
          text: "4.0 - 6.0 %",
        },
      ],
    });
  });

  it("reads the loader's shape: system, and the value as a string", () => {
    const r = toFhirResource(
      "Observation",
      {
        id: "o1",
        code: "718-7",
        system: "http://loinc.org",
        value: "13.6",
        unit: "g/dL",
        category: "laboratory",
        dateTime: "2019-04-02T10:00:00+0200",
      },
      "p1",
    );
    expect(r.valueQuantity).toEqual({
      value: 13.6,
      unit: "g/dL",
      system: "http://unitsofmeasure.org",
      code: "g/dL",
    });
    expect(r.effectiveDateTime).toBe("2019-04-02T10:00:00+02:00");
    // A lab value without its laboratory says it is unknown (EU lab profile).
    expect(r.performer).toEqual([DAR]);
    expect(r.status).toBe("unknown");
  });

  it("makes a vital sign a vital sign: category, UCUM unit, blood pressure as components", () => {
    const bmi = toFhirResource("Observation", {
      id: "b",
      code: "39156-5",
      value: 27.1,
      date: "2024-01-02",
    });
    expect(bmi.category).toEqual([
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs",
            display: "Vital Signs",
          },
        ],
      },
    ]);
    expect(bmi.valueQuantity).toMatchObject({ unit: "kg/m2", code: "kg/m2" });

    const bp = toFhirResource("Observation", {
      resourceId: "fhir-obs-4002",
      code: "55284-4",
      valueQuantity: 145,
      valueUnit: "mmHg",
      dateTime: "2023-09-12T11:45:00Z",
    });
    expect((bp.code as { coding: unknown[] }).coding).toEqual([
      { system: "http://loinc.org", code: "55284-4" },
      { system: "http://loinc.org", code: "85354-9" },
    ]);
    expect(bp).not.toHaveProperty("valueQuantity");
    expect(bp.component).toEqual([
      {
        code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] },
        valueQuantity: {
          value: 145,
          unit: "mmHg",
          system: "http://unitsofmeasure.org",
          code: "mm[Hg]",
        },
      },
      {
        code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] },
        dataAbsentReason: {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/data-absent-reason",
              code: "unknown",
            },
          ],
        },
      },
    ]);
  });

  it("gives a device's weekly mean its week and its source kind", () => {
    const r = toFhirResource("Observation", {
      resourceId: "act-p1-2025-01-05",
      code: "55411-3",
      category: "activity",
      effectiveStart: "2024-12-30",
      effectiveDate: "2025-01-05",
      sourceKind: "device-weekly-mean",
      value: 18,
      unit: "min/d",
    });
    expect(r.effectivePeriod).toEqual({
      start: "2024-12-30",
      end: "2025-01-05",
    });
    expect(r).not.toHaveProperty("effectiveDateTime");
    expect(r.extension).toEqual([
      {
        url: "https://ehds.mabu.red/fhir/StructureDefinition/epa-ingest-source-kind",
        valueCode: "device-weekly-mean",
      },
    ]);
  });

  it("maps every type's codes and statuses into R4's value sets", () => {
    const enc = toFhirResource(
      "Encounter",
      {
        resourceId: "e1",
        class: "ambulatory",
        status: "finished",
        date: "2025-03-14T09:00:00Z",
        display: "Laboratory visit",
        serviceProvider: "AlphaKlinik Berlin",
        name: "Laboratory visit 1 of 6",
      },
      "P1",
    );
    expect(enc).toMatchObject({
      status: "finished",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: "AMB",
      },
      type: [{ text: "Laboratory visit" }],
      period: { start: "2025-03-14T09:00:00Z" },
      serviceProvider: { display: "AlphaKlinik Berlin" },
    });
    expect(
      toFhirResource("Encounter", { id: "e2", class: "IMP" }).class,
    ).toMatchObject({ code: "IMP" });
    expect(
      toFhirResource("Encounter", { id: "e3", class: "phone" }).class,
    ).toEqual(DAR);

    const cond = toFhirResource("Condition", {
      id: "c1",
      code: "44054006",
      display: "Type 2 diabetes mellitus",
      status: "active",
      onsetDate: "2023-06-15T10:00:00Z",
    });
    expect(cond).toMatchObject({
      clinicalStatus: { coding: [{ code: "active" }] },
      code: {
        coding: [{ system: "http://snomed.info/sct", code: "44054006" }],
      },
      onsetDateTime: "2023-06-15T10:00:00Z",
    });

    const med = toFhirResource("MedicationRequest", {
      resourceId: "m1",
      medicationCode: "860975",
      display: "Metformin 500mg",
      status: "active",
      date: "2023-07-10T14:20:00Z",
    });
    expect(med).toMatchObject({
      status: "active",
      intent: "order",
      medicationCodeableConcept: {
        coding: [
          {
            system: "http://www.nlm.nih.gov/research/umls/rxnorm",
            code: "860975",
          },
        ],
        text: "Metformin 500mg",
      },
      authoredOn: "2023-07-10T14:20:00Z",
      requester: DAR,
    });

    const proc = toFhirResource("Procedure", {
      id: "pr1",
      code: "117015009",
      performedStart: "2019-04-02T10:00:00+02:00",
      performedEnd: "2019-04-02T10:15:00+02:00",
      status: "done",
    });
    expect(proc).toMatchObject({
      status: "unknown",
      performedPeriod: {
        start: "2019-04-02T10:00:00+02:00",
        end: "2019-04-02T10:15:00+02:00",
      },
    });

    const rep = toFhirResource("DiagnosticReport", {
      resourceId: "dr1",
      code: "36643-5",
      codeSystem: "http://loinc.org",
      category: "RAD",
      categoryDisplay: "Radiology",
      issued: "2026-01-22T15:30:00Z",
      effectiveDate: new neo4j.types.Date(2026, 1, 22),
      performer: "AlphaKlinik Berlin, Radiologie (fictional)",
      conclusion: "Lungs clear.",
      modality: "DX",
      status: "final",
    });
    expect(rep).toMatchObject({
      status: "final",
      category: [{ coding: [{ code: "RAD" }], text: "Radiology" }],
      effectiveDateTime: "2026-01-22",
      issued: "2026-01-22T15:30:00Z",
      performer: [{ display: "AlphaKlinik Berlin, Radiologie (fictional)" }],
      conclusion: "Lungs clear.",
    });
    expect(rep).not.toHaveProperty("modality");

    const stm = toFhirResource("MedicationStatement", {
      resourceId: "ms1",
      medicationCode: "A10BA02",
      codeSystem: "http://www.whocc.no/atc",
      display: "Metformin 500 mg",
      effectiveStart: new neo4j.types.Date(2018, 4, 10),
      planPrinted: new neo4j.types.Date(2026, 8, 21),
      source: "Medikationsplan (fictional)",
      reason: "Diabetes mellitus type 2",
      dose: 500,
      doseUnit: "mg",
      dosageText: "1-0-1",
      status: "active",
    });
    expect(stm).toMatchObject({
      effectivePeriod: { start: "2018-04-10" },
      dateAsserted: "2026-08-21",
      informationSource: { display: "Medikationsplan (fictional)" },
      reasonCode: [{ text: "Diabetes mellitus type 2" }],
      dosage: [
        {
          text: "1-0-1",
          doseAndRate: [{ doseQuantity: { value: 500, code: "mg" } }],
        },
      ],
    });
  });

  it("knows every type the facade serves, and refuses one it does not map", () => {
    expect(FACADE_TYPES).toEqual([
      "Patient",
      "Encounter",
      "Condition",
      "Observation",
      "Procedure",
      "MedicationRequest",
      "DiagnosticReport",
      "Immunization",
      "MedicationStatement",
    ]);
    expect(() => toFhirResource("Basic", { id: "b" })).toThrow(/Basic/);
  });

  it("gives an entry an absolute fullUrl under the base, and none without an id", () => {
    expect(
      toFhirEntry({ resourceType: "Patient", id: "p1" }, "http://h:9090/fhir/")
        .fullUrl,
    ).toBe("http://h:9090/fhir/Patient/p1");
    expect(toFhirEntry({ resourceType: "Patient", id: "p1" }).fullUrl).toBe(
      "Patient/p1",
    );
    expect(toFhirEntry({ resourceType: "Patient" })).not.toHaveProperty(
      "fullUrl",
    );
  });
});

describe("R4 dates", () => {
  it("keeps a date, and a timestamp with its zone", () => {
    expect(fhirDateTime("2024-09-12")).toBe("2024-09-12");
    expect(fhirDateTime("2024-09")).toBe("2024-09");
    expect(fhirDateTime("2024-09-12T08:30:00Z")).toBe("2024-09-12T08:30:00Z");
    expect(fhirDateTime("2024-09-12T08:30:00.123+02:00")).toBe(
      "2024-09-12T08:30:00.123+02:00",
    );
  });

  it("adds missing seconds, drops a zone id, and cuts a local time to its date", () => {
    expect(fhirDateTime("2026-09-22T18:05Z")).toBe("2026-09-22T18:05:00Z");
    expect(fhirDateTime("2026-09-22T18:05:00+02:00[Europe/Berlin]")).toBe(
      "2026-09-22T18:05:00+02:00",
    );
    expect(fhirDateTime("2026-09-22T18:05:00")).toBe("2026-09-22");
    expect(
      fhirDateTime(new neo4j.types.LocalDateTime(2026, 9, 22, 18, 5, 0, 0)),
    ).toBe("2026-09-22");
  });

  it("refuses what is not a date", () => {
    expect(fhirDateTime("")).toBeUndefined();
    expect(fhirDateTime("yesterday")).toBeUndefined();
    expect(fhirDateTime("2024-13-01")).toBeUndefined();
    expect(fhirDateTime(false)).toBeUndefined();
  });

  it("gives a date its date part and an instant only with a time", () => {
    expect(fhirDate("2023-06-15T10:00:00Z")).toBe("2023-06-15");
    expect(fhirDate(new neo4j.types.Date(1965, 4, 12))).toBe("1965-04-12");
    expect(fhirInstant("2026-03-04T10:00:00Z")).toBe("2026-03-04T10:00:00Z");
    expect(fhirInstant("2026-03-04")).toBeUndefined();
  });
});

// #1218: what the loader now keeps of an Observation comes back in FHIR: the
// components of a blood pressure panel, every coding, and the UCUM code the
// source gave beside the printed unit.
describe("Observation fidelity (#1218)", () => {
  const panel = {
    id: "bp-1218",
    code: "85354-9",
    system: "http://loinc.org",
    display: "Blood pressure panel with all children optional",
    category: "vital-signs",
    status: "final",
    dateTime: "2024-05-06T08:00:00+02:00",
    codingSystems: ["http://loinc.org"],
    codingCodes: ["85354-9"],
    codingDisplays: ["Blood pressure panel with all children optional"],
    componentCodes: ["8462-4", "8480-6"],
    componentDisplays: ["Diastolic Blood Pressure", "Systolic Blood Pressure"],
    componentValues: [82, 131],
    componentUnits: ["mm[Hg]", "mm[Hg]"],
    componentUcumCodes: ["mm[Hg]", "mm[Hg]"],
    componentAbsentCodes: [],
  };

  it("serves both values of a blood pressure panel", () => {
    const r = toFhirResource("Observation", panel, "p-1");
    expect(r.valueQuantity).toBeUndefined();
    expect(r.component).toEqual([
      {
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8462-4",
              display: "Diastolic Blood Pressure",
            },
          ],
        },
        valueQuantity: {
          value: 82,
          unit: "mm[Hg]",
          system: "http://unitsofmeasure.org",
          code: "mm[Hg]",
        },
      },
      {
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8480-6",
              display: "Systolic Blood Pressure",
            },
          ],
        },
        valueQuantity: {
          value: 131,
          unit: "mm[Hg]",
          system: "http://unitsofmeasure.org",
          code: "mm[Hg]",
        },
      },
    ]);
  });

  it("names a component the source sent without a value as unknown", () => {
    const r = toFhirResource(
      "Observation",
      {
        ...panel,
        componentCodes: ["8480-6"],
        componentDisplays: ["Systolic Blood Pressure"],
        componentValues: [131],
        componentUnits: ["mm[Hg]"],
        componentUcumCodes: ["mm[Hg]"],
        componentAbsentCodes: ["8462-4"],
      },
      "p-1",
    );
    const comps = r.component as Record<string, unknown>[];
    expect(comps).toHaveLength(2);
    expect(comps[1]).toEqual({
      code: { coding: [{ system: "http://loinc.org", code: "8462-4" }] },
      dataAbsentReason: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
            code: "unknown",
          },
        ],
      },
    });
  });

  it("keeps every coding, the first one first", () => {
    const r = toFhirResource("Observation", {
      id: "multi",
      code: "8480-6",
      system: "http://loinc.org",
      display: "Systolic blood pressure",
      value: 120,
      unit: "mm[Hg]",
      codingSystems: [
        "http://loinc.org",
        "http://snomed.info/sct",
        "urn:oid:1.2.276.0.76.5.409",
      ],
      codingCodes: ["8480-6", "271649006", "RR-SYS"],
      codingDisplays: [
        "Systolic blood pressure",
        "Systolic blood pressure",
        "",
      ],
    });
    const coding = (r.code as { coding: { system?: string; code: string }[] })
      .coding;
    expect(coding.map((c) => c.code)).toEqual([
      "8480-6",
      "271649006",
      "RR-SYS",
      "85354-9",
    ]);
    expect(coding[1].system).toBe("http://snomed.info/sct");
  });

  it("uses the UCUM code the source gave, beside the printed unit", () => {
    const r = toFhirResource("Observation", {
      id: "u",
      code: "2345-7",
      system: "http://loinc.org",
      value: 95,
      unit: "mg/dl",
      ucumCode: "mg/dL",
    });
    expect(r.valueQuantity).toEqual({
      value: 95,
      unit: "mg/dl",
      system: "http://unitsofmeasure.org",
      code: "mg/dL",
    });
  });

  it("still serves a stored blood pressure without components as before", () => {
    const r = toFhirResource("Observation", {
      resourceId: "bp-seed",
      code: "55284-4",
      valueQuantity: 145,
      valueUnit: "mmHg",
    });
    const comps = r.component as Record<string, unknown>[];
    expect(comps).toHaveLength(2);
    expect(
      (comps[0].valueQuantity as Record<string, unknown> | undefined)?.value,
    ).toBe(145);
  });
});
