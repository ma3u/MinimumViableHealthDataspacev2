/**
 * Where a login lands (issue #271): the four personas with an overview go
 * there, every one of them.
 */
import { describe, it, expect } from "vitest";
import { DEMO_PERSONAS, landingFor } from "@/lib/auth";

describe("landingFor", () => {
  it("sends the four personas to the overview", () => {
    for (const p of ["patient", "researcher", "hdab", "hospital"]) {
      expect(landingFor(p)).toBe("/overview");
    }
  });

  it("sends the administrator and the trust centre operator there too", () => {
    expect(landingFor("edc-admin")).toBe("/overview");
    expect(landingFor("trust-center")).toBe("/overview");
  });

  it("covers every demo persona", () => {
    for (const p of DEMO_PERSONAS) {
      expect(landingFor(p.personaId)).toBe("/overview");
    }
  });
});
