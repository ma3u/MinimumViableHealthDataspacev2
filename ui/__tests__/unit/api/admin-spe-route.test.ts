/**
 * GET /api/admin/spe (#774, ADR-068): the confidential SPEs for the operator
 * and the access body.
 *
 * Passes the proxy's /spe/status through; when the proxy has none yet (404)
 * or cannot be reached, it answers from what the UI knows, asks the proxy
 * nothing else, and never claims an attestation it was not told about. The
 * real requireAuth() runs here, against the mocked getServerSession, so the
 * role gate is pinned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";

vi.unmock("@/lib/auth-guard");

import { GET } from "@/app/api/admin/spe/route";
import type { SpeStatusResponse } from "@/lib/spe";

const mockFetch = vi.fn();

const ADMIN = {
  user: { id: "admin-1", name: "Test Admin", email: "admin@test.example" },
  roles: ["EDC_ADMIN"],
};

const PROXY_STATUS: SpeStatusResponse = {
  environment: "azure",
  trustee: {
    url: "https://trustee.example",
    operator: "MedReg DE (access body)",
    verifier: "snp",
    reachable: true,
  },
  spes: [
    {
      id: "SPE-1",
      holder: "AlphaKlinik Berlin",
      runsOn: "ACI confidential container group mvhd-spe-1 (westeurope)",
      teeType: "AMD SEV-SNP",
      attestationScope: "workload",
      simulated: false,
      label: "Attested: confidential workload",
      attestedAt: "2026-10-30T07:00:00Z",
      keyReleasedAt: "2026-10-30T07:00:01Z",
      permitId: "hdab-medreg-pharmaco-2026-001",
      policyHash: "sha256:" + "a".repeat(64),
      policyCheckedByHardware: true,
      patients: 108,
      status: "ready",
    },
  ],
  residualTrust: [
    "AMD root of trust",
    "Microsoft utility VM image (measurement endorsed by Microsoft)",
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function proxyAnswers(routes: Record<string, () => Response | never>) {
  mockFetch.mockImplementation(async (url: string) => {
    for (const [path, answer] of Object.entries(routes)) {
      if (url.endsWith(path)) return answer();
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("GET /api/admin/spe", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(getServerSession).mockResolvedValue(ADMIN as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passes the proxy's /spe/status through unchanged", async () => {
    proxyAnswers({ "/spe/status": () => json(PROXY_STATUS) });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROXY_STATUS);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("names the caller to the proxy", async () => {
    proxyAnswers({ "/spe/status": () => json(PROXY_STATUS) });
    await GET();
    const init = mockFetch.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers["X-Participant"]).toMatch(/^did:web:/);
    expect(init.headers["X-Caller"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("falls back without asking the proxy anything else when it has no /spe/status (404)", async () => {
    proxyAnswers({ "/spe/status": () => json({ error: "Not found" }, 404) });
    const body = (await (await GET()).json()) as SpeStatusResponse;
    expect(body.fallback?.reason).toBe(
      "The query proxy has no /spe/status yet",
    );
    expect(body.environment).toBe("local");
    expect(body.trustee).toBeNull();
    expect(body.residualTrust).toEqual([]);
    expect(body.spes.map((s) => [s.id, s.holder, s.status])).toEqual([
      ["SPE-1", "AlphaKlinik Berlin", "unreachable"],
    ]);
    // No /federated/stats: it would write a TransferEvent per page visit.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/spe\/status$/);
  });

  it("lists SPE-2 in the fallback only when NEO4J_SPE2_CONFIGURED says so", async () => {
    proxyAnswers({ "/spe/status": () => json({}, 404) });
    for (const [value, ids] of [
      ["true", ["SPE-1", "SPE-2"]],
      ["1", ["SPE-1", "SPE-2"]],
      ["false", ["SPE-1"]],
      ["", ["SPE-1"]],
    ] as const) {
      vi.stubEnv("NEO4J_SPE2_CONFIGURED", value);
      const body = (await (await GET()).json()) as SpeStatusResponse;
      expect(
        body.spes.map((s) => s.id),
        `"${value}"`,
      ).toEqual(ids);
    }
    vi.stubEnv("NEO4J_SPE2_CONFIGURED", "true");
    const body = (await (await GET()).json()) as SpeStatusResponse;
    expect(body.spes[1].holder).toBe("Limburg Medical Centre");
  });

  it("never invents attested state in the fallback", async () => {
    vi.stubEnv("NEO4J_SPE2_CONFIGURED", "true");
    proxyAnswers({ "/spe/status": () => json({}, 404) });
    const body = (await (await GET()).json()) as SpeStatusResponse;
    expect(body.spes).toHaveLength(2);
    for (const spe of body.spes) {
      expect(spe.label).toBe("Simulated attestation");
      expect(spe.simulated).toBe(true);
      expect(spe.teeType).toBe("none");
      expect(spe.attestationScope).toBe("none");
      expect(spe.attestedAt).toBeNull();
      expect(spe.keyReleasedAt).toBeNull();
      expect(spe.permitId).toBeNull();
      expect(spe.policyHash).toBeNull();
      expect(spe.policyCheckedByHardware).toBe(false);
      expect(spe.patients).toBeNull();
      expect(spe.attestation).toBeNull();
    }
  });

  it("lists SPE-1 as unreachable when the proxy cannot be reached", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as SpeStatusResponse;
    expect(body.fallback?.reason).toBe("The query proxy is unreachable");
    expect(body.spes).toHaveLength(1);
    expect(body.spes[0]).toMatchObject({
      id: "SPE-1",
      status: "unreachable",
      label: "Simulated attestation",
    });
  });

  it("falls back when /spe/status answers in a shape it does not know", async () => {
    proxyAnswers({ "/spe/status": () => json({ hello: "world" }) });
    const body = (await (await GET()).json()) as SpeStatusResponse;
    expect(body.fallback?.reason).toMatch(/unknown shape/);
    expect(body.spes[0].status).toBe("unreachable");
  });

  it("says azure in the fallback on the Azure deployment", async () => {
    vi.stubEnv("DEPLOYMENT_TARGET", "azure");
    proxyAnswers({ "/spe/status": () => json({}, 503) });
    const body = (await (await GET()).json()) as SpeStatusResponse;
    expect(body.environment).toBe("azure");
    expect(body.fallback?.reason).toBe(
      "The query proxy's /spe/status answered 503",
    );
  });

  describe("the role gate", () => {
    it("answers 401 with { error } without a session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("answers 403 to a data user", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "r", email: "researcher@health-dataspace.local" },
        roles: ["DATA_USER"],
      } as never);
      const res = await GET();
      expect(res.status).toBe(403);
      expect(await res.json()).toHaveProperty("error");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("lets the access body in", async () => {
      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "h", email: "regulator@health-dataspace.local" },
        roles: ["HDAB_AUTHORITY"],
      } as never);
      proxyAnswers({ "/spe/status": () => json(PROXY_STATUS) });
      const res = await GET();
      expect(res.status).toBe(200);
      expect((await res.json()).spes[0].id).toBe("SPE-1");
    });
  });
});
