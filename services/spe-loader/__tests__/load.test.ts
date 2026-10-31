/**
 * No key, no data (ADR-068 decision 2): a workspace is loaded only after
 * Trustee released the key, and the key opened the extract. An attestation
 * that fails, a key Trustee refuses and a key that does not open the extract
 * all end with the refusal on record and nothing of the permit's data in
 * the workspace.
 */
import { describe, expect, it, vi } from "vitest";
import { newExtractKey, seal } from "../src/crypto.js";
import { KbsError, type Kbs } from "../src/kbs.js";
import { ingest, unlock, type WorkspacePort } from "../src/load.js";
import { SPES } from "../src/spes.js";
import type { SpeAttestationRecord, SpeEventRecord } from "../src/workspace.js";
import { earToken, sampleJsonl } from "./helpers.js";

const SPE2 = SPES[2];

function sealed(key: Buffer, speId = "SPE-2") {
  return seal(sampleJsonl(speId as "SPE-2"), key, {
    speId,
    permitId: "permit-test",
    keyPath: `default/spe-${speId.slice(-1)}/extract-key`,
    policyHash: `sha256:${"a".repeat(64)}`,
    createdAt: "2026-10-31T08:00:00.000Z",
  });
}

function fakeKbs(over: Partial<Kbs> = {}): Kbs {
  return {
    attest: vi.fn().mockResolvedValue(earToken("sample")),
    getResource: vi.fn(),
    ...over,
  };
}

function fakeWorkspace() {
  const attestations: SpeAttestationRecord[] = [];
  const events: SpeEventRecord[] = [];
  const ws: WorkspacePort & {
    attestations: typeof attestations;
    events: typeof events;
  } = {
    attestations,
    events,
    assertWorkspace: vi.fn().mockResolvedValue(undefined),
    currentLoadId: vi.fn().mockResolvedValue(null),
    writeExtract: vi.fn().mockResolvedValue({ nodes: 4, relationships: 2 }),
    emptyWorkspace: vi.fn().mockResolvedValue(0),
    applyFile: vi.fn().mockResolvedValue(3),
    countPatients: vi.fn().mockResolvedValue(0),
    recordAttestation: vi.fn(async (a: SpeAttestationRecord) => {
      attestations.push(a);
    }),
    recordEvents: vi.fn(async (e: SpeEventRecord[]) => {
      events.push(...e);
    }),
  };
  return ws;
}

const ingestDeps = (workspace: WorkspacePort) => ({
  workspace,
  spe: SPE2,
  runsOn: "test",
  cypherDir: "/repo/neo4j",
});

describe("unlock and ingest", () => {
  it("loads the workspace once the key is released and opens the extract", async () => {
    const key = newExtractKey();
    const kbs = fakeKbs({
      getResource: vi.fn().mockResolvedValue(Buffer.from(key)),
    });
    const { outcome, plaintext } = await unlock(sealed(key), {
      kbs,
      spe: SPE2,
    });
    expect(outcome.ok).toBe(true);
    expect(kbs.getResource).toHaveBeenCalledWith(
      "default/spe-2/extract-key",
      expect.any(String),
    );

    const ws = fakeWorkspace();
    vi.mocked(ws.countPatients).mockResolvedValue(2);
    const res = await ingest(outcome, plaintext, ingestDeps(ws));
    expect(res).toEqual({
      status: "ready",
      patients: 2,
      nodes: 4,
      relationships: 2,
    });
    expect(ws.writeExtract).toHaveBeenCalledOnce();
    expect(vi.mocked(ws.applyFile).mock.calls.map((c) => c[0])).toEqual([
      "/repo/neo4j/init-schema.cypher",
      "/repo/neo4j/register-fhir-dataset-hdcatap-spe2.cypher",
    ]);
    expect(ws.events.map((e) => e.type)).toEqual([
      "spe.attestation",
      "spe.key_release",
      "spe.workspace_loaded",
    ]);
    const last = ws.attestations.at(-1)!;
    expect(last).toMatchObject({
      speId: "SPE-2",
      holder: "Limburg Medical Centre",
      status: "ready",
      simulated: true,
      teeType: "none",
      attestationScope: "none",
      label: "Simulated attestation",
      policyCheckedByHardware: false,
      patients: 2,
      permitId: "permit-test",
    });
    expect(last.keyReleasedAt).not.toBeNull();
    for (const e of ws.events) {
      expect(e).toMatchObject({
        speId: "SPE-2",
        permitId: "permit-test",
        policyHash: `sha256:${"a".repeat(64)}`,
        simulated: true,
      });
    }
  });

  it("loads nothing when the attestation fails", async () => {
    const kbs = fakeKbs({
      attest: vi
        .fn()
        .mockRejectedValue(new KbsError("PolicyDeny: evidence refused", true)),
      getResource: vi.fn(),
    });
    const { outcome, plaintext } = await unlock(sealed(newExtractKey()), {
      kbs,
      spe: SPE2,
      attempts: 5,
      sleep: vi.fn(),
    });
    expect(outcome).toMatchObject({ ok: false, stage: "attestation" });
    expect(plaintext).toBeNull();
    expect(kbs.attest).toHaveBeenCalledOnce();
    expect(kbs.getResource).not.toHaveBeenCalled();

    const ws = fakeWorkspace();
    const res = await ingest(outcome, plaintext, ingestDeps(ws));
    expect(res.status).toBe("refused");
    expect(ws.writeExtract).not.toHaveBeenCalled();
    expect(ws.applyFile).not.toHaveBeenCalled();
    expect(ws.emptyWorkspace).toHaveBeenCalledOnce();
    expect(ws.attestations.at(-1)).toMatchObject({
      status: "refused",
      keyReleasedAt: null,
    });
    expect(ws.attestations.at(-1)?.attestation).toMatchObject({
      verifier: null,
      result: "fail",
      claims: { tee: null, measurement: null },
      refusalReason: expect.stringContaining("attestation failed"),
    });
    expect(ws.events.map((e) => e.type)).toEqual(["spe.key_refused"]);
  });

  it("loads nothing when Trustee refuses the key (a warning token)", async () => {
    const kbs = fakeKbs({
      attest: vi.fn().mockResolvedValue(earToken("sample", "warning")),
      getResource: vi
        .fn()
        .mockRejectedValue(new KbsError("Access denied by policy", true)),
    });
    const { outcome, plaintext } = await unlock(sealed(newExtractKey()), {
      kbs,
      spe: SPE2,
    });
    expect(outcome).toMatchObject({ ok: false, stage: "key" });
    expect(outcome.attestation?.earStatus).toBe("warning");
    expect(plaintext).toBeNull();

    const ws = fakeWorkspace();
    await ingest(outcome, plaintext, ingestDeps(ws));
    expect(ws.writeExtract).not.toHaveBeenCalled();
    expect(ws.events.map((e) => [e.type, e.outcome])).toEqual([
      ["spe.attestation", "refused"],
      ["spe.key_refused", "refused"],
    ]);
  });

  it("loads nothing when the released key does not open the extract", async () => {
    const kbs = fakeKbs({
      getResource: vi.fn().mockResolvedValue(newExtractKey()),
    });
    const { outcome, plaintext } = await unlock(sealed(newExtractKey()), {
      kbs,
      spe: SPE2,
    });
    expect(outcome).toMatchObject({ ok: false, stage: "decrypt" });
    expect(plaintext).toBeNull();
    const ws = fakeWorkspace();
    await ingest(outcome, plaintext, ingestDeps(ws));
    expect(ws.writeExtract).not.toHaveBeenCalled();
    expect(ws.attestations.at(-1)?.status).toBe("refused");
  });

  it("waits for a Trustee that does not answer yet, and never retries a refusal", async () => {
    const key = newExtractKey();
    const attest = vi
      .fn()
      .mockRejectedValueOnce(new KbsError("connection refused", false))
      .mockRejectedValueOnce(new KbsError("connection refused", false))
      .mockResolvedValue(earToken("sample"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const kbs = fakeKbs({
      attest,
      getResource: vi.fn().mockResolvedValue(key),
    });
    const { outcome } = await unlock(sealed(key), {
      kbs,
      spe: SPE2,
      attempts: 5,
      intervalMs: 15000,
      sleep,
    });
    expect(outcome.ok).toBe(true);
    expect(attest).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(15000);
  });

  it("refuses an extract meant for the other SPE before asking Trustee", async () => {
    const kbs = fakeKbs();
    await expect(
      unlock(sealed(newExtractKey(), "SPE-1"), { kbs, spe: SPE2 }),
    ).rejects.toThrow(/SPE-1's/);
    expect(kbs.attest).not.toHaveBeenCalled();
  });

  it("does not load the same unlock twice", async () => {
    const key = newExtractKey();
    const kbs = fakeKbs({ getResource: vi.fn().mockResolvedValue(key) });
    const { outcome, plaintext } = await unlock(sealed(key), {
      kbs,
      spe: SPE2,
    });
    const ws = fakeWorkspace();
    vi.mocked(ws.currentLoadId).mockResolvedValue(outcome.loadId);
    expect(await ingest(outcome, plaintext, ingestDeps(ws))).toEqual({
      status: "unchanged",
    });
    expect(ws.writeExtract).not.toHaveBeenCalled();
  });

  it("labels Azure SEV-SNP vTPM evidence as an attested node, not simulated", async () => {
    const key = newExtractKey();
    const kbs = fakeKbs({
      attest: vi
        .fn()
        .mockResolvedValue(
          earToken("az-snp-vtpm", "affirming", { measurement: "m1" }),
        ),
      getResource: vi.fn().mockResolvedValue(key),
    });
    const { outcome, plaintext } = await unlock(sealed(key), {
      kbs,
      spe: SPE2,
    });
    const ws = fakeWorkspace();
    await ingest(outcome, plaintext, ingestDeps(ws));
    expect(ws.attestations.at(-1)).toMatchObject({
      teeType: "AMD SEV-SNP",
      attestationScope: "node",
      simulated: false,
      label: "Attested: SEV-SNP node",
    });
  });
});
