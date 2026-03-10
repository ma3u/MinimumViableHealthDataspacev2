"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 text-center">
        <ShieldCheck size={48} className="mx-auto mb-4 text-layer1" />
        <h1 className="text-2xl font-bold text-white mb-2">
          Health Dataspace Login
        </h1>
        <p className="text-gray-400 mb-6">
          Sign in with your Keycloak account to access protected resources.
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-sm text-red-300">
            {error === "OAuthCallback"
              ? "Authentication failed. Please try again."
              : `Error: ${error}`}
          </div>
        )}

        <button
          onClick={() => signIn("keycloak", { callbackUrl })}
          className="w-full px-4 py-3 bg-layer1 hover:bg-layer1/80 text-white rounded-lg font-medium transition-colors"
        >
          Sign in with Keycloak
        </button>

        <p className="text-gray-500 text-xs mt-4">
          EHDS-compliant authentication via Keycloak SSO
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
          <div className="text-gray-400">Loading...</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
