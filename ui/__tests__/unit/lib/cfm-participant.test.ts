import { describe, it, expect } from "vitest";
import { buildParticipantProfile, newDidSlug } from "@/lib/cfm-participant";

describe("newDidSlug", () => {
  it("makes an ASCII, lower-case path segment with a random suffix", () => {
    expect(newDidSlug("Institut de Recherche Santé")).toMatch(
      /^institut-de-recherche-sante-[0-9a-f]{6}$/,
    );
  });

  it("gives two registrations of the same name two DIDs", () => {
    expect(newDidSlug("AlphaKlinik Berlin")).not.toBe(
      newDidSlug("AlphaKlinik Berlin"),
    );
  });

  it("falls back when nothing usable is left of the name", () => {
    expect(newDidSlug("✱✱✱")).toMatch(/^participant-[0-9a-f]{6}$/);
  });
});

describe("buildParticipantProfile", () => {
  it("maps each EHDS type to the dataspace profile's role", () => {
    const roles = (t: string) =>
      buildParticipantProfile("s", "N", "p1", t).participantRoles.p1;
    expect(roles("data-holder")).toEqual(["provider"]);
    expect(roles("data-user")).toEqual(["consumer"]);
    expect(roles("health-data-access-body")).toEqual(["operator"]);
  });

  it("uses the EDC-layer DID base of the seeded participants", () => {
    expect(
      buildParticipantProfile("lmc-1a2b3c", "LMC", "p1", "data-holder")
        .identifier,
    ).toBe("did:web:identityhub%3A7083:lmc-1a2b3c");
  });
});
