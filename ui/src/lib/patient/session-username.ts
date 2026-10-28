import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/**
 * The signed-in patient's Keycloak login name, or null.
 *
 * AuthSession does not carry `preferredUsername`, so the routes that need the
 * login (to match a pairing or a connected phone to it) read the full session,
 * as /api/patient/ehr-sync does. The session callback in `lib/auth.ts` puts it
 * on `session.user`, for a Keycloak and an EUDI sign-in alike; an EUDI session
 * has no mail and its name is the record's pseudonym, so without that the
 * login of a wallet sign-in was lost (ADR-067). A session without it falls
 * back to the mail's local part (`patient1@...`), and only then to the name,
 * which is usually a display name and would match no Keycloak login.
 */
export async function sessionUsername(): Promise<string | null> {
  const session = (await getServerSession(authOptions)) as {
    preferredUsername?: string | null;
    user?: {
      name?: string | null;
      email?: string | null;
      preferredUsername?: string | null;
    } | null;
  } | null;
  if (!session) return null;
  return (
    session.preferredUsername ||
    session.user?.preferredUsername ||
    session.user?.email?.split("@")[0] ||
    session.user?.name ||
    null
  );
}
