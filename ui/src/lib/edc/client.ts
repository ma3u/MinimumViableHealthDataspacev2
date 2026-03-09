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
 *   // List all assets
 *   const assets = await edcClient.management('/v3/assets/request', 'POST', {});
 *
 *   // Get catalogs
 *   const catalog = await edcClient.management('/v3/catalog/request', 'POST', body);
 *
 * Types are generated from JAD OpenAPI specs via:
 *   npm run generate:api
 *
 * @see {@link https://github.com/Metaform/jad} JAD repository
 */

// ---------------------------------------------------------------------------
// Configuration — base URLs for each API (Docker Compose defaults)
// ---------------------------------------------------------------------------
const API_ENDPOINTS = {
  /** EDC-V Management API (Control Plane) */
  management:
    process.env.NEXT_PUBLIC_EDC_MANAGEMENT_URL ||
    "http://cp.localhost/api/mgmt",
  /** DCP Identity API (IdentityHub) */
  identity:
    process.env.NEXT_PUBLIC_EDC_IDENTITY_URL ||
    "http://ih.localhost/api/identity",
  /** Issuer Admin API (IssuerService) */
  issuer:
    process.env.NEXT_PUBLIC_EDC_ISSUER_URL ||
    "http://issuer.localhost/api/admin",
  /** CFM Tenant Manager API */
  tenant: process.env.NEXT_PUBLIC_CFM_TENANT_URL || "http://tm.localhost/api",
  /** CFM Provision Manager API */
  provision:
    process.env.NEXT_PUBLIC_CFM_PROVISION_URL || "http://pm.localhost/api",
} as const;

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
    process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://keycloak.localhost";
  const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "edcv";
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "admin";
  const clientSecret =
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_SECRET || "edc-v-admin-secret";

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
