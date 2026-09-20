import { describe, expect, it } from "vitest";
import {
  MAX_VALUES,
  RefusedError,
  SYSTEM_PROMPT,
  renderValues,
  vet,
} from "../src/analyse.js";

const value = {
  label: "LDL-Cholesterin",
  value: 141,
  unit: "mg/dL",
  loinc: "2089-1",
  referenceHigh: 116,
  status: "preliminary" as const,
};

const consented = {
  consent: { provider: "anthropic" },
  values: [value],
  question: "Was bedeutet das?",
};

describe("vet", () => {
  it("refuses a request with no per-call consent naming the provider", () => {
    // Issue #186: on-device by default, cloud only by an explicit per-call act
    // with the provider named at the moment of use. A blanket setting
    // elsewhere cannot satisfy this, which is the point.
    expect(() => vet({ values: [value] })).toThrow(RefusedError);
    expect(() =>
      vet({ consent: { provider: "someone-else" }, values: [value] }),
    ).toThrow(/supported provider/);
  });

  it("accepts azure, the default, and anthropic, the opt-in", () => {
    // Azure is the only provider-paid option that keeps special category data
    // inside the EU data zone (ADR-033, issue #187).
    expect(vet({ ...consented, consent: { provider: "azure" } }).provider).toBe(
      "azure",
    );
    expect(vet(consented).provider).toBe("anthropic");
  });

  it("never substitutes the default for an unknown provider name", () => {
    // Quietly falling back would mean the consent the user gave and the
    // provider that answered were different things, which is the one property
    // this check exists to guarantee.
    expect(() =>
      vet({ ...consented, consent: { provider: "openai" } }),
    ).toThrow(/supported provider/);
  });

  it("accepts a consented request and returns only what may be sent", () => {
    const vetted = vet(consented);
    expect(vetted.values).toHaveLength(1);
    expect(vetted.question).toBe("Was bedeutet das?");
  });

  it("refuses a payload carrying anything that identifies a person", () => {
    // The local store holds no name, birth date or insurance number, so their
    // presence means a caller hand-built the request. Health values alone are
    // pseudonymous; these are what make a payload identifying.
    for (const field of [
      "name",
      "geburtsdatum",
      "versichertenNummer",
      "email",
    ]) {
      expect(() =>
        vet({
          consent: { provider: "anthropic" },
          values: [{ ...value, [field]: "x" } as never],
        }),
      ).toThrow(/identifies a person/);
    }
  });

  it("caps how much can leave in one request", () => {
    // Without a cap, "send the panel you want asked about" is one loop away
    // from "sync my record to a US API".
    const many = Array.from({ length: MAX_VALUES + 1 }, () => value);
    expect(() =>
      vet({ consent: { provider: "anthropic" }, values: many }),
    ).toThrow(/exceeds/);
  });

  it("refuses an empty selection rather than sending an empty question", () => {
    expect(() =>
      vet({ consent: { provider: "anthropic" }, values: [] }),
    ).toThrow(/no values/);
  });

  it("refuses a value with no unit or label", () => {
    expect(() =>
      vet({
        consent: { provider: "anthropic" },
        values: [{ ...value, unit: "" }],
      }),
    ).toThrow(/missing its unit or label/);
    expect(() =>
      vet({
        consent: { provider: "anthropic" },
        values: [{ ...value, label: "" }],
      }),
    ).toThrow(/missing its unit or label/);
  });

  it("accepts a quantity LOINC does not code", () => {
    // A bioimpedance scale's visceral fat mass has no LOINC term. Refusing it
    // here would mean a person could not ask about a reading their own device
    // produced, so only the unit and the label are required.
    const uncoded = {
      ...value,
      loinc: null,
      label: "Viszeralfett",
      unit: "kg",
    };
    expect(() =>
      vet({ consent: { provider: "anthropic" }, values: [uncoded] }),
    ).not.toThrow();
    // And the rendered prompt says no code rather than an empty one.
    const rendered = renderValues([uncoded]);
    expect(rendered).toContain("- Viszeralfett:");
    expect(rendered).not.toContain("LOINC");
  });

  it("refuses a non-finite number", () => {
    expect(() =>
      vet({
        consent: { provider: "anthropic" },
        values: [{ ...value, value: Number.NaN }],
      }),
    ).toThrow(/finite/);
  });
});

describe("the prompt states the intended purpose every time", () => {
  it("forbids diagnosis, risk scoring and prescribing", () => {
    // Qualification as a medical device turns almost entirely on the stated
    // intended purpose (MDCG 2019-11), and because these come from in-vitro
    // samples it is IVDR that would apply. So the purpose is stated in every
    // request rather than in a document nobody sends.
    expect(SYSTEM_PROMPT).toMatch(/do not diagnose/);
    expect(SYSTEM_PROMPT).toMatch(/do not estimate risk/);
    expect(SYSTEM_PROMPT).toMatch(/do not recommend treatment/);
  });

  it("binds the model to the lab's own printed range", () => {
    // ADR-033 rule 1: a reference range is lab and assay specific and is never
    // normalised away.
    expect(SYSTEM_PROMPT).toMatch(/Never substitute a range/);
  });

  it("tells the model which values were transcribed by OCR", () => {
    expect(SYSTEM_PROMPT).toMatch(/preliminary/);
  });
});

describe("renderValues", () => {
  it("carries the printed range and the provenance with every value", () => {
    const rendered = renderValues([value]);
    expect(rendered).toContain("LOINC 2089-1");
    expect(rendered).toContain("< 116");
    expect(rendered).toContain("preliminary");
  });

  it("says so when a value had no printed range, rather than inventing one", () => {
    const { referenceHigh, ...bare } = value;
    void referenceHigh;
    expect(renderValues([bare])).toContain("none printed");
  });
});
