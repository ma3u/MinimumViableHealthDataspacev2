/**
 * The sealed extract (ADR-068 decision 3): AES-256-GCM under a key per
 * permit, the header bound as additional data. What opens it is the one key
 * Trustee holds; anything else, including a header changed by one byte, gets
 * an error and not a byte of the plaintext.
 */
import { describe, expect, it } from "vitest";
import {
  ExtractKeyError,
  KEY_BYTES,
  newExtractKey,
  open,
  readHeader,
  seal,
} from "../src/crypto.js";
import { sampleJsonl } from "./helpers.js";

const meta = {
  speId: "SPE-2",
  permitId: "permit-test",
  keyPath: "default/spe-2/extract-key",
  policyHash: `sha256:${"a".repeat(64)}`,
  createdAt: "2026-10-31T08:00:00.000Z",
};

describe("seal and open", () => {
  it("round-trips an extract under its own key", () => {
    const key = newExtractKey();
    const plaintext = sampleJsonl();
    const envelope = seal(plaintext, key, meta);
    expect(envelope.includes(Buffer.from("Limburg Medical Centre"))).toBe(
      false,
    );
    const opened = open(envelope, key);
    expect(opened.plaintext.equals(plaintext)).toBe(true);
    expect(opened.header).toMatchObject({
      ...meta,
      alg: "AES-256-GCM",
      compression: "gzip",
    });
  });

  it("makes a new 32-byte key, different every time", () => {
    const a = newExtractKey();
    const b = newExtractKey();
    expect(a.length).toBe(KEY_BYTES);
    expect(a.equals(b)).toBe(false);
  });

  it("refuses a wrong key and returns nothing", () => {
    const envelope = seal(sampleJsonl(), newExtractKey(), meta);
    expect(() => open(envelope, newExtractKey())).toThrow(ExtractKeyError);
  });

  it("refuses a key of the wrong length", () => {
    const envelope = seal(sampleJsonl(), newExtractKey(), meta);
    expect(() => open(envelope, Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it("refuses an extract whose header was changed (it is the additional data)", () => {
    const key = newExtractKey();
    const envelope = seal(sampleJsonl(), key, meta);
    const tampered = Buffer.from(
      envelope.toString("latin1").replace("SPE-2", "SPE-1"),
      "latin1",
    );
    expect(readHeader(tampered).header.speId).toBe("SPE-1");
    expect(() => open(tampered, key)).toThrow(ExtractKeyError);
  });

  it("refuses an extract whose body was changed", () => {
    const key = newExtractKey();
    const envelope = seal(sampleJsonl(), key, meta);
    envelope[envelope.length - 20] ^= 0xff;
    expect(() => open(envelope, key)).toThrow(ExtractKeyError);
  });

  it("refuses something that is not a sealed extract", () => {
    expect(() => readHeader(Buffer.from("{}"))).toThrow(
      /not a sealed SPE extract/,
    );
  });
});
