"use client";

import { signIn } from "next-auth/react";

export function SignInRequired({
  title = "Sign in required",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        {description}
      </p>
      <button
        type="button"
        onClick={() => signIn("keycloak")}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Sign in
      </button>
    </div>
  );
}
