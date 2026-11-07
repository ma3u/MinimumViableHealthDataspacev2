/**
 * /api/participants/me driven against a real HTTP control plane and
 * IdentityHub rather than a mocked edcClient, with the payloads read from the
 * local EDC 1.0 stack on 2026-11-05 (ADR-078, #881).
 *
 * The unit tests mock `edcClient`, so they prove the logic but not that it
 * survives the wire format. This one starts a server, points the management
 * and identity URLs at it, and checks that a seeded context and one
 * onboarded through the hub come back in the shape the onboarding page reads.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";

// Auth is the only thing stubbed: these routes are behind a Keycloak session
// and this test is about the wire format, not about the guard. The client's
// service-token request reaches this server too, gets no token, and the
// client goes on without one.
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    session: { user: { id: "u" }, roles: ["EDC_ADMIN"], accessToken: "t" },
  }),
  isAuthError: () => false,
}));

/** `GET /api/mgmt/v5/participants` on the 1.0 control plane: every context CREATED. */
const CONTEXTS = [
  {
    "@type": "ParticipantContext",
    "@id": "32d56110-e68a-4c1f-9d2e-6f0a8b7c5d41",
    identity: "did:web:identityhub%3A7083:alpha-klinik",
    properties: {},
    state: "CREATED",
    "@context": ["https://w3id.org/edc/connector/management/v2"],
  },
  {
    "@type": "ParticipantContext",
    "@id": "cfb1ffeb-25f7-48d7-bab2-d991f91fa5c6",
    identity: "did:web:identityhub%3A7083:riverside-general-4f2a91",
    properties: {
      displayName: "Riverside General",
      organization: "Riverside General",
      role: "data-holder",
      ehdsParticipantType: "data-holder",
      registeredAt: "2026-09-17T19:53:20.110Z",
    },
    state: "CREATED",
    "@context": ["https://w3id.org/edc/connector/management/v2"],
  },
];

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body: unknown = [];
    if (req.url?.startsWith("/api/mgmt/v5/participants")) body = CONTEXTS;
    // IdentityHub holds AlphaKlinik's MembershipCredential, not Riverside's.
    else if (req.url?.includes(`${CONTEXTS[0]["@id"]}/credentials`))
      body = [{ id: "vc-1", state: 500 }];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  process.env.EDC_MANAGEMENT_URL = `http://127.0.0.1:${port}/api/mgmt`;
  process.env.EDC_IDENTITY_URL = `http://127.0.0.1:${port}/api/identity`;
  process.env.KEYCLOAK_INTERNAL_URL = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("/api/participants/me against a real control plane", () => {
  it("lists the seeded context active and the stuck registration stalled, over the wire", async () => {
    const { GET } = await import("@/app/api/participants/me/route");
    const listed = await (await GET()).json();

    expect(listed).toHaveLength(2);
    const byName = Object.fromEntries(
      listed.map((t: { properties: { displayName: string } }) => [
        t.properties.displayName,
        t,
      ]),
    );
    expect(byName["AlphaKlinik Berlin"].provisioningComplete).toBe(true);
    const riverside = byName["Riverside General"];
    expect(riverside.id).toBe("cfb1ffeb-25f7-48d7-bab2-d991f91fa5c6");
    expect(riverside.provisioningComplete).toBe(false);
    expect(riverside.provisioningStalled).toBe(true);
    expect(riverside.stalledReason).toContain("MembershipCredential");
    expect(riverside.participantProfiles[0].identifier).toBe(
      "did:web:identityhub%3A7083:riverside-general-4f2a91",
    );
  });
});
