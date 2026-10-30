/**
 * ACI confidential containers (ADR-069): the SEV-SNP report's HOST_DATA is
 * the SHA-256 of the group's ccePolicy, so per-workload evidence carries the
 * permit's policy hash itself. The workspace records that hash as checked by
 * hardware once Trustee released the key; Trustee's Azure resource policy
 * is rendered with each permit's hash; the loader checks HOST_DATA against
 * the policy file the UVM enforces.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { newExtractKey, seal } from "../src/crypto.js";
import type { Kbs } from "../src/kbs.js";
import { ingest, unlock, type WorkspacePort } from "../src/load.js";
import { hostDataMatchesPolicy, inspectPlatform } from "../src/platform.js";
import { SPES } from "../src/spes.js";
import { renderResourcePolicy } from "../src/trustee-policy.js";
import type { SpeAttestationRecord, SpeEventRecord } from "../src/workspace.js";
import { earToken, sampleJsonl } from "./helpers.js";

const CCE_POLICY = 'package policy\napi_version := "0.10.0"\n';
const HOST_DATA = createHash("sha256").update(CCE_POLICY).digest("hex");

function workspace() {
  const attestations: SpeAttestationRecord[] = [];
  const events: SpeEventRecord[] = [];
  const ws: WorkspacePort = {
    assertWorkspace: vi.fn().mockResolvedValue(undefined),
    currentLoadId: vi.fn().mockResolvedValue(null),
    writeExtract: vi.fn().mockResolvedValue({ nodes: 4, relationships: 2 }),
    emptyWorkspace: vi.fn().mockResolvedValue(0),
    applyFile: vi.fn().mockResolvedValue(1),
    countPatients: vi.fn().mockResolvedValue(2),
    recordAttestation: vi.fn(
      async (a: SpeAttestationRecord) => void attestations.push(a),
    ),
    recordEvents: vi.fn(async (e: SpeEventRecord[]) => void events.push(...e)),
  };
  return { ws, attestations, events };
}

async function runWith(token: string, released: boolean) {
  const key = newExtractKey();
  const envelope = seal(sampleJsonl("SPE-1"), key, {
    speId: "SPE-1",
    permitId: "permit-test",
    keyPath: "default/spe-1/extract-key",
    // Sealed before the ccePolicy existed.
    policyHash: null,
    createdAt: "2026-10-31T08:00:00.000Z",
  });
  const kbs: Kbs = {
    attest: vi.fn().mockResolvedValue(token),
    getResource: released
      ? vi.fn().mockResolvedValue(key)
      : vi.fn().mockRejectedValue(new Error("PolicyDeny")),
  };
  const { outcome, plaintext } = await unlock(envelope, { kbs, spe: SPES[1] });
  const { ws, attestations, events } = workspace();
  await ingest(outcome, plaintext, {
    workspace: ws,
    spe: SPES[1],
    runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
    cypherDir: "/n",
  });
  return { attestations, events };
}

describe("per-workload SNP evidence (ACI)", () => {
  it("takes the policy hash from HOST_DATA and marks it checked by hardware once the key came", async () => {
    const { attestations, events } = await runWith(
      earToken("snp", "affirming", { init_data: HOST_DATA, measurement: "aa" }),
      true,
    );
    expect(attestations.at(-1)).toMatchObject({
      teeType: "AMD SEV-SNP",
      attestationScope: "workload",
      simulated: false,
      label: "Attested: confidential workload",
      policyHash: `sha256:${HOST_DATA}`,
      policyCheckedByHardware: true,
      status: "ready",
    });
    expect(events.every((e) => e.policyHash === `sha256:${HOST_DATA}`)).toBe(
      true,
    );
  });

  it("does not call a refused workload's hash checked", async () => {
    const { attestations } = await runWith(
      earToken("snp", "affirming", { init_data: "00".repeat(32) }),
      false,
    );
    expect(attestations.at(-1)).toMatchObject({
      status: "refused",
      policyCheckedByHardware: false,
    });
  });
});

describe("renderResourcePolicy", () => {
  const template = readFileSync(
    resolve(__dirname, "../../../trustee/policies/resource-azure.rego.tmpl"),
    "utf8",
  );

  it("writes each permit's hash, without the prefix, into the committed template", () => {
    const out = renderResourcePolicy(template, {
      "spe-2": `sha256:${"b".repeat(64)}`,
      "spe-1": `sha256:${HOST_DATA}`,
    });
    expect(out).toContain(
      `permit_policy_hash := {\n\t"spe-1": "${HOST_DATA}",\n\t"spe-2": "${"b".repeat(
        64,
      )}",\n}`,
    );
    expect(out).not.toContain("permit_policy_hash := {}");
  });

  it("refuses a malformed hash or SPE name", () => {
    expect(() => renderResourcePolicy(template, { "spe-1": "abc" })).toThrow(
      /sha256/,
    );
    expect(() =>
      renderResourcePolicy(template, { x: `sha256:${HOST_DATA}` }),
    ).toThrow(/not an SPE/);
    expect(() => renderResourcePolicy(template, {})).toThrow(/no permit/);
  });
});

describe("the UVM's security context", () => {
  it("checks HOST_DATA against the policy file and records the files' digests", () => {
    const dir = mkdtempSync(join(tmpdir(), "uvm-"));
    writeFileSync(
      join(dir, "security-policy-base64"),
      Buffer.from(CCE_POLICY).toString("base64"),
    );
    writeFileSync(
      join(dir, "reference-info-base64"),
      Buffer.from("cose").toString("base64"),
    );
    const facts = inspectPlatform({
      UVM_SECURITY_CONTEXT_DIR: dir,
      SPE_SNP_DEVICE: "/nonexistent",
    });
    expect(facts.securityPolicySha256).toBe(HOST_DATA);
    expect(facts.referenceInfoSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(facts.hostAmdCertSha256).toBeNull();
    expect(hostDataMatchesPolicy(facts, HOST_DATA.toUpperCase())).toBe(true);
    expect(hostDataMatchesPolicy(facts, "00")).toBe(false);
    expect(hostDataMatchesPolicy(facts, null)).toBeNull();
  });
});
