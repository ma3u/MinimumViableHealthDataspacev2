/**
 * Art. 71 opt-out (ADR-062): the rewrite every secondary-use query passes
 * through, and the check before a resource is released.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  secondaryUseView,
  forSecondaryUse,
  runSecondaryUse,
  releasable,
  OPTED_OUT_LABEL,
} from "../src/opt-out.js";
import { QUERY_TEMPLATES } from "../src/nlq/engine.js";

const { vectors } = JSON.parse(
  readFileSync(
    new URL("./fixtures/opt-out-vectors.json", import.meta.url),
    "utf8",
  ),
) as { vectors: { name: string; in: string; out: string }[] };

describe("secondaryUseView", () => {
  it.each(vectors.map((v) => [v.name, v.in, v.out] as const))(
    "%s",
    (_name, input, expected) => {
      expect(secondaryUseView(input)).toBe(expected);
    },
  );

  it("is idempotent", () => {
    for (const v of vectors) {
      expect(secondaryUseView(secondaryUseView(v.in))).toBe(v.out);
    }
  });

  it("narrows every NLQ template that reads a person", () => {
    const person =
      /\(\s*\w*\s*:\s*(Patient|OMOPPerson|Condition|Observation|MedicationRequest|Encounter|OMOP\w+)\b/;
    const reading = QUERY_TEMPLATES.filter((t) => person.test(t.cypher));
    expect(reading.length).toBeGreaterThan(5);
    for (const t of reading) {
      const view = secondaryUseView(t.cypher);
      expect(view, t.name).toContain(`&!${OPTED_OUT_LABEL}`);
      expect(view, t.name).not.toMatch(person);
    }
  });
});

describe("the Art. 71(4) exception", () => {
  const q = "MATCH (p:Patient) RETURN count(p)";
  it("is the only way past the filter", () => {
    expect(forSecondaryUse(q)).toContain("&!OptedOut");
    expect(forSecondaryUse(q, {})).toContain("&!OptedOut");
    expect(forSecondaryUse(q, { art71Exception: false })).toContain(
      "&!OptedOut",
    );
    expect(forSecondaryUse(q, { art71Exception: true })).toBe(q);
  });

  it("runSecondaryUse hands the narrowed query to the session", async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    await runSecondaryUse({ run } as never, q, { a: 1 });
    expect(run).toHaveBeenCalledWith(
      "MATCH (p:(Patient)&!OptedOut) RETURN count(p)",
      { a: 1 },
    );
  });
});

describe("releasable", () => {
  it("drops a node that carries the marker", () => {
    expect(releasable({ labels: ["Patient"] })).toBe(true);
    expect(releasable({ labels: ["Patient", "OptedOut"] })).toBe(false);
    expect(releasable(null)).toBe(true);
  });
});
