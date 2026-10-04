import { runQuery } from "@/lib/neo4j";
import { ownPatientIdForSession } from "@/lib/overview/patient";

/**
 * The phones a patient connected, one `(:AppConnection)` each (#473, ADR-049).
 *
 * In Neo4j rather than memory, because a connection must survive a restart:
 * the phone holds a refresh token for half an hour and a patient who
 * disconnected it must stay disconnected. The pairing that leads here is an
 * `(:AppPairing)` for its two minutes plus grace (`app-pairing.ts`).
 *
 * `deviceId` is a random UUID the app generates once and keeps in its
 * Keychain. A connection belongs to exactly one login; registering a device id
 * that another login already holds is refused, never reassigned.
 */

export interface AppConnection {
  deviceId: string;
  deviceName: string;
  username: string;
  connectedAt: string;
  lastSeenAt: string | null;
}

export const DEVICE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A device name as a person reads it, bounded and stripped of controls. */
export function cleanDeviceName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "iPhone").slice(0, 60);
}

const RETURN_FIELDS = `a.deviceId AS deviceId, a.deviceName AS deviceName,
  a.username AS username, toString(a.connectedAt) AS connectedAt,
  toString(a.lastSeenAt) AS lastSeenAt`;

/**
 * Records a connection. Returns it, or null when the device id is already
 * held by a different login.
 */
export async function registerConnection(input: {
  deviceId: string;
  deviceName: string;
  username: string;
}): Promise<AppConnection | null> {
  const patientId = ownPatientIdForSession({
    preferredUsername: input.username,
  });
  const rows = await runQuery<AppConnection>(
    `MERGE (a:AppConnection {deviceId: $deviceId})
       ON CREATE SET a.username = $username,
                     a.deviceName = $deviceName,
                     a.client = 'klarbefund-app',
                     a.connectedAt = datetime(),
                     a.lastSeenAt = datetime()
       ON MATCH SET a.lastSeenAt = CASE WHEN a.username = $username
                                        THEN datetime() ELSE a.lastSeenAt END,
                    a.deviceName = CASE WHEN a.username = $username
                                        THEN $deviceName ELSE a.deviceName END
     WITH a
     OPTIONAL MATCH (p:Patient)
       WHERE $patientId IS NOT NULL
         AND coalesce(p.id, p.resourceId, elementId(p)) = $patientId
     FOREACH (_ IN CASE WHEN p IS NOT NULL AND a.username = $username
                        THEN [1] ELSE [] END |
       MERGE (p)-[:HAS_APP_CONNECTION]->(a))
     RETURN ${RETURN_FIELDS}`,
    { ...input, patientId },
  );
  const row = rows[0];
  if (!row || row.username !== input.username) return null;
  return row;
}

/** The connection, when it exists and belongs to this login. */
export async function findConnection(
  deviceId: string,
  username: string,
): Promise<AppConnection | null> {
  if (!DEVICE_ID.test(deviceId)) return null;
  const rows = await runQuery<AppConnection>(
    `MATCH (a:AppConnection {deviceId: $deviceId, username: $username})
     SET a.lastSeenAt = datetime()
     RETURN ${RETURN_FIELDS}`,
    { deviceId, username },
  );
  return rows[0] ?? null;
}

/** Every connection of one login, newest first. */
export async function listConnections(
  username: string,
): Promise<AppConnection[]> {
  return runQuery<AppConnection>(
    `MATCH (a:AppConnection {username: $username})
     RETURN ${RETURN_FIELDS}
     ORDER BY a.connectedAt DESC`,
    { username },
  );
}

/** Deletes one connection of one login. True when there was one. */
export async function deleteConnection(
  deviceId: string,
  username: string,
): Promise<boolean> {
  if (!DEVICE_ID.test(deviceId)) return false;
  const rows = await runQuery<{ deleted: number }>(
    `MATCH (a:AppConnection {deviceId: $deviceId, username: $username})
     DETACH DELETE a
     RETURN count(*) AS deleted`,
    { deviceId, username },
  );
  return (rows[0]?.deleted ?? 0) > 0;
}
