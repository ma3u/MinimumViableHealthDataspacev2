"use client";

import { signIn, useSession } from "next-auth/react";
import { Shield, LogIn } from "lucide-react";
import { DEMO_PERSONAS, ROLE_LABELS } from "@/lib/auth";

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/**
 * Demo persona cards showing available users and their roles.
 * Displayed on the start page so new users can quickly see which
 * test accounts are available and sign in directly.
 */
export function DemoPersonaCards() {
  const { data: session } = useSession();

  // Hide persona cards if already signed in (unless static mode)
  if (session && !IS_STATIC) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Demo Users &amp; Roles
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Sign in as any persona to explore role-specific views.
        <span className="text-gray-600">
          {" "}
          Password = username &middot; Keycloak realm: EDCV
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {DEMO_PERSONAS.map((persona) => (
          <button
            key={persona.username}
            onClick={() => {
              if (IS_STATIC) {
                localStorage.setItem("demo-persona", persona.username);
                window.location.href = `/graph?persona=${persona.personaId}`;
              } else {
                signIn("keycloak", {
                  callbackUrl: `/graph?persona=${persona.personaId}`,
                });
              }
            }}
            className={`group text-left rounded-xl border p-4 bg-gray-800/40 hover:bg-gray-800 transition-colors ${
              persona.badge.split(" ").find((c) => c.startsWith("border-")) ??
              "border-gray-700"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="font-mono text-sm font-semibold text-white group-hover:text-blue-200 transition-colors">
                  {persona.username}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {persona.organisation}
                </span>
              </div>
              <LogIn
                size={14}
                className="text-gray-600 group-hover:text-blue-300 transition-colors"
              />
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {[...persona.roles]
                .filter(
                  (r) =>
                    r !== "EDC_USER_PARTICIPANT" || persona.roles.length === 1,
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
            <p className="text-xs text-gray-500 leading-tight">
              {persona.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
