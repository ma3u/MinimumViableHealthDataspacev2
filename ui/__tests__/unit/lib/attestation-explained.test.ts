import { describe, it, expect } from "vitest";
import {
  allAttestationTexts,
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
