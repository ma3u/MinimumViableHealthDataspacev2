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
  // Participant sub-types — set as Keycloak roles alongside EDC_USER_PARTICIPANT.
  // Falls back to username pattern detection for the demo stack.
  DATA_HOLDER: "DATA_HOLDER",
  DATA_USER: "DATA_USER",
  TRUST_CENTER_OPERATOR: "TRUST_CENTER_OPERATOR",
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];

export function hasRole(roles: string[] | undefined, role: Role): boolean {
  return roles?.includes(role) ?? false;
}

/**
 * Friendly display labels for each role code.
 * Shown in UserMenu and the sign-in persona cards.
 */
export const ROLE_LABELS: Record<string, string> = {
  EDC_ADMIN: "Dataspace Admin",
  EDC_USER_PARTICIPANT: "Participant",
  HDAB_AUTHORITY: "HDAB Authority",
  DATA_HOLDER: "Data Holder",
  DATA_USER: "Researcher",
  TRUST_CENTER_OPERATOR: "Trust Center",
};

/**
 * Demo participant cards shown on the sign-in page.
 * Each entry matches a Keycloak user in the local EDCV realm.
 */
export const DEMO_PERSONAS = [
  {
    username: "edcadmin",
    displayName: "edcadmin",
    organisation: "Dataspace Operator",
    roles: ["EDC_ADMIN"],
    personaId: "edc-admin",
    description: "Full operator access — all participants, contracts, admin",
    color: "text-red-300",
    badge: "bg-red-900/50 text-red-200 border-red-700",
  },
  {
    username: "clinicuser",
    displayName: "clinicuser",
    organisation: "AlphaKlinik Berlin",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    personaId: "hospital",
    description: "Publishes FHIR datasets, manages contracts with researchers",
    color: "text-blue-300",
    badge: "bg-blue-900/50 text-blue-200 border-blue-700",
  },
  {
    username: "researcher",
    displayName: "researcher",
    organisation: "PharmaCo Research AG",
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    personaId: "researcher",
    description: "Discovers datasets, negotiates access, runs OMOP analytics",
    color: "text-green-300",
    badge: "bg-green-900/50 text-green-200 border-green-700",
  },
  {
    username: "regulator",
    displayName: "regulator",
    organisation: "MedReg DE",
    roles: ["HDAB_AUTHORITY"],
    personaId: "hdab",
    description: "Reviews access applications, governs Trust Centers",
    color: "text-amber-300",
    badge: "bg-amber-900/50 text-amber-200 border-amber-700",
  },
  {
    username: "lmcuser",
    displayName: "lmcuser",
    organisation: "Limburg Medical Centre",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    personaId: "hospital",
    description: "NL data holder — publishes cross-border datasets",
    color: "text-blue-300",
    badge: "bg-blue-900/50 text-blue-200 border-blue-700",
  },
] as const;

/**
 * Derives the participant sub-type from roles and username.
 * Checks explicit Keycloak roles first, then falls back to username patterns
 * for the local demo stack.
 */
export function deriveParticipantType(
  roles: string[],
  username?: string | null,
): "DATA_HOLDER" | "DATA_USER" | "TRUST_CENTER_OPERATOR" | null {
  if (roles.includes("TRUST_CENTER_OPERATOR")) return "TRUST_CENTER_OPERATOR";
  if (roles.includes("DATA_HOLDER")) return "DATA_HOLDER";
  if (roles.includes("DATA_USER")) return "DATA_USER";
  // Demo fallback by username pattern
  const u = (username ?? "").toLowerCase();
  if (
    u.includes("clinic") ||
    u.includes("klinik") ||
    u.includes("lmc") ||
    u.includes("hospital")
  )
    return "DATA_HOLDER";
  if (
    u.includes("researcher") ||
    u.includes("pharmaco") ||
    u.includes("research")
  )
    return "DATA_USER";
  if (u.includes("rki") || u.includes("rivm") || u.includes("trust"))
    return "TRUST_CENTER_OPERATOR";
  return null;
}

/**
 * Derives the graph persona ID for a user.
 * Used to auto-redirect to the correct graph view after login.
 */
export function derivePersonaId(
  roles: string[],
  username?: string | null,
): string {
  if (roles.includes("EDC_ADMIN")) return "edc-admin";
  if (roles.includes("HDAB_AUTHORITY")) return "hdab";
  const type = deriveParticipantType(roles, username);
  if (type === "TRUST_CENTER_OPERATOR") return "trust-center";
  if (type === "DATA_HOLDER") return "hospital";
  if (type === "DATA_USER") return "researcher";
  return "default";
}
