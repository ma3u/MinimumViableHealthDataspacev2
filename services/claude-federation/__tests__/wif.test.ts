import { describe, expect, it, vi } from "vitest";
import {
  ADVISORY_REFRESH_SECONDS,
  FederatedCredentials,
  FederationError,
  exchange,
} from "../src/wif.js";

const config = {
  federationRuleId: "fdrl_test",
  organizationId: "00000000-0000-0000-0000-000000000000",
  serviceAccountId: "svac_test",
  workspaceId: "wrkspc_test",
  baseUrl: "https://api.example.invalid",
};

function okResponse(token: string, expiresIn = 600): Response {
  return new Response(
    JSON.stringify({
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("exchange", () => {
  it("posts the RFC 7523 jwt-bearer grant with the rule, org and service account", async () => {
    const fetchImpl = vi.fn(async () => okResponse("sk-ant-oat01-x"));
    await exchange(
      "the.jwt.here",
      config,
      fetchImpl as unknown as typeof fetch,
    );

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.example.invalid/v1/oauth/token");
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: "the.jwt.here",
      federation_rule_id: "fdrl_test",
      organization_id: "00000000-0000-0000-0000-000000000000",
      service_account_id: "svac_test",
      workspace_id: "wrkspc_test",
    });
  });

  it("omits workspace_id when the rule covers a single workspace", async () => {
    const fetchImpl = vi.fn(async () => okResponse("t"));
    const { workspaceId, ...single } = config;
    void workspaceId;
    await exchange("jwt", single, fetchImpl as unknown as typeof fetch);
    expect(
      JSON.parse(String((fetchImpl.mock.calls[0] as never[])[1]!["body"])),
    ).not.toHaveProperty("workspace_id");
  });

  it("takes the expiry from the response, never from configuration", async () => {
    // The minted lifetime is the lesser of the rule's setting and twice the
    // remaining life of the presented JWT, so assuming the configured value
    // would eventually serve a token that is already dead.
    const fetchImpl = vi.fn(async () => okResponse("t", 61));
    const token = await exchange(
      "jwt",
      config,
      fetchImpl as unknown as typeof fetch,
    );
    expect(token.expiresInSeconds).toBe(61);
  });

  it("surfaces the upstream reason instead of a bare failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"error":"jti_reused"}', { status: 400 }),
    );
    await expect(
      exchange("jwt", config, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({
      status: 400,
      detail: expect.stringContaining("jti_reused"),
    });
  });

  it("rejects a malformed response rather than caching nonsense", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      exchange("jwt", config, fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(FederationError);
  });
});

describe("FederatedCredentials", () => {
  it("mints a fresh identity token for every exchange", async () => {
    // Anthropic treats a JWT carrying jti as single use. A provider that
    // returns a cached token works exactly once and then fails every refresh.
    let issued = 0;
    const identity = vi.fn(async () => `jwt-${++issued}`);
    let now = 1_000_000;
    const fetchImpl = vi.fn(async () => okResponse(`token-${issued}`, 600));

    const credentials = new FederatedCredentials(
      identity,
      config,
      fetchImpl as unknown as typeof fetch,
      () => now,
    );

    expect(await credentials.get()).toBe("token-1");
    now += 600_000; // past expiry
    expect(await credentials.get()).toBe("token-2");
    expect(identity).toHaveBeenCalledTimes(2);
    expect(
      (fetchImpl.mock.calls as never[][]).map(
        (c) => JSON.parse(String(c[1]!["body"])).assertion,
      ),
    ).toEqual(["jwt-1", "jwt-2"]);
  });

  it("serves the cached token while it is comfortably valid", async () => {
    const fetchImpl = vi.fn(async () => okResponse("token", 600));
    let now = 1_000_000;
    const credentials = new FederatedCredentials(
      async () => "jwt",
      config,
      fetchImpl as unknown as typeof fetch,
      () => now,
    );

    await credentials.get();
    now += 60_000;
    await credentials.get();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps serving the cached token when an advisory refresh fails", async () => {
    // Expiry minus 120s: the exchange is attempted, and a network blip here
    // must not take the service down while a valid token is still in hand.
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return okResponse("token-1", 600);
      throw new Error("network down");
    });
    let now = 1_000_000;
    const credentials = new FederatedCredentials(
      async () => "jwt",
      config,
      fetchImpl as unknown as typeof fetch,
      () => now,
    );

    expect(await credentials.get()).toBe("token-1");
    now += (600 - ADVISORY_REFRESH_SECONDS + 1) * 1000;
    expect(await credentials.get()).toBe("token-1");
    expect(calls).toBe(2);
  });

  it("raises when a mandatory refresh fails, rather than serving a dying token", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return okResponse("token-1", 600);
      throw new Error("network down");
    });
    let now = 1_000_000;
    const credentials = new FederatedCredentials(
      async () => "jwt",
      config,
      fetchImpl as unknown as typeof fetch,
      () => now,
    );

    await credentials.get();
    now += (600 - 10) * 1000; // inside the mandatory window
    await expect(credentials.get()).rejects.toThrow("network down");
  });

  it("does not burn an identity token per concurrent caller", async () => {
    let issued = 0;
    const identity = vi.fn(async () => `jwt-${++issued}`);
    const fetchImpl = vi.fn(async () => okResponse("token", 600));
    const credentials = new FederatedCredentials(
      identity,
      config,
      fetchImpl as unknown as typeof fetch,
    );

    await Promise.all([
      credentials.get(),
      credentials.get(),
      credentials.get(),
    ]);
    expect(identity).toHaveBeenCalledTimes(1);
  });
});
