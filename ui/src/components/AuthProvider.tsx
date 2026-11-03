"use client";

import { SessionProvider } from "next-auth/react";
import { IS_STATIC } from "@/lib/static-export";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // The static build has no /api/auth/session. Starting from "no session"
  // stops next-auth from asking for one, which answered with an HTML 404 and
  // logged CLIENT_FETCH_ERROR on every page.
  return (
    <SessionProvider session={IS_STATIC ? null : undefined}>
      {children}
    </SessionProvider>
  );
}
