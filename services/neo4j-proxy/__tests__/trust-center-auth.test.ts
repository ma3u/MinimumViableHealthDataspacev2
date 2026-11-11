/**
 * The trust centre's pseudonym routes act for an access body (EHDS Art. 66,
 * Art. 73): resolve and revoke take a realm token with HDAB_AUTHORITY or
 * TRUST_CENTER_OPERATOR, and refuse anyone else (#1029). And no response
 * carries an internal error message: a Neo4j error quotes its query.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import supertest from "supertest";

process.env.KEYCLOAK_ISSUER = "http://keycloak:8080/realms/edcv";
process.env.KEYCLOAK_PUBLIC_URL = "http://localhost:8080/realms/edcv";

// The realm's keys are a key pair made here, not Keycloak's JWKS.
let realmJwks: JWTVerifyGetKey;
vi.mock("jose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jose")>()),
  createRemoteJWKSet: () =>
    ((...args: Parameters<JWTVerifyGetKey>) =>
      realmJwks(...args)) as JWTVerifyGetKey,
}));

const run = vi.fn();
vi.mock("../src/db.js", () => ({
  getSession: () => ({ run, close: vi.fn() }),
}));
const logError = vi.fn();
vi.mock("../src/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/logger.js")>();
  return {
    ...actual,
    logger: { ...actual.logger, error: logError, warn: vi.fn() },
  };
});

const { app } = await import("../src/app.js");
await import("../src/routes/trust-center.js");
await import("../src/error-handler.js");
const request = supertest(app);

let privateKey: CryptoKey;
let foreignKey: CryptoKey;

beforeAll(async () => {
  const realm = await generateKeyPair("RS256");
  privateKey = realm.privateKey;
  const jwk = {
    ...(await exportJWK(realm.publicKey)),
    kid: "realm",
    alg: "RS256",
  };
  realmJwks = createLocalJWKSet({ keys: [jwk] });
  foreignKey = (await generateKeyPair("RS256")).privateKey;
});

function token(
  roles: string[],
  opts: { key?: CryptoKey; issuer?: string; expiresIn?: string } = {},
) {
  return new SignJWT({
    preferred_username: "regulator",
    realm_access: { roles },
  })
    .setProtectedHeader({ alg: "RS256", kid: "realm" })
    .setIssuer(opts.issuer ?? "http://localhost:8080/realms/edcv")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(opts.key ?? privateKey);
}

const RESOLVE_BODY = {
  studyId: "study-001",
  trustCenterName: "TC-DE",
  providerPseudonyms: [{ psnId: "psn-1", providerId: "alpha-klinik" }],
};

type Row = Record<string, unknown>;
const records = (...rows: Row[]) => ({
  records: rows.map((row) => ({ get: (k: string) => row[k] })),
});

beforeEach(() => {
  run.mockReset();
  logError.mockReset();
});

describe("POST /trust-center/resolve", () => {
  it("answers 401 without a token", async () => {
    const res = await request.post("/trust-center/resolve").send(RESOLVE_BODY);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 401 for a token the realm did not sign", async () => {
    const res = await request
      .post("/trust-center/resolve")
      .set(
        "Authorization",
        `Bearer ${await token(["HDAB_AUTHORITY"], { key: foreignKey })}`,
      )
      .send(RESOLVE_BODY);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 401 for another issuer and for an expired token", async () => {
    for (const t of [
      await token(["HDAB_AUTHORITY"], {
        issuer: "http://evil.example/realms/edcv",
      }),
      await token(["HDAB_AUTHORITY"], { expiresIn: "-1m" }),
    ]) {
      const res = await request
        .post("/trust-center/resolve")
        .set("Authorization", `Bearer ${t}`)
        .send(RESOLVE_BODY);
      expect(res.status).toBe(401);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 403 for a data user, and for a patient", async () => {
    for (const roles of [["EDC_USER_PARTICIPANT", "DATA_USER"], ["PATIENT"]]) {
      const res = await request
        .post("/trust-center/resolve")
        .set("Authorization", `Bearer ${await token(roles)}`)
        .send(RESOLVE_BODY);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden" });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("resolves for an access body", async () => {
    run
      .mockResolvedValueOnce(
        records({ did: "did:web:tc.example", protocol: "x", country: "DE" }),
      )
      .mockResolvedValue({ records: [] });
    const res = await request
      .post("/trust-center/resolve")
      .set("Authorization", `Bearer ${await token(["HDAB_AUTHORITY"])}`)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(200);
    expect(res.body.rpsnId).toMatch(/^rpsn-[a-f0-9]{64}$/);
    expect(res.body.trustCenterDid).toBe("did:web:tc.example");
  });

  it("resolves for a trust centre operator, whose token came from the internal issuer", async () => {
    run
      .mockResolvedValueOnce(
        records({ did: "did:web:tc.example", protocol: "x", country: "DE" }),
      )
      .mockResolvedValue({ records: [] });
    const res = await request
      .post("/trust-center/resolve")
      .set(
        "Authorization",
        `Bearer ${await token(["TRUST_CENTER_OPERATOR"], {
          issuer: "http://keycloak:8080/realms/edcv",
        })}`,
      )
      .send(RESOLVE_BODY);
    expect(res.status).toBe(200);
  });

  it("does not hand an internal error message to the caller, and logs it", async () => {
    const internal =
      "Neo.ClientError.Statement.SyntaxError: Invalid input 'X' (line 1) MATCH (tc:TrustCenter {name: 'TC-DE'})";
    run.mockRejectedValue(new Error(internal));
    const res = await request
      .post("/trust-center/resolve")
      .set("Authorization", `Bearer ${await token(["HDAB_AUTHORITY"])}`)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal Server Error" });
    expect(res.text).not.toContain("Neo.ClientError");
    expect(res.text).not.toContain("MATCH");
    expect(logError).toHaveBeenCalledOnce();
    expect((logError.mock.calls[0][0] as { err: Error }).err.message).toBe(
      internal,
    );
  });
});

describe("DELETE /trust-center/revoke/:rpsn", () => {
  it("answers 401 without a token", async () => {
    const res = await request.delete("/trust-center/revoke/rpsn-abc");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 401 for a malformed Authorization header", async () => {
    const res = await request
      .delete("/trust-center/revoke/rpsn-abc")
      .set("Authorization", "Basic cmVndWxhdG9yOng=");
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 403 for a data user and for a data holder", async () => {
    for (const roles of [["DATA_USER"], ["DATA_HOLDER"]]) {
      const res = await request
        .delete("/trust-center/revoke/rpsn-abc")
        .set("Authorization", `Bearer ${await token(roles)}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden" });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("revokes for an access body, recorded as the verified caller", async () => {
    run
      .mockResolvedValueOnce(
        records({ rpsnId: "rpsn-abc", studyId: "study-001" }),
      )
      .mockResolvedValue({ records: [] });
    const res = await request
      .delete("/trust-center/revoke/rpsn-abc")
      .set("Authorization", `Bearer ${await token(["HDAB_AUTHORITY"])}`)
      .set("X-Participant-Id", "did:web:pharmaco.de:research");
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    expect(run.mock.calls[0][1].revokedBy).toBe("regulator");
  });

  it("does not hand an internal error message to the caller", async () => {
    run.mockRejectedValue(
      new Error("Neo.TransientError: connection to neo4j:7687 lost"),
    );
    const res = await request
      .delete("/trust-center/revoke/rpsn-abc")
      .set("Authorization", `Bearer ${await token(["TRUST_CENTER_OPERATOR"])}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal Server Error" });
    expect(res.text).not.toContain("neo4j:7687");
  });
});

describe("the routes that stay open", () => {
  it("GET /trust-center/status needs no token", async () => {
    run.mockResolvedValue({ records: [] });
    const res = await request.get("/trust-center/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trustCenters: [] });
  });
});
