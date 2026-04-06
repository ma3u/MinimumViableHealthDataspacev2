"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, Settings, Shield, User, Users } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ROLE_LABELS, DEMO_PERSONAS, deriveParticipantType } from "@/lib/auth";
import { useDemoPersona, setDemoPersona } from "@/lib/use-demo-persona";

/** Badge colours per role code (compact chip in nav bar and dropdown). */
const ROLE_BADGE: Record<string, string> = {
  EDC_ADMIN: "bg-red-700/80 text-red-100",
  EDC_USER_PARTICIPANT: "bg-blue-700/80 text-blue-100",
  HDAB_AUTHORITY: "bg-amber-700/80 text-amber-100",
  DATA_HOLDER: "bg-blue-600/80 text-blue-100",
  DATA_USER: "bg-green-700/80 text-green-100",
  TRUST_CENTER_OPERATOR: "bg-violet-700/80 text-violet-100",
  PATIENT: "bg-teal-700/80 text-teal-100",
};

/** Dropdown border accent per primary role. */
const ROLE_ACCENT: Record<string, string> = {
  EDC_ADMIN: "border-red-700",
  HDAB_AUTHORITY: "border-amber-600",
  DATA_HOLDER: "border-blue-600",
  DATA_USER: "border-green-600",
  TRUST_CENTER_OPERATOR: "border-violet-600",
  EDC_USER_PARTICIPANT: "border-blue-700",
  PATIENT: "border-teal-600",
};

/** Shield icon colour per primary role. */
const ROLE_SHIELD: Record<string, string> = {
  EDC_ADMIN: "text-red-400",
  HDAB_AUTHORITY: "text-amber-400",
  DATA_HOLDER: "text-blue-400",
  DATA_USER: "text-green-400",
  TRUST_CENTER_OPERATOR: "text-violet-400",
  EDC_USER_PARTICIPANT: "text-[var(--text-secondary)]",
  PATIENT: "text-teal-400",
};

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * Returns the most meaningful roles to display.
 * Hides EDC_USER_PARTICIPANT when a more specific sub-role is present.
 */
function displayRolesFor(roles: string[]): string[] {
  const specific = roles.filter((r) =>
    [
      "EDC_ADMIN",
      "HDAB_AUTHORITY",
      "DATA_HOLDER",
      "DATA_USER",
      "TRUST_CENTER_OPERATOR",
      "PATIENT",
    ].includes(r),
  );
  if (specific.length === 0 && roles.includes("EDC_USER_PARTICIPANT")) {
    return ["EDC_USER_PARTICIPANT"];
  }
  return specific;
}

/**
 * Switch to a different Keycloak user.
 * Must sign out from BOTH NextAuth AND Keycloak itself — otherwise Keycloak's
 * SSO session cookie auto-authenticates the same user on the next signIn().
 *
 * After logout, redirects to NextAuth's signIn with login_hint so Keycloak
 * pre-fills the username field for the target user.
 */
function switchPersona(
  username: string,
  _personaId: string,
  onClose: () => void,
) {
  onClose();
  const keycloakPublicUrl =
    process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL ??
    "http://localhost:8080/realms/edcv";
  const clientId =
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "health-dataspace-ui";
  // Store the target username so we can pass it as login_hint after logout
  sessionStorage.setItem("switch_to_user", username);
  // Re-show the demo password warning for the new user
  sessionStorage.removeItem("demo-password-banner-dismissed");
  // Sign out from NextAuth first, then redirect to Keycloak's logout endpoint.
  // The post_logout_redirect_uri sends the user to /auth/switch which triggers
  // a new sign-in with login_hint.
  signOut({ redirect: false }).then(() => {
    const returnUrl = window.location.origin + "/auth/switch";
    const logoutUrl = `${keycloakPublicUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(
      returnUrl,
    )}&client_id=${clientId}`;
    window.location.href = logoutUrl;
  });
}

export default function UserMenu() {
  const { data: liveSession, status: liveStatus } = useSession();
  // Always call useDemoPersona — hook rules require unconditional calls.
  const demoPersona = useDemoPersona();
  const demoSession = IS_STATIC
    ? {
        user: {
          name: demoPersona.username,
          email: `${demoPersona.username}@demo.ehds.eu`,
        },
        roles: [...demoPersona.roles],
      }
    : null;
  const session = IS_STATIC ? demoSession : liveSession;
  const status = IS_STATIC ? "authenticated" : liveStatus;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-secondary)]">
        <User size={15} />
        <span className="animate-pulse">…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => !IS_STATIC && signIn("keycloak")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <LogIn size={15} />
        Sign in
      </button>
    );
  }

  const roles = (session as { roles?: string[] }).roles ?? [];
  const username = session.user?.name ?? session.user?.email ?? "";
  const shownRoles = displayRolesFor(roles);
  const primaryRole = shownRoles[0] ?? "EDC_USER_PARTICIPANT";
  // Derive a friendly participant type for display
  const _participantType = deriveParticipantType(roles, username);

  // Short role label for the nav bar chip
  const navLabel = ROLE_LABELS[primaryRole] ?? username;
  const accentClass = ROLE_ACCENT[primaryRole] ?? "border-gray-600";
  const shieldClass =
    ROLE_SHIELD[primaryRole] ?? "text-[var(--text-secondary)]";

  return (
    <div ref={ref} className="relative">
      {/* ── Nav bar button ── */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-[var(--text-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        aria-label="User menu"
      >
        <Shield size={14} className={shieldClass} />
        <span className="max-w-[90px] truncate text-xs font-medium">
          {username}
          {IS_STATIC && (
            <span className="ml-1 text-[9px] text-amber-400">(demo)</span>
          )}
        </span>
        {/* Role chip — hidden on very small screens */}
        <span
          className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
            ROLE_BADGE[primaryRole] ?? "bg-gray-600 text-gray-200"
          }`}
        >
          {navLabel}
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className={`absolute right-0 top-full mt-1 w-72 bg-[var(--surface-2)] border rounded-lg shadow-xl z-50 ${accentClass}`}
        >
          {/* Identity block */}
          <div className="p-3 border-b border-[var(--border)]">
            <p className="text-sm text-white font-semibold truncate">
              {username}
              {IS_STATIC && (
                <span className="ml-1.5 text-[10px] text-amber-400 font-normal">
                  demo mode
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
              {session.user?.email}
            </p>
            {/* Role badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {shownRoles.map((role) => (
                <span
                  key={role}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${
                    ROLE_BADGE[role] ?? "bg-gray-600 text-gray-200"
                  } border-transparent`}
                >
                  <Shield size={9} />
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          </div>

          {/* Settings link */}
          <div className="p-2 border-b border-[var(--border)]">
            <a
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Settings size={14} />
              <span className="font-medium">Settings</span>
            </a>
          </div>

          {/* Persona switcher — Keycloak in live mode, localStorage in static demo */}
          <div className="border-t border-[var(--border)]">
            <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
              <Users size={11} className="text-[var(--text-secondary)]" />
              <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-semibold">
                {IS_STATIC ? "Switch demo persona" : "Returning users"}
              </span>
            </div>
            <div className="px-2 pb-2 space-y-0.5">
              {DEMO_PERSONAS.map((persona) => {
                const isActive = persona.username === username;
                const primaryRole = [...persona.roles].find((r) =>
                  [
                    "EDC_ADMIN",
                    "HDAB_AUTHORITY",
                    "DATA_HOLDER",
                    "DATA_USER",
                    "PATIENT",
                  ].includes(r),
                );
                return (
                  <button
                    key={persona.username}
                    disabled={isActive}
                    onClick={() => {
                      if (IS_STATIC) {
                        setDemoPersona(persona.username);
                        setOpen(false);
                      } else {
                        switchPersona(persona.username, persona.personaId, () =>
                          setOpen(false),
                        );
                      }
                    }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-colors ${
                      isActive
                        ? "bg-gray-700/50 cursor-default"
                        : "hover:bg-[var(--surface-2)] cursor-pointer"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        ROLE_BADGE[primaryRole ?? ""] ??
                        "bg-gray-600 text-gray-200"
                      }`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[primaryRole ?? ""] ?? primaryRole}
                    </span>
                    <span
                      className={`font-mono text-xs truncate ${
                        isActive ? "text-white" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {persona.username}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-[9px] text-[var(--text-secondary)] shrink-0">
                        active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sign out */}
          <div className="p-2 border-t border-[var(--border)]">
            <button
              onClick={() => {
                setOpen(false);
                sessionStorage.removeItem("demo-password-banner-dismissed");
                if (IS_STATIC) return;
                const keycloakPublicUrl =
                  process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL;
                const logoutUrl = keycloakPublicUrl
                  ? `${keycloakPublicUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(
                      window.location.origin,
                    )}&client_id=${
                      process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
                      "health-dataspace-ui"
                    }`
                  : undefined;
                signOut({ callbackUrl: logoutUrl ?? "/" });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-[var(--surface-2)] rounded transition-colors"
            >
              <LogOut size={14} />
              {IS_STATIC ? "Sign out (disabled in demo)" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
