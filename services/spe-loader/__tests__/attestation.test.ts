/**
 * What a workspace says about its attestation is read from Trustee's EAR
 * token: the TEE that produced the evidence decides teeType, the scope and
 * the label (ADR-068 decision 5), the worst ear.status of all submodules
 * decides whether it was affirming. The permit's policy hash is stable for
 * the same workload and changes with anything it covers.
 */
import { describe, expect, it } from "vitest";
import { describeEvidence, summariseToken } from "../src/attestation.js";
import { policyHash, workloadFrom } from "../src/policy-hash.js";
import { earToken } from "./helpers.js";

describe("summariseToken", () => {
  it("labels the sample attester as simulated", () => {
    const s = summariseToken(earToken("sample"));
    expect(s).toMatchObject({
      tee: "sample",
      teeType: "none",
      attestationScope: "none",
      simulated: true,
      label: "Simulated attestation",
      earStatus: "affirming",
      evidence: { svn: "1", launch_digest: "abcde" },
    });
  });

  it("labels Azure SEV-SNP vTPM evidence as an attested node and keeps the values to pin", () => {
    const s = summariseToken(
      earToken("az-snp-vtpm", "affirming", {
        measurement: "abc",
        tpm: { pcr11: "ff" },
      }),
    );
    expect(s).toMatchObject({
      teeType: "AMD SEV-SNP",
      attestationScope: "node",
      simulated: false,
      label: "Attested: SEV-SNP node",
      evidence: { measurement: "abc", "tpm.pcr11": "ff" },
    });
  });

  it("reports a warning token as such", () => {
    expect(summariseToken(earToken("sample", "warning")).earStatus).toBe(
      "warning",
    );
  });

  it("refuses something that is not a JWT", () => {
    expect(() => summariseToken("not-a-token")).toThrow(/not a JWT/);
  });

  it("builds the administration's attestation object from the token, never the TEE key", () => {
    const token = earToken("az-snp-vtpm", "affirming", {
      measurement: "AB12",
      reported_tcb_bootloader: 3,
      reported_tcb_tee: 0,
      reported_tcb_snp: 8,
      reported_tcb_microcode: 115,
      init_data: "00ff",
      report_data: "beef",
      tpm: { pcr00: "aa", pcr11: "bb", "not-a-pcr": "cc" },
    });
    const { record } = summariseToken(token);
    expect(record).toEqual({
      verifier: "az-snp-vtpm",
      result: "pass",
      evidenceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      tokenIssuedAt: "2026-10-31T00:00:00.000Z",
      tokenExpiresAt: "2026-10-31T00:05:00.000Z",
      policyId: null,
      claims: {
        tee: "az-snp-vtpm",
        measurement: "ab12",
        reportedTcb: "bootloader=3 tee=0 snp=8 microcode=115",
        hostData: "00ff",
        reportData: "beef",
        pcrs: { pcr00: "aa", pcr11: "bb" },
        vmId: null,
      },
      refusalReason: null,
    });
    expect(JSON.stringify(record)).not.toContain("tee-pubkey");
  });

  it("marks a warning token as a failed attestation, with nulls for what sample evidence lacks", () => {
    const { record } = summariseToken(earToken("sample", "warning"));
    expect(record.result).toBe("fail");
    expect(record.claims).toMatchObject({
      tee: "sample",
      measurement: null,
      pcrs: null,
      hostData: null,
    });
  });

  it("keeps workload-level evidence apart from node-level", () => {
    expect(describeEvidence("snp")).toMatchObject({
      attestationScope: "workload",
      label: "Attested: confidential workload",
    });
  });
});

describe("policyHash", () => {
  const deployment = {
    kind: "Deployment",
    spec: {
      template: {
        spec: {
          initContainers: [
            {
              name: "unlock",
              image: "acr/spe-loader@sha256:1",
              command: ["spe-loader", "unlock"],
              env: [{ name: "TRUSTEE_URL", value: "https://x" }],
            },
          ],
          containers: [
            {
              name: "neo4j",
              image: "acr/neo4j@sha256:2",
              env: [
                { name: "NEO4J_AUTH", value: "secret" },
                { name: "A", value: "1" },
              ],
            },
          ],
        },
      },
    },
  };

  it("is the same for the same workload, whatever the env values or their order", () => {
    const a = policyHash(workloadFrom(deployment));
    const changed = structuredClone(deployment);
    changed.spec.template.spec.containers[0].env = [
      { name: "A", value: "2" },
      { name: "NEO4J_AUTH", value: "another" },
    ];
    expect(policyHash(workloadFrom(changed))).toBe(a);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes with an image digest or a command", () => {
    const a = policyHash(workloadFrom(deployment));
    const image = structuredClone(deployment);
    image.spec.template.spec.containers[0].image = "acr/neo4j@sha256:3";
    const command = structuredClone(deployment);
    command.spec.template.spec.initContainers[0].command = ["sh"];
    expect(policyHash(workloadFrom(image))).not.toBe(a);
    expect(policyHash(workloadFrom(command))).not.toBe(a);
  });

  it("refuses a workload without containers", () => {
    expect(() => policyHash({ containers: [] })).toThrow();
  });
});
