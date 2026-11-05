/**
 * A pull transfer on EDC 1.0 (#881) is served only on a token siglet signed:
 * the right issuer, a key from siglet's JWKS, not expired, and naming a dataset.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({ run: vi.fn(), close: vi.fn() })),
      getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
      close: vi.fn(),
    })),
    auth: { basic: vi.fn() },
  },
}));

const { verifyDataspaceToken, DATASET_ROUTES, SIGLET_ISSUER } = await import(
  "../src/dataspace-token.js"
);
const { app } = await import("../src/index.js");
import supertest from "supertest";
const request = supertest(app);

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let sigletKey: Key;
let otherKey: Key;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const siglet = await generateKeyPair("EdDSA", { extractable: true });
  sigletKey = siglet.privateKey;
  otherKey = (await generateKeyPair("EdDSA")).privateKey;
  const jwk = {
    ...(await exportJWK(siglet.publicKey)),
    kid: "signing-siglet-1",
    alg: "EdDSA",
  };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

function token(
  claims: Record<string, unknown>,
  { key = sigletKey, issuer = SIGLET_ISSUER, expiresIn = "1h" } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "signing-siglet-1" })
    .setIssuer(issuer)
    .setSubject("did:web:identityhub%3A7083:pharmaco")
    .setAudience("did:web:identityhub%3A7083:alpha-klinik")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

describe("verifyDataspaceToken", () => {
  it("returns the dataset, consumer and provider a siglet token grants", async () => {
    const grant = await verifyDataspaceToken(
      await token({ datasetId: "fhir-patient-search", agreementId: "agr-1" }),
      jwks,
    );
    expect(grant).toEqual({
      datasetId: "fhir-patient-search",
      consumer: "did:web:identityhub%3A7083:pharmaco",
      provider: "did:web:identityhub%3A7083:alpha-klinik",
      agreementId: "agr-1",
    });
  });

  it("refuses a token signed with a key siglet does not publish", async () => {
    await expect(
      verifyDataspaceToken(
        await token({ datasetId: "fhir-patient-search" }, { key: otherKey }),
        jwks,
      ),
    ).rejects.toThrow();
  });

  it("refuses a token from another issuer", async () => {
    await expect(
      verifyDataspaceToken(
        await token(
          { datasetId: "fhir-patient-search" },
          { issuer: "someone-else" },
        ),
        jwks,
      ),
    ).rejects.toThrow(/iss/);
  });

  it("refuses an expired token", async () => {
    await expect(
      verifyDataspaceToken(
        await token({ datasetId: "fhir-patient-search" }, { expiresIn: "-1m" }),
        jwks,
      ),
    ).rejects.toThrow(/exp/);
  });

  it("refuses a token that names no dataset", async () => {
    await expect(verifyDataspaceToken(await token({}), jwks)).rejects.toThrow(
      "the token names no dataset",
    );
  });

  it("knows a route for every FHIR, OMOP and catalog asset it serves", () => {
    expect(DATASET_ROUTES["fhir-patient-search"]).toEqual({
      method: "GET",
      path: "/fhir/Patient",
    });
    expect(DATASET_ROUTES["omop-cohort-statistics"]).toEqual({
      method: "POST",
      path: "/omop/cohort",
    });
  });
});

describe("/dataspace/data", () => {
  it("answers 401 with no token", async () => {
    const res = await request.get("/dataspace/data");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("A dataspace access token is required");
  });

  it("answers 401 to a token it cannot verify", async () => {
    const res = await request
      .get("/dataspace/data")
      .set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("The dataspace access token is not valid");
  });
});
