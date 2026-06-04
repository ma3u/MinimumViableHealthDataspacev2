import { describe, it, expect } from "vitest";
import {
  mapPidToPatient,
  DEMO_EUDI_PATIENT_USERNAME,
} from "@/lib/eudi-patient-map";

describe("mapPidToPatient", () => {
  it("maps a verified PID to the fixed demo patient with a PATIENT role", () => {
    const p = mapPidToPatient({
      givenName: "Erika",
      familyName: "Mustermann",
      birthDate: "1984-01-26",
    });
    expect(p.username).toBe(DEMO_EUDI_PATIENT_USERNAME);
    expect(p.roles).toEqual(["PATIENT"]);
    expect(p.displayName).toBe("Erika Mustermann");
  });

  it("falls back to a friendly label when no name is disclosed", () => {
    const p = mapPidToPatient({});
    expect(p.username).toBe(DEMO_EUDI_PATIENT_USERNAME);
    expect(p.displayName).toBe("EUDI Wallet Patient");
  });

  it("uses whichever name part is present", () => {
    expect(mapPidToPatient({ familyName: "Mustermann" }).displayName).toBe(
      "Mustermann",
    );
    expect(mapPidToPatient({ givenName: "Erika" }).displayName).toBe("Erika");
  });
});
