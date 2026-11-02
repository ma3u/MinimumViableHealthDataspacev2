"use client";
import { CITIZEN_WALLET } from "@/lib/wallet-config";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck, Shield, Smartphone } from "lucide-react";
import { DEMO_PERSONAS, ROLE_LABELS, landingFor } from "@/lib/auth";
import { IS_STATIC } from "@/lib/static-export";
import { T, useT } from "@/lib/i18n/translate";

/** Wallet QR sign-in needs server API routes — absent in the static export. */

/** Error message mapping for common OAuth errors. */
function oauthErrorMessage(error: string, t: ReturnType<typeof useT>): string {
  switch (error) {
    case "OAuthCallback":
      return t(
        "Authentication callback failed. Keycloak may be unreachable or misconfigured.",
      );
    case "Callback":
      return t(
        "OAuth callback error: check that Keycloak is running and the redirect URI is registered.",
      );
    case "OAuthSignin":
      return t(
        "Could not start sign-in flow. Is Keycloak running on port 8080?",
      );
    default:
      return t("Error: {error}", { error });
  }
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");
  const t = useT("signin");
  const tc = useT("common");

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 py-10 px-4">
      {/* ── Login card ── */}
      <div className="bg-(--surface-2) rounded-lg p-8 max-w-md w-full text-center">
        <ShieldCheck
          size={48}
          className="mx-auto mb-4 text-blue-800 dark:text-blue-300"
        />
        <h1 className="text-2xl font-bold text-(--text-primary) mb-2">
          {t("Health Dataspace Login")}
        </h1>
        <p className="text-(--text-secondary) mb-6">
          {t(
            "Sign in with your Keycloak account to access protected resources.",
          )}
          <br />
          <span className="text-(--text-secondary) text-xs mt-1 block">
            {t("Password = username (local dev only)")}
          </span>
        </p>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-sm p-3 mb-4 text-sm text-red-800 dark:text-red-300">
            {oauthErrorMessage(error, t)}
          </div>
        )}

        <button
          onClick={() => signIn("keycloak", { callbackUrl })}
          className="w-full px-4 py-3 bg-(--accent) hover:bg-(--accent-hover) text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
        >
          {t("Sign in with Keycloak")}
        </button>

        {!IS_STATIC && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-(--text-secondary)/20" />
              <span className="text-xs text-(--text-secondary)">{t("or")}</span>
              <div className="h-px flex-1 bg-(--text-secondary)/20" />
            </div>
            <a
              href={`/auth/eudi-qr?callbackUrl=${encodeURIComponent(
                callbackUrl,
              )}`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-(--accent) text-(--accent) hover:bg-(--accent)/10 rounded-lg font-medium transition-colors"
            >
              <Smartphone size={18} />{" "}
              {t("Sign in with {wallet} (QR)", { wallet: CITIZEN_WALLET.name })}
            </a>
            <p className="text-(--text-secondary) text-[11px] mt-2">
              {t("Patient login via OpenID4VP")} ·{" "}
              {t(CITIZEN_WALLET.description)}, {t(CITIZEN_WALLET.alternatives)}
            </p>
          </>
        )}

        <p className="text-(--text-secondary) text-xs mt-4">
          {t("EHDS-compliant authentication via Keycloak SSO")}
        </p>
      </div>

      {/* ── Demo persona reference cards ── */}
      <div className="w-full max-w-3xl">
        <p className="text-xs text-(--text-secondary) text-center mb-3 uppercase tracking-wide font-semibold">
          {t("Demo users: sign in as any of these to test role-specific views")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEMO_PERSONAS.map((persona) => (
            <button
              key={persona.username}
              onClick={() =>
                signIn("keycloak", {
                  callbackUrl: landingFor(persona.personaId),
                })
              }
              // No base surface background: the first badge token is the role
              // colour (bg-(--role-*-bg)) and that is what the card shows. A
              // `bg-(--surface-2)/60` here was dead under Tailwind 3, which
              // cannot apply opacity to a var(); v4 can, and it covered the role.
              className={`group text-left rounded-lg border p-3 hover:bg-(--surface-2) transition-colors ${
                persona.badge.replace("text-", "border-").split(" ")[0]
              }`}
            >
              {/* Username + org */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="font-mono text-sm font-semibold text-(--text-primary) group-hover:text-(--accent) transition-colors">
                    {persona.username}
                  </div>
                  <div className="text-xs text-(--text-secondary)">
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
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${persona.badge}`}
                    >
                      <Shield size={8} />
                      {ROLE_LABELS[role] ? tc(ROLE_LABELS[role]) : role}
                    </span>
                  ))}
              </div>
              {/* Description */}
              <p className="text-xs text-(--text-secondary) leading-tight">
                {t(persona.description)}
              </p>
              <p className="text-[10px] text-(--text-secondary) mt-1.5">
                → {t("opens graph:")}{" "}
                <span className="font-mono">{persona.personaId}</span>
              </p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-(--text-secondary) text-center mt-3">
          {t("Password = username")} &nbsp;·&nbsp; Keycloak realm: EDCV
          &nbsp;·&nbsp; http://localhost:8080
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
          <div className="text-(--text-secondary)">
            <T area="common">{"Loading…"}</T>
          </div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
