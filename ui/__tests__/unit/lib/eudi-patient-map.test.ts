import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  mapPidToPatient,
  demoPatient,
  PID_BINDINGS,
} from "@/lib/eudi-patient-map";
import { patientPseudonym } from "@/lib/patient-identity";

describe("mapPidToPatient (#708)", () => {
  it("binds a PID to the patient whose name it carries, at level high", () => {
    const p = mapPidToPatient({
      givenName: "Maria",
      familyName: "Schmidt",
      ageOver18: true,
    });
    expect(p).toEqual({
      username: "patient1",
      displayName: patientPseudonym("P1"),
      roles: ["PATIENT"],
      assurance: "high",
    });
    expect(
      mapPidToPatient({ givenName: "Jan", familyName: "de Vries" })?.username,
    ).toBe("patient2");
  });

  it("ignores case, accents and extra spaces", () => {
    expect(
      mapPidToPatient({ givenName: " MARÍA ", familyName: "schmidt" })
        ?.username,
    ).toBe("patient1");
    expect(
      mapPidToPatient({ givenName: "jan", familyName: "De  Vries" })?.username,
    ).toBe("patient2");
  });

  it("binds a German PID, whose names are UPPERCASE (ICAO Doc 9303)", () => {
    expect(
      mapPidToPatient({ givenName: "MARIA", familyName: "SCHMIDT" })?.username,
    ).toBe("patient1");
    expect(
      mapPidToPatient({ givenName: "JAN", familyName: "DE VRIES" })?.username,
    ).toBe("patient2");
  });

  it("refuses a PID that belongs to nobody: no demo patient as a fallback", () => {
    expect(
      mapPidToPatient({ givenName: "Erika", familyName: "Mustermann" }),
    ).toBeNull();
    expect(mapPidToPatient({ givenName: "Maria" })).toBeNull();
    expect(mapPidToPatient({})).toBeNull();
  });

  it("never shows the verified name: the session carries the record's pseudonym (#475)", () => {
    const p = mapPidToPatient({ givenName: "Maria", familyName: "Schmidt" });
    expect(p?.displayName).not.toMatch(/Maria|Schmidt/);
    expect(p?.displayName).toMatch(/^Patient [0-9a-f]{8}$/);
  });

  it("the simulated approval signs in as patient1, at level low: no PID was shown", () => {
    expect(demoPatient()).toEqual({
      username: "patient1",
      displayName: patientPseudonym("P1"),
      roles: ["PATIENT"],
      assurance: "low",
    });
  });

  it("binds only the realm's patient personas, with the realm's names", () => {
    const realm = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "../jad/keycloak-realm.json"),
        "utf8",
      ),
    ) as {
      users: {
        username: string;
        firstName?: string;
        lastName?: string;
        realmRoles?: string[];
      }[];
    };
    for (const b of PID_BINDINGS) {
      const u = realm.users.find((x) => x.username === b.username);
      expect(u?.realmRoles).toContain("PATIENT");
      expect([u?.firstName, u?.lastName]).toEqual([b.givenName, b.familyName]);
    }
  });
});
