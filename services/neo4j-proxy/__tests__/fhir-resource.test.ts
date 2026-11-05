/**
 * A graph node as a FHIR R4 resource (#876): an id a consumer can key on,
 * ISO dates instead of the driver's objects, and a reference to the patient.
 */
import { describe, it, expect } from "vitest";
import neo4j from "neo4j-driver";
import { toFhirEntry, toFhirResource } from "../src/fhir-resource.js";

describe("toFhirResource", () => {
  it("takes the id from fhirId, id or resourceId, in that order", () => {
    expect(toFhirResource("Patient", { resourceId: "fhir-pat-1" }).id).toBe(
      "fhir-pat-1",
    );
    expect(
      toFhirResource("Patient", { fhirId: "f1", resourceId: "r1" }).id,
    ).toBe("f1");
  });

  it("writes a driver date as ISO 8601 and an integer as a number", () => {
    const r = toFhirResource("Patient", {
      resourceId: "p1",
      birthDate: new neo4j.types.Date(1965, 4, 12),
      age: neo4j.int(61),
    });
    expect(r.birthDate).toBe("1965-04-12");
    expect(r.age).toBe(61);
  });

  it("refers a record to its patient, and keeps a reference it has", () => {
    expect(
      toFhirResource("Condition", { resourceId: "c1" }, "p1").subject,
    ).toEqual({ reference: "Patient/p1" });
    expect(
      toFhirResource(
        "Condition",
        { resourceId: "c1", subject: { reference: "Patient/x" } },
        "p1",
      ).subject,
    ).toEqual({ reference: "Patient/x" });
    expect(
      toFhirResource("Patient", { resourceId: "p1" }, "p1"),
    ).not.toHaveProperty("subject");
  });

  it("gives an entry the fullUrl of its id, and none without one", () => {
    expect(toFhirEntry({ resourceType: "Patient", id: "p1" }).fullUrl).toBe(
      "Patient/p1",
    );
    expect(toFhirEntry({ resourceType: "Patient" })).not.toHaveProperty(
      "fullUrl",
    );
  });
});
