// @vitest-environment node
/**
 * The three flows of ADR-067 through the routes: link a PID to a signed-in
 * sandbox account, sign in by the PID's secure hash, and create an account
 * from a PID that has none. Keycloak is the in-memory fake, the verifier a
 * mock, Neo4j a mock at @/lib/neo4j.
 *
 * The real requireAuth() runs here (setup.ts mocks it open), so the link
 * start and the wallet-link route are checked against the session they get.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@/lib/auth-guard");

vi.mock("@/lib/eudi-verifier", () => ({
  startPresentation: vi.fn(),
  getPresentationResult: vi.fn(),
  walletFetchedRequest: vi.fn(async () => false),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") },
}));
const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { getServerSession } from "next-auth/next";
import { POST as start } from "@/app/api/auth/eudi/start/route";
import { GET as status } from "@/app/api/auth/eudi/status/route";
import { POST as register } from "@/app/api/auth/eudi/register/route";
import {
  GET as linkState,
  DELETE as unlink,
} from "@/app/api/patient/wallet-link/route";
import { authOptions } from "@/lib/auth";
import { startPresentation, getPresentationResult } from "@/lib/eudi-verifier";
import { getTransaction, updateTransaction } from "@/lib/eudi-store";
import { pidFingerprint } from "@/lib/pid-fingerprint";
import { PID_ATTRIBUTE } from "@/lib/pid-link";
import { patientPseudonym } from "@/lib/patient-identity";
import { accountLimiter } from "@/lib/account-rate-limit";
import { isSandboxUsername } from "@/lib/sandbox-account";
import { fakeKeycloak, type FakeUser } from "../../fixtures/fake-keycloak";

const KEY = Buffer.alloc(32, 7).toString("base64");
/** The German specimen PID's holder: fictional. */
const ERIKA = {
  givenName: "ERIKA",
  familyName: "MUSTERMANN",
  birthDate: "1964-08-12",
};
const CLEAR_TEXT = /erika|mustermann|1964-08-12/i;

let txCounter = 0;
let logged: unknown[] = [];

function sandboxUser(username: string, id: string, fp?: string): FakeUser {
  return {
    id,
    username,
    firstName: "Klarbefund",
    lastName: "Sandbox",
    email: `${username}@klarbefund.invalid`,
    attributes: fp ? { [PID_ATTRIBUTE]: [fp] } : {},
  };
}

function fingerprintOf(pid = ERIKA): string {
  const fp = pidFingerprint(pid);
  if (!fp) throw new Error("no key");
  return fp;
}

function session(username: string | null, roles = ["PATIENT"]) {
  vi.mocked(getServerSession).mockResolvedValue(
    username
      ? {
          user: { name: "Patient x", preferredUsername: username },
          roles,
          expires: "2099-01-01",
        }
      : null,
  );
}

function startRequest(body?: unknown): Request {
  return new Request("http://x/api/auth/eudi/start", {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

async function startSid(body?: unknown): Promise<string> {
  vi.mocked(startPresentation).mockResolvedValue({
    transactionId: `tx-${++txCounter}`,
    clientId: "c",
    requestUri: "https://v/r",
    walletLink: "openid4vp://?x",
  });
  const res = await start(startRequest(body));
  expect(res.status).toBe(200);
  return (await res.json()).sid as string;
}

/** The wallet answers with this PID; the page polls once. */
async function present(sid: string, pid: object = ERIKA) {
  vi.mocked(getPresentationResult).mockResolvedValue({
    status: "completed",
    pid,
  });
  const res = await status(
    new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
  );
  return { res, body: await res.json() };
}

function registerRequest(sid: unknown, address = "203.0.113.7"): Request {
  return new Request("http://x/api/auth/eudi/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify({ sid }),
  });
}

async function authorize(sid: string) {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { id?: string } }).options?.id === "eudi-wallet",
  ) as { options: { authorize: (c: unknown) => Promise<unknown> } };
  return (await provider.options.authorize({ sid })) as {
    preferredUsername: string;
    roles: string[];
    assurance: string;
  } | null;
}

beforeEach(() => {
  vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
  vi.stubEnv("KEYCLOAK_ACCOUNT_SERVICE_SECRET", "svc-secret");
  vi.mocked(startPresentation).mockReset();
  vi.mocked(getPresentationResult).mockReset();
  mockRunQuery.mockReset();
  mockRunQuery.mockResolvedValue([]);
  accountLimiter.reset();
  logged = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a) => {
      logged.push(...a);
    });
  }
});
afterEach(() => {
  // Nothing the hub logged names the person or carries the hash.
  const text = JSON.stringify(logged.map(String));
  expect(text).not.toMatch(CLEAR_TEXT);
  expect(text).not.toMatch(/[0-9a-f]{64}/);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sign in by the secure hash (ADR-067)", () => {
  it("opens the account that holds the PID's hash, at level high", async () => {
    fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1", fingerprintOf())]);
    const sid = await startSid();
    const { res, body } = await present(sid);
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "completed" });
    expect(getTransaction(sid)?.verifiedPatient).toEqual({
      username: "kb-ab3dk7mn",
      displayName: patientPseudonym("KB-AB3DK7MN"),
      roles: ["PATIENT"],
      assurance: "high",
    });
    const user = await authorize(sid);
    expect(user).toMatchObject({
      preferredUsername: "kb-ab3dk7mn",
      roles: ["PATIENT"],
      assurance: "high",
    });
  });

  it("keeps the demo personas' name match first", async () => {
    const kc = fakeKeycloak([]);
    const sid = await startSid();
    const { body } = await present(sid, {
      givenName: "Maria",
      familyName: "Schmidt",
      birthDate: "1980-01-01",
    });
    expect(body.status).toBe("completed");
    expect(getTransaction(sid)?.verifiedPatient?.username).toBe("patient1");
    expect(kc.calls).toEqual([]);
  });

  it("refuses a PID on no account, offers to register, and keeps only the hash", async () => {
    fakeKeycloak([]);
    const sid = await startSid();
    const { res, body } = await present(sid);
    expect(res.status).toBe(403);
    expect(body).toEqual({
      status: "refused",
      error: expect.stringMatching(/no record/i),
      canRegister: true,
    });
    const tx = getTransaction(sid)!;
    expect(tx.fingerprint).toBe(fingerprintOf());
    expect(tx.verifiedPatient).toBeUndefined();
    expect(JSON.stringify(tx)).not.toMatch(CLEAR_TEXT);
    expect(JSON.stringify(body)).not.toMatch(CLEAR_TEXT);
    expect(JSON.stringify(body)).not.toContain(tx.fingerprint);
    // asked again, the same answer, without asking the verifier
    vi.mocked(getPresentationResult).mockClear();
    const again = await status(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect(again.status).toBe(403);
    expect((await again.json()).canRegister).toBe(true);
    expect(getPresentationResult).not.toHaveBeenCalled();
    expect(await authorize(sid)).toBeNull();
  });

  it("refuses without an offer when the wallet shared no birth date", async () => {
    fakeKeycloak([]);
    const sid = await startSid();
    const { res, body } = await present(sid, {
      givenName: "Erika",
      familyName: "Mustermann",
    });
    expect(res.status).toBe(403);
    expect(body.canRegister).toBeUndefined();
    expect(getTransaction(sid)?.fingerprint).toBeUndefined();
  });

  it("refuses without an offer when the hub has no hash key", async () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", "");
    const kc = fakeKeycloak([]);
    const sid = await startSid();
    const { body } = await present(sid);
    expect(body).toEqual({
      status: "refused",
      error: expect.stringMatching(/no record/i),
    });
    expect(kc.calls).toEqual([]);
  });

  it("keeps polling when Keycloak cannot be asked", async () => {
    const kc = fakeKeycloak([]);
    kc.fail.search = 503;
    const sid = await startSid();
    const { body } = await present(sid);
    expect(body).toEqual({ status: "pending" });
    expect(getTransaction(sid)?.status).toBe("pending");
  });
});

describe("link a PID to the signed-in account (ADR-067)", () => {
  it("starts only for a signed-in sandbox patient", async () => {
    session(null);
    expect((await start(startRequest({ purpose: "link" }))).status).toBe(401);
    session("patient1");
    const persona = await start(startRequest({ purpose: "link" }));
    expect(persona.status).toBe(403);
    expect((await persona.json()).error).toMatch(/Klarbefund/);
    session("edcadmin", ["EDC_ADMIN"]);
    expect((await start(startRequest({ purpose: "link" }))).status).toBe(403);
    expect(startPresentation).not.toHaveBeenCalled();
  });

  it("says so when the hub does not link wallets", async () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", "");
    session("kb-ab3dk7mn");
    const res = await start(startRequest({ purpose: "link" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/does not connect/);
  });

  it("writes the hash to the account and answers linked", async () => {
    const kc = fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1")]);
    session("kb-ab3dk7mn");
    const sid = await startSid({ purpose: "link" });
    expect(getTransaction(sid)).toMatchObject({
      purpose: "link",
      linkUsername: "kb-ab3dk7mn",
    });
    const { res, body } = await present(sid);
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "linked" });
    expect(kc.byUsername("kb-ab3dk7mn")?.attributes).toEqual({
      [PID_ATTRIBUTE]: [fingerprintOf()],
    });
    // nothing of the PID went to Keycloak but the hash
    for (const c of kc.calls) expect(c.body ?? "").not.toMatch(CLEAR_TEXT);
    expect(JSON.stringify(getTransaction(sid))).not.toMatch(CLEAR_TEXT);
    // a link never signs in
    expect(await authorize(sid)).toBeNull();
    const again = await status(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect(await again.json()).toEqual({ status: "linked" });
  });

  it("refuses with 409 when the PID belongs to another account", async () => {
    const kc = fakeKeycloak([
      sandboxUser("kb-ab3dk7mn", "u-1"),
      sandboxUser("kb-pq7rs2tv", "u-2", fingerprintOf()),
    ]);
    session("kb-ab3dk7mn");
    const sid = await startSid({ purpose: "link" });
    const { res, body } = await present(sid);
    expect(res.status).toBe(409);
    expect(body).toEqual({
      status: "refused",
      error: expect.stringMatching(/already connected to another account/),
    });
    expect(kc.byUsername("kb-ab3dk7mn")?.attributes).toEqual({});
    expect(kc.calls.some((c) => c.method === "PUT")).toBe(false);
    const again = await status(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect(again.status).toBe(409);
  });

  it("answers linked again when the PID is already on this account", async () => {
    const kc = fakeKeycloak([
      sandboxUser("kb-ab3dk7mn", "u-1", fingerprintOf()),
    ]);
    session("kb-ab3dk7mn");
    const sid = await startSid({ purpose: "link" });
    expect((await present(sid)).body).toEqual({ status: "linked" });
    expect(kc.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("refuses to link a demo persona's PID", async () => {
    const kc = fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1")]);
    session("kb-ab3dk7mn");
    const sid = await startSid({ purpose: "link" });
    const { res, body } = await present(sid, {
      givenName: "Jan",
      familyName: "de Vries",
      birthDate: "1975-03-03",
    });
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/demo patients/);
    expect(kc.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("refuses a PID without a birth date", async () => {
    fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1")]);
    session("kb-ab3dk7mn");
    const sid = await startSid({ purpose: "link" });
    const { res, body } = await present(sid, {
      givenName: "Erika",
      familyName: "Mustermann",
    });
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/birth date/);
  });
});

describe("POST /api/auth/eudi/register (ADR-067)", () => {
  async function refusedSid(): Promise<string> {
    const sid = await startSid();
    const { body } = await present(sid);
    expect(body.canRegister).toBe(true);
    return sid;
  }

  it("creates a sandbox account with the hash on it and signs the sid in to it", async () => {
    const kc = fakeKeycloak([]);
    const sid = await refusedSid();
    const res = await register(registerRequest(sid));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      status: "completed",
      username: expect.any(String),
      password: expect.stringMatching(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/),
    });
    expect(isSandboxUsername(body.username)).toBe(true);
    // Keycloak: the login in the patients' group, the password, the hash
    const created = JSON.parse(
      kc.calls.find((c) => c.method === "POST" && c.url.endsWith("/users"))!
        .body!,
    );
    expect(created).toMatchObject({
      username: body.username,
      groups: ["/klarbefund-patients"],
      attributes: { [PID_ATTRIBUTE]: [fingerprintOf()] },
    });
    expect(created.credentials[0].value).toBe(body.password);
    expect(JSON.stringify(created)).not.toMatch(CLEAR_TEXT);
    // Neo4j: the empty record, nothing of the PID
    expect(mockRunQuery).toHaveBeenCalledTimes(1);
    expect(mockRunQuery.mock.calls[0][1]).toEqual({
      patientId: `KB-${body.username.slice(3).toUpperCase()}`,
      username: body.username,
    });
    // the sid signs in once, at level high, and forgot the hash
    const tx = getTransaction(sid)!;
    expect(tx.fingerprint).toBeUndefined();
    expect(tx.status).toBe("completed");
    const user = await authorize(sid);
    expect(user).toMatchObject({
      preferredUsername: body.username,
      assurance: "high",
    });
    expect(await authorize(sid)).toBeNull();
    // and the next sign-in with this PID opens the new account
    const next = await startSid();
    expect((await present(next)).body.status).toBe("completed");
    expect(getTransaction(next)?.verifiedPatient?.username).toBe(body.username);
  });

  it("creates one account per PID, never two", async () => {
    const kc = fakeKeycloak([]);
    const first = await refusedSid();
    const second = await refusedSid();
    expect((await register(registerRequest(first))).status).toBe(201);
    const res = await register(registerRequest(second));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already has an account/);
    expect(kc.users.size).toBe(1);
    // the same sid cannot create a second one either
    expect((await register(registerRequest(first))).status).toBe(403);
    expect(kc.users.size).toBe(1);
  });

  it("refuses two requests racing for one sid", async () => {
    const kc = fakeKeycloak([]);
    const sid = await refusedSid();
    const [a, b] = await Promise.all([
      register(registerRequest(sid)),
      register(registerRequest(sid)),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
    expect(kc.users.size).toBe(1);
  });

  it("refuses an unknown sid, one without the offer, a consumed one", async () => {
    fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1", fingerprintOf())]);
    expect((await register(registerRequest("nope"))).status).toBe(404);
    expect((await register(registerRequest(42))).status).toBe(404);
    // a sid still waiting for the wallet
    const pending = await startSid();
    expect((await register(registerRequest(pending))).status).toBe(403);
    // a sid that signed in
    const signedIn = await startSid();
    await present(signedIn);
    expect((await register(registerRequest(signedIn))).status).toBe(403);
    // a sid refused with the offer, then consumed
    vi.stubEnv("PID_FINGERPRINT_KEY", Buffer.alloc(32, 9).toString("base64"));
    const refused = await refusedSid();
    updateTransaction(refused, { consumed: true });
    expect((await register(registerRequest(refused))).status).toBe(403);
    // a link presentation never registers
    const kc2 = fakeKeycloak([sandboxUser("kb-pq7rs2tv", "u-2")]);
    session("kb-pq7rs2tv");
    const link = await startSid({ purpose: "link" });
    updateTransaction(link, {
      status: "error",
      canRegister: true,
      fingerprint: fingerprintOf(),
    });
    expect((await register(registerRequest(link))).status).toBe(403);
    expect(kc2.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await register(
      new Request("http://x/api/auth/eudi/register", {
        method: "POST",
        body: "sid=1",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses an expired sid", async () => {
    fakeKeycloak([]);
    const sid = await refusedSid();
    updateTransaction(sid, { createdAt: Date.now() - 6 * 60 * 1000 });
    expect((await register(registerRequest(sid))).status).toBe(404);
  });

  it("draws on the app's account limit", async () => {
    fakeKeycloak([]);
    for (let i = 0; i < 5; i++) {
      expect(accountLimiter.allow("198.51.100.1")).toBe(true);
    }
    const sid = await refusedSid();
    const res = await register(registerRequest(sid, "198.51.100.1"));
    expect(res.status).toBe(429);
    // the offer stands: from another address it goes through
    expect((await register(registerRequest(sid))).status).toBe(201);
  });

  it("leaves no half-made account when Keycloak refuses, and the offer stands", async () => {
    const kc = fakeKeycloak([]);
    kc.fail.create = 400;
    const sid = await refusedSid();
    const res = await register(registerRequest(sid));
    expect(res.status).toBe(502);
    expect(String(mockRunQuery.mock.calls.at(-1)![0])).toContain(
      "DETACH DELETE",
    );
    expect(kc.users.size).toBe(0);
    expect(getTransaction(sid)?.canRegister).toBe(true);
    kc.fail.create = undefined;
    expect((await register(registerRequest(sid))).status).toBe(201);
  });
});

describe("/api/patient/wallet-link (ADR-067)", () => {
  it("needs a patient session", async () => {
    session(null);
    expect((await linkState()).status).toBe(401);
    expect((await unlink()).status).toBe(401);
  });

  it("tells a sandbox account whether it is linked, without the hash", async () => {
    fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1", fingerprintOf())]);
    session("kb-ab3dk7mn");
    const res = await linkState();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ eligible: true, available: true, linked: true });
  });

  it("answers a demo persona that it cannot link, without asking Keycloak", async () => {
    const kc = fakeKeycloak([]);
    session("patient1");
    expect(await (await linkState()).json()).toEqual({
      eligible: false,
      available: true,
      linked: false,
    });
    const res = await unlink();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
    expect(kc.calls).toEqual([]);
  });

  it("disconnects: the attribute goes, the account stays", async () => {
    const kc = fakeKeycloak([
      sandboxUser("kb-ab3dk7mn", "u-1", fingerprintOf()),
    ]);
    session("kb-ab3dk7mn");
    const res = await unlink();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false });
    expect(kc.byUsername("kb-ab3dk7mn")?.attributes).toEqual({});
    expect(await (await linkState()).json()).toMatchObject({ linked: false });
    // the PID no longer signs in to it, and may register again
    const sid = await startSid();
    expect((await present(sid)).body.canRegister).toBe(true);
  });

  it("reads the login of a wallet session, which has no mail", async () => {
    fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1")]);
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        name: patientPseudonym("KB-AB3DK7MN"),
        preferredUsername: "kb-ab3dk7mn",
      },
      roles: ["PATIENT"],
      assurance: "high",
      expires: "2099-01-01",
    });
    expect(await (await linkState()).json()).toMatchObject({ eligible: true });
  });

  it("answers 404 when the account is gone", async () => {
    fakeKeycloak([]);
    session("kb-ab3dk7mn");
    expect((await unlink()).status).toBe(404);
  });

  it("answers 502 when Keycloak fails", async () => {
    const kc = fakeKeycloak([sandboxUser("kb-ab3dk7mn", "u-1")]);
    kc.fail.search = 500;
    session("kb-ab3dk7mn");
    expect((await linkState()).status).toBe(502);
    expect((await unlink()).status).toBe(502);
  });
});
