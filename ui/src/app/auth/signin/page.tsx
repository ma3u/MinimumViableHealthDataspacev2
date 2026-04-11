"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck, Shield } from "lucide-react";
import { DEMO_PERSONAS, ROLE_LABELS } from "@/lib/auth";

/** Error message mapping for common OAuth errors. */
function oauthErrorMessage(error: string): string {
  switch (error) {
    case "OAuthCallback":
      return "Authentication callback failed. Keycloak may be unreachable or misconfigured.";
    case "Callback":
      return "OAuth callback error — check that Keycloak is running and the redirect URI is registered.";
    case "OAuthSignin":
      return "Could not start sign-in flow. Is Keycloak running on port 8080?";
    default:
      return `Error: ${error}`;
  }
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 py-10 px-4">
      {/* ── Login card ── */}
      <div className="bg-[var(--surface-2)] rounded-lg p-8 max-w-md w-full text-center">
        <ShieldCheck
          size={48}
          className="mx-auto mb-4 text-blue-800 dark:text-blue-300"
        />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Health Dataspace Login
        </h1>
        <p className="text-[var(--text-secondary)] mb-6">
          Sign in with your Keycloak account to access protected resources.
          <br />
          <span className="text-[var(--text-secondary)] text-xs mt-1 block">
            Password = username (local dev only)
          </span>
        </p>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded p-3 mb-4 text-sm text-red-800 dark:text-red-300">
            {oauthErrorMessage(error)}
          </div>
        )}

        <button
          onClick={() => signIn("keycloak", { callbackUrl })}
          className="w-full px-4 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
        >
          Sign in with Keycloak
        </button>

        <p className="text-[var(--text-secondary)] text-xs mt-4">
          EHDS-compliant authentication via Keycloak SSO
        </p>
      </div>

      {/* ── Demo persona reference cards ── */}
      <div className="w-full max-w-3xl">
        <p className="text-xs text-[var(--text-secondary)] text-center mb-3 uppercase tracking-wide font-semibold">
          Demo users — sign in as any of these to test role-specific views
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEMO_PERSONAS.map((persona) => (
            <button
              key={persona.username}
              onClick={() =>
                signIn("keycloak", {
                  callbackUrl: `/graph?persona=${persona.personaId}`,
                })
              }
              className={`group text-left rounded-lg border p-3 bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] transition-colors ${
                persona.badge.replace("text-", "border-").split(" ")[0]
              }`}
            >
              {/* Username + org */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="font-mono text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {persona.username}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {persona.organisation}
                  </div>
                </div>
              </div>
              {/* Role badges */}
              <div className="flex flex-wrap gap-1 mb-2">
                {[...persona.roles]
                  .filter(
                    (r) =>
                      r !== "EDC_USER_PARTICIPANT" ||
                      persona.roles.length === 1,
                  )
                  .map((role) => (
                    <span
                      key={role}
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${persona.badge}`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))}
              </div>
              {/* Description */}
              <p className="text-xs text-[var(--text-secondary)] leading-tight">
                {persona.description}
              </p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
                → opens graph:{" "}
                <span className="font-mono">{persona.personaId}</span>
              </p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-secondary)] text-center mt-3">
          Password = username &nbsp;·&nbsp; Keycloak realm: EDCV &nbsp;·&nbsp;
          http://localhost:8080
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-[var(--text-secondary)]">Loading…</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
