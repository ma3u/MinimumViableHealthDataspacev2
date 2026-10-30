/**
 * The presentation rules for the SPEs of ADR-068 (#774): which label an SPE
 * gets, which Trustee resource a permit opens, and whether hardware checks the
 * permit's policy hash.
 */
import { describe, it, expect } from "vitest";
import {
  attestationAnchor,
  attestationVerdict,
  policyCheckDepth,
  shortPolicyHash,
  speEventLabel,
  speLabelText,
  speLabelTone,
  trusteeResource,
} from "@/lib/spe";
import { normaliseSpeEvent } from "@/lib/spe-audit";

describe("speLabelTone", () => {
  it("follows the label the proxy sent", () => {
    expect(speLabelTone({ label: "Simulated attestation" })).toBe("simulated");
    expect(
      speLabelTone({ label: "Attested: SEV-SNP node", simulated: false }),
    ).toBe("node");
    expect(
      speLabelTone({
        label: "Attested: confidential workload",
        simulated: false,
      }),
    ).toBe("workload");
  });

  it("falls back to the fields, and to simulated when unclear", () => {
    expect(speLabelTone({ simulated: false, attestationScope: "node" })).toBe(
      "node",
    );
    expect(
      speLabelTone({ simulated: false, attestationScope: "workload" }),
    ).toBe("workload");
    expect(speLabelTone({ attestationScope: "node" })).toBe("simulated");
    expect(speLabelTone({ simulated: false, attestationScope: "none" })).toBe(
      "simulated",
    );
    expect(speLabelText({ label: "something new" })).toBe(
      "Simulated attestation",
    );
  });
});

describe("trusteeResource", () => {
  it("names the extract key of the SPE's workspace", () => {
    expect(trusteeResource("SPE-1")).toBe("default/spe-1/extract-key");
    expect(trusteeResource("SPE-2")).toBe("default/spe-2/extract-key");
  });
});

describe("shortPolicyHash", () => {
  it("keeps the algorithm and the first twelve hex characters", () => {
    const hash = "sha256:" + "0123456789abcdef".repeat(4);
    expect(shortPolicyHash(hash)).toBe("sha256:0123456789ab…");
  });

  it("leaves a short hash alone", () => {
    expect(shortPolicyHash("sha256:abc")).toBe("sha256:abc");
  });
});

describe("policyCheckDepth", () => {
  it("is recorded only at M1", () => {
    expect(
      policyCheckDepth({
        simulated: true,
        attestationScope: "none",
        policyCheckedByHardware: false,
      }),
    ).toEqual({ checked: false, depth: "M1", text: "Recorded only (M1)" });
  });

  it("is recorded only at A1, node-level evidence", () => {
    expect(
      policyCheckDepth({
        simulated: false,
        attestationScope: "node",
        policyCheckedByHardware: false,
      }).text,
    ).toBe("Recorded only (A1)");
  });

  it("is checked by hardware only at A2, workload evidence", () => {
    expect(
      policyCheckDepth({
        simulated: false,
        attestationScope: "workload",
        policyCheckedByHardware: true,
      }),
    ).toEqual({
      checked: true,
      depth: "A2",
      text: "Checked by hardware (A2, workload evidence)",
    });
  });

  it("does not believe a hardware check that node evidence cannot give", () => {
    expect(
      policyCheckDepth({
        simulated: false,
        attestationScope: "node",
        policyCheckedByHardware: true,
      }).checked,
    ).toBe(false);
  });
});

describe("attestationVerdict", () => {
  const evidence = {
    verifier: "sample",
    result: "pass" as const,
    evidenceDigest: null,
    tokenIssuedAt: null,
    tokenExpiresAt: null,
    policyId: null,
    claims: null,
    refusalReason: null,
  };

  it("is none without an attestation or a result", () => {
    expect(attestationVerdict({ attestation: null }).text).toBe(
      "No attestation recorded",
    );
    expect(attestationVerdict({}).verdict).toBe("none");
    expect(
      attestationVerdict({ attestation: { ...evidence, result: null } })
        .verdict,
    ).toBe("none");
  });

  it("tells a failed verification from a refused key", () => {
    expect(
      attestationVerdict({ attestation: { ...evidence, result: "fail" } })
        .verdict,
    ).toBe("fail");
    expect(
      attestationVerdict({
        attestation: { ...evidence, refusalReason: "policy" },
      }).verdict,
    ).toBe("refused");
    expect(
      attestationVerdict({ status: "refused", attestation: evidence }).text,
    ).toBe("Verified, key refused");
  });

  it("says whether the key was released after a pass", () => {
    expect(attestationVerdict({ attestation: evidence }).text).toBe("Verified");
    expect(
      attestationVerdict({
        attestation: evidence,
        keyReleasedAt: "2026-10-30T07:00:00Z",
      }).text,
    ).toBe("Verified, key released");
  });
});

describe("attestationAnchor", () => {
  it("is a stable fragment per SPE", () => {
    expect(attestationAnchor("SPE-1")).toBe("attestation-spe-1");
    expect(attestationAnchor("SPE 2")).toBe("attestation-spe-2");
  });
});

describe("speEventLabel", () => {
  it("reads each of the five event types", () => {
    expect(speEventLabel("spe.attestation")).toBe("Attestation");
    expect(speEventLabel("spe.key_release")).toBe("Key released");
    expect(speEventLabel("spe.key_refused")).toBe("Key refused");
    expect(speEventLabel("spe.workspace_loaded")).toBe("Workspace loaded");
    expect(speEventLabel("spe.workspace_destroyed")).toBe(
      "Workspace destroyed",
    );
    expect(speEventLabel("spe.unknown")).toBe("spe.unknown");
  });
});

describe("normaliseSpeEvent", () => {
  it("takes the fields from the node", () => {
    expect(
      normaliseSpeEvent({
        id: "e1",
        eventType: "spe.attestation",
        speId: "SPE-1",
        simulated: true,
        recorded: "2026-10-30T07:00:00Z",
      }),
    ).toMatchObject({
      id: "e1",
      eventType: "spe.attestation",
      speId: "SPE-1",
      simulated: true,
      permitId: null,
    });
  });

  it("takes them from the FHIR AuditEvent when the node does not carry them", () => {
    const event = normaliseSpeEvent({
      resource: JSON.stringify({
        id: "r1",
        recorded: "2026-10-30T07:00:00Z",
        entity: [
          {
            detail: [
              { type: "eventType", valueString: "spe.workspace_loaded" },
              { type: "speId", valueString: "SPE-2" },
              { type: "simulated", valueBoolean: false },
            ],
          },
        ],
      }),
    });
    expect(event).toMatchObject({
      id: "r1",
      eventType: "spe.workspace_loaded",
      speId: "SPE-2",
      simulated: false,
      recorded: "2026-10-30T07:00:00Z",
    });
  });

  it("drops anything that is not an SPE event", () => {
    expect(normaliseSpeEvent({ id: "q", resource: "{}" })).toBeNull();
    expect(normaliseSpeEvent({ eventType: "query" })).toBeNull();
    expect(normaliseSpeEvent({ resource: "not json" })).toBeNull();
  });
});
