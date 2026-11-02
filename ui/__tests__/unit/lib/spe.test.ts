/**
 * The presentation rules for the SPEs of ADR-068 (#774): which label an SPE
 * gets, which Trustee resource a permit opens, and whether hardware checks the
 * permit's policy hash.
 */
import { describe, it, expect } from "vitest";
import {
  attestationAnchor,
  attestationVerdict,
  permitBindings,
  permitHashCheck,
  policyCheckDepth,
  shortPolicyHash,
  speEventLabel,
  speLabelText,
  speLabelTone,
  trusteeResource,
  type SpeEntry,
  type SpeStatusResponse,
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
  it("reads each of the six event types", () => {
    expect(speEventLabel("spe.attestation")).toBe("Attestation");
    expect(speEventLabel("spe.key_release")).toBe("Key released");
    expect(speEventLabel("spe.key_refused")).toBe("Key refused");
    expect(speEventLabel("spe.workspace_loaded")).toBe("Workspace loaded");
    expect(speEventLabel("spe.workspace_destroyed")).toBe(
      "Workspace destroyed",
    );
    expect(speEventLabel("spe.optout_synced")).toBe(
      "Opt-outs synced (Art. 71)",
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

  it("reads the opt-out counts of spe.optout_synced, and only those", () => {
    expect(
      normaliseSpeEvent({
        id: "o1",
        eventType: "spe.optout_synced",
        optedOutAdded: 2,
        optedOutRemoved: { low: 1, high: 0 },
        optedOutInHub: "7",
      })?.optOut,
    ).toEqual({ added: 2, removed: 1, inHub: 7 });
    expect(
      normaliseSpeEvent({ id: "a1", eventType: "spe.attestation" })?.optOut,
    ).toBeNull();
  });

  it("drops anything that is not an SPE event", () => {
    expect(normaliseSpeEvent({ id: "q", resource: "{}" })).toBeNull();
    expect(normaliseSpeEvent({ eventType: "query" })).toBeNull();
    expect(normaliseSpeEvent({ resource: "not json" })).toBeNull();
  });
});

describe("permitHashCheck and permitBindings (#833)", () => {
  const spe = (over: Partial<SpeEntry>): SpeEntry => ({
    id: "SPE-1",
    holder: "AlphaKlinik Berlin",
    runsOn: "x",
    teeType: "none",
    attestationScope: "none",
    simulated: true,
    label: "Simulated attestation",
    attestedAt: null,
    keyReleasedAt: null,
    permitId: null,
    policyHash: null,
    policyCheckedByHardware: false,
    patients: null,
    status: "ready",
    ...over,
  });
  const A2 = {
    attestationScope: "workload" as const,
    simulated: false,
    policyCheckedByHardware: true,
  };

  it("hardware when the workspace's evidence says so (ACI: HOST_DATA)", () => {
    expect(permitHashCheck(spe(A2), "azure")).toEqual({
      kind: "hardware",
      depth: "A2",
      text: "Checked by hardware: HOST_DATA of the SEV-SNP report (A2)",
    });
  });

  it("on-start only for an ACI group ARM reports not running", () => {
    expect(
      permitHashCheck(
        spe({ armState: "Stopped", powerState: "stopped" }),
        "azure",
      ).kind,
    ).toBe("on-start");
    // No ARM state: not an ACI group (the proxy unwired, SPE-1 the hub graph).
    expect(permitHashCheck(spe({ powerState: "starting" }), "azure").kind).toBe(
      "recorded",
    );
    // A running group whose evidence is not A2 is reported as it is.
    expect(
      permitHashCheck(
        spe({ armState: "Running", powerState: "running" }),
        "azure",
      ).kind,
    ).toBe("recorded");
  });

  it("recorded only on the local stack, whatever the power state", () => {
    expect(
      permitHashCheck(spe({ powerState: "unreachable" }), "local"),
    ).toEqual({ kind: "recorded", depth: "M1", text: "Recorded only (M1)" });
  });

  it("takes the workspace's own record first, the hub's permit for the rest", () => {
    const own = `sha256:${"a".repeat(64)}`;
    const hub = `sha256:${"b".repeat(64)}`;
    const data: SpeStatusResponse = {
      environment: "azure",
      trustee: null,
      residualTrust: [],
      spes: [
        spe({ id: "SPE-1", permitId: "p-1", policyHash: own }),
        spe({ id: "SPE-2", armState: "Stopped", powerState: "stopped" }),
      ],
      permits: [
        {
          permitId: "p-1",
          name: "Permit one",
          status: "APPROVED",
          policyHash: hub,
          policyHashBySpe: { "SPE-1": hub, "SPE-2": hub },
          speWorkspaces: ["SPE-1", "SPE-2"],
          trusteeResources: [],
          recordedAt: null,
        },
      ],
    };
    const [one, two] = permitBindings(data);
    expect(one).toMatchObject({
      permitId: "p-1",
      permitName: "Permit one",
      policyHash: own,
      hashSource: "workspace",
      trusteeResource: "default/spe-1/extract-key",
    });
    expect(two).toMatchObject({
      permitId: "p-1",
      policyHash: hub,
      hashSource: "permit",
      trusteeResource: "default/spe-2/extract-key",
      check: { kind: "on-start" },
    });
  });

  it("finds a permit by its Trustee resource and gives none when there is none", () => {
    const data: SpeStatusResponse = {
      environment: "local",
      trustee: null,
      residualTrust: [],
      spes: [spe({ id: "SPE-2" }), spe({ id: "SPE-1" })],
      permits: [
        {
          permitId: "p-2",
          name: null,
          status: null,
          policyHash: `sha256:${"c".repeat(64)}`,
          policyHashBySpe: {},
          speWorkspaces: [],
          trusteeResources: ["default/spe-2/extract-key"],
          recordedAt: null,
        },
      ],
    };
    const [two, one] = permitBindings(data);
    expect(two.permitId).toBe("p-2");
    expect(two.hashSource).toBe("permit");
    expect(one).toMatchObject({
      permitId: null,
      policyHash: null,
      hashSource: null,
    });
  });
});
