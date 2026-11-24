import { describe, it, expect } from "vitest";
import {
  allAttestationTexts,
  attestationChecks,
  attestationLight,
  attestationInShort,
  hostDataMatchesPolicy,
  keyCustody,
} from "@/lib/attestation-explained";
import { MESSAGES } from "@/messages";

describe("attestation in plain words", () => {
  it("gives a different short answer for each verdict", () => {
    const heads = (["none", "fail", "refused", "pass"] as const).map(
      (v) => attestationInShort(v, false).headline,
    );
    expect(new Set(heads).size).toBe(4);
    expect(attestationInShort("pass", true).headline).toMatch(
      /no hardware vouched/,
    );
    expect(attestationInShort("pass", false).headline).toMatch(
      /processor proved/,
    );
  });

  it("compares HOST_DATA with the policy hash, with or without the prefix", () => {
    expect(hostDataMatchesPolicy("ABCD", "sha256:abcd")).toBe(true);
    expect(hostDataMatchesPolicy("abcd", "sha256:abce")).toBe(false);
    expect(hostDataMatchesPolicy(null, "sha256:abcd")).toBeNull();
  });

  it("names the open sovereignty gap for the hosted key broker", () => {
    const hosted = keyCustody(false)
      .rows.map((r) => r.text)
      .join(" ");
    expect(hosted).toMatch(/subscription owner could read/);
    expect(hosted).toMatch(/not in the cloud provider's key vault/);
    const demo = keyCustody(true)
      .rows.map((r) => r.text)
      .join(" ");
    expect(demo).toMatch(/never for real data/);
  });

  it("has every text in every language", () => {
    for (const lang of ["en", "de", "fr", "es", "nl"] as const) {
      const admin = MESSAGES[lang].admin as Record<string, string>;
      expect(
        allAttestationTexts().filter((x) => !admin[x]),
        lang,
      ).toEqual([]);
    }
  });
});

import {
  attestationChecks,
  attestationLight,
} from "@/lib/attestation-explained";

describe("the attestation traffic light", () => {
  const base = {
    verdict: "pass" as const,
    simulated: false,
    hostMatch: true,
    keyReleased: true,
  };
  it("is green only for hardware proof that matches the permit, with the key out", () => {
    expect(attestationLight(base)).toBe("green");
    expect(attestationLight({ ...base, simulated: true })).toBe("amber");
    expect(attestationLight({ ...base, hostMatch: null })).toBe("amber");
    expect(attestationLight({ ...base, keyReleased: false })).toBe("amber");
    expect(attestationLight({ ...base, verdict: "none" })).toBe("amber");
  });
  it("is red when the proof failed, the key was refused or the software differs", () => {
    expect(attestationLight({ ...base, verdict: "fail" })).toBe("red");
    expect(attestationLight({ ...base, verdict: "refused" })).toBe("red");
    expect(attestationLight({ ...base, hostMatch: false })).toBe("red");
  });
  it("marks the sovereignty gap of the hosted key as amber even when all else is green", () => {
    const checks = attestationChecks({ ...base, audited: true });
    expect(checks.map((c) => c.state)).toEqual([
      "ok",
      "ok",
      "ok",
      "warn",
      "ok",
    ]);
    expect(checks[3].text).toMatch(/hub's own subscription/);
  });
});
