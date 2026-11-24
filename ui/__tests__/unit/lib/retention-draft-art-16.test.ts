import { describe, it, expect } from "vitest";
import { retainUntil, retainUntilFor, retentionCypher } from "@/lib/retention";

const d = (s: string) => new Date(s);

describe("log retention, draft SPE act Art. 16(4) (#1236)", () => {
  const recorded = d("2026-06-01T00:00:00Z");

  it("keeps one year after the permit ends", () => {
    expect(retainUntilFor(recorded, d("2027-12-31T00:00:00Z"))).toEqual(
      d("2028-12-31T00:00:00Z"),
    );
  });

  it("never more than five years after the event", () => {
    expect(retainUntilFor(recorded, d("2035-01-01T00:00:00Z"))).toEqual(
      d("2031-06-01T00:00:00Z"),
    );
  });

  it("never less than one year after the event (Art. 73(1)(e))", () => {
    // A permit that had already ended when the event was recorded.
    expect(retainUntilFor(recorded, d("2026-01-01T00:00:00Z"))).toEqual(
      d("2027-06-01T00:00:00Z"),
    );
  });

  it("keeps one year without a permit end", () => {
    expect(retainUntilFor(recorded, null)).toEqual(retainUntil(recorded));
  });

  it("writes the same rule into the Cypher of a recorded event", () => {
    const c = retentionCypher("t", "permit");
    expect(c).toContain("permit.validUntil");
    expect(c).toContain("duration({years: 5})");
    expect(c).toContain("duration({years: 1})");
    expect(c).toMatch(/SET t\.retainUntil = toString\(CASE/);
  });
});
