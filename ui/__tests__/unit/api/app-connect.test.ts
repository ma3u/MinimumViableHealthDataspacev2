// @vitest-environment node
/**
 * Connecting the Klarbefund app from the patient screen (#473, ADR-049).
 *
 * Signed with a key made here, in place of the realm's: `createRemoteJWKSet`
 * is swapped for a local key set, so every check the hub makes on a real
 * Keycloak token runs, and the token's claims are whatever the case needs.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";
import { getServerSession } from "next-auth/next";

const keys: { get?: JWTVerifyGetKey } = {};
vi.mock("jose", async (original) => ({
  ...(await original<typeof import("jose")>()),
  createRemoteJWKSet: () =>
    ((...args: Parameters<JWTVerifyGetKey>) =>
      keys.get!(...args)) as JWTVerifyGetKey,
}));

const mockRunQuery = vi.fn();

/**
 * The `(:AppPairing)` nodes, as Neo4j would hold them for every replica of
 * the UI. Pairing queries go here; every other query goes to mockRunQuery,
 * so the cases below set the connection rows as before.
 */
type PairingRow = {
  id: string;
  username: string;
  expiresAt: number;
  deviceId?: string;
  deviceName?: string;
};
const pairingRows = new Map<string, PairingRow>();
function pairingQuery(cypher: string, p: Record<string, unknown>) {
  const row = pairingRows.get(p.id as string);
  const own = row && row.username === p.username ? row : undefined;
  if (cypher.trimStart().startsWith("MERGE (p:AppPairing")) {
    for (const [id, r] of pairingRows) {
      if (r.expiresAt < (p.sweepBefore as number)) pairingRows.delete(id);
    }
    if (!row) {
      pairingRows.set(p.id as string, {
        id: p.id as string,
        username: p.username as string,
        expiresAt: p.expiresAt as number,
      });
    }
    return [];
  }
  if (cypher.includes("SET p.deviceId")) {
    if (own)
      Object.assign(own, { deviceId: p.deviceId, deviceName: p.deviceName });
    return [];
  }
  return own ? [{ deviceId: null, deviceName: null, ...own }] : [];
}
vi.mock("@/lib/neo4j", () => ({
  runQuery: (cypher: string, params: Record<string, unknown>) =>
    cypher.includes(":AppPairing")
      ? Promise.resolve(pairingQuery(cypher, params))
      : mockRunQuery(cypher, params),
}));

// The real requireAuth(), against the mocked session.
vi.unmock("@/lib/auth-guard");

import { verifyAppToken, requireAppToken } from "@/lib/app-auth";
import {
  appLink,
  getPairing,
  pairingStatus,
  startPairing,
  toPublicUrl,
} from "@/lib/app-pairing";

const ISSUER = "http://localhost:8080/realms/edcv";
const DEVICE = "6f1c2b7e-3d4a-4b5c-9d8e-1a2b3c4d5e6f";
let privateKey: KeyLike;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test",
    alg: "RS256",
  };
  keys.get = createLocalJWKSet({ keys: [jwk] });
});

async function token(
  claims: Record<string, unknown> = {},
  opts: { issuer?: string; exp?: string | number } = {},
) {
  return new SignJWT({
    azp: "klarbefund-app",
    preferred_username: "patient1",
    realm_access: { roles: ["PATIENT"] },
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(privateKey);
}

function bearer(t: string, device?: string, init: RequestInit = {}) {
  return new Request("http://localhost/api/x", {
    ...init,
    headers: {
      authorization: `Bearer ${t}`,
      ...(device ? { "x-klarbefund-device": device } : {}),
      ...(init.headers ?? {}),
    },
  });
}

function patientSession(username = "patient1") {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: username, name: username },
    roles: ["PATIENT"],
    preferredUsername: username,
    expires: "2099-01-01",
  } as never);
}

function fakeKeycloak() {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          device_code: "dev-code-1",
          user_code: "ABCD-EFGH",
          verification_uri: "http://keycloak:8080/realms/edcv/device",
          verification_uri_complete:
            "http://keycloak:8080/realms/edcv/device?user_code=ABCD-EFGH",
          expires_in: 120,
          interval: 5,
        }),
        { status: 200 },
      ),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  mockRunQuery.mockReset();
  pairingRows.clear();
});

describe("the app's token (ADR-049)", () => {
  it("admits a token of klarbefund-app with the PATIENT role", async () => {
    expect(await verifyAppToken(await token())).toMatchObject({
      username: "patient1",
      roles: ["PATIENT"],
    });
  });

  it("admits a token of klarbefund-account, an account the app created (ADR-054)", async () => {
    expect(
      await verifyAppToken(
        await token({
          azp: "klarbefund-account",
          preferred_username: "kb-ab3dk7mn",
        }),
      ),
    ).toMatchObject({ username: "kb-ab3dk7mn" });
  });

  it("refuses a token another client asked for, such as the UI's own", async () => {
    expect(
      await verifyAppToken(await token({ azp: "health-dataspace-ui" })),
    ).toBeNull();
  });

  it("refuses a token without the PATIENT role", async () => {
    expect(
      await verifyAppToken(
        await token({ realm_access: { roles: ["DATA_USER"] } }),
      ),
    ).toBeNull();
  });

  it("refuses a token from another issuer", async () => {
    expect(
      await verifyAppToken(
        await token({}, { issuer: "https://evil.example/realms/edcv" }),
      ),
    ).toBeNull();
  });

  it("refuses an expired token", async () => {
    expect(
      await verifyAppToken(
        await token({}, { exp: Math.floor(Date.now() / 1000) - 60 }),
      ),
    ).toBeNull();
  });

  it("refuses a token signed with a key that is not the realm's", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({
      azp: "klarbefund-app",
      preferred_username: "patient1",
      realm_access: { roles: ["PATIENT"] },
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(ISSUER)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    expect(await verifyAppToken(forged)).toBeNull();
  });

  it("refuses a valid token from a device that is not connected", async () => {
    mockRunQuery.mockResolvedValue([]);
    const res = await requireAppToken(bearer(await token(), DEVICE));
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).json()).toMatchObject({
      error: "Unauthorized",
    });
  });

  it("admits a valid token from a connected device of the same login", async () => {
    mockRunQuery.mockResolvedValue([
      { deviceId: DEVICE, username: "patient1" },
    ]);
    const res = await requireAppToken(bearer(await token(), DEVICE));
    expect(res).toMatchObject({
      app: { username: "patient1", deviceId: DEVICE },
    });
    expect(mockRunQuery.mock.calls[0][1]).toEqual({
      deviceId: DEVICE,
      username: "patient1",
    });
  });

  it("says why when there is no bearer at all", async () => {
    const res = await requireAppToken(new Request("http://localhost/api/x"));
    expect((res as Response).status).toBe(401);
  });
});

describe("the pairing (RFC 8628, started by the website)", () => {
  it("asks Keycloak for klarbefund-app and rewrites the approval page to the public host", async () => {
    const fetcher = fakeKeycloak();
    const p = await startPairing("patient1", fetcher, 1_000_000);
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/protocol\/openid-connect\/auth\/device$/);
    expect(String(init.body)).toContain("client_id=klarbefund-app");
    expect(p.verificationUri).toBe(
      "http://localhost:8080/realms/edcv/device?user_code=ABCD-EFGH",
    );
    expect(toPublicUrl("https://elsewhere.example/x")).toBe(
      "https://elsewhere.example/x",
    );
  });

  it("puts everything the phone needs in the link, and the device code nowhere else", async () => {
    const p = await startPairing("patient1", fakeKeycloak(), 1_000_000);
    const link = new URL(appLink(p, "https://ehds.mabu.red"));
    expect(link.protocol).toBe("klarbefund:");
    expect(link.host).toBe("connect");
    expect(Object.fromEntries(link.searchParams)).toMatchObject({
      ehds: "https://ehds.mabu.red",
      issuer: ISSUER,
      client: "klarbefund-app",
      pairing: p.id,
      device_code: "dev-code-1",
      user_code: "ABCD-EFGH",
      expires: String(Math.floor((1_000_000 + 120_000) / 1000)),
    });
    expect(p.verificationUri).not.toContain("dev-code-1");
  });

  it("shows a pairing only to the login that started it, and expires it", async () => {
    const p = await startPairing("patient1", fakeKeycloak(), 1_000_000);
    expect(await getPairing(p.id, "patient2", 1_000_001)).toBeNull();
    const mine = (await getPairing(p.id, "patient1", 1_000_001))!;
    expect(pairingStatus(mine, 1_000_001)).toBe("pending");
    expect(pairingStatus(mine, 1_000_000 + 121_000)).toBe("expired");
    // Past the five minutes' grace, a phone can no longer register with it.
    expect(
      await getPairing(p.id, "patient1", 1_000_000 + 121_000 + 300_000),
    ).toBeNull();
  });

  it("is found by another replica: nothing about it is kept in the process", async () => {
    // On Azure, mvhd-ui runs up to three replicas. The QR code, the phone's
    // registration and the screen's polling may each reach a different one;
    // a freshly loaded module is what a second replica is (2026-10-04).
    const p = await startPairing("patient1", fakeKeycloak(), 1_000_000);
    vi.resetModules();
    const other = await import("@/lib/app-pairing");
    expect(await other.getPairing(p.id, "patient1", 1_000_001)).toMatchObject({
      id: p.id,
      expiresAt: 1_000_000 + 120_000,
    });
    await other.completePairing(p.id, "patient1", DEVICE, "iPhone");
    const back = (await getPairing(p.id, "patient1", 1_000_002))!;
    expect(pairingStatus(back, 1_000_002)).toBe("connected");
  });

  it("stores neither the device code nor the user code", async () => {
    const p = await startPairing("patient1", fakeKeycloak(), 1_000_000);
    expect(JSON.stringify(pairingRows.get(p.id))).not.toMatch(
      /dev-code-1|ABCD-EFGH/,
    );
  });

  it("sweeps pairings past their grace period when a new one starts", async () => {
    const old = await startPairing("patient1", fakeKeycloak(), 1_000_000);
    await startPairing("patient1", fakeKeycloak(), 1_000_000 + 500_000);
    expect(pairingRows.has(old.id)).toBe(false);
    expect(pairingRows.size).toBe(1);
  });
});

describe("POST /api/patient/app-pairing", () => {
  it("answers a patient with the QR code, the link and the approval page", async () => {
    patientSession();
    vi.stubGlobal("fetch", fakeKeycloak());
    try {
      const { POST } = await import("@/app/api/patient/app-pairing/route");
      const res = await POST(
        new Request("http://localhost/api/patient/app-pairing", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.qrDataUri).toMatch(/^data:image\/png;base64,/);
      expect(body.appLink).toMatch(/^klarbefund:\/\/connect\?/);
      expect(body.userCode).toBe("ABCD-EFGH");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a signed-in user who is not a patient", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "researcher" },
      roles: ["DATA_USER"],
      expires: "2099-01-01",
    } as never);
    const { POST } = await import("@/app/api/patient/app-pairing/route");
    const res = await POST(
      new Request("http://localhost/api/patient/app-pairing", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/patient/app-devices", () => {
  const register = async (t: string, pairingId: string) => {
    const { POST } = await import("@/app/api/patient/app-devices/route");
    return POST(
      bearer(t, undefined, {
        method: "POST",
        body: JSON.stringify({
          pairingId,
          deviceId: DEVICE,
          deviceName: "iPhone\u0000 of P1",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
  };

  it("registers the phone under a pairing of the same login", async () => {
    const p = await startPairing("patient1", fakeKeycloak());
    mockRunQuery.mockResolvedValue([
      {
        deviceId: DEVICE,
        deviceName: "iPhone of P1",
        username: "patient1",
        connectedAt: "now",
        lastSeenAt: "now",
      },
    ]);
    const res = await register(await token(), p.id);
    expect(res.status).toBe(201);
    expect(mockRunQuery.mock.calls[0][1]).toMatchObject({
      deviceId: DEVICE,
      deviceName: "iPhone of P1",
      username: "patient1",
    });
    expect(pairingStatus((await getPairing(p.id, "patient1"))!)).toBe(
      "connected",
    );
  });

  it("registers a phone without a QR code after a password sign-in (ADR-054)", async () => {
    mockRunQuery.mockResolvedValue([
      { deviceId: DEVICE, username: "kb-ab3dk7mn", deviceName: "iPhone" },
    ]);
    const res = await register(
      await token({
        azp: "klarbefund-account",
        preferred_username: "kb-ab3dk7mn",
      }),
      "",
    );
    expect(res.status).toBe(201);
  });

  it("still needs a QR code for a token from the device grant", async () => {
    expect((await register(await token(), "")).status).toBe(403);
  });

  it("refuses a token of one login with a pairing another login started", async () => {
    const p = await startPairing("patient2", fakeKeycloak());
    const res = await register(await token(), p.id);
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a device id another login already holds", async () => {
    const p = await startPairing("patient1", fakeKeycloak());
    mockRunQuery.mockResolvedValue([
      { deviceId: DEVICE, username: "patient2" },
    ]);
    expect((await register(await token(), p.id)).status).toBe(409);
  });

  it("refuses the UI's own token", async () => {
    const p = await startPairing("patient1", fakeKeycloak());
    expect(
      (await register(await token({ azp: "health-dataspace-ui" }), p.id))
        .status,
    ).toBe(401);
  });
});

describe("GET /api/patient/app/record", () => {
  it("answers a connected phone with its own login's observations as a FHIR Bundle", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ deviceId: DEVICE, username: "patient1" }])
      .mockResolvedValueOnce([{ id: "P1", name: "Anna Example" }])
      .mockResolvedValueOnce([
        {
          id: "o1",
          code: "2089-1",
          display: "LDL",
          value: 141,
          unit: "mg/dL",
          low: null,
          high: 116,
          rangeText: "< 116",
          category: "laboratory",
          effective: "2026-09-04",
          performer: null,
        },
      ]);
    const { GET } = await import("@/app/api/patient/app/record/route");
    const res = await GET(bearer(await token(), DEVICE));
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry[0].resource.referenceRange[0]).toMatchObject({
      text: "< 116",
    });
    // The record is the login's own: P1 for patient1, never a parameter.
    expect(mockRunQuery.mock.calls[1][1]).toMatchObject({ patientId: "P1" });
  });

  it("refuses a phone that was disconnected", async () => {
    mockRunQuery.mockResolvedValue([]);
    const { GET } = await import("@/app/api/patient/app/record/route");
    expect((await GET(bearer(await token(), DEVICE))).status).toBe(401);
  });
});

describe("DELETE /api/patient/app-devices/{deviceId}", () => {
  const params = { params: Promise.resolve({ deviceId: DEVICE }) };

  it("lets the patient disconnect their phone from the website", async () => {
    patientSession();
    mockRunQuery.mockResolvedValue([{ deleted: 1 }]);
    const { DELETE } = await import(
      "@/app/api/patient/app-devices/[deviceId]/route"
    );
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mockRunQuery.mock.calls[0][1]).toEqual({
      deviceId: DEVICE,
      username: "patient1",
    });
  });

  it("lets the app disconnect only itself", async () => {
    mockRunQuery.mockResolvedValue([
      {
        deviceId: "11111111-2222-4333-8444-555555555555",
        username: "patient1",
      },
    ]);
    const { DELETE } = await import(
      "@/app/api/patient/app-devices/[deviceId]/route"
    );
    const res = await DELETE(
      bearer(await token(), "11111111-2222-4333-8444-555555555555", {
        method: "DELETE",
      }),
      params,
    );
    expect(res.status).toBe(403);
  });
});
