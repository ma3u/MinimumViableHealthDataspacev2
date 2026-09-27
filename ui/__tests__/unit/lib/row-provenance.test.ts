import { describe, it, expect } from "vitest";
import { tagRows } from "@/lib/row-provenance";

/**
 * #358. The exchange lists merge control-plane, demo and bundled-mock rows,
 * while the detail routes ask the control plane alone, so the hub listed rows
 * that answered 502 when opened and nothing said which. Provenance is now on
 * every row.
 */
describe("tagRows", () => {
  it("marks control-plane rows openable", () => {
    const [row] = tagRows([{ "@id": "neg-1" }], "controlplane");
    expect(row.source).toBe("controlplane");
    expect(row.openable).toBe(true);
  });

  it.each(["demo", "mock"] as const)(
    "marks %s rows not openable, because the detail route cannot serve them",
    (source) => {
      const [row] = tagRows([{ "@id": "neg-1" }], source);
      expect(row.source).toBe(source);
      expect(row.openable).toBe(false);
    },
  );

  it("keeps the original fields", () => {
    const [row] = tagRows([{ "@id": "neg-1", state: "FINALIZED" }], "demo");
    expect(row["@id"]).toBe("neg-1");
    expect(row.state).toBe("FINALIZED");
  });

  it("does not mutate the input, which is a shared module-level fixture", () => {
    const input = [{ "@id": "neg-1" }] as Record<string, unknown>[];
    tagRows(input, "mock");
    expect(input[0]).not.toHaveProperty("source");
    expect(input[0]).not.toHaveProperty("openable");
  });

  it("returns an empty array unchanged", () => {
    expect(tagRows([], "controlplane")).toEqual([]);
  });
});
