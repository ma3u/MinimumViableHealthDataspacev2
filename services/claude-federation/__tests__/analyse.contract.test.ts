import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderValues, vet, type AnalyseRequest } from "../src/analyse.js";

/**
 * The service against the wire contract in `contract/analyse-request.json`.
 *
 * The matching Swift test asserts the app produces the same file. Two tests
 * that never meet can both pass while the app talks to a server that rejects
 * it, and the only place that shows up is on a phone with no debugger attached.
 */
const CONTRACT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../contract/analyse-request.json",
);

const request = JSON.parse(readFileSync(CONTRACT, "utf8")) as AnalyseRequest;

describe("the analyse request contract", () => {
  it("accepts exactly the document the app sends", () => {
    const vetted = vet(request);
    expect(vetted.values).toHaveLength(3);
    expect(vetted.question).toBe("Was bedeuten diese Werte?");
  });

  it("carries the provenance of every value through to the prompt", () => {
    const rendered = renderValues(vet(request).values);
    // The model must be able to see which values were transcribed from a
    // photograph and might be misread.
    expect(rendered).toContain("preliminary");
    expect(rendered).toContain("final");
  });

  it("renders a value with no printed range as none printed, not as zero", () => {
    const rendered = renderValues(vet(request).values);
    expect(rendered).toContain("none printed");
    expect(rendered).not.toContain("< undefined");
  });

  it("keeps the lab's own range rather than inventing one", () => {
    const rendered = renderValues(vet(request).values);
    expect(rendered).toContain("< 116");
    expect(rendered).toContain("4 to 6");
  });

  it("the contract carries nothing that identifies a person", () => {
    // The same assertion the service makes at runtime, made against the
    // committed contract so the shape itself cannot drift into carrying one.
    const text = JSON.stringify(request).toLowerCase();
    for (const forbidden of [
      'name":',
      "birth",
      "geburts",
      "versicherten",
      "email",
      "patientid",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
