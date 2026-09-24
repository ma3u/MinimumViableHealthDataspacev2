/**
 * Where a login lands (issue #271): the four personas with an overview go
 * there, the rest keep the graph explorer.
 */
import { describe, it, expect } from "vitest";
import { DEMO_PERSONAS, landingFor } from "@/lib/auth";

describe("landingFor", () => {
  it("sends the four personas to the overview", () => {
    for (const p of ["patient", "researcher", "hdab", "hospital"]) {
      expect(landingFor(p)).toBe("/overview");
    }
  });

  it("keeps the graph explorer for the others", () => {
    expect(landingFor("edc-admin")).toBe("/graph?persona=edc-admin");
    expect(landingFor("trust-center")).toBe("/graph?persona=trust-center");
  });

  it("covers every demo persona", () => {
    for (const p of DEMO_PERSONAS) {
      expect(landingFor(p.personaId)).toMatch(/^\/(overview|graph\?persona=)/);
    }
    expect(
      DEMO_PERSONAS.filter((p) => landingFor(p.personaId) === "/overview"),
    ).toHaveLength(7);
  });
});
