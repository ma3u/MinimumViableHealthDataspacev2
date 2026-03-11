import { type NextAuthOptions } from "next-auth";

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";
const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      version: "2.0",
      issuer: keycloakPublicUrl,
      clientId: process.env.KEYCLOAK_CLIENT_ID || "ui",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "ui-secret",
      authorization: {
        url: `${keycloakPublicUrl}/protocol/openid-connect/auth`,
        params: { scope: "openid profile email" },
      },
      token: `${keycloakServerUrl}/protocol/openid-connect/token`,
      userinfo: `${keycloakServerUrl}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${keycloakServerUrl}/protocol/openid-connect/certs`,
      idToken: true,
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
        user: { ...session.user, id: token.sub as string },
      };
    },
  },
  pages: { signIn: "/auth/signin" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  events: {},
};

export const Roles = {
  EDC_ADMIN: "EDC_ADMIN",
  EDC_USER_PARTICIPANT: "EDC_USER_PARTICIPANT",
  HDAB_AUTHORITY: "HDAB_AUTHORITY",
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];
export function hasRole(roles: string[] | undefined, role: Role): boolean {
  return roles?.includes(role) ?? false;
}
