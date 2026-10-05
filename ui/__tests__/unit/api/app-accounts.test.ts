// @vitest-environment node
/**
 * The Klarbefund app creates and deletes its own sandbox account (ADR-054).
 *
 * The attestation check has its own tests (lib/app-attest.test.ts); here it
 * is replaced, so these cases are about what the routes do around it:
 * refusing, creating every part of an account or none, and deleting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

const verifyAttestation = vi.fn();
vi.mock("@/lib/app-attest", async (original) => ({
  ...(await original<typeof import("@/lib/app-attest")>()),
  verifyAttestation: (...args: unknown[]) => verifyAttestation(...args),
}));

const requireAppToken = vi.fn();
vi.mock("@/lib/app-auth", async (original) => ({
  ...(await original<typeof import("@/lib/app-auth")>()),
  requireAppToken: (...args: unknown[]) => requireAppToken(...args),
}));

import { clientData, issueChallenge } from "@/lib/app-attest";
import {
  isSandboxUsername,
  newCredentials,
  sandboxPatientId,
} from "@/lib/app-accounts";
import { ownPatientId } from "@/lib/overview/patient";

const DEVICE = "6f1c2b7e-3d4a-4b5c-9d8e-1a2b3c4d5e6f";

/** Keycloak, as much of it as account creation and deletion use. */
function fakeKeycloak(createStatus = 201) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body ? String(init.body) : undefined,
    });
    if (String(url).endsWith("/protocol/openid-connect/token")) {
      return new Response(JSON.stringify({ access_token: "svc" }), {
        status: 200,
      });
    }
    if (String(url).endsWith("/users") && init.method === "POST") {
      return new Response(null, { status: createStatus });
    }
    if (String(url).includes("/users?")) {
      return new Response(JSON.stringify([{ id: "u-1" }]), { status: 200 });
    }
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  return calls;
}

function create(body: Record<string, unknown>) {
  return import("@/app/api/app-accounts/route").then(({ POST }) =>
    POST(
      new Request("http://localhost/api/app-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

const valid = () => ({
  challenge: issueChallenge(),
  keyId: Buffer.alloc(32, 1).toString("base64"),
  attestation: "AAAA",
  deviceId: DEVICE,
  deviceName: "iPhone",
});

beforeEach(() => {
  process.env.APP_ATTEST_SECRET = "test-secret";
  process.env.KEYCLOAK_ACCOUNT_SERVICE_SECRET = "svc-secret";
  mockRunQuery.mockReset();
  verifyAttestation.mockReset();
  requireAppToken.mockReset();
  verifyAttestation.mockReturnValue({
    environment: "development",
    publicKey: "",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.KEYCLOAK_ACCOUNT_SERVICE_SECRET;
});

describe("a sandbox login", () => {
  it("is kb- and eight letters a person can read, and owns KB- and the same", () => {
    for (let i = 0; i < 50; i++) {
      const { username, password } = newCredentials();
      expect(isSandboxUsername(username)).toBe(true);
      expect(username).not.toMatch(/[01ilo]/);
      expect(password).toMatch(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/);
    }
    expect(sandboxPatientId("kb-ab3dk7mn")).toBe("KB-AB3DK7MN");
    expect(ownPatientId("kb-ab3dk7mn")).toBe("KB-AB3DK7MN");
  });

  it("is never a demo persona", () => {
    expect(isSandboxUsername("patient1")).toBe(false);
    expect(ownPatientId("patient1")).toBe("P1");
    expect(sandboxPatientId("kb-../../x")).toBeNull();
  });
});

describe("POST /api/app-accounts/challenge", () => {
  it("hands out a challenge without a session", async () => {
    const { POST } = await import("@/app/api/app-accounts/challenge/route");
    const res = await POST(
      new Request("http://localhost/api/app-accounts/challenge", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).challenge).toMatch(/^\d+\.[\w-]+\.[\w-]+$/);
  });
});

describe("POST /api/app-accounts", () => {
  it("creates the login, the record and the connection, and returns the password once", async () => {
    const calls = fakeKeycloak();
    mockRunQuery
      .mockResolvedValueOnce([{ fresh: true }])
      .mockResolvedValueOnce([{ deviceId: DEVICE, username: "x" }]);
    const body = valid();
    const res = await create(body);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const account = await res.json();
    expect(isSandboxUsername(account.username)).toBe(true);
    expect(account.patientId).toBe(sandboxPatientId(account.username));
    expect(account.client).toBe("klarbefund-account");
    // The attestation was checked against this challenge and this phone.
    expect(verifyAttestation.mock.calls[0][0]).toMatchObject({
      keyId: body.keyId,
      clientData: clientData(body.challenge, DEVICE),
    });
    // Keycloak got the user, in the patients' group, with that password.
    const user = JSON.parse(
      calls.find((c) => c.method === "POST" && c.url.endsWith("/users"))!.body!,
    );
    expect(user).toMatchObject({
      username: account.username,
      groups: ["/klarbefund-patients"],
    });
    expect(user.credentials[0].value).toBe(account.password);
    // The record and the phone were written under the new login.
    expect(mockRunQuery.mock.calls[0][1]).toMatchObject({
      username: account.username,
      keyId: body.keyId,
    });
    expect(mockRunQuery.mock.calls[1][1]).toMatchObject({
      deviceId: DEVICE,
      username: account.username,
    });
  });

  it("refuses a missing field, a foreign challenge and a failed attestation", async () => {
    expect((await create({ ...valid(), deviceId: "x" })).status).toBe(400);
    expect((await create({ ...valid(), challenge: "1.2.3" })).status).toBe(401);
    const { AttestError } = await import("@/lib/app-attest");
    verifyAttestation.mockImplementation(() => {
      throw new AttestError("the attestation is for another app");
    });
    const res = await create(valid());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: "Unauthorized",
      reason: "the attestation is for another app",
    });
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a key that already created an account", async () => {
    fakeKeycloak();
    mockRunQuery.mockResolvedValueOnce([{ fresh: false }]);
    expect((await create(valid())).status).toBe(409);
  });

  it("leaves no half-made account when Keycloak refuses", async () => {
    fakeKeycloak(409);
    mockRunQuery.mockResolvedValueOnce([{ fresh: true }]).mockResolvedValue([]);
    const res = await create(valid());
    expect(res.status).toBe(502);
    expect(String(mockRunQuery.mock.calls.at(-1)![0])).toContain(
      "DETACH DELETE",
    );
  });

  it("says so when the hub has no service account configured", async () => {
    delete process.env.KEYCLOAK_ACCOUNT_SERVICE_SECRET;
    mockRunQuery.mockResolvedValueOnce([{ fresh: true }]).mockResolvedValue([]);
    expect((await create(valid())).status).toBe(503);
  });
});

describe("DELETE /api/patient/app/account", () => {
  const remove = async () => {
    const { DELETE } = await import("@/app/api/patient/app/account/route");
    return DELETE(new Request("http://localhost/x", { method: "DELETE" }));
  };

  it("deletes a sandbox account: the login, the record, the phones", async () => {
    requireAppToken.mockResolvedValue({
      app: { username: "kb-ab3dk7mn", roles: ["PATIENT"], deviceId: DEVICE },
    });
    const calls = fakeKeycloak();
    mockRunQuery.mockResolvedValue([]);
    const res = await remove();
    expect(res.status).toBe(200);
    expect(
      calls.some((c) => c.method === "DELETE" && c.url.endsWith("/users/u-1")),
    ).toBe(true);
    expect(mockRunQuery.mock.calls[0][1]).toMatchObject({
      patientId: "KB-AB3DK7MN",
      username: "kb-ab3dk7mn",
    });
  });

  it("refuses to delete a demo persona", async () => {
    requireAppToken.mockResolvedValue({
      app: { username: "patient1", roles: ["PATIENT"], deviceId: DEVICE },
    });
    const calls = fakeKeycloak();
    const res = await remove();
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("refuses without the app's token", async () => {
    const { NextResponse } = await import("next/server");
    requireAppToken.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await remove()).status).toBe(401);
  });
});
