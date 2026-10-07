import { describe, it, expect } from "vitest";
import {
  mapPidToPatient,
  demoPatient,
  DEMO_EUDI_PATIENT_USERNAME,
  DEMO_EUDI_PATIENT_RECORD,
} from "@/lib/eudi-patient-map";
import { patientPseudonym } from "@/lib/patient-identity";

describe("mapPidToPatient", () => {
  it("maps a verified PID to the fixed demo patient with a PATIENT role", () => {
    const p = mapPidToPatient({
      givenName: "Erika",
      familyName: "Mustermann",
      ageOver18: true,
    });
    expect(p.username).toBe(DEMO_EUDI_PATIENT_USERNAME);
    expect(p.roles).toEqual(["PATIENT"]);
  });

  it("never shows the verified name: the session carries the record's pseudonym (#475)", () => {
    const named = mapPidToPatient({
      givenName: "Erika",
      familyName: "Mustermann",
    });
    expect(named.displayName).toBe(patientPseudonym(DEMO_EUDI_PATIENT_RECORD));
    expect(named.displayName).not.toMatch(/Erika|Mustermann/);
    expect(named.displayName).toMatch(/^Patient [0-9a-f]{8}$/);
    // the same label whether or not a name was disclosed
    expect(mapPidToPatient({}).displayName).toBe(named.displayName);
  });

  it("the simulated approval signs in as the same pseudonymised patient", () => {
    expect(demoPatient()).toEqual(mapPidToPatient({}));
  });
});
