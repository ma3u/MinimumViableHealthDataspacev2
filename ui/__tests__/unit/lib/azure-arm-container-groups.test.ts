/**
 * The ARM helpers for the SPE workspaces' ACI container groups (ADR-072):
 * read the power state, start, stop, and an ArmError that carries the status
 * so a missing role (403) can be told apart. fetch is stubbed; the managed
 * identity endpoint and ARM are both answered by it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ArmError,
  getContainerGroupState,
  startContainerGroup,
  stopContainerGroup,
} from "@/lib/azure-arm";

const mockFetch = vi.fn();
const GROUP =
  "https://management.azure.com/subscriptions/sub-1/resourceGroups/rg-mvhd-dev/providers/Microsoft.ContainerInstance/containerGroups/mvhd-spe-1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function answer(arm: (url: string, init?: RequestInit) => Response) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("http://identity.test")) {
      return json({
        access_token: "token-1",
        expires_on: String(Math.floor(Date.now() / 1000) + 3600),
        resource: "https://management.azure.com/",
        token_type: "Bearer",
      });
    }
    return arm(url, init);
  });
}

describe("ACI container group helpers", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("IDENTITY_ENDPOINT", "http://identity.test/msi/token");
    vi.stubEnv("IDENTITY_HEADER", "header-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads the group's power state and its first running container's start", async () => {
    answer(() =>
      json({
        name: "mvhd-spe-1",
        properties: {
          provisioningState: "Succeeded",
          instanceView: { state: "Running" },
          containers: [
            {
              name: "spe-ingest",
              properties: {
                instanceView: {
                  currentState: {
                    state: "Running",
                    startTime: "2026-11-02T08:01:05Z",
                  },
                },
              },
            },
            {
              name: "neo4j",
              properties: {
                instanceView: {
                  currentState: {
                    state: "Running",
                    startTime: "2026-11-02T08:01:02Z",
                  },
                },
              },
            },
          ],
        },
      }),
    );
    const state = await getContainerGroupState(
      "sub-1",
      "rg-mvhd-dev",
      "mvhd-spe-1",
    );
    expect(state).toEqual({
      name: "mvhd-spe-1",
      provisioningState: "Succeeded",
      state: "Running",
      startedAt: "2026-11-02T08:01:02Z",
    });
    const armCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("https://management.azure.com"),
    )!;
    expect(armCall[0]).toBe(`${GROUP}?api-version=2023-05-01`);
    expect(
      (armCall[1] as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer token-1");
  });

  it("reports a stopped group with no start time", async () => {
    answer(() =>
      json({
        name: "mvhd-spe-1",
        properties: {
          provisioningState: "Succeeded",
          instanceView: { state: "Stopped" },
          containers: [{ name: "neo4j", properties: {} }],
        },
      }),
    );
    expect(
      await getContainerGroupState("sub-1", "rg-mvhd-dev", "mvhd-spe-1"),
    ).toMatchObject({ state: "Stopped", startedAt: null });
  });

  it("starts and stops with a POST to the group's start and stop actions", async () => {
    answer(() => new Response(null, { status: 202 }));
    await startContainerGroup("sub-1", "rg-mvhd-dev", "mvhd-spe-1");
    answer(() => new Response(null, { status: 204 }));
    await stopContainerGroup("sub-1", "rg-mvhd-dev", "mvhd-spe-1");
    const posts = mockFetch.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts.map((c) => c[0])).toEqual([
      `${GROUP}/start?api-version=2023-05-01`,
      `${GROUP}/stop?api-version=2023-05-01`,
    ]);
  });

  it("throws an ArmError carrying 403 when the identity lacks the role", async () => {
    answer(() =>
      json(
        {
          error: {
            code: "AuthorizationFailed",
            message: "does not have authorization to perform action",
          },
        },
        403,
      ),
    );
    const err = await startContainerGroup(
      "sub-1",
      "rg-mvhd-dev",
      "mvhd-spe-1",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArmError);
    expect((err as ArmError).status).toBe(403);
    expect((err as ArmError).message).toContain("AuthorizationFailed");
  });

  it("throws an ArmError carrying 404 for a group that does not exist", async () => {
    answer(() => json({ error: { code: "ResourceNotFound" } }, 404));
    const err = await getContainerGroupState(
      "sub-1",
      "rg-mvhd-dev",
      "mvhd-spe-9",
    ).catch((e: unknown) => e);
    expect((err as ArmError).status).toBe(404);
  });
});
