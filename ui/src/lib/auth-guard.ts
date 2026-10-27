import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions, type Role } from "@/lib/auth";
import { IS_STATIC } from "@/lib/static-export";
import { patientAssuranceShortfall } from "@/lib/assurance";

export interface AuthSession {
  user: { id: string; name?: string | null; email?: string | null };
  roles: string[];
  accessToken: string;
}

interface AuthSuccess {
  session: AuthSession;
}

/**
 * Require authentication and optionally specific roles.
 * Returns the session on success, or a NextResponse error on failure.
 * In static export mode, returns a synthetic demo session.
 */
export async function requireAuth(
  allowedRoles?: Role[],
): Promise<AuthSuccess | NextResponse> {
  if (IS_STATIC) {
    return {
      session: {
        user: { id: "demo-user", name: "Demo User" },
        roles: ["EDC_ADMIN"],
        accessToken: "static-demo-token",
      },
    };
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roles = (session as { roles?: string[] }).roles ?? [];

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAny = allowedRoles.some((r) => roles.includes(r));
    if (!hasAny) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // A person's own session must meet the deployment's identification floor
  // (Implementing Reg. (EU) 2026/2099; PATIENT_MIN_ASSURANCE, #708).
  const lacking = patientAssuranceShortfall(
    roles,
    (session as { assurance?: unknown }).assurance,
  );
  if (lacking) {
    return NextResponse.json(
      {
        error: `Sign in with the EUDI Wallet: this needs assurance level ${lacking}`,
      },
      { status: 403 },
    );
  }

  return {
    session: {
      user: session.user as AuthSession["user"],
      roles,
      accessToken: (session as { accessToken?: string }).accessToken ?? "",
    },
  };
}

/** Type guard: true when requireAuth returned an error response. */
export function isAuthError(
  result: AuthSuccess | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
