// @vitest-environment node
/**
 * App Attest on the hub (ADR-054).
 *
 * The fixture is a real attestation object in Apple's shape, signed by a
 * throwaway root made for this test: Apple's own root signs only what a real
 * device sends. So every check runs, against a root the test can choose, and
 * the pinned Apple root is checked by its fingerprint separately.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { X509Certificate } from "crypto";
import fixture from "../../fixtures/app-attest.json";
import {
  AttestError,
  checkChallenge,
  clientData,
  decodeCbor,
  issueChallenge,
  verifyAttestation,
} from "@/lib/app-attest";
import { APPLE_APP_ATTEST_ROOT_CA } from "@/lib/apple-app-attest-root";

const previous = process.env.APP_ATTEST_SECRET;
beforeAll(() => {
  process.env.APP_ATTEST_SECRET = fixture.secret;
});
afterAll(() => {
  if (previous === undefined) delete process.env.APP_ATTEST_SECRET;
  else process.env.APP_ATTEST_SECRET = previous;
});

const valid = () => ({
  keyId: fixture.keyId,
  attestation: fixture.attestation,
  clientData: clientData(fixture.challenge, fixture.deviceId),
  root: fixture.rootPem,
  now: fixture.now,
});

function refused(input: Parameters<typeof verifyAttestation>[0]): string {
  try {
    verifyAttestation(input);
  } catch (err) {
    expect(err).toBeInstanceOf(AttestError);
    return (err as Error).message;
  }
  throw new Error("the attestation was accepted");
}

describe("the challenge", () => {
  it("is accepted by any replica until it expires, then refused", () => {
    const c = issueChallenge(1_000_000);
    expect(checkChallenge(c, 1_000_001)).toBe(true);
    expect(checkChallenge(c, 1_000_000 + 5 * 60_000 + 1)).toBe(false);
  });

  it("is refused when any part of it was changed", () => {
    const [expiry, nonce, mac] = issueChallenge(1_000_000).split(".");
    expect(checkChallenge(`${Number(expiry) + 1}.${nonce}.${mac}`, 1)).toBe(
      false,
    );
    expect(checkChallenge(`${expiry}.x${nonce}.${mac}`, 1)).toBe(false);
    expect(checkChallenge("not-a-challenge", 1)).toBe(false);
  });

  it("accepts the fixture's, which was made with the same secret", () => {
    expect(checkChallenge(fixture.challenge, fixture.now)).toBe(true);
  });
});

describe("an attestation", () => {
  it("is accepted when every step holds, and names its environment", () => {
    const result = verifyAttestation(valid());
    expect(result.environment).toBe("development");
    expect(result.publicKey).toContain("BEGIN PUBLIC KEY");
  });

  it("is refused for another challenge or another device", () => {
    expect(
      refused({
        ...valid(),
        clientData: clientData("other", fixture.deviceId),
      }),
    ).toMatch(/another challenge/);
    expect(
      refused({
        ...valid(),
        clientData: clientData(
          fixture.challenge,
          "11111111-2222-4333-8444-555555555555",
        ),
      }),
    ).toMatch(/another challenge/);
  });

  it("is refused when the chain does not lead to the root, as Apple's would not", () => {
    expect(refused({ ...valid(), root: APPLE_APP_ATTEST_ROOT_CA })).toMatch(
      /does not lead to Apple/,
    );
  });

  it("is refused for another app", () => {
    expect(
      refused({ ...valid(), appId: "OTHERTEAM.red.mabu.meinbefund" }),
    ).toMatch(/another app/);
  });

  it("is refused when the key id is not the certified key's", () => {
    const other = Buffer.alloc(32, 7).toString("base64");
    expect(refused({ ...valid(), keyId: other })).toMatch(/key id/);
  });

  it("is refused when a certificate is not valid at the time", () => {
    expect(refused({ ...valid(), now: Date.UTC(2000, 0, 1) })).toMatch(
      /not valid now/,
    );
  });

  it("is refused when it is not CBOR, or not App Attest", () => {
    expect(
      refused({
        ...valid(),
        attestation: Buffer.from("nope").toString("base64"),
      }),
    ).toBeTruthy();
    // {"fmt": "packed"}
    const packed = Buffer.from("a163666d74667061636b6564", "hex");
    expect(
      refused({ ...valid(), attestation: packed.toString("base64") }),
    ).toMatch(/not an App Attest/);
  });
});

describe("CBOR", () => {
  it("decodes the types an attestation object uses", () => {
    // {"a": [1, -2, h'ff', true, null]}
    const value = decodeCbor(Buffer.from("a1616185012141fff5f6", "hex"));
    expect(value).toBeInstanceOf(Map);
    expect((value as Map<unknown, unknown>).get("a")).toEqual([
      1,
      -2,
      Buffer.from([0xff]),
      true,
      null,
    ]);
  });

  it("refuses a length that runs past the end", () => {
    expect(() => decodeCbor(Buffer.from("5a000000ff00", "hex"))).toThrow(
      AttestError,
    );
  });
});

describe("the pinned Apple root", () => {
  it("is Apple's App Attestation Root CA, by its published fingerprint", () => {
    const root = new X509Certificate(APPLE_APP_ATTEST_ROOT_CA);
    expect(root.subject).toContain("Apple App Attestation Root CA");
    expect(root.fingerprint256).toBe(
      "1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32",
    );
  });
});
