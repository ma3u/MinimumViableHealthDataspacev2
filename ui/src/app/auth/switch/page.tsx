"use client";

import { signIn } from "next-auth/react";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * /auth/switch — intermediate page after Keycloak logout.
 * Reads the target username from sessionStorage and triggers a new
 * sign-in with login_hint so Keycloak pre-fills the username field.
 */
export default function SwitchPage() {
  useEffect(() => {
    const targetUser = sessionStorage.getItem("switch_to_user");
    sessionStorage.removeItem("switch_to_user");
    // Trigger NextAuth sign-in with login_hint for Keycloak
    signIn("keycloak", { callbackUrl: "/" }, { login_hint: targetUser ?? "" });
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-secondary)]">
      <Loader2 size={16} className="mr-2 animate-spin" />
      Switching user…
    </div>
  );
}
