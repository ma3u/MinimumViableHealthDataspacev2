"use client";

import { signIn } from "next-auth/react";
import { useT } from "@/lib/i18n/translate";

export function SignInRequired({
  title,
  description,
}: {
  title?: string;
  description: string;
}) {
  const tc = useT("common");
  const tn = useT("nav");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-lg font-semibold text-(--text-primary)">
        {title ?? tc("Sign in required")}
      </p>
      <p className="max-w-md text-sm text-(--text-secondary)">{description}</p>
      <button
        type="button"
        onClick={() => signIn("keycloak")}
        className="rounded-sm bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {tn("Sign in")}
      </button>
    </div>
  );
}
