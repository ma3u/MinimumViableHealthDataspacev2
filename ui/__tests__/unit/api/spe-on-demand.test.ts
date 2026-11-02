/**
 * SPE workspaces start on demand (ADR-072).
 *
 *   - POST /api/admin/spe/power starts and stops the ACI groups through ARM,
 *     for the operator and the access body only; an ARM 403 is answered with
 *     the role the hub's identity lacks and the command that grants it;
 *   - GET /api/admin/spe adds each workspace's power state, and does not make
 *     the proxy wait for a workspace ARM reports stopped;
 *   - a federated query that needs a stopped workspace starts it (when the
 *     caller may) and is answered 503 with {error, spe: {id, state,
 *     etaSeconds}}, instead of waiting for it.
 *
 * The real requireAuth() runs against the mocked getServerSession. fetch is
 * stubbed: it answers the managed identity endpoint, ARM and the proxy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";

vi.unmock("@/lib/auth-guard");

vi.mock("@/lib/permit-gate", () => ({
  gateSecondaryUse: vi.fn(async () => ({ allowed: true, headers: {} })),
  activePermitHeaders: vi.fn(async () => ({})),
}));
vi.mock("@/lib/odrl-engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/odrl-engine")>()),
  resolveOdrlScope: vi.fn(async () => null),
}));

import { POST as POWER } from "@/app/api/admin/spe/power/route";
import { GET as SPE_STATUS } from "@/app/api/admin/spe/route";
import { GET as FEDERATED } from "@/app/api/federated/route";
import { POST as NLQ } from "@/app/api/nlq/route";
import { isSpeColdStart, type SpeStatusResponse } from "@/lib/spe";

const mockFetch = vi.fn();
const ARM =
  "https://management.azure.com/subscriptions/sub-1/resourceGroups/rg-mvhd-dev/providers/Microsoft.ContainerInstance/containerGroups/";

const session = (roles: string[]) => ({
  user: { id: "u-1", name: "Test", email: "test@test.example" },
  roles,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface World {
  /** ARM instanceView.state per group; missing = 404. */
  groups: Record<string, string>;
  /** Seconds since each running group's containers started. */
  startedAgo?: Record<string, number>;
  /** ARM answer to start/stop: 202, or 403 for a missing role. */
  powerStatus?: number;
  /** ARM answer to reading a group, when not 200. */
  readStatus?: number;
  proxy?: (url: string) => Response;
}

const posts: string[] = [];
const proxyCalls: string[] = [];

function world(w: World) {
  posts.length = 0;
  proxyCalls.length = 0;
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("http://identity.test")) {
      return json({
        access_token: "t",
        expires_on: String(Math.floor(Date.now() / 1000) + 3600),
        resource: "https://management.azure.com/",
        token_type: "Bearer",
      });
    }
    if (url.startsWith(ARM)) {
      const [name, action] = url.slice(ARM.length).split("?")[0].split("/");
      if (init?.method === "POST") {
        posts.push(`${action} ${name}`);
        const status = w.powerStatus ?? 202;
        return status === 403
          ? json({ error: { code: "AuthorizationFailed" } }, 403)
          : new Response(null, { status });
      }
      if (w.readStatus) return json({ error: {} }, w.readStatus);
      const state = w.groups[name];
      if (!state) return json({ error: { code: "ResourceNotFound" } }, 404);
      const ago = w.startedAgo?.[name];
      return json({
        name,
        properties: {
          provisioningState: "Succeeded",
          instanceView: { state },
          containers: [
            {
              name: "neo4j",
              properties:
                state === "Running"
                  ? {
                      instanceView: {
                        currentState: {
                          state: "Running",
                          startTime: new Date(
                            Date.now() - (ago ?? 3600) * 1000,
                          ).toISOString(),
                        },
                      },
                    }
                  : {},
            },
          ],
        },
      });
    }
    proxyCalls.push(url);
    return w.proxy ? w.proxy(url) : json({ ok: true });
  });
}

const BOTH_STOPPED = { "mvhd-spe-1": "Stopped", "mvhd-spe-2": "Stopped" };
const BOTH_RUNNING = { "mvhd-spe-1": "Running", "mvhd-spe-2": "Running" };

function powerRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/spe/power", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function onAzure() {
  vi.stubEnv("DEPLOYMENT_TARGET", "azure");
  vi.stubEnv("AZURE_SUBSCRIPTION_ID", "sub-1");
  vi.stubEnv("AZURE_RESOURCE_GROUP", "rg-mvhd-dev");
  vi.stubEnv("IDENTITY_ENDPOINT", "http://identity.test/msi/token");
  vi.stubEnv("IDENTITY_HEADER", "h");
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.mocked(getServerSession).mockResolvedValue(
    session(["EDC_ADMIN"]) as never,
  );
  onAzure();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/spe/power", () => {
  it("answers 401 with { error } without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeDefined();
  });

  it("answers 403 to a data user: only the operator and the access body press Start", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["DATA_USER"]) as never,
    );
    world({ groups: BOTH_STOPPED });
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-1" }));
    expect(res.status).toBe(403);
    expect(posts).toEqual([]);
  });

  it("refuses an unknown action or workspace with 400", async () => {
    world({ groups: BOTH_STOPPED });
    for (const body of [
      { action: "restart", spe: "SPE-1" },
      { action: "start", spe: "SPE-3" },
      {},
    ]) {
      const res = await POWER(powerRequest(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/must be/);
    }
    expect(posts).toEqual([]);
  });

  it("starts SPE-1 through ARM and answers 202 with the cold-start time", async () => {
    world({ groups: BOTH_STOPPED });
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-1" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      action: "start",
      spes: [
        {
          id: "SPE-1",
          group: "mvhd-spe-1",
          state: "starting",
          etaSeconds: 240,
        },
      ],
    });
    expect(posts).toEqual(["start mvhd-spe-1"]);
  });

  it("stops both for the access body", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["HDAB_AUTHORITY"]) as never,
    );
    world({ groups: BOTH_RUNNING, powerStatus: 204 });
    const res = await POWER(powerRequest({ action: "stop", spe: "all" }));
    expect(res.status).toBe(202);
    expect(
      (await res.json()).spes.map((s: { state: string }) => s.state),
    ).toEqual(["stopped", "stopped"]);
    expect(posts).toEqual(["stop mvhd-spe-1", "stop mvhd-spe-2"]);
  });

  it("says the hub's identity lacks the role, and names the command, on an ARM 403", async () => {
    world({ groups: BOTH_STOPPED, powerStatus: 403 });
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-2" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("system-assigned identity of mvhd-ui");
    expect(body.error).toContain("Azure Container Instances Contributor Role");
    expect(body.role).toBe("Azure Container Instances Contributor Role");
    expect(body.command).toContain(
      "az containerapp show -g rg-mvhd-dev -n mvhd-ui --query identity.principalId -o tsv",
    );
    expect(body.command).toContain("for g in mvhd-spe-1 mvhd-spe-2");
    expect(body.command).toContain(
      'az role assignment create --assignee-object-id "$UI_PRINCIPAL"',
    );
  });

  it("answers 404 for a group that does not exist", async () => {
    world({ groups: BOTH_STOPPED, powerStatus: 404 });
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-1" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("mvhd-spe-1");
  });

  it("answers 501 off Azure: locally the workspaces are compose services", async () => {
    vi.stubEnv("DEPLOYMENT_TARGET", "local");
    world({ groups: BOTH_STOPPED });
    const res = await POWER(powerRequest({ action: "start", spe: "SPE-1" }));
    expect(res.status).toBe(501);
    expect((await res.json()).error).toContain("docker compose");
    expect(posts).toEqual([]);
  });
});

describe("GET /api/admin/spe with the groups' power (ADR-072)", () => {
  const entry = (id: string, status: string) => ({
    id,
    holder: id === "SPE-1" ? "AlphaKlinik Berlin" : "Limburg Medical Centre",
    runsOn: `ACI confidential container group mvhd-spe-${id.slice(
      -1,
    )} (westeurope)`,
    teeType: "AMD SEV-SNP",
    attestationScope: "workload",
    simulated: false,
    label: "Attested: confidential workload",
    attestedAt: null,
    keyReleasedAt: null,
    permitId: null,
    policyHash: null,
    policyCheckedByHardware: true,
    patients: status === "ready" ? 108 : null,
    status,
    lastQueriedAt: id === "SPE-1" ? "2026-11-02T09:00:00.000Z" : null,
  });

  it("reports running, starting and stopped, and skips the stopped one at the proxy", async () => {
    world({
      groups: { "mvhd-spe-1": "Running", "mvhd-spe-2": "Stopped" },
      proxy: () =>
        json({
          environment: "azure",
          trustee: null,
          spes: [entry("SPE-1", "ready"), entry("SPE-2", "unreachable")],
          residualTrust: [],
        }),
    });
    const body = (await (await SPE_STATUS()).json()) as SpeStatusResponse;
    expect(proxyCalls).toHaveLength(1);
    expect(proxyCalls[0]).toMatch(/\/spe\/status\?skip=SPE-2$/);
    expect(
      body.spes.map((s) => [s.id, s.powerState, s.armState, s.lastQueriedAt]),
    ).toEqual([
      ["SPE-1", "running", "Running", "2026-11-02T09:00:00.000Z"],
      ["SPE-2", "stopped", "Stopped", null],
    ]);
    expect(body.power).toEqual({ available: true, reason: null });
  });

  it("calls a running group whose workspace is still loading starting", async () => {
    world({
      groups: BOTH_RUNNING,
      startedAgo: { "mvhd-spe-1": 60, "mvhd-spe-2": 60 },
      proxy: () =>
        json({
          environment: "azure",
          trustee: null,
          spes: [entry("SPE-1", "loading"), entry("SPE-2", "unreachable")],
          residualTrust: [],
        }),
    });
    const body = (await (await SPE_STATUS()).json()) as SpeStatusResponse;
    expect(body.spes.map((s) => s.powerState)).toEqual([
      "starting",
      "starting",
    ]);
    expect(proxyCalls[0]).toMatch(/\/spe\/status$/);
  });
});

describe("the cold start in front of a federated query (ADR-072)", () => {
  it("starts a stopped workspace for a data user and answers 503 with which and how long", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["DATA_USER"]) as never,
    );
    world({ groups: { "mvhd-spe-1": "Stopped", "mvhd-spe-2": "Running" } });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("240");
    const body = await res.json();
    expect(isSpeColdStart(body)).toBe(true);
    expect(body).toEqual({
      error:
        "SPE-1 is starting (cold start, about 3 to 4 minutes): attesting, releasing the key, loading the data. Try again in a few minutes.",
      spe: { id: "SPE-1", state: "starting", etaSeconds: 240 },
      spes: [{ id: "SPE-1", state: "starting", etaSeconds: 240 }],
      started: true,
    });
    expect(posts).toEqual(["start mvhd-spe-1"]);
    // Nobody waited for the proxy.
    expect(proxyCalls).toEqual([]);
  });

  it("starts nothing for a caller who may not, and says the workspace is stopped", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      session(["PATIENT"]) as never,
    );
    world({ groups: BOTH_STOPPED });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.spe).toEqual({
      id: "SPE-1",
      state: "stopped",
      etaSeconds: 240,
    });
    expect(body.spes.map((s: { id: string }) => s.id)).toEqual([
      "SPE-1",
      "SPE-2",
    ]);
    expect(body.started).toBe(false);
    expect(posts).toEqual([]);
  });

  it("answers a workspace that was just started as starting, with the time left", async () => {
    world({
      groups: BOTH_RUNNING,
      startedAgo: { "mvhd-spe-1": 3600, "mvhd-spe-2": 60 },
    });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.spe.id).toBe("SPE-2");
    expect(body.spe.state).toBe("starting");
    expect(body.spe.etaSeconds).toBeGreaterThanOrEqual(100);
    expect(body.spe.etaSeconds).toBeLessThanOrEqual(120);
    expect(posts).toEqual([]);
  });

  it("asks the proxy when both run", async () => {
    world({
      groups: BOTH_RUNNING,
      proxy: () => json({ speCount: 2, totals: { patients: 215 } }),
    });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).speCount).toBe(2);
    expect(proxyCalls[0]).toMatch(/\/federated\/stats$/);
  });

  it("goes on as before when ARM cannot tell (no role to read)", async () => {
    world({
      groups: BOTH_STOPPED,
      readStatus: 403,
      proxy: () => json({ speCount: 1, totals: { patients: 107 } }),
    });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(200);
    expect(posts).toEqual([]);
  });

  it("does not ask ARM off Azure", async () => {
    vi.stubEnv("DEPLOYMENT_TARGET", "local");
    world({ groups: BOTH_STOPPED, proxy: () => json({ speCount: 2 }) });
    const res = await FEDERATED(
      new NextRequest("http://localhost/api/federated"),
    );
    expect(res.status).toBe(200);
    expect(
      mockFetch.mock.calls.every((c) => !String(c[0]).startsWith(ARM)),
    ).toBe(true);
  });

  const nlq = (body: unknown) =>
    NLQ(
      new NextRequest("http://localhost/api/nlq", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    );

  it("gates a federated NLQ question", async () => {
    world({ groups: BOTH_STOPPED });
    const res = await nlq({ question: "How many patients?", federated: true });
    expect(res.status).toBe(503);
    expect((await res.json()).spe.id).toBe("SPE-1");
    expect(posts).toEqual(["start mvhd-spe-1", "start mvhd-spe-2"]);
    expect(proxyCalls).toEqual([]);
  });

  it("lets a question without federated reach the hub graph while the workspaces are stopped", async () => {
    world({
      groups: BOTH_STOPPED,
      proxy: () => json({ results: [], federated: false }),
    });
    const res = await nlq({ question: "Which datasets are there?" });
    expect(res.status).toBe(200);
    expect(posts).toEqual([]);
  });

  it("turns the proxy's failure on a template that asks every SPE into the cold-start answer", async () => {
    world({
      groups: BOTH_STOPPED,
      proxy: () => json({ error: "no answer within 5000 ms" }, 500),
    });
    const res = await nlq({ question: "How many SPEs can I access?" });
    expect(res.status).toBe(503);
    expect((await res.json()).spe.state).toBe("starting");
  });
});
