/**
 * Workload Identity Federation against the Claude API.
 *
 * Exchanges a JWT from an identity provider we operate for a short-lived
 * Anthropic access token, so nothing in this system ever holds an
 * `sk-ant-...` API key.
 *
 * Contract per Anthropic's WIF documentation:
 * https://platform.claude.com/docs/en/manage-claude/workload-identity-federation
 */

/** RFC 7523 grant used by the exchange. */
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export interface FederationConfig {
  /** `fdrl_...`, the rule the JWT must satisfy. */
  federationRuleId: string;
  /** Anthropic organization UUID. */
  organizationId: string;
  /** `svac_...`, the service account the minted token acts as. */
  serviceAccountId: string;
  /** `wrkspc_...`. Required when the rule covers more than one workspace. */
  workspaceId?: string;
  /** Override for tests. */
  baseUrl?: string;
}

/** RFC 6749 §5.1 token response. */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AccessToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * What the token endpoint said, with no clock applied.
 *
 * `exchange` deliberately does not stamp an absolute expiry. It used to, using
 * `Date.now()`, while `FederatedCredentials` compared against an injectable
 * clock. Two clocks in one refresh decision meant the cache never expired
 * under a fake clock and the refresh schedule was, in effect, untested. The
 * caller owns time; this reports only what the server returned.
 */
export interface MintedToken {
  token: string;
  expiresInSeconds: number;
}

export class FederationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "FederationError";
  }
}

/**
 * Mints a fresh identity JWT.
 *
 * **Must** return a new token each call, never a cached one. Anthropic treats
 * identity tokens carrying a `jti` as single use: re-presenting one is rejected
 * as `jti_reused`. A provider that hands back the same cached JWT will work
 * exactly once and then fail every refresh, which is a confusing way to find
 * out, so the contract is stated here rather than discovered in production.
 */
export type IdentityTokenProvider = () => Promise<string>;

/**
 * Exchanges one identity JWT for an Anthropic access token.
 *
 * The minted token's lifetime is the lesser of the rule's
 * `token_lifetime_seconds` and twice the remaining life of the presented JWT,
 * floored at 60 seconds, so the returned expiry is read from the response
 * rather than assumed from configuration.
 */
export async function exchange(
  assertion: string,
  config: FederationConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MintedToken> {
  const base = config.baseUrl ?? "https://api.anthropic.com";
  const body: Record<string, string> = {
    grant_type: JWT_BEARER_GRANT,
    assertion,
    federation_rule_id: config.federationRuleId,
    organization_id: config.organizationId,
    service_account_id: config.serviceAccountId,
  };
  if (config.workspaceId) body.workspace_id = config.workspaceId;

  const response = await fetchImpl(`${base}/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // The response body carries the reason (bad rule, claim mismatch,
    // jti_reused). Surfacing it is the difference between a five-minute fix and
    // an afternoon in the Console's authentication history page.
    const detail = await response.text().catch(() => "");
    throw new FederationError(
      `token exchange failed with HTTP ${response.status}`,
      response.status,
      detail.slice(0, 500),
    );
  }

  const payload = (await response.json()) as Partial<TokenResponse>;
  if (!payload.access_token || typeof payload.expires_in !== "number") {
    throw new FederationError(
      "token exchange returned a response with no access_token or expires_in",
    );
  }

  return { token: payload.access_token, expiresInSeconds: payload.expires_in };
}

/** Seconds before expiry at which a refresh is attempted but failure tolerated. */
export const ADVISORY_REFRESH_SECONDS = 120;
/** Seconds before expiry at which a failed refresh becomes an error. */
export const MANDATORY_REFRESH_SECONDS = 30;

/**
 * Caches the minted token and refreshes it on the two-tier schedule the SDKs
 * use.
 *
 * Advisory refresh at expiry minus 120s attempts an exchange and, if the token
 * endpoint is unreachable, keeps serving the cached token which is still good
 * for roughly 90 seconds. Mandatory refresh at expiry minus 30s raises instead,
 * because at that point the cached token is too close to expiry to be safe.
 *
 * The distinction matters: a transient network blip during advisory refresh
 * should not take the service down, and a real outage at mandatory refresh
 * must not be papered over with a token that is about to be rejected.
 */
export class FederatedCredentials {
  private cached?: AccessToken;
  private inFlight?: Promise<AccessToken>;

  constructor(
    private readonly identityToken: IdentityTokenProvider,
    private readonly config: FederationConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** A token that is valid now, refreshing if the schedule calls for it. */
  async get(): Promise<string> {
    const current = this.cached;
    const remainingMs = current ? current.expiresAt - this.now() : -1;

    if (current && remainingMs > ADVISORY_REFRESH_SECONDS * 1000) {
      return current.token;
    }

    const mandatory =
      !current || remainingMs <= MANDATORY_REFRESH_SECONDS * 1000;

    try {
      // One exchange at a time. Concurrent requests must not each burn an
      // identity JWT, both because the exchange costs a round trip and because
      // single-use `jti` semantics make the losers fail outright.
      this.inFlight ??= this.refresh().finally(() => {
        this.inFlight = undefined;
      });
      const token = await this.inFlight;
      return token.token;
    } catch (error) {
      if (mandatory) throw error;
      // Advisory window: the cached token is still usable, so serve it and let
      // the next call try again.
      return current!.token;
    }
  }

  private async refresh(): Promise<AccessToken> {
    const assertion = await this.identityToken();
    const minted = await exchange(assertion, this.config, this.fetchImpl);
    const token: AccessToken = {
      token: minted.token,
      expiresAt: this.now() + minted.expiresInSeconds * 1000,
    };
    this.cached = token;
    return token;
  }

  /** Exposed for tests and health checks; never logged. */
  get expiresAt(): number | undefined {
    return this.cached?.expiresAt;
  }
}
