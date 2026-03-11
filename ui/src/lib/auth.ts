import { type NextAuthOptions } from "next-auth";

/**
 * NextAuth.js configuration for Keycloak SSO (Phase 2c).
 *
 * Handles the Docker hostname split:
 *   - Server-side (token exchange, OIDC discovery): KEYCLOAK_ISSUER → http://keycloak:8080/realms/edcv
 *   - Browser-side (authorization redirect): KEYCLOAK_PUBLIC_URL → http://localhost:8080/realms/edcv
 */

const keycloakIssuer = process.env.KEYCLOAK_ISSUER!; // Docker-internal: http://keycloak:8080/realms/edcv
const keycloakPublicUrl = process.env.KEYCLOAK_PUBLIC_URL!; // Browser-facing: http://localhost:8080/realms/edcv

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      // Explicit endpoint split: browser-facing for authorization, Docker-internal for server-side
      issuer: keycloakIssuer,
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      authorization: {
        url: `${keycloakPublicUrl}/protocol/openid-connect/auth`,
        params: { scope: "openid profile email" },
      },
      token: `${keycloakIssuer}/protocol/openid-connect/token`,
      userinfo: `${keycloakIssuer}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${keycloakIssuer}/protocol/openid-connect/certs`,
      checks: ["pkce", "state"],
      profile(profile: any) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: null,
        };
      },
    } as any,
  ],

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        // Extract realm roles from Keycloak token
        const keycloakProfile = profile as Record<string, unknown>;
        const realmAccess = keycloakProfile.realm_access as
          | { roles?: string[] }
          | undefined;
        token.roles = realmAccess?.roles ?? [];
        token.sub = profile.sub;
      }
      return token;
    },

    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string,
        roles: (token.roles as string[]) ?? [],
        user: {
          ...session.user,
          id: token.sub as string,
        },
      };
    },
  },

  pages: {
    signIn: "/auth/signin",
  },

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },

  // Trust Keycloak logout
  events: {
    async signOut() {
      // Optionally trigger Keycloak end-session here
    },
  },
};

/**
 * Health Dataspace roles for route protection.
 */
export const Roles = {
  EDC_ADMIN: "EDC_ADMIN",
  EDC_USER_PARTICIPANT: "EDC_USER_PARTICIPANT",
  HDAB_AUTHORITY: "HDAB_AUTHORITY",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/**
 * Check if a session has a specific role.
 */
export function hasRole(roles: string[] | undefined, role: Role): boolean {
  return roles?.includes(role) ?? false;
}
