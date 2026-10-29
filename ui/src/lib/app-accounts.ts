import { randomInt } from "crypto";
import { runQuery } from "@/lib/neo4j";
import { isSandboxUsername, sandboxPatientId } from "@/lib/sandbox-account";

export { isSandboxUsername, sandboxPatientId };

/**
 * Sandbox accounts the Klarbefund app creates for itself (ADR-054).
 *
 * A Keycloak user `kb-xxxxxxxx` with a generated password, in the group
 * `klarbefund-patients` (role PATIENT), and an empty record of its own,
 * `(:Patient {id: "KB-XXXXXXXX", sandbox: true})`. The hub talks to Keycloak
 * through the service account `ehds-account-service`, whose only roles are
 * the ones that create, find and delete users.
 */

/** The public client the app signs in with by password (ADR-054). */
export const ACCOUNT_CLIENT_ID = "klarbefund-account";
const ACCOUNT_GROUP = "klarbefund-patients";
const SERVICE_CLIENT_ID = "ehds-account-service";

/** No 0/O, 1/l/I: a person may type these off the phone's screen. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function pick(n: number, alphabet = ALPHABET): string {
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/**
 * A new login and password. The password is four groups of five from an
 * alphabet without look-alikes, upper and lower case: about 117 bits.
 */
export function newCredentials(): { username: string; password: string } {
  const mixed = ALPHABET + ALPHABET.replace(/[0-9]/g, "").toUpperCase();
  const groups = Array.from({ length: 4 }, () => pick(5, mixed));
  return { username: `kb-${pick(8)}`, password: groups.join("-") };
}

// ---- Keycloak ----

const keycloakServerUrl =
  process.env.KEYCLOAK_ISSUER ?? "http://keycloak:8080/realms/edcv";

/** `…/realms/edcv` → `…/admin/realms/edcv`. */
export function adminBase(): string {
  return keycloakServerUrl.replace(/\/realms\/([^/]+)\/?$/, "/admin/realms/$1");
}

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** True when the hub holds the account service's secret at all. */
export function accountServiceConfigured(): boolean {
  return Boolean(process.env.KEYCLOAK_ACCOUNT_SERVICE_SECRET);
}

/** A token of the service account `ehds-account-service`, for the admin API. */
export async function serviceToken(fetcher: typeof fetch): Promise<string> {
  const secret = process.env.KEYCLOAK_ACCOUNT_SERVICE_SECRET;
  if (!secret) {
    throw new AccountError(
      "account creation is not configured on this hub",
      503,
    );
  }
  const res = await fetcher(
    `${keycloakServerUrl}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SERVICE_CLIENT_ID,
        client_secret: secret,
      }),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new AccountError(
      `Keycloak refused the service account (${res.status})`,
    );
  }
  return json.access_token;
}

/**
 * Creates the Keycloak user. Throws AccountError when Keycloak refuses.
 * `attributes` go in the same call, so an account made from a PID carries
 * its secure hash from its first moment (ADR-067).
 */
export async function createKeycloakUser(
  credentials: { username: string; password: string },
  fetcher: typeof fetch = fetch,
  attributes?: Record<string, string[]>,
): Promise<void> {
  const token = await serviceToken(fetcher);
  const res = await fetcher(`${adminBase()}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Keycloak's user profile requires a name and an e-mail before a user may
    // sign in; without them the password grant answers "Account is not fully
    // set up". `.invalid` is reserved and never delivers (RFC 2606).
    body: JSON.stringify({
      username: credentials.username,
      enabled: true,
      email: `${credentials.username}@klarbefund.invalid`,
      emailVerified: true,
      firstName: "Klarbefund",
      lastName: "Sandbox",
      groups: [`/${ACCOUNT_GROUP}`],
      ...(attributes ? { attributes } : {}),
      credentials: [
        { type: "password", value: credentials.password, temporary: false },
      ],
    }),
    cache: "no-store",
  });
  if (res.status !== 201) {
    throw new AccountError(`Keycloak refused the new user (${res.status})`);
  }
}

/** Deletes a sandbox login from Keycloak. True when there was one. */
export async function deleteKeycloakUser(
  username: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!isSandboxUsername(username)) return false;
  const token = await serviceToken(fetcher);
  const headers = { Authorization: `Bearer ${token}` };
  const found = await fetcher(
    `${adminBase()}/users?exact=true&username=${encodeURIComponent(username)}`,
    { headers, cache: "no-store" },
  );
  const users = (await found.json().catch(() => [])) as { id?: string }[];
  const id = Array.isArray(users) ? users[0]?.id : undefined;
  if (!found.ok) {
    throw new AccountError(`Keycloak lookup failed (${found.status})`);
  }
  if (!id) return false;
  const res = await fetcher(`${adminBase()}/users/${id}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  if (res.status !== 204) {
    throw new AccountError(`Keycloak refused the deletion (${res.status})`);
  }
  return true;
}

// ---- Neo4j ----

/**
 * Records the attested key and creates the empty record. False when the key
 * already created an account: one key, one account, ever.
 */
export async function createSandboxRecord(input: {
  username: string;
  keyId: string;
  environment: string;
}): Promise<boolean> {
  const patientId = sandboxPatientId(input.username);
  if (!patientId) throw new AccountError("not a sandbox login", 400);
  // `createdBy` is set only on create, so it names this login exactly when
  // this call created the key's record; a replayed key finds someone else's.
  const rows = await runQuery<{ fresh: boolean }>(
    `MERGE (k:AppAttestKey {keyId: $keyId})
       ON CREATE SET k.username = $username, k.createdBy = $username,
                     k.environment = $environment, k.createdAt = datetime()
     WITH k, k.createdBy = $username AND k.username = $username AS fresh
     FOREACH (_ IN CASE WHEN fresh THEN [1] ELSE [] END |
       MERGE (p:Patient {id: $patientId})
         ON CREATE SET p.resourceId = $patientId, p.name = 'Klarbefund sandbox',
                       p.sandbox = true, p.appAccount = $username,
                       p.createdAt = datetime())
     RETURN fresh`,
    { ...input, patientId },
  );
  return rows[0]?.fresh === true;
}

/**
 * Creates the empty record of an account made from a verified PID (ADR-067).
 * There is no App Attest key here: the PID's secure hash, on at most one
 * Keycloak account, is the guard. Nothing of the PID is written to Neo4j.
 */
export async function createPidSandboxRecord(username: string): Promise<void> {
  const patientId = sandboxPatientId(username);
  if (!patientId) throw new AccountError("not a sandbox login", 400);
  await runQuery(
    `MERGE (p:Patient {id: $patientId})
       ON CREATE SET p.resourceId = $patientId, p.name = 'Klarbefund sandbox',
                     p.sandbox = true, p.appAccount = $username,
                     p.createdAt = datetime()
       ON MATCH SET p.appAccount = $username`,
    { patientId, username },
  );
}

/**
 * Deletes what a sandbox login owns on the hub: its record with its own
 * Observations, its research consents, and its phones. A consent is the
 * person's own node (PatientConsent, keyed by the record's id) and goes with
 * them; the programme it was given to is shared and is only detached, never
 * followed into a delete. Before 2026-10-29 the consents were left behind,
 * orphaned, still naming the record.
 *
 * The attested key's record stays, without the login, so the key can never
 * create a second account.
 */
export async function deleteSandboxRecord(username: string): Promise<void> {
  const patientId = sandboxPatientId(username);
  if (!patientId) return;
  await runQuery(
    `OPTIONAL MATCH (p:Patient {id: $patientId, sandbox: true})
     OPTIONAL MATCH (p)-[]->(o:Observation)
     WITH collect(DISTINCT p) AS records, collect(DISTINCT o) AS observations
     FOREACH (n IN observations | DETACH DELETE n)
     FOREACH (n IN records | DETACH DELETE n)
     WITH 1 AS done
     OPTIONAL MATCH (c:PatientConsent {patientId: $patientId})
     WITH collect(c) AS consents
     FOREACH (n IN consents | DETACH DELETE n)
     WITH 1 AS done
     OPTIONAL MATCH (a:AppConnection {username: $username})
     WITH collect(a) AS phones
     FOREACH (n IN phones | DETACH DELETE n)
     WITH 1 AS done
     OPTIONAL MATCH (k:AppAttestKey {username: $username})
     WITH collect(k) AS keys
     FOREACH (k IN keys | SET k.username = null, k.deletedAt = datetime())`,
    { patientId, username },
  );
}
