/**
 * Identity tokens from Azure, for the workload that federates to Anthropic.
 *
 * The stack already runs on Azure Container Apps (`rg-mvhd-dev`), so the
 * workload has an Entra managed identity available with no secret to store: the
 * platform injects `IDENTITY_ENDPOINT` and `IDENTITY_HEADER`, and the endpoint
 * hands back a signed JWT for the audience we ask for. That is the whole point
 * of federating rather than shipping an API key. There is no credential in this
 * repository, in the container image, or in the app.
 */
import { FederationError } from "./wif.js";

export interface EntraConfig {
  /**
   * The audience to request, which becomes the `aud` claim the federation rule
   * matches on. An App ID URI registered in the tenant, for example
   * `api://meinbefund-claude`.
   */
  audience: string;
  /** `IDENTITY_ENDPOINT`, injected by Container Apps. */
  endpoint: string;
  /** `IDENTITY_HEADER`, injected by Container Apps. */
  header: string;
  /** User-assigned identity client id; omit for the system-assigned identity. */
  clientId?: string;
}

export function entraConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EntraConfig {
  const missing = [
    "ANTHROPIC_WIF_AUDIENCE",
    "IDENTITY_ENDPOINT",
    "IDENTITY_HEADER",
  ].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new FederationError(
      `missing environment for the Azure identity provider: ${missing.join(
        ", ",
      )}. ` +
        "IDENTITY_ENDPOINT and IDENTITY_HEADER are injected by Container Apps when " +
        "a managed identity is assigned; running locally needs them supplied by hand.",
    );
  }
  return {
    audience: env.ANTHROPIC_WIF_AUDIENCE!,
    endpoint: env.IDENTITY_ENDPOINT!,
    header: env.IDENTITY_HEADER!,
    clientId: env.AZURE_CLIENT_ID,
  };
}

/**
 * Fetches a managed-identity JWT.
 *
 * `bypass_cache=true` is deliberate and load-bearing. The instance metadata
 * service caches tokens and will happily return the same JWT until it is close
 * to expiry, but Anthropic treats an identity token carrying a `jti` as single
 * use and rejects a repeat as `jti_reused`. A cached token would therefore
 * work for exactly one exchange and fail every refresh afterwards, which
 * surfaces hours later as an outage rather than immediately as a
 * misconfiguration. Asking for a fresh token every time costs one metadata
 * round trip per refresh, which is roughly hourly.
 */
export async function fetchIdentityToken(
  config: EntraConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(config.endpoint);
  url.searchParams.set("api-version", "2019-08-01");
  url.searchParams.set("resource", config.audience);
  url.searchParams.set("bypass_cache", "true");
  if (config.clientId) url.searchParams.set("client_id", config.clientId);

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { "X-IDENTITY-HEADER": config.header },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new FederationError(
      `managed identity token request failed with HTTP ${response.status}`,
      response.status,
      detail.slice(0, 500),
    );
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new FederationError(
      "managed identity endpoint returned no access_token",
    );
  }
  return payload.access_token;
}

/**
 * Reads `iss` and `aud` out of a JWT without verifying it.
 *
 * Only for configuration diagnostics: registering a federation issuer requires
 * the exact `iss` string, and getting it wrong (`https://sts.windows.net/<t>/`
 * for a v1 managed-identity token versus
 * `https://login.microsoftonline.com/<t>/v2.0` for a v2 one) produces a
 * signature-verification failure with no hint about which value to use. This
 * prints the value to paste into the Console. It must never be used to make an
 * authorisation decision; Anthropic verifies the signature, we do not.
 */
export function describeUnverifiedToken(jwt: string): {
  issuer?: string;
  audience?: string;
  expiresAt?: string;
} {
  const segments = jwt.split(".");
  const payload = segments[1];
  if (!payload) return {};
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { iss?: string; aud?: string | string[]; exp?: number };
    return {
      issuer: claims.iss,
      audience: Array.isArray(claims.aud) ? claims.aud.join(",") : claims.aud,
      expiresAt: claims.exp
        ? new Date(claims.exp * 1000).toISOString()
        : undefined,
    };
  } catch {
    return {};
  }
}
