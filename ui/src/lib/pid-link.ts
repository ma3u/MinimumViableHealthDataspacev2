/**
 * The link between a PID and a sandbox account (ADR-067, #708).
 *
 * The link is the Keycloak user attribute `pid_fingerprint`: the secure hash
 * of `pid-fingerprint.ts`, one per account, declared admin-only in the
 * realm's user profile (`scripts/declare-pid-fingerprint-attribute.sh`). The
 * hub reads and writes it through the service account `ehds-account-service`
 * (`view-users`, `manage-users`), with the token code of `app-accounts.ts`.
 *
 * Nothing here logs a fingerprint, and nothing here ever sees a name or a
 * birth date: those stop at the status route, which computes the hash.
 */
import {
  AccountError,
  accountServiceConfigured,
  adminBase,
  isSandboxUsername,
  sandboxPatientId,
  serviceToken,
} from "@/lib/app-accounts";
import type { EudiVerifiedPatient } from "@/lib/eudi-store";
import { pidLinkEnabled } from "@/lib/pid-fingerprint";
import { patientPseudonym } from "@/lib/patient-identity";

/** The user attribute that carries the hash. */
export const PID_ATTRIBUTE = "pid_fingerprint";

/** The shape the realm's user profile enforces on the attribute. */
const FINGERPRINT = /^k[0-9]+:[0-9a-f]{64}$/;

interface KeycloakUser {
  id?: string;
  username?: string;
  attributes?: Record<string, string[]>;
  [key: string]: unknown;
}

/**
 * Whether this hub can link a PID at all: it needs the hash key and the
 * account service. Without either the wallet signs in only the demo personas.
 */
export function pidAccountsAvailable(): boolean {
  return pidLinkEnabled() && accountServiceConfigured();
}

/**
 * The username of the account that holds this fingerprint, or null. Throws
 * AccountError when more than one does: one fingerprint belongs to at most
 * one account, and the hub will not guess which.
 */
export async function findUsernameByFingerprint(
  fingerprint: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (!FINGERPRINT.test(fingerprint)) return null;
  const token = await serviceToken(fetcher);
  const query = new URLSearchParams({
    q: `${PID_ATTRIBUTE}:${fingerprint}`,
    exact: "true",
  });
  const res = await fetcher(`${adminBase()}/users?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AccountError(`Keycloak lookup failed (${res.status})`);
  }
  const users = (await res.json().catch(() => [])) as KeycloakUser[];
  // Keycloak searched exactly; where it returns the attributes, check again.
  const holders = (Array.isArray(users) ? users : []).filter(
    (u) =>
      typeof u.username === "string" &&
      (!u.attributes ||
        (u.attributes[PID_ATTRIBUTE] ?? []).includes(fingerprint)),
  );
  if (holders.length > 1) {
    throw new AccountError("more than one account holds this PID", 409);
  }
  return holders[0]?.username ?? null;
}

/** The full representation of one user, by username, or null. */
async function readUser(
  username: string,
  token: string,
  fetcher: typeof fetch,
): Promise<KeycloakUser | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const found = await fetcher(
    `${adminBase()}/users?exact=true&username=${encodeURIComponent(username)}`,
    { headers, cache: "no-store" },
  );
  if (!found.ok) {
    throw new AccountError(`Keycloak lookup failed (${found.status})`);
  }
  const list = (await found.json().catch(() => [])) as KeycloakUser[];
  const id = Array.isArray(list)
    ? list.find((u) => u.username === username)?.id
    : undefined;
  if (!id) return null;
  const res = await fetcher(`${adminBase()}/users/${id}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AccountError(`Keycloak lookup failed (${res.status})`);
  }
  return (await res.json()) as KeycloakUser;
}

/**
 * Writes the attribute on a sandbox account: read the user, change this one
 * attribute, put the user back with every other attribute as it was.
 * `values` is `[fingerprint]` to link and `[]` to unlink.
 */
async function writeAttribute(
  username: string,
  values: string[],
  fetcher: typeof fetch,
): Promise<boolean> {
  if (!isSandboxUsername(username)) {
    throw new AccountError("only a sandbox account links a wallet", 403);
  }
  const token = await serviceToken(fetcher);
  const user = await readUser(username, token, fetcher);
  if (!user?.id) return false;
  const next: KeycloakUser = {
    ...user,
    attributes: { ...(user.attributes ?? {}), [PID_ATTRIBUTE]: values },
  };
  const res = await fetcher(`${adminBase()}/users/${user.id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(next),
    cache: "no-store",
  });
  if (res.status !== 204 && !res.ok) {
    throw new AccountError(`Keycloak refused the change (${res.status})`);
  }
  return true;
}

/** Links a PID to a sandbox account. False when there is no such account. */
export async function setFingerprint(
  username: string,
  fingerprint: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!FINGERPRINT.test(fingerprint)) {
    throw new AccountError("not a PID fingerprint", 400);
  }
  return writeAttribute(username, [fingerprint], fetcher);
}

/** Removes the link (ADR-067 decision 7). False when there is no such account. */
export async function clearFingerprint(
  username: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  return writeAttribute(username, [], fetcher);
}

/** Whether a sandbox account carries a link now. */
export async function hasFingerprint(
  username: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!isSandboxUsername(username)) return false;
  const token = await serviceToken(fetcher);
  const user = await readUser(username, token, fetcher);
  return (user?.attributes?.[PID_ATTRIBUTE] ?? []).some((v) =>
    FINGERPRINT.test(v),
  );
}

/**
 * The session a PID opens on a sandbox account: the patient role, the
 * record's pseudonym as the name (#475), assurance high (the EUDI Wallet's).
 */
export function sandboxPatient(username: string): EudiVerifiedPatient {
  return {
    username,
    displayName: patientPseudonym(sandboxPatientId(username) ?? username),
    roles: ["PATIENT"],
    assurance: "high",
  };
}
