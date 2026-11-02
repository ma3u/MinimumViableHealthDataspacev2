/**
 * The access body sets Trustee's reference values through kbs-client; a list
 * of one is "one of", a scalar an exact value, and the type decides the flag.
 * The attestation policy replaces Trustee's default_cpu, and a TCB minimum
 * (ADR-073) is one integer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ATTESTATION_POLICY_ID,
  attestationPolicyArgs,
  checkMinimum,
  kbsErrorSummary,
  referenceValueArgs,
  referenceValueBody,
  type ReferenceValue,
} from "../src/kbs.js";

const TRUSTEE = resolve(__dirname, "../../../trustee");

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

  it("leaves a list of several values to the admin API", () => {
    const body = JSON.parse(referenceValueBody("snp_bootloader", [10, 12]));
    expect(body).toMatchObject({ version: "0.1.0", type: "sample" });
    expect(JSON.parse(Buffer.from(body.payload, "base64").toString())).toEqual({
      snp_bootloader: [10, 12],
    });
    expect(() => referenceValueBody("a b", [1, 2])).toThrow(/refusing/);
  });

  it("refuses more than one value and a name that is not an identifier", () => {
    expect(() =>
      referenceValueArgs("svn", ["1", "2"] as unknown as ReferenceValue),
    ).toThrow(/one value/);
    expect(() => referenceValueArgs("a b", "x")).toThrow(/refusing/);
  });
});

describe("attestationPolicyArgs", () => {
  it("sets the Rego policy Trustee evaluates for CPU evidence, default_cpu", () => {
    expect(ATTESTATION_POLICY_ID).toBe("default_cpu");
    expect(attestationPolicyArgs("/app/trustee/policies/x.rego")).toEqual([
      "set-attestation-policy",
      "--type",
      "rego",
      "--id",
      "default_cpu",
      "--policy-file",
      "/app/trustee/policies/x.rego",
    ]);
  });

  it("refuses an id that is not an identifier", () => {
    expect(() => attestationPolicyArgs("p.rego", "default cpu")).toThrow(
      /refusing/,
    );
  });
});

describe("checkMinimum", () => {
  it("takes a non-negative integer for a name ending in _min", () => {
    expect(() => checkMinimum("snp_bootloader_min", 10)).not.toThrow();
    expect(() => checkMinimum("snp_tee_svn_min", 0)).not.toThrow();
  });

  it("refuses a list, a string, a fraction or a negative number", () => {
    for (const bad of [[10], "10", 10.5, -1, true] as ReferenceValue[])
      expect(() => checkMinimum("snp_microcode_min", bad)).toThrow(
        /one non-negative integer/,
      );
  });

  it("leaves every other reference value alone", () => {
    expect(() => checkMinimum("snp_bootloader", [10, 12])).not.toThrow();
    expect(() => checkMinimum("snp_guest_abi_minor", "31")).not.toThrow();
  });

  it("goes to kbs-client as one integer, not a list of one", () => {
    expect(referenceValueArgs("snp_bootloader_min", 10)).toEqual([
      "set-sample-reference-value",
      "snp_bootloader_min",
      "10",
      "--as-integer",
      "--as-single-value",
    ]);
  });
});

describe("the committed attestation policy and example", () => {
  const policy = readFileSync(
    resolve(TRUSTEE, "policies/attestation-ear-cpu.rego"),
    "utf8",
  );
  const example = JSON.parse(
    readFileSync(resolve(TRUSTEE, "reference-values-aci.example.json"), "utf8"),
  ) as Record<string, ReferenceValue>;
  const minimums = [
    "snp_bootloader_min",
    "snp_microcode_min",
    "snp_snp_svn_min",
    "snp_tee_svn_min",
  ];

  it("asks for each minimum the example sets, and the example sets them as integers", () => {
    for (const name of minimums) {
      expect(policy).toContain(`"${name}"`);
      expect(() => checkMinimum(name, example[name])).not.toThrow();
    }
  });

  it("keeps the launch measurement a pinned list", () => {
    expect(policy).toContain(
      'input.snp.measurement in query_reference_value("snp_launch_measurement")',
    );
    expect(Array.isArray(example.snp_launch_measurement)).toBe(true);
  });
});
