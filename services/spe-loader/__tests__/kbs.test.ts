/**
 * The access body sets Trustee's reference values through kbs-client; a list
 * of one is "one of", a scalar an exact value, and the type decides the flag.
 */
import { describe, expect, it } from "vitest";
import {
  kbsErrorSummary,
  referenceValueArgs,
  type ReferenceValue,
} from "../src/kbs.js";

describe("kbsErrorSummary", () => {
  it("keeps the KBS error types and the final error, without colour codes", () => {
    const stderr = [
      "\u001b[33m WARN\u001b[0m kbs_protocol::client::token_client: Authenticating with KBS failed. ErrorInformation {",
      '    error_type: "https://github.com/confidential-containers/kbs/errors/TokenVerifierError",',
      '    detail: "Token Verifier error",',
      "}",
      "Error: request unauthorized",
    ].join("\n");
    expect(kbsErrorSummary(stderr)).toBe(
      "TokenVerifierError: Token Verifier error; Error: request unauthorized",
    );
  });
});

describe("referenceValueArgs", () => {
  it("passes a list of one string as a list", () => {
    expect(referenceValueArgs("launch_digest", ["abcde"])).toEqual([
      "set-sample-reference-value",
      "launch_digest",
      "abcde",
    ]);
  });

  it("passes a scalar integer as a single integer", () => {
    expect(referenceValueArgs("major_version", 1)).toEqual([
      "set-sample-reference-value",
      "major_version",
      "1",
      "--as-integer",
      "--as-single-value",
    ]);
  });

  it("passes a boolean as a bool", () => {
    expect(referenceValueArgs("smt_enabled", [true])).toContain("--as-bool");
  });

  it("refuses more than one value and a name that is not an identifier", () => {
    expect(() =>
      referenceValueArgs("svn", ["1", "2"] as unknown as ReferenceValue),
    ).toThrow(/one value/);
    expect(() => referenceValueArgs("a b", "x")).toThrow(/refusing/);
  });
});
