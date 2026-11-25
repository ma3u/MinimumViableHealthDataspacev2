import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import {
  JWKS_REFETCH_COOLDOWN_MS,
  verifyDataplaneToken,
} from "../src/dataplane-token.js";

// A data plane that restarts with a new signing key (compose: a key per
// start) must not have its tokens refused for long: the proxy fetches the key
// set again for an unknown kid after JWKS_REFETCH_COOLDOWN_MS, not jose's 30 s.

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let served: JWK[] = [];
let fetches = 0;
let server: http.Server;

async function keyPair(kid: string): Promise<{ jwk: JWK; key: Key }> {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(pair.publicKey)), kid, alg: "RS256" };
  return { jwk, key: pair.privateKey };
}

function token(key: Key, kid: string): Promise<string> {
  return new SignJWT({ scope: "inbox:open", flowId: "flow-1" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer("mvhd-dataplane")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(key);
}

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    fetches += 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: served }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.DATAPLANE_JWKS_URL = `http://127.0.0.1:${port}/.well-known/jwks.json`;
});

afterAll(async () => {
  delete process.env.DATAPLANE_JWKS_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("the data plane restarts with a new key", () => {
  it("accepts the new key's tokens within the short cooldown", async () => {
    const before = await keyPair("key-before");
    served = [before.jwk];
    const first = await verifyDataplaneToken(
      await token(before.key, "key-before"),
      "inbox:open",
    );
    expect(first.flowId).toBe("flow-1");

    // the restart: the data plane serves only its new key
    const after = await keyPair("key-after");
    served = [after.jwk];
    const fetchesBefore = fetches;
    await new Promise((r) => setTimeout(r, JWKS_REFETCH_COOLDOWN_MS + 200));

    const second = await verifyDataplaneToken(
      await token(after.key, "key-after"),
      "inbox:open",
    );
    expect(second.flowId).toBe("flow-1");
    expect(fetches).toBe(fetchesBefore + 1);
  });

  it("keeps the wait short, far below jose's 30 s default", () => {
    expect(JWKS_REFETCH_COOLDOWN_MS).toBeLessThanOrEqual(5_000);
  });
});
