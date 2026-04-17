"use client";

import { signIn, signOut } from "next-auth/react";
import {
  LogIn,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ROLE_LABELS, DEMO_PERSONAS, deriveParticipantType } from "@/lib/auth";
import {
  useDemoPersona,
  setDemoPersona,
  clearDemoPersona,
} from "@/lib/use-demo-persona";
import { useTabSession, markSessionSwitch } from "@/lib/use-tab-session";
import { BuildInfo } from "@/components/BuildInfo";

/** Badge colours per role code — uses semantic CSS tokens, adapts to light/dark. */
const ROLE_BADGE: Record<string, string> = {
  EDC_ADMIN: "bg-[var(--role-admin-bg)]   text-[var(--role-admin-text)]",
  EDC_USER_PARTICIPANT:
    "bg-[var(--role-holder-bg)]  text-[var(--role-holder-text)]",
  HDAB_AUTHORITY: "bg-[var(--role-hdab-bg)]    text-[var(--role-hdab-text)]",
  DATA_HOLDER: "bg-[var(--role-holder-bg)]  text-[var(--role-holder-text)]",
  DATA_USER: "bg-[var(--role-user-bg)]    text-[var(--role-user-text)]",
  TRUST_CENTER_OPERATOR:
    "bg-[var(--role-trust-bg)]   text-[var(--role-trust-text)]",
  PATIENT: "bg-[var(--role-patient-bg)] text-[var(--role-patient-text)]",
};

/** Dropdown border accent per primary role. */
const ROLE_ACCENT: Record<string, string> = {
  EDC_ADMIN: "border-[var(--role-admin-border)]",
  HDAB_AUTHORITY: "border-[var(--role-hdab-border)]",
  DATA_HOLDER: "border-[var(--role-holder-border)]",
  DATA_USER: "border-[var(--role-user-border)]",
  TRUST_CENTER_OPERATOR: "border-[var(--role-trust-border)]",
  EDC_USER_PARTICIPANT: "border-[var(--role-holder-border)]",
  PATIENT: "border-[var(--role-patient-border)]",
};

/** Shield icon colour per primary role. */
const ROLE_SHIELD: Record<string, string> = {
  EDC_ADMIN: "text-[var(--role-admin-text)]",
  HDAB_AUTHORITY: "text-[var(--role-hdab-text)]",
  DATA_HOLDER: "text-[var(--role-holder-text)]",
  DATA_USER: "text-[var(--role-user-text)]",
  TRUST_CENTER_OPERATOR: "text-[var(--role-trust-text)]",
  EDC_USER_PARTICIPANT: "text-[var(--text-secondary)]",
  PATIENT: "text-[var(--role-patient-text)]",
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
  keycloakConfig: { publicUrl: string; clientId: string } | null,
) {
  onClose();
  // Fall back to same-origin "/" if the runtime config hasn't loaded yet —
  // never bake in localhost since this code runs in the browser against the
  // production deployment.
  const keycloakPublicUrl = keycloakConfig?.publicUrl;
  const clientId = keycloakConfig?.clientId ?? "health-dataspace-ui";
  if (!keycloakPublicUrl) {
    // Config not loaded yet — fall back to plain NextAuth signOut.
    signOut({ callbackUrl: "/auth/switch" });
    return;
  }
  // Store the target username so we can pass it as login_hint after logout
  sessionStorage.setItem("switch_to_user", username);
  // Mark this tab as intentionally switching — clears the session snapshot
  // so the new Keycloak session is accepted after redirect.
  markSessionSwitch();
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
  // Tab-scoped session: immune to cross-tab cookie changes in live mode.
  const { session: tabSession, status: tabStatus } = useTabSession();
  // Always call useDemoPersona — hook rules require unconditional calls.
  const demoPersona = useDemoPersona();
  const demoSession =
    IS_STATIC && demoPersona
      ? {
          user: {
            name: demoPersona.username,
            email: `${demoPersona.username}@demo.ehds.eu`,
          },
          roles: [...demoPersona.roles],
        }
      : null;
  // In static mode: use demo persona (null = signed out). In live mode: use tab-scoped snapshot.
  const session = IS_STATIC
    ? demoSession
    : tabSession
      ? {
          user: { name: tabSession.username, email: tabSession.email },
          roles: tabSession.roles,
        }
      : null;
  const status = IS_STATIC
    ? demoPersona
      ? "authenticated"
      : "unauthenticated"
    : tabStatus;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Runtime Keycloak config — fetched once on mount from /api/auth/keycloak-config.
  // We can't use NEXT_PUBLIC_* env vars because they're baked in at `npm run build`
  // time inside the Docker image and our build doesn't pass them as build args.
  const [keycloakConfig, setKeycloakConfig] = useState<{
    publicUrl: string;
    clientId: string;
  } | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (IS_STATIC) return;
    let cancelled = false;
    fetch("/api/keycloak-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cancelled && cfg) setKeycloakConfig(cfg);
      })
      .catch(() => {
        /* leave null — sign-out falls back to NextAuth-only */
      });
    return () => {
      cancelled = true;
    };
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
    if (IS_STATIC) {
      // Static demo: show persona picker dropdown
      return (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <LogIn size={15} />
            Sign in
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl z-50">
              <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                <Users size={11} className="text-[var(--text-secondary)]" />
                <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-semibold">
                  Choose a demo persona
                </span>
              </div>
              <div className="px-2 pb-2 space-y-0.5">
                {DEMO_PERSONAS.map((persona) => {
                  const pRole = [...persona.roles].find((r) =>
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
                      onClick={() => {
                        setDemoPersona(persona.username);
                        setOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                    >
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          ROLE_BADGE[pRole ?? ""] ??
                          "bg-gray-600 text-[var(--text-primary)]"
                        }`}
                      >
                        <Shield size={8} />
                        {ROLE_LABELS[pRole ?? ""] ?? pRole}
                      </span>
                      <span className="font-mono text-xs truncate text-[var(--text-primary)]">
                        {persona.username}
                      </span>
                    </button>
                  );
                })}
              </div>
              <BuildInfo />
            </div>
          )}
        </div>
      );
    }
    // Live mode: show persona picker dropdown (same as static mode but triggers Keycloak sign-in)
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <LogIn size={15} />
          Sign in
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl z-50">
            <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
              <Users size={11} className="text-[var(--text-secondary)]" />
              <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-semibold">
                Returning users
              </span>
            </div>
            <div className="px-2 pb-2 space-y-0.5">
              {DEMO_PERSONAS.map((persona) => {
                const pRole = [...persona.roles].find((r) =>
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
                    onClick={() => {
                      setOpen(false);
                      signIn(
                        "keycloak",
                        { callbackUrl: `/graph?persona=${persona.personaId}` },
                        { login_hint: persona.username },
                      );
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                  >
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        ROLE_BADGE[pRole ?? ""] ??
                        "bg-gray-600 text-[var(--text-primary)]"
                      }`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[pRole ?? ""] ?? pRole}
                    </span>
                    <span className="font-mono text-xs truncate text-[var(--text-primary)]">
                      {persona.username}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t border-[var(--border)]">
              <a
                href="/auth/signin"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] rounded transition-colors"
              >
                <ShieldCheck size={12} />
                All users &amp; details
              </a>
            </div>
            <BuildInfo />
          </div>
        )}
      </div>
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
            ROLE_BADGE[primaryRole] ?? "bg-gray-600 text-[var(--text-primary)]"
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
            <p className="text-sm text-[var(--text-primary)] font-semibold truncate">
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
                    ROLE_BADGE[role] ?? "bg-gray-600 text-[var(--text-primary)]"
                  } border-transparent`}
                >
                  <Shield size={9} />
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          </div>

          {/* Settings link — hidden for PATIENT (no DCP business credentials) */}
          {!roles.includes("PATIENT") && (
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
          )}

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
                        switchPersona(
                          persona.username,
                          persona.personaId,
                          () => setOpen(false),
                          keycloakConfig,
                        );
                      }
                    }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-colors ${
                      isActive
                        ? "bg-[var(--surface-2)] cursor-default"
                        : "hover:bg-[var(--surface-2)] cursor-pointer"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        ROLE_BADGE[primaryRole ?? ""] ??
                        "bg-gray-600 text-[var(--text-primary)]"
                      }`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[primaryRole ?? ""] ?? primaryRole}
                    </span>
                    <span
                      className={`font-mono text-xs truncate ${
                        isActive
                          ? "text-[var(--accent)] font-semibold"
                          : "text-[var(--text-primary)]"
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
                // Clear the tab session snapshot so re-login gets a fresh one
                markSessionSwitch();
                if (IS_STATIC) {
                  clearDemoPersona();
                  return;
                }
                const logoutUrl = keycloakConfig?.publicUrl
                  ? `${
                      keycloakConfig.publicUrl
                    }/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(
                      window.location.origin,
                    )}&client_id=${keycloakConfig.clientId}`
                  : undefined;
                signOut({ callbackUrl: logoutUrl ?? "/" });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-[var(--surface-2)] rounded transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          <BuildInfo />
        </div>
      )}
    </div>
  );
}
