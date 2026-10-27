import { describe, it, expect, afterEach, vi } from "vitest";
import {
  patientAssuranceFloor,
  patientAssuranceShortfall,
} from "@/lib/assurance";

afterEach(() => vi.unstubAllEnvs());

describe("patientAssuranceShortfall (#708)", () => {
  it("holds nobody to a floor while PATIENT_MIN_ASSURANCE is unset", () => {
    vi.stubEnv("PATIENT_MIN_ASSURANCE", "");
    expect(patientAssuranceFloor()).toBeNull();
    expect(patientAssuranceShortfall(["PATIENT"], "low")).toBeNull();
  });

  it("ignores a value that is not an eIDAS level", () => {
    vi.stubEnv("PATIENT_MIN_ASSURANCE", "medium");
    expect(patientAssuranceFloor()).toBeNull();
  });

  it("at substantial, a password sign-in falls short and a PID does not", () => {
    vi.stubEnv("PATIENT_MIN_ASSURANCE", "substantial");
    expect(patientAssuranceShortfall(["PATIENT"], "low")).toBe("substantial");
    expect(patientAssuranceShortfall(["PATIENT"], undefined)).toBe(
      "substantial",
    );
    expect(patientAssuranceShortfall(["PATIENT"], "substantial")).toBeNull();
    expect(patientAssuranceShortfall(["PATIENT"], "high")).toBeNull();
  });

  it("at high, substantial falls short", () => {
    vi.stubEnv("PATIENT_MIN_ASSURANCE", "high");
    expect(patientAssuranceShortfall(["PATIENT"], "substantial")).toBe("high");
  });

  it("applies to a person's own session only, not to a participant's", () => {
    vi.stubEnv("PATIENT_MIN_ASSURANCE", "substantial");
    expect(patientAssuranceShortfall(["DATA_USER"], "low")).toBeNull();
    expect(
      patientAssuranceShortfall(["PATIENT", "EDC_ADMIN"], "low"),
    ).toBeNull();
  });
});
