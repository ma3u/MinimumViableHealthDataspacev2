/**
 * Art. 71 opt-out (ADR-062): the UI's copy of the secondary-use rewrite runs
 * the same vectors as the proxy's, so the two cannot drift.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  forRoles,
  isSecondaryUse,
  openOptOut,
  secondaryUseView,
} from "@/lib/opt-out";

const VECTORS = path.resolve(
  __dirname,
  "../../../../services/neo4j-proxy/__tests__/fixtures/opt-out-vectors.json",
);
const { vectors } = JSON.parse(readFileSync(VECTORS, "utf8")) as {
  vectors: { name: string; in: string; out: string }[];
};

describe("secondaryUseView (the proxy's vectors)", () => {
  it.each(vectors.map((v) => [v.name, v.in, v.out] as const))(
    "%s",
    (_name, input, expected) => {
      expect(secondaryUseView(input)).toBe(expected);
    },
  );
});

describe("which reads are secondary use", () => {
  it.each([
    [["DATA_USER"], true],
    [["HDAB_AUTHORITY"], true],
    [["TRUST_CENTER_OPERATOR"], true],
    [["DATA_USER", "EDC_USER_PARTICIPANT"], true],
    [["EDC_ADMIN"], false],
    [["DATA_HOLDER"], false],
    [["EDC_ADMIN", "DATA_USER"], false],
    [["PATIENT"], false],
    [[], false],
  ] as const)("%j → %s", (roles, expected) => {
    expect(isSecondaryUse(roles)).toBe(expected);
  });

  it("narrows a query only for secondary use", () => {
    const q = "MATCH (op:OMOPPerson) RETURN count(op)";
    expect(forRoles(q, ["DATA_USER"])).toContain("&!OptedOut");
    expect(forRoles(q, ["DATA_HOLDER"])).toBe(q);
  });
});

describe("openOptOut", () => {
  it("is the record without a reversal", () => {
    const closed = {
      optOutId: "a",
      optedOutAt: "2026-01-01",
      source: null,
      reversedAt: "2026-02-01",
      reversalSource: null,
    };
    const open = { ...closed, optOutId: "b", reversedAt: null };
    expect(openOptOut([closed])).toBeNull();
    expect(openOptOut([open, closed])?.optOutId).toBe("b");
  });
});
