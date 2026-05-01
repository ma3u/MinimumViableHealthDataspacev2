/**
 * Unit tests for GET /api/admin/components/[name]/diagnosis.
 *
 * The diagnosis catalogue is static (deterministic boot errors are more
 * useful than tailing logs that just keep printing the same exception),
 * so the tests focus on:
 *   - returning known issues from the catalogue with the right shape
 *   - falling back to a "no known issue" response for unknown apps
 *   - 401/403 auth gating
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";

import { GET } from "@/app/api/admin/components/[name]/diagnosis/route";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq() {
  return {} as unknown as import("next/server").NextRequest;
}

async function callGet(name: string) {
  const res = await GET(makeReq(), {
    params: Promise.resolve({ name }),
  });
  return { status: res.status, body: await res.json() };
}

describe("GET /api/admin/components/[name]/diagnosis", () => {
  it("returns 401 when not signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { status, body } = await callGet("mvhd-controlplane");
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the user does not have EDC_ADMIN", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { name: "x" },
      roles: ["DATA_USER"],
    } as never);
    const { status, body } = await callGet("mvhd-controlplane");
    expect(status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });

  it.each([
    "mvhd-controlplane",
    "mvhd-identityhub",
    "mvhd-issuerservice",
    "mvhd-dp-fhir",
    "mvhd-dp-omop",
    "mvhd-tenant-mgr",
    "mvhd-provision-mgr",
  ])("returns critical/warning diagnosis for %s", async (name) => {
    const { status, body } = await callGet(name);
    expect(status).toBe(200);
    expect(body.name).toBe(name);
    expect(["critical", "warning"]).toContain(body.severity);
    expect(body.summary).toBeTruthy();
    expect(body.cause).toBeTruthy();
    expect(body.remediation).toBeTruthy();
    expect(body.trackingIssue).toMatch(/^https:\/\//);
  });

  it("includes a bootError block for the controlplane port-collision case", async () => {
    const { body } = await callGet("mvhd-controlplane");
    expect(body.bootError).toMatch(/port 8081 already exists/i);
  });

  it("returns a healthy fallback for an unknown component name", async () => {
    const { status, body } = await callGet("mvhd-something-else");
    expect(status).toBe(200);
    expect(body.severity).toBe("healthy");
    expect(body.summary).toMatch(/no known boot issue/i);
    expect(body.bootError).toBeUndefined();
  });
});
