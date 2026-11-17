/**
 * The reference a bonus program's answer is tied to (#934 step 8, ADR-091).
 * The portal shows it and the neo4j-proxy sends it, from two copies of one
 * derivation; both run the same vectors, so they cannot drift apart.
 */
import { describe, it, expect } from "vitest";
import { memberReference } from "@/lib/patient/member-reference";
import fixture from "../../../../services/neo4j-proxy/__tests__/fixtures/member-reference-vectors.json";

describe("memberReference", () => {
  it.each(fixture.vectors)(
    "derives $memberReference from $consentId, as the proxy does",
    ({ consentId, memberReference: expected }) => {
      expect(memberReference(consentId)).toBe(expected);
    },
  );

  it("gives a new join a new reference", () => {
    expect(memberReference("consent-a")).not.toBe(memberReference("consent-b"));
  });

  it("does not contain the consent id it comes from", () => {
    const id = "3f2c9a1e-7b54-4d0e-9c1a-5e8f2b6d7a90";
    expect(memberReference(id).replace(/-/g, "").toLowerCase()).not.toContain(
      id.slice(0, 8),
    );
  });
});
