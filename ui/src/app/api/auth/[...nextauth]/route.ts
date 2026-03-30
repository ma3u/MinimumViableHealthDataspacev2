import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Next.js 15 aggressively caches server-side fetch() by default. NextAuth v4
 * uses fetch internally for OIDC discovery (wellKnown). If the first discovery
 * fetch fails (e.g. Keycloak not ready yet), Next.js caches the failure and
 * all subsequent auth attempts fail with `error=keycloak`.
 *
 * `force-dynamic` + `fetchCache = "force-no-store"` disable this caching so
 * every auth request re-fetches the OIDC configuration.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const handler = NextAuth(authOptions);

// Log configuration on startup (server-side only)
if (typeof window === "undefined") {
  console.log("[NextAuth] Configuration loaded:");
  console.log("  NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
  console.log("  KEYCLOAK_CLIENT_ID:", process.env.KEYCLOAK_CLIENT_ID);
  console.log("  KEYCLOAK_ISSUER:", process.env.KEYCLOAK_ISSUER);
  console.log("  KEYCLOAK_PUBLIC_URL:", process.env.KEYCLOAK_PUBLIC_URL);
}

export { handler as GET, handler as POST };
