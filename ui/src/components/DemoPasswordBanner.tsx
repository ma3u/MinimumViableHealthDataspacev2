"use client";

import { useSession } from "next-auth/react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useState } from "react";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * Dismissible warning banner shown to authenticated users reminding them
 * to change the default demo password. Links to Keycloak account security.
 *
 * - Hidden in static export mode (no real auth)
 * - Dismissed state stored in sessionStorage (reappears next browser session)
 */
export default function DemoPasswordBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return sessionStorage.getItem("demo-password-banner-dismissed") === "true";
  });

  if (IS_STATIC || status !== "authenticated" || !session || dismissed) {
    return null;
  }

  const keycloakPublicUrl =
    process.env.NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL ??
    "http://localhost:8080/realms/edcv";
  const passwordUrl = `${keycloakPublicUrl}/account/#/security/signingin`;

  function handleDismiss() {
    sessionStorage.setItem("demo-password-banner-dismissed", "true");
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      className="bg-amber-900/40 border-b border-amber-700/50 px-4 py-2 flex items-center gap-3 text-sm"
    >
      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
      <p className="text-amber-200 flex-1">
        <span className="font-semibold">Demo mode:</span> You are using a
        default password.{" "}
        <a
          href={passwordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-amber-300 underline underline-offset-2 hover:text-amber-100 transition-colors"
        >
          Change your password
          <ExternalLink size={12} />
        </a>
      </p>
      <button
        onClick={handleDismiss}
        className="text-amber-400 hover:text-amber-200 transition-colors p-1 rounded hover:bg-amber-800/40"
        aria-label="Dismiss password warning"
      >
        <X size={16} />
      </button>
    </div>
  );
}
