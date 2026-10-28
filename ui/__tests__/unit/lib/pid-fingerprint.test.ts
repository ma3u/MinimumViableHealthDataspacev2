import { describe, it, expect, afterEach, vi } from "vitest";
import { pidFingerprint, pidLinkEnabled } from "@/lib/pid-fingerprint";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER = Buffer.alloc(32, 9).toString("base64");
const pid = {
  givenName: "Erika",
  familyName: "Mustermann",
  birthDate: "1964-08-12",
};

afterEach(() => vi.unstubAllEnvs());

describe("pidFingerprint (ADR-067)", () => {
  it("is a keyed hash that contains nothing of the PID", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    const fp = pidFingerprint(pid);
    expect(fp).toMatch(/^k1:[0-9a-f]{64}$/);
    expect(fp).not.toMatch(/erika|mustermann|1964/i);
  });

  it("is the same for the same person, whatever the case, accents or spaces", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    expect(
      pidFingerprint({
        givenName: " ERIKA ",
        familyName: "MUSTERMANN",
        birthDate: "1964-08-12",
      }),
    ).toBe(pidFingerprint(pid));
    expect(
      pidFingerprint({
        givenName: "José",
        familyName: "Núñez",
        birthDate: "1970-01-01",
      }),
    ).toBe(
      pidFingerprint({
        givenName: "JOSE",
        familyName: "NUNEZ",
        birthDate: "1970-01-01",
      }),
    );
  });

  it("tells apart two people with the same name and another birth date", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    expect(pidFingerprint({ ...pid, birthDate: "1964-08-13" })).not.toBe(
      pidFingerprint(pid),
    );
  });

  it("depends on the key, and names the key it used", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    const a = pidFingerprint(pid);
    vi.stubEnv("PID_FINGERPRINT_KEY", OTHER);
    vi.stubEnv("PID_FINGERPRINT_KEY_ID", "k2");
    const b = pidFingerprint(pid);
    expect(b).toMatch(/^k2:/);
    expect(b?.slice(3)).not.toBe(a?.slice(3));
  });

  it("is null without a birth date, a name or a key", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    expect(pidFingerprint({ ...pid, birthDate: undefined })).toBeNull();
    expect(pidFingerprint({ ...pid, givenName: undefined })).toBeNull();
    vi.stubEnv("PID_FINGERPRINT_KEY", "");
    expect(pidFingerprint(pid)).toBeNull();
    expect(pidLinkEnabled()).toBe(false);
  });

  it("refuses a key shorter than 256 bits", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", Buffer.alloc(16, 1).toString("base64"));
    expect(pidLinkEnabled()).toBe(false);
    expect(pidFingerprint(pid)).toBeNull();
  });
});
