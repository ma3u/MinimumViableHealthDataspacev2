/**
 * EDC-V / CFM API Client
 *
 * Type-safe client for all JAD Management, Identity, Issuer, Tenant, and
 * Provision Manager APIs. Uses openapi-typescript generated types with
 * a lightweight fetch wrapper.
 *
 * Usage:
 *   import { edcClient } from '@/lib/edc/client';
 *
 *   // List all assets for a participant
 *   const assets = await edcClient.management(
 *     '/v5alpha/participants/{ctxId}/assets/request', 'POST',
 *     { '@context': [EDC_CONTEXT], '@type': 'QuerySpec' }
 *   );
 *
 *   // List tenants
 *   const tenants = await edcClient.tenant('/v1alpha1/tenants');
 *
 * Types are generated from JAD OpenAPI specs via:
 *   npm run generate:api
 *
 * @see {@link https://github.com/Metaform/jad} JAD repository
 */

// ---------------------------------------------------------------------------
// Configuration — base URLs for each API (Docker Compose defaults)
// ---------------------------------------------------------------------------

/**
 * Server-side env vars (no NEXT_PUBLIC_ prefix) use Docker-internal hostnames.
 * The NEXT_PUBLIC_ fallbacks use Traefik *.localhost for client-side/dev use.
 */
const API_ENDPOINTS = {
  /** EDC-V Management API (Control Plane — port 8081) */
  management:
    process.env.EDC_MANAGEMENT_URL ||
    process.env.NEXT_PUBLIC_EDC_MANAGEMENT_URL ||
    "http://health-dataspace-controlplane:8081/api/mgmt",
  /** DCP Identity API (IdentityHub — port 7081) */
  identity:
    process.env.EDC_IDENTITY_URL ||
    process.env.NEXT_PUBLIC_EDC_IDENTITY_URL ||
    "http://health-dataspace-identityhub:7081/api/identity",
  /** Issuer Admin API (IssuerService — port 10013) */
  issuer:
    process.env.EDC_ISSUER_URL ||
    process.env.NEXT_PUBLIC_EDC_ISSUER_URL ||
    "http://health-dataspace-issuerservice:10013/api/admin",
  /** CFM Tenant Manager API */
  tenant:
    process.env.EDC_TENANT_URL ||
    process.env.NEXT_PUBLIC_CFM_TENANT_URL ||
    "http://health-dataspace-tenant-manager:8080/api",
  /** CFM Provision Manager API */
  provision:
    process.env.EDC_PROVISION_URL ||
    process.env.NEXT_PUBLIC_CFM_PROVISION_URL ||
    "http://health-dataspace-provision-manager:8080/api",
} as const;

/** JSON-LD context required by EDC Management API v5alpha */
export const EDC_CONTEXT = "https://w3id.org/edc/connector/management/v2";

type ApiName = keyof typeof API_ENDPOINTS;

// ---------------------------------------------------------------------------
// Token management — Keycloak OAuth2 client credentials flow
// ---------------------------------------------------------------------------
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an OAuth2 access token from Keycloak using client credentials grant.
 * Tokens are cached and refreshed 30s before expiry.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const keycloakUrl =
    process.env.KEYCLOAK_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_KEYCLOAK_URL ||
    "http://keycloak:8080";
  const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "edcv";
  const clientId =
    process.env.EDC_SERVICE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ||
    "admin";
  const clientSecret =
    process.env.EDC_SERVICE_CLIENT_SECRET ||
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_SECRET ||
    "edc-v-admin-secret";

  const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Keycloak token request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: TokenResponse = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
interface RequestOptions {
  /** Skip OAuth2 token (for public endpoints) */
  noAuth?: boolean;
  /** Additional headers */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Make a typed API request to a JAD service.
 *
 * @param api - Which API to call (management, identity, issuer, tenant, provision)
 * @param path - API path (e.g., '/v3/assets/request')
 * @param method - HTTP method
 * @param body - Request body (will be JSON-serialized)
 * @param options - Additional request options
 * @returns Parsed JSON response
 */
async function apiRequest<T = unknown>(
  api: ApiName,
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = API_ENDPOINTS[api];
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...options.headers,
  };

  if (!options.noAuth) {
    try {
      const token = await getAccessToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (err) {
      console.warn("Failed to get access token, proceeding without auth:", err);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "No error body");
    throw new Error(
      `EDC API error [${api}] ${method} ${path}: ${response.status} ${response.statusText}\n${errorBody}`,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Typed API client facade
// ---------------------------------------------------------------------------

/** Type-safe EDC-V / CFM API client */
export const edcClient = {
  /** EDC-V Management API — assets, policies, contracts, catalogs, transfers */
  management: <T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: unknown,
    options?: RequestOptions,
  ) => apiRequest<T>("management", path, method, body, options),

  /** DCP Identity API — participants, key pairs, credentials */
  identity: <T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: unknown,
    options?: RequestOptions,
  ) => apiRequest<T>("identity", path, method, body, options),

  /** Issuer Admin API — credential definitions, issuance */
  issuer: <T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: unknown,
    options?: RequestOptions,
  ) => apiRequest<T>("issuer", path, method, body, options),

  /** CFM Tenant Manager API — tenants, participant profiles, dataspaces */
  tenant: <T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: unknown,
    options?: RequestOptions,
  ) => apiRequest<T>("tenant", path, method, body, options),

  /** CFM Provision Manager API — provision requests, workflows */
  provision: <T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
    body?: unknown,
    options?: RequestOptions,
  ) => apiRequest<T>("provision", path, method, body, options),
} as const;

export type { ApiName, RequestOptions };
