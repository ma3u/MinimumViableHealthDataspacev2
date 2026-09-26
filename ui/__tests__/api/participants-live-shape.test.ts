/**
 * The two participant routes driven against a real HTTP Tenant Manager rather
 * than a mocked edcClient, with the exact payloads read from the Azure
 * deployment on 2026-09-26 (issue #203).
 *
 * The unit tests above mock `edcClient`, so they prove the logic but not that
 * it survives the wire format. This one starts a server, points EDC_TENANT_URL
 * at it, and checks that a tenant whose activities have been pending since
 * 2026-09-17 comes back labelled stalled.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";

// Auth is the only thing stubbed: these routes are behind a Keycloak session
// and this test is about the Tenant Manager, not about the guard.
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    session: { user: { id: "u" }, roles: ["EDC_ADMIN"], accessToken: "t" },
  }),
  isAuthError: () => false,
}));

/** Verbatim from `GET /api/v1alpha1/tenants` on mvhd-tenant-mgr. */
const TENANTS = [
  {
    id: "3ff36995-3fb0-4298-8daa-fb119565f1f9",
    version: 0,
    properties: {
      displayName: "Madrid Hospital",
      ehdsParticipantType: "data-holder",
      organization: "Madrid Hospital",
      role: "data-holder",
    },
  },
];

/** Verbatim from `GET .../participant-profiles`, pending for nine days. */
const PROFILES = [
  {
    id: "c4d96f14-d4bf-4cfc-a93c-cd88c0f0efef",
    version: 0,
    identifier: "",
    tenantId: "3ff36995-3fb0-4298-8daa-fb119565f1f9",
    participantRoles: {},
    vpas: [
      {
        id: "1644796b-6ee2-41e5-a882-01492c723ecd",
        version: 0,
        state: "pending",
        stateTimestamp: "2026-09-17T19:53:20.110489769Z",
        type: "cfm.connector",
        cellId: "89d97b22-9474-4223-a5bc-d5f7510e651b",
      },
      {
        id: "4c117f29-7e6b-41c5-a229-23338f517d17",
        version: 0,
        state: "pending",
        stateTimestamp: "2026-09-17T19:53:20.110491569Z",
        type: "cfm.credentialservice",
        cellId: "89d97b22-9474-4223-a5bc-d5f7510e651b",
      },
      {
        id: "d6953caf-f4e9-4cd0-a51d-090b3161429f",
        version: 0,
        state: "pending",
        stateTimestamp: "2026-09-17T19:53:20.110492969Z",
        type: "cfm.dataplane",
        cellId: "89d97b22-9474-4223-a5bc-d5f7510e651b",
      },
    ],
    error: false,
  },
];

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = req.url?.includes("/participant-profiles")
      ? PROFILES
      : TENANTS;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  process.env.EDC_TENANT_URL = `http://127.0.0.1:${port}/api`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("/api/participants/me against a real Tenant Manager", () => {
  it("labels the nine-day-old registration stalled, over the wire", async () => {
    const { GET } = await import("@/app/api/participants/me/route");
    const listed = await (await GET()).json();

    expect(listed).toHaveLength(1);
    expect(listed[0].properties.displayName).toBe("Madrid Hospital");
    expect(listed[0].vpaSummary.total).toBe(3);
    expect(listed[0].vpaSummary.pending).toBe(3);
    expect(listed[0].provisioningStalled).toBe(true);
    expect(listed[0].stalledReason).toContain("cfm.connector");
    expect(listed[0].stalledReason).toContain("no DID was registered");
  });
});
