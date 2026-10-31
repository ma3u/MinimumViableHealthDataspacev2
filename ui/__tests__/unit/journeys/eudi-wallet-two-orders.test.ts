// @vitest-environment node
/**
 * The two orders of the Klarbefund user guide (Connect to EHDS › Your EUDI
 * wallet, if you want one) and the runbook `klarbefund-connect.md`, end to
 * end through the real route handlers (ADR-054, ADR-067, #708):
 *
 * - Klarbefund first: the app makes a `kb-` account, the person signs in on
 *   the website with its password, links the wallet, and the wallet opens
 *   that account from then on.
 * - Wallet first: a PID on no account is offered one, the hub creates it and
 *   answers the password once, and the app signs in with that password.
 *
 * Each journey runs against one Keycloak and one graph that every step
 * shares, so what one route writes is what the next one reads. The fakes sit
 * where the route tests put theirs: `fetch` to Keycloak (the shared
 * `fake-keycloak` fixture), `runQuery` of `@/lib/neo4j`, the verifier, and
 * Apple's attestation. Sessions are made by the real NextAuth callbacks of
 * `@/lib/auth`, so a password sign-in and a wallet sign-in carry what they
 * carry in production; the real requireAuth() checks them.
 *
 * The person is fictional, and the hub must not log or store their name or
 * birth date anywhere (ADR-067): every test ends by checking that.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { randomBytes } from "crypto";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";

vi.unmock("@/lib/auth-guard");

// The realm's keys, made here: every check the hub makes on a Keycloak token
// runs, against tokens the fake Keycloak below signs.
const realmKeys: { get?: JWTVerifyGetKey } = {};
vi.mock("jose", async (original) => ({
  ...(await original<typeof import("jose")>()),
  createRemoteJWKSet: () =>
    ((...args: Parameters<JWTVerifyGetKey>) =>
      realmKeys.get!(...args)) as JWTVerifyGetKey,
}));
vi.mock("@/lib/eudi-verifier", () => ({
  startPresentation: vi.fn(),
  getPresentationResult: vi.fn(),
  walletFetchedRequest: vi.fn(async () => false),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") },
}));
// Apple's attestation has its own tests (lib/app-attest.test.ts).
vi.mock("@/lib/app-attest", async (original) => ({
  ...(await original<typeof import("@/lib/app-attest")>()),
  verifyAttestation: () => ({ environment: "development", publicKey: "" }),
}));
vi.mock("@/lib/neo4j", () => ({
  runQuery: (cypher: string, params: Record<string, unknown>) =>
    Promise.resolve(graph.run(cypher, params ?? {})),
}));

import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { POST as challengeRoute } from "@/app/api/app-accounts/challenge/route";
import { POST as createAppAccount } from "@/app/api/app-accounts/route";
import { POST as startRoute } from "@/app/api/auth/eudi/start/route";
import { GET as statusRoute } from "@/app/api/auth/eudi/status/route";
import { POST as registerRoute } from "@/app/api/auth/eudi/register/route";
import {
  GET as walletLinkRoute,
  DELETE as disconnectWalletRoute,
} from "@/app/api/patient/wallet-link/route";
import { POST as registerDevice } from "@/app/api/patient/app-devices/route";
import { GET as readAppRecord } from "@/app/api/patient/app/record/route";
import { startPresentation, getPresentationResult } from "@/lib/eudi-verifier";
import { getTransaction } from "@/lib/eudi-store";
import { pidFingerprint } from "@/lib/pid-fingerprint";
import { PID_ATTRIBUTE } from "@/lib/pid-link";
import { accountLimiter } from "@/lib/account-rate-limit";
import { isSandboxUsername, sandboxPatientId } from "@/lib/sandbox-account";
import { fakeKeycloak, type FakeUser } from "../../fixtures/fake-keycloak";

// ---- the person, the hub's key -------------------------------------------

/** A fictional person's PID, as d-you presents it. */
const PID = {
  givenName: "Lotte",
  familyName: "Beispielfrau",
  birthDate: "1988-05-17",
};
const CLEAR_TEXT = /lotte|beispielfrau|1988-05-17/i;
const KEY = Buffer.alloc(32, 11).toString("base64");
const ISSUER =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

function fingerprint(): string {
  const fp = pidFingerprint(PID);
  if (!fp) throw new Error("the hub has no fingerprint key");
  return fp;
}

// ---- the graph: sandbox records and phones, in memory --------------------

interface GraphPatient {
  id: string;
  name: string;
  sandbox: boolean;
  appAccount: string;
}
interface GraphConnection {
  deviceId: string;
  deviceName: string;
  username: string;
  connectedAt: string;
  lastSeenAt: string | null;
}

/**
 * The part of Neo4j these journeys touch: the sandbox `(:Patient)`, the
 * attested key and the phone's `(:AppConnection)`. A query it does not know
 * throws, so a route that starts asking something new fails here loudly
 * rather than reading an empty answer.
 */
function fakeGraph() {
  const patients = new Map<string, GraphPatient>();
  const attestKeys = new Map<
    string,
    { username: string | null; createdBy: string }
  >();
  const connections = new Map<string, GraphConnection>();
  const now = () => new Date().toISOString();

  function run(cypher: string, p: Record<string, unknown>): unknown[] {
    const s = (k: string) => p[k] as string;
    if (cypher.includes("MERGE (k:AppAttestKey")) {
      let key = attestKeys.get(s("keyId"));
      if (!key) {
        key = { username: s("username"), createdBy: s("username") };
        attestKeys.set(s("keyId"), key);
      }
      const fresh =
        key.createdBy === s("username") && key.username === s("username");
      if (fresh && !patients.has(s("patientId"))) {
        patients.set(s("patientId"), {
          id: s("patientId"),
          name: "Klarbefund sandbox",
          sandbox: true,
          appAccount: s("username"),
        });
      }
      return [{ fresh }];
    }
    if (cypher.includes("MERGE (p:Patient {id: $patientId})")) {
      const existing = patients.get(s("patientId"));
      patients.set(s("patientId"), {
        id: s("patientId"),
        name: existing?.name ?? "Klarbefund sandbox",
        sandbox: existing?.sandbox ?? true,
        appAccount: s("username"),
      });
      return [];
    }
    if (cypher.includes("MERGE (a:AppConnection")) {
      let a = connections.get(s("deviceId"));
      if (!a) {
        a = {
          deviceId: s("deviceId"),
          deviceName: s("deviceName"),
          username: s("username"),
          connectedAt: now(),
          lastSeenAt: now(),
        };
        connections.set(a.deviceId, a);
      }
      return [{ ...a }];
    }
    if (
      cypher.includes(
        "MATCH (a:AppConnection {deviceId: $deviceId, username: $username})",
      ) &&
      cypher.includes("SET a.lastSeenAt")
    ) {
      const a = connections.get(s("deviceId"));
      return a && a.username === s("username") ? [{ ...a }] : [];
    }
    if (cypher.includes("MATCH (p:Patient)-[:HAS_OBSERVATION]")) {
      return []; // a sandbox record starts empty
    }
    if (cypher.includes("MATCH (p:Patient)") && cypher.includes("AS sandbox")) {
      const patient = patients.get(s("patientId"));
      return patient
        ? [{ id: patient.id, name: patient.name, sandbox: patient.sandbox }]
        : [];
    }
    if (cypher.includes("DETACH DELETE") && cypher.includes("sandbox: true")) {
      patients.delete(s("patientId"));
      for (const [id, a] of connections) {
        if (a.username === s("username")) connections.delete(id);
      }
      for (const key of attestKeys.values()) {
        if (key.username === s("username")) key.username = null;
      }
      return [];
    }
    throw new Error(
      `the journey's graph does not know this query: ${
        cypher.trim().split("\n")[0]
      }`,
    );
  }

  return { patients, attestKeys, connections, run };
}

/** Both made fresh for every test, and shared by every step inside it. */
let graph: ReturnType<typeof fakeGraph>;
let kc: ReturnType<typeof fakeKeycloak>;

// ---- Keycloak's side: the password check and the tokens it signs ---------

let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "realm",
    alg: "RS256",
  };
  realmKeys.get = createLocalJWKSet({ keys: [jwk] });
});

type StoredUser = FakeUser & {
  enabled?: boolean;
  groups?: string[];
  credentials?: { type: string; value: string }[];
};

/**
 * What Keycloak does when a person types a username and password, for the
 * website's client (the authorization code flow behind "Sign in with
 * Keycloak") or the app's (the password grant of `klarbefund-account`): it
 * checks the password the account was created with and signs a token. The
 * group `klarbefund-patients` carries the PATIENT role; the realm puts no
 * `sub` in the token (#556).
 */
async function keycloakLogin(
  username: string,
  password: string,
  client: string,
): Promise<{ accessToken: string; claims: Record<string, unknown> } | null> {
  const user = kc.byUsername(username) as StoredUser | undefined;
  const ok =
    user?.enabled !== false &&
    user?.credentials?.some(
      (c) => c.type === "password" && c.value === password,
    );
  if (!user || !ok) return null;
  const claims = {
    azp: client,
    preferred_username: user.username,
    realm_access: {
      roles: (user.groups ?? []).includes("/klarbefund-patients")
        ? ["PATIENT"]
        : [],
    },
  };
  const accessToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "realm" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
  return { accessToken, claims };
}

// ---- the website: sessions made by the real NextAuth callbacks -----------

let browserSession: Session | null = null;

function signedOut() {
  browserSession = null;
}

async function sessionFrom(
  jwtInput: Record<string, unknown>,
): Promise<Session> {
  const callbacks = authOptions.callbacks!;
  const token = (await callbacks.jwt!({
    token: {} as JWT,
    ...jwtInput,
  } as never)) as JWT;
  return (await callbacks.session!({
    session: { user: {}, expires: "2099-01-01T00:00:00.000Z" },
    token,
  } as never)) as Session;
}

/** "Sign in with Keycloak" on the website, with a username and password. */
async function signInWithKeycloak(username: string, password: string) {
  const login = await keycloakLogin(username, password, "health-dataspace-ui");
  if (!login) throw new Error(`Keycloak refused ${username}'s password`);
  browserSession = await sessionFrom({
    user: { id: username, name: username, email: `${username}@x.invalid` },
    account: {
      provider: "keycloak",
      type: "oauth",
      providerAccountId: username,
      access_token: login.accessToken,
    },
    profile: login.claims,
  });
  return browserSession;
}

/** The EUDI wallet provider's authorize(), as the page's signIn() calls it. */
async function eudiAuthorize(sid: string) {
  const provider = authOptions.providers.find(
    (p) => (p as { options?: { id?: string } }).options?.id === "eudi-wallet",
  ) as { options: { authorize: (c: unknown) => Promise<unknown> } };
  return (await provider.options.authorize({ sid })) as {
    preferredUsername: string;
    roles: string[];
    assurance: string;
  } | null;
}

/** The page's signIn("eudi-wallet", { sid }); null when it is refused. */
async function signInWithWallet(sid: string) {
  const user = await eudiAuthorize(sid);
  if (!user) return null;
  browserSession = await sessionFrom({
    user,
    account: { provider: "eudi-wallet", type: "credentials" },
  });
  return browserSession;
}

let txCounter = 0;

/** POST /api/auth/eudi/start, plain (sign-in) or with a body (link). */
async function startPresentationAt(body?: unknown): Promise<Response> {
  vi.mocked(startPresentation).mockResolvedValue({
    transactionId: `tx-journey-${++txCounter}`,
    clientId: "c",
    requestUri: "https://verifier.invalid/r",
    walletLink: "openid4vp://?request_uri=x",
  });
  return startRoute(
    new Request("http://hub.invalid/api/auth/eudi/start", {
      method: "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    }),
  );
}

/** d-you scans the QR code and approves; the page polls the status route. */
async function walletPresents(sid: string, pid: object = PID) {
  vi.mocked(getPresentationResult).mockResolvedValue({
    status: "completed",
    pid,
  });
  return poll(sid);
}

async function poll(sid: string) {
  const res = await statusRoute(
    new Request(`http://hub.invalid/api/auth/eudi/status?sid=${sid}`),
  );
  return { status: res.status, body: await res.json() };
}

/** "Sign in with d-you (QR)": start, scan, approve, and the page's answer. */
async function walletSignIn() {
  const started = await startPresentationAt();
  expect(started.status).toBe(200);
  const { sid } = (await started.json()) as { sid: string };
  return { sid, ...(await walletPresents(sid)) };
}

/** "Create an account with this PID". */
async function createAccountWithThisPid(sid: string, address = "203.0.113.20") {
  const res = await registerRoute(
    new Request("http://hub.invalid/api/auth/eudi/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify({ sid }),
    }),
  );
  return { status: res.status, headers: res.headers, body: await res.json() };
}

/** Health Profile › Connect your EUDI wallet, then d-you approves. */
async function connectYourEudiWallet() {
  const started = await startPresentationAt({ purpose: "link" });
  const startBody = await started.json();
  if (started.status !== 200) {
    return { started: started.status, status: 0, body: startBody, sid: "" };
  }
  const sid = (startBody as { sid: string }).sid;
  return { started: started.status, sid, ...(await walletPresents(sid)) };
}

/** What `/patient/wallet` reads: whether this account carries a link. */
async function walletLinkState() {
  const res = await walletLinkRoute();
  return { status: res.status, body: await res.json() };
}

/** "Disconnect wallet". */
async function disconnectWallet() {
  const res = await disconnectWalletRoute();
  return { status: res.status, body: await res.json() };
}

// ---- the app ---------------------------------------------------------------

const PHONE = "6f1c2b7e-3d4a-4b5c-9d8e-1a2b3c4d5e6f";
const SECOND_PHONE = "0b6e3a52-8c1d-4f7a-9e2b-5d4c3b2a1f0e";
let addressCounter = 0;
/** Each request from its own documentation address, so no limiter is hit. */
const nextAddress = () => `198.51.100.${++addressCounter}`;

interface AppAccount {
  username: string;
  password: string;
  patientId: string;
  client: string;
}

/** More › Connect to EHDS › Create an EHDS account (ADR-054). */
async function appCreatesAccount(deviceId = PHONE): Promise<AppAccount> {
  const address = nextAddress();
  const challengeRes = await challengeRoute(
    new Request("http://hub.invalid/api/app-accounts/challenge", {
      method: "POST",
      headers: { "x-forwarded-for": address },
    }),
  );
  expect(challengeRes.status).toBe(200);
  const { challenge } = (await challengeRes.json()) as { challenge: string };
  const res = await createAppAccount(
    new Request("http://hub.invalid/api/app-accounts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify({
        challenge,
        keyId: randomBytes(32).toString("base64"),
        attestation: "AAAA",
        deviceId,
        deviceName: "iPhone",
      }),
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as AppAccount;
}

/** The app's password sign-in: the `klarbefund-account` client (ADR-054). */
async function appSignsIn(username: string, password: string) {
  const login = await keycloakLogin(username, password, "klarbefund-account");
  return login?.accessToken ?? null;
}

function appRequest(
  token: string,
  init: { method?: string; body?: unknown; device?: string } = {},
): Request {
  return new Request("http://hub.invalid/api/patient/app", {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.device ? { "x-klarbefund-device": init.device } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

/** The phone registers under the login it signed in with. */
async function appRegistersPhone(token: string, deviceId: string) {
  const res = await registerDevice(
    appRequest(token, {
      method: "POST",
      body: { deviceId, deviceName: "iPhone" },
    }),
  );
  return { status: res.status, body: await res.json() };
}

/** The app reads its own record. */
async function appReadsRecord(token: string, deviceId: string) {
  const res = await readAppRecord(appRequest(token, { device: deviceId }));
  return { status: res.status, body: await res.json() };
}

// ---- the two orders, as steps the other tests start from -------------------

/** Klarbefund first, through step 5 of the guide. */
async function klarbefundFirst(deviceId = PHONE) {
  const account = await appCreatesAccount(deviceId);
  const appToken = await appSignsIn(account.username, account.password);
  expect(appToken).not.toBeNull();
  await signInWithKeycloak(account.username, account.password);
  const linked = await connectYourEudiWallet();
  expect(linked.body).toEqual({ status: "linked" });
  signedOut();
  return { ...account, appToken: appToken! };
}

/** The wallet first, through step 3 of the guide. */
async function walletFirst() {
  signedOut();
  const offered = await walletSignIn();
  expect(offered.body.canRegister).toBe(true);
  const created = await createAccountWithThisPid(offered.sid, nextAddress());
  expect(created.status).toBe(201);
  expect(await signInWithWallet(offered.sid)).not.toBeNull();
  signedOut();
  return created.body as { username: string; password: string };
}

function keycloakUser(username: string): StoredUser {
  const user = kc.byUsername(username) as StoredUser | undefined;
  if (!user) throw new Error(`Keycloak has no ${username}`);
  return user;
}

// ---- hooks ----------------------------------------------------------------

let logged: unknown[] = [];

beforeEach(() => {
  vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
  vi.stubEnv("KEYCLOAK_ACCOUNT_SERVICE_SECRET", "svc-secret");
  vi.stubEnv("APP_ATTEST_SECRET", "journey-attest-secret");
  graph = fakeGraph();
  kc = fakeKeycloak([]);
  signedOut();
  vi.mocked(getServerSession).mockImplementation(async () => browserSession);
  vi.mocked(startPresentation).mockReset();
  vi.mocked(getPresentationResult).mockReset();
  accountLimiter.reset();
  logged = [];
  for (const m of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a) => {
      logged.push(...a);
    });
  }
});

afterEach(() => {
  // ADR-067: the name and the birth date are neither logged nor stored, and
  // the hash is never logged.
  const text = JSON.stringify(logged.map(String));
  expect(text).not.toMatch(CLEAR_TEXT);
  expect(text).not.toMatch(/[0-9a-f]{64}/);
  for (const user of kc.users.values()) {
    expect(JSON.stringify(user)).not.toMatch(CLEAR_TEXT);
  }
  for (const call of kc.calls) expect(call.body ?? "").not.toMatch(CLEAR_TEXT);
  expect(
    JSON.stringify([...graph.patients.values(), ...graph.connections.values()]),
  ).not.toMatch(CLEAR_TEXT);
  vi.mocked(getServerSession).mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---- the journeys ---------------------------------------------------------

describe("Klarbefund first, the wallet later (user guide, runbook)", () => {
  it("the app's account takes the wallet, keeps only the hash, and the wallet opens it from then on", async () => {
    // 1. In the app: Connect to EHDS › Create an EHDS account.
    const account = await appCreatesAccount();
    expect(isSandboxUsername(account.username)).toBe(true);
    expect(account.client).toBe("klarbefund-account");
    expect(graph.patients.get(account.patientId)).toMatchObject({
      sandbox: true,
      appAccount: account.username,
    });
    expect(graph.connections.get(PHONE)?.username).toBe(account.username);
    const appToken = await appSignsIn(account.username, account.password);
    expect(appToken).not.toBeNull();
    const before = await appReadsRecord(appToken!, PHONE);
    expect(before.status).toBe(200);
    expect(before.body.resourceType).toBe("Bundle");

    // 2. On the website: Sign in with Keycloak, with that username and password.
    const session = await signInWithKeycloak(
      account.username,
      account.password,
    );
    expect(session).toMatchObject({
      roles: ["PATIENT"],
      assurance: "low",
      user: { preferredUsername: account.username },
    });
    expect(await walletLinkState()).toEqual({
      status: 200,
      body: { eligible: true, available: true, linked: false },
    });

    // 3. to 5. Health Profile › Connect your EUDI wallet; d-you approves.
    const link = await connectYourEudiWallet();
    expect(link.started).toBe(200);
    expect(link).toMatchObject({ status: 200, body: { status: "linked" } });

    // The account holds the hash, and nothing else of the PID.
    const user = keycloakUser(account.username);
    expect(user.attributes).toEqual({ [PID_ATTRIBUTE]: [fingerprint()] });
    expect(fingerprint()).toMatch(/^k1:[0-9a-f]{64}$/);
    expect(user).toMatchObject({
      firstName: "Klarbefund",
      lastName: "Sandbox",
    });
    expect(JSON.stringify(user)).not.toMatch(CLEAR_TEXT);
    expect(await walletLinkState()).toMatchObject({ body: { linked: true } });
    // A link changes the account; it never signs anyone in.
    expect(await eudiAuthorize(link.sid)).toBeNull();

    // From now on Sign in with d-you opens this account, at level high.
    signedOut();
    const later = await walletSignIn();
    expect(later).toMatchObject({ status: 200, body: { status: "completed" } });
    const walletSession = await signInWithWallet(later.sid);
    expect(walletSession).toMatchObject({
      roles: ["PATIENT"],
      assurance: "high",
      user: { preferredUsername: account.username },
    });
    expect(JSON.stringify(walletSession)).not.toMatch(CLEAR_TEXT);
    expect(await walletLinkState()).toMatchObject({ body: { linked: true } });

    // And the app stays connected as before.
    const after = await appReadsRecord(appToken!, PHONE);
    expect(after.status).toBe(200);
    expect(kc.users.size).toBe(1);
  });
});

describe("the wallet first, Klarbefund later (user guide, runbook)", () => {
  it("a PID on no account is offered one, the password comes once, and the app signs in with it", async () => {
    // 1. and 2. Sign in with d-you (QR): no account belongs to the PID yet.
    const offered = await walletSignIn();
    expect(offered.status).toBe(403);
    expect(offered.body).toEqual({
      status: "refused",
      error: expect.stringMatching(/no record/i),
      canRegister: true,
    });
    expect(await eudiAuthorize(offered.sid)).toBeNull();
    expect(kc.users.size).toBe(0);

    // Create an account with this PID.
    const created = await createAccountWithThisPid(offered.sid);
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect(created.body).toEqual({
      status: "completed",
      username: expect.any(String),
      password: expect.any(String),
    });
    const { username, password } = created.body as {
      username: string;
      password: string;
    };
    expect(isSandboxUsername(username)).toBe(true);
    const user = keycloakUser(username);
    expect(user.attributes).toEqual({ [PID_ATTRIBUTE]: [fingerprint()] });
    expect(user.groups).toEqual(["/klarbefund-patients"]);
    expect(graph.patients.get(sandboxPatientId(username)!)).toMatchObject({
      sandbox: true,
      appAccount: username,
    });

    // 3. The password is shown once: nothing the hub answers or keeps after
    // this carries it, and the offer cannot be taken twice.
    const again = await poll(offered.sid);
    expect(again.body).toEqual({ status: "completed" });
    expect(JSON.stringify(getTransaction(offered.sid))).not.toContain(password);
    const twice = await createAccountWithThisPid(offered.sid);
    expect(twice.status).toBe(403);
    expect(JSON.stringify(twice.body)).not.toContain(password);
    expect(JSON.stringify([...graph.patients.values()])).not.toContain(
      password,
    );
    expect(kc.users.size).toBe(1);

    // I have saved them, sign me in: the sid opens the new account, once.
    const session = await signInWithWallet(offered.sid);
    expect(session).toMatchObject({
      roles: ["PATIENT"],
      assurance: "high",
      user: { preferredUsername: username },
    });
    expect(await eudiAuthorize(offered.sid)).toBeNull();
    expect(await walletLinkState()).toMatchObject({
      body: { eligible: true, linked: true },
    });

    // 4. In the app: Connect to EHDS › Sign in with an EHDS account.
    expect(await appSignsIn(username, "not-the-password")).toBeNull();
    const appToken = await appSignsIn(username, password);
    expect(appToken).not.toBeNull();
    const phone = await appRegistersPhone(appToken!, PHONE);
    expect(phone.status).toBe(201);
    expect(phone.body.connection).toMatchObject({ deviceId: PHONE, username });
    const record = await appReadsRecord(appToken!, PHONE);
    expect(record.status).toBe(200);
    expect(record.body.resourceType).toBe("Bundle");

    // The app and the wallet now open the same record.
    signedOut();
    const later = await walletSignIn();
    expect(later.body).toEqual({ status: "completed" });
    expect(getTransaction(later.sid)?.verifiedPatient?.username).toBe(username);
  });
});

describe("one PID, one account (ADR-067)", () => {
  it("after Klarbefund first, the wallet signs in to that account and cannot create a second one", async () => {
    const first = await klarbefundFirst();

    const wallet = await walletSignIn();
    expect(wallet.body).toEqual({ status: "completed" });
    const refused = await createAccountWithThisPid(wallet.sid);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/cannot create an account/);
    expect(kc.users.size).toBe(1);
    expect(getTransaction(wallet.sid)?.verifiedPatient?.username).toBe(
      first.username,
    );

    // A second Klarbefund account (another phone) cannot take the PID.
    const second = await appCreatesAccount(SECOND_PHONE);
    await signInWithKeycloak(second.username, second.password);
    const link = await connectYourEudiWallet();
    expect(link.status).toBe(409);
    expect(link.body).toEqual({
      status: "refused",
      error: expect.stringMatching(/already connected to another account/),
    });
    expect(keycloakUser(second.username).attributes ?? {}).toEqual({});
    expect(keycloakUser(first.username).attributes).toEqual({
      [PID_ATTRIBUTE]: [fingerprint()],
    });
  });

  it("after the wallet first, a Klarbefund account made later cannot take the PID", async () => {
    const fromWallet = await walletFirst();

    const fromApp = await appCreatesAccount();
    await signInWithKeycloak(fromApp.username, fromApp.password);
    const link = await connectYourEudiWallet();
    expect(link.status).toBe(409);
    expect(link.body.error).toMatch(/already connected to another account/);
    expect(keycloakUser(fromApp.username).attributes ?? {}).toEqual({});

    // The wallet still opens the account it created, and offers no other.
    signedOut();
    const wallet = await walletSignIn();
    expect(wallet.body).toEqual({ status: "completed" });
    expect(getTransaction(wallet.sid)?.verifiedPatient?.username).toBe(
      fromWallet.username,
    );
    expect((await createAccountWithThisPid(wallet.sid)).status).toBe(403);
    expect(kc.users.size).toBe(2);
  });
});

describe("the trap the runbook documents (#708)", () => {
  // When the pages warn about this, or a wallet sign-in learns to link, this
  // test fails on purpose: update it, the user guide and the runbook together.
  it("documented gap, tracked on #708: a wallet sign-in never links the PID to an existing Klarbefund account, it offers a second account", async () => {
    const existing = await appCreatesAccount();

    // Signed out, the person chooses Sign in with d-you, not Sign in with
    // Keycloak.
    const wallet = await walletSignIn();
    expect(wallet.status).toBe(403);
    expect(wallet.body).toEqual({
      status: "refused",
      error: expect.stringMatching(/no record/i),
      canRegister: true,
    });
    // Nothing was linked, and the existing account was not opened.
    expect(keycloakUser(existing.username).attributes ?? {}).toEqual({});
    expect(await eudiAuthorize(wallet.sid)).toBeNull();

    // Taking the offer makes a second account, which now holds the PID.
    const created = await createAccountWithThisPid(wallet.sid);
    expect(created.status).toBe(201);
    expect(created.body.username).not.toBe(existing.username);
    expect(kc.users.size).toBe(2);
    expect(keycloakUser(created.body.username).attributes).toEqual({
      [PID_ATTRIBUTE]: [fingerprint()],
    });

    // And the Klarbefund account can no longer be linked to it.
    signedOut();
    await signInWithKeycloak(existing.username, existing.password);
    const link = await connectYourEudiWallet();
    expect(link.status).toBe(409);
  });
});

describe("Disconnect wallet (user guide)", () => {
  it("removes the hash and keeps the account, its record and the app; the next wallet sign-in is offered an account again", async () => {
    const account = await klarbefundFirst();
    await signInWithKeycloak(account.username, account.password);

    expect(await disconnectWallet()).toEqual({
      status: 200,
      body: { linked: false },
    });
    expect(keycloakUser(account.username).attributes ?? {}).toEqual({});
    expect(graph.patients.has(account.patientId)).toBe(true);
    expect(graph.connections.get(PHONE)?.username).toBe(account.username);
    expect((await appReadsRecord(account.appToken, PHONE)).status).toBe(200);
    expect(await walletLinkState()).toMatchObject({ body: { linked: false } });

    signedOut();
    const wallet = await walletSignIn();
    expect(wallet.status).toBe(403);
    expect(wallet.body.canRegister).toBe(true);
    expect(await eudiAuthorize(wallet.sid)).toBeNull();

    // From the password session it connects again.
    await signInWithKeycloak(account.username, account.password);
    expect((await connectYourEudiWallet()).body).toEqual({ status: "linked" });
  });
});
