import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { requireAuth, type AuthSession } from "@/lib/auth-guard";

/**
 * A session, or a machine credential, for the one route a machine calls.
 *
 * Every API route needs a session (ADR-044). The catalog crawler is a
 * machine with none; it POSTs to /api/mock-dsp/<participant>/catalog/request
 * every five minutes. It sends `Authorization: Bearer <token>` instead, the
 * token kept once in Key Vault and referenced by the UI and the crawler job
 * through a managed identity (ADR-036, scripts/azure/wire-dsp-catalog-token.sh).
 *
 * - A bearer header that matches the token in `envName` admits the caller as
 *   a service, with no roles.
 * - A bearer header that does not match is refused with 401, rather than
 *   falling back to the session, so a wrong token is never mistaken for a
 *   missing one.
 * - With no bearer header, or with the token unset in this environment, the
 *   caller needs a session, exactly as requireAuth() decides.
 */
export async function requireSessionOrToken(
  request: Request,
  envName: string,
): Promise<{ session: AuthSession } | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env[envName];
  if (expected && header.startsWith("Bearer ")) {
    if (sameSecret(header.slice("Bearer ".length), expected)) {
      return {
        session: {
          user: { id: `service:${envName}` },
          roles: [],
          accessToken: "",
        },
      };
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return requireAuth();
}

/** Constant-time comparison, so the response time does not leak a prefix. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
