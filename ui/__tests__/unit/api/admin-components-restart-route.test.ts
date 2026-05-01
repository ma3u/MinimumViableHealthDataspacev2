/**
 * Unit tests for POST /api/admin/components/[name]/restart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";

const mockListContainerApps = vi.fn();
const mockSetMin = vi.fn();
const mockRestart = vi.fn();
const mockIsAzure = vi.fn();
const mockSubId = vi.fn();
const mockRg = vi.fn();

vi.mock("@/lib/azure-arm", () => ({
  azureSubscriptionId: () => mockSubId(),
  azureResourceGroup: () => mockRg(),
  isAzureDeployment: () => mockIsAzure(),
  listContainerApps: (...a: unknown[]) => mockListContainerApps(...a),
  restartContainerApp: (...a: unknown[]) => mockRestart(...a),
  setContainerAppMinReplicas: (...a: unknown[]) => mockSetMin(...a),
}));

import { POST } from "@/app/api/admin/components/[name]/restart/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockSubId.mockReturnValue("sub-123");
  mockRg.mockReturnValue("rg-mvhd-dev");
  mockIsAzure.mockReturnValue(true);
  mockListContainerApps.mockResolvedValue([
    {
      name: "mvhd-controlplane",
      properties: { template: { scale: { minReplicas: 0 } } },
    },
  ]);
  mockSetMin.mockResolvedValue(undefined);
  mockRestart.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq() {
  return {} as unknown as import("next/server").NextRequest;
}

async function callPost(name: string) {
  const res = await POST(makeReq(), {
    params: Promise.resolve({ name }),
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/admin/components/[name]/restart", () => {
  it("returns 401 when not signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { status, body } = await callPost("mvhd-controlplane");
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when role is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "x" },
      roles: ["DATA_USER"],
    } as never);
    const { status } = await callPost("mvhd-controlplane");
    expect(status).toBe(403);
  });

  it("returns 400 for an unknown component name", async () => {
    const { status, body } = await callPost("mvhd-not-real");
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unknown component/i);
  });

  it("returns 400 when not on Azure", async () => {
    mockIsAzure.mockReturnValue(false);
    const { status, body } = await callPost("mvhd-controlplane");
    expect(status).toBe(400);
    expect(body.error).toMatch(/only available on Azure/i);
  });

  it("returns 500 when subscription/resource-group are unset", async () => {
    mockSubId.mockReturnValue(null);
    const { status } = await callPost("mvhd-controlplane");
    expect(status).toBe(500);
  });

  it("scales up min-replicas before restarting when currently 0", async () => {
    const { status, body } = await callPost("mvhd-controlplane");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.scaledUp).toBe(true);
    expect(mockSetMin).toHaveBeenCalledWith(
      "sub-123",
      "rg-mvhd-dev",
      "mvhd-controlplane",
      1,
    );
    expect(mockRestart).toHaveBeenCalledWith(
      "sub-123",
      "rg-mvhd-dev",
      "mvhd-controlplane",
    );
  });

  it("does not scale up when min-replicas is already > 0", async () => {
    mockListContainerApps.mockResolvedValue([
      {
        name: "mvhd-controlplane",
        properties: { template: { scale: { minReplicas: 1 } } },
      },
    ]);
    const { status, body } = await callPost("mvhd-controlplane");
    expect(status).toBe(200);
    expect(body.scaledUp).toBe(false);
    expect(mockSetMin).not.toHaveBeenCalled();
    expect(mockRestart).toHaveBeenCalled();
  });

  it("returns 502 when the ARM call throws", async () => {
    mockRestart.mockRejectedValue(new Error("ARM 403 AuthorizationFailed"));
    const { status, body } = await callPost("mvhd-controlplane");
    expect(status).toBe(502);
    expect(body.error).toBe("Restart failed");
    expect(body.detail).toMatch(/AuthorizationFailed/);
  });
});
