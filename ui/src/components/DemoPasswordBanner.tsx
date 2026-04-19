"use client";

import { useSession } from "next-auth/react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * Dismissible warning banner shown to authenticated users reminding them
 * to change the default demo password. Links to Keycloak account security.
 *
 * - Hidden in static export mode (no real auth)
 * - Dismissed state stored in sessionStorage (reappears next browser session)
 * - Keycloak URL fetched at runtime from /api/keycloak-config so the link
 *   points at the correct host on Azure (NEXT_PUBLIC_* is baked at build
 *   time and would leak "localhost:8080" into production bundles).
 */
export default function DemoPasswordBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return sessionStorage.getItem("demo-password-banner-dismissed") === "true";
  });
  const [passwordUrl, setPasswordUrl] = useState<string | null>(null);

  useEffect(() => {
    if (IS_STATIC) return;
    let cancelled = false;
    fetch("/api/keycloak-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg?.publicUrl || !cfg?.clientId) return;
        // Use Keycloak's OIDC "required action" flow (`kc_action`) rather
        // than the Account Console — the latter crashes with "Something
        // went wrong" when the realm lacks specific account-console client
        // config, which our Azure realm hits today. The UPDATE_PASSWORD
        // action is canonical Keycloak, works on every realm, and returns
        // the user to our origin after the change.
        const redirect = encodeURIComponent(window.location.origin);
        const url = new URL(`${cfg.publicUrl}/protocol/openid-connect/auth`);
        url.searchParams.set("client_id", cfg.clientId);
        url.searchParams.set("redirect_uri", decodeURIComponent(redirect));
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid");
        url.searchParams.set("kc_action", "UPDATE_PASSWORD");
        setPasswordUrl(url.toString());
      })
      .catch(() => {
        /* leave null — link just hides until config resolves */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (IS_STATIC || status !== "authenticated" || !session || dismissed) {
    return null;
  }
  if (!passwordUrl) return null;

  function handleDismiss() {
    sessionStorage.setItem("demo-password-banner-dismissed", "true");
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      className="bg-amber-50 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-700/50 px-4 py-2 flex items-center gap-3 text-sm"
    >
      <AlertTriangle
        size={16}
        className="text-[var(--warning-text)] shrink-0"
      />
      <p className="text-[var(--warning-text)] flex-1">
        <span className="font-semibold">Demo mode:</span> You are using a
        default password.{" "}
        <a
          href={passwordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[var(--warning-text)] underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Change your password
          <ExternalLink size={12} />
        </a>
      </p>
      <button
        onClick={handleDismiss}
        className="text-[var(--warning-text)] hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors p-1 rounded"
        aria-label="Dismiss password warning"
      >
        <X size={16} />
      </button>
    </div>
  );
}
