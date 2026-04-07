import { type NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";
const keycloakPublicUrl =
  process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv";

/**
 * Custom Keycloak OIDC provider with split URLs (Docker-internal vs public).
 *
 * All server-side endpoints (token, userinfo, jwks) use the Docker-internal
 * hostname (keycloak:8080). Browser-facing endpoints (authorization, issuer)
 * use the public localhost URL.
 *
 * IMPORTANT: Do NOT set `wellKnown` — NextAuth v4 fetches the OIDC discovery
 * document and uses its endpoint URLs, which contain `localhost:8080`. From
 * inside the container, `localhost` resolves to the container itself (not the
 * Keycloak container), causing ECONNREFUSED during token exchange.
 *
 * See CLAUDE.md Gotchas #5 and #6.
 */
const keycloakProvider: OAuthConfig<Record<string, unknown>> = {
  id: "keycloak",
  name: "Keycloak",
  type: "oauth",
  issuer: keycloakPublicUrl,
  clientId: process.env.KEYCLOAK_CLIENT_ID || "health-dataspace-ui",
  clientSecret:
    process.env.KEYCLOAK_CLIENT_SECRET || "health-dataspace-ui-secret",
  authorization: {
    url: `${keycloakPublicUrl}/protocol/openid-connect/auth`,
    params: { scope: "openid profile email" },
  },
  token: `${keycloakServerUrl}/protocol/openid-connect/token`,
  userinfo: `${keycloakServerUrl}/protocol/openid-connect/userinfo`,
  jwks_endpoint: `${keycloakServerUrl}/protocol/openid-connect/certs`,
  idToken: true,
  checks: ["pkce", "state"],
  profile(profile) {
    return {
      id: profile.sub as string,
      name: (profile.name ?? profile.preferred_username) as string,
      email: profile.email as string,
      image: null,
    };
  },
};

export const authOptions: NextAuthOptions = {
  providers: [keycloakProvider],
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
  debug: process.env.NEXTAUTH_DEBUG === "true",
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
  // EHDS Chapter II / GDPR Art. 15-22 — patient primary-use access
  PATIENT: "PATIENT",
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
  PATIENT: "Patient / Citizen",
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
    description: "Full operator access: all participants, contracts, admin",
    color: "text-[var(--role-admin-text)]",
    badge:
      "bg-[var(--role-admin-bg)] text-[var(--role-admin-text)] border-[var(--role-admin-border)]",
  },
  {
    username: "clinicuser",
    displayName: "clinicuser",
    organisation: "AlphaKlinik Berlin",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    personaId: "hospital",
    description: "Publishes FHIR datasets, manages contracts with researchers",
    color: "text-[var(--role-holder-text)]",
    badge:
      "bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] border-[var(--role-holder-border)]",
  },
  {
    username: "researcher",
    displayName: "researcher",
    organisation: "PharmaCo Research AG",
    roles: ["EDC_USER_PARTICIPANT", "DATA_USER"],
    personaId: "researcher",
    description: "Discovers datasets, negotiates access, runs OMOP analytics",
    color: "text-[var(--role-user-text)]",
    badge:
      "bg-[var(--role-user-bg)] text-[var(--role-user-text)] border-[var(--role-user-border)]",
  },
  {
    username: "regulator",
    displayName: "regulator",
    organisation: "MedReg DE",
    roles: ["HDAB_AUTHORITY"],
    personaId: "hdab",
    description: "Reviews access applications, governs Trust Centers",
    color: "text-[var(--role-hdab-text)]",
    badge:
      "bg-[var(--role-hdab-bg)] text-[var(--role-hdab-text)] border-[var(--role-hdab-border)]",
  },
  {
    username: "lmcuser",
    displayName: "lmcuser",
    organisation: "Limburg Medical Centre",
    roles: ["EDC_USER_PARTICIPANT", "DATA_HOLDER"],
    personaId: "hospital",
    description: "NL data holder, publishes cross-border datasets",
    color: "text-[var(--role-holder-text)]",
    badge:
      "bg-[var(--role-holder-bg)] text-[var(--role-holder-text)] border-[var(--role-holder-border)]",
  },
  // EHDS Chapter II / GDPR Art. 15-22 — patient primary-use access
  {
    username: "patient1",
    displayName: "patient1",
    organisation: "AlphaKlinik Berlin (patient)",
    roles: ["PATIENT"],
    personaId: "patient",
    description:
      "EHDS Art. 3: access own EHR, donate to research, see insights",
    color: "text-[var(--role-patient-text)]",
    badge:
      "bg-[var(--role-patient-bg)] text-[var(--role-patient-text)] border-[var(--role-patient-border)]",
  },
  {
    username: "patient2",
    displayName: "patient2",
    organisation: "Limburg Medical Centre (patient)",
    roles: ["PATIENT"],
    personaId: "patient",
    description: "Cross-border NL patient, MyHealth@EU Art. 7 data portability",
    color: "text-[var(--role-patient-text)]",
    badge:
      "bg-[var(--role-patient-bg)] text-[var(--role-patient-text)] border-[var(--role-patient-border)]",
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
): "DATA_HOLDER" | "DATA_USER" | "TRUST_CENTER_OPERATOR" | "PATIENT" | null {
  if (roles.includes("PATIENT")) return "PATIENT";
  if (roles.includes("TRUST_CENTER_OPERATOR")) return "TRUST_CENTER_OPERATOR";
  if (roles.includes("DATA_HOLDER")) return "DATA_HOLDER";
  if (roles.includes("DATA_USER")) return "DATA_USER";
  // Demo fallback by username pattern
  const u = (username ?? "").toLowerCase();
  if (u.startsWith("patient")) return "PATIENT";
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
  if (type === "PATIENT") return "patient";
  if (type === "TRUST_CENTER_OPERATOR") return "trust-center";
  if (type === "DATA_HOLDER") return "hospital";
  if (type === "DATA_USER") return "researcher";
  return "default";
}
