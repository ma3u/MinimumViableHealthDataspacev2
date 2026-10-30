import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, type Driver, type Session } from "neo4j-driver";

// ---------------------------------------------------------------------------
// Neo4j drivers: the hub graph, and the SPE workspaces
// ---------------------------------------------------------------------------
//
// `driver` is the hub graph: catalog, permits, audit chain, and SPE-1 for as
// long as SPE-1 is not a workspace of its own. NEO4J_SPE1_URI makes it one
// (ADR-068 decision 3, ADR-069): the federated path and the spe_access
// template then ask `spe1Driver` for SPE-1, never the hub, which holds every
// patient of both halves. While a configured SPE-1 workspace does not answer
// it is left out of the federation rather than replaced by the hub.

export let driver: Driver;
export let spe1Driver: Driver | null = null;
export let spe2Driver: Driver | null = null;
let spe1Workspace = false;

export function getSession(): Session {
  return driver.session({ database: "neo4j" });
}

/** True once NEO4J_SPE1_URI is set: SPE-1 is a workspace, not the hub. */
export function spe1IsWorkspace(): boolean {
  return spe1Workspace;
}

export function setSpe1Workspace(configured: boolean): void {
  spe1Workspace = configured;
}

/** Whether a federated question has more than the hub to ask. */
export function federationAvailable(): boolean {
  return spe2Driver != null || spe1Workspace;
}

/** Returns all active SPE labels and their drivers */
export function getSpeDrivers(): Array<{ label: string; driver: Driver }> {
  const spes: Array<{ label: string; driver: Driver }> = [];
  if (!spe1Workspace) spes.push({ label: "SPE-1", driver });
  else if (spe1Driver) spes.push({ label: "SPE-1", driver: spe1Driver });
  if (spe2Driver) spes.push({ label: "SPE-2", driver: spe2Driver });
  return spes;
}

export function setDriver(d: Driver): void {
  driver = d;
}

export function setSpe1Driver(d: Driver | null): void {
  spe1Driver = d;
}

export function setSpe2Driver(d: Driver | null): void {
  spe2Driver = d;
}

/**
 * The URI and driver config for a workspace. With a pinned CA (the AKS
 * workspaces' own, ADR-069) the connection is encrypted and trusts that CA
 * only; the driver refuses trust settings on a `+s` scheme, so the scheme
 * becomes the plain one with encryption switched on in the config. Without a
 * CA the URI is used as given (compose: plain Bolt on the compose network).
 */
export function workspaceDriverOptions(
  uri: string,
  ca: { pem?: string; file?: string },
): { uri: string; config: Config } {
  if (!ca.pem && !ca.file) return { uri, config: {} };
  let file = ca.file;
  if (!file) {
    const dir = mkdtempSync(join(tmpdir(), "spe-ca-"));
    file = join(dir, "ca.pem");
    writeFileSync(file, ca.pem as string, { mode: 0o600 });
  }
  const plain = uri
    .replace(/^bolt\+s{1,2}c?:/, "bolt:")
    .replace(/^neo4j\+s{1,2}c?:/, "neo4j:");
  return {
    uri: plain,
    config: {
      encrypted: "ENCRYPTION_ON",
      trust: "TRUST_CUSTOM_CA_SIGNED_CERTIFICATES",
      trustedCertificates: [file],
    },
  };
}

export interface SpeConnection {
  /** Makes a fresh driver; called once per attempt. */
  create: () => Driver;
  attempts: number;
  intervalMs: number;
  /** Injected by tests; a real wait otherwise. */
  sleep?: (ms: number) => Promise<void>;
  onConnected?: (address: string | undefined, attempt: number) => void;
  onGiveUp?: (err: unknown) => void;
}
/** The SPE-2 name of SpeConnection, kept for its callers. */
export type Spe2Connection = SpeConnection;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/**
 * Connects an SPE workspace and keeps trying while it does not answer yet.
 *
 * The proxy used to try SPE-2 once at startup and, if it was not up, run
 * without it until the next restart. On Azure the morning start (ADR-053)
 * brings the AKS node, its workspaces and the proxy up within minutes of each
 * other, and a workspace answers Bolt only once its loader has run, so one
 * try could lose an SPE for the whole day (ADR-069). True once the workspace
 * answered and its driver is set; false after the last attempt, with no
 * driver set.
 */
export async function connectSpe(
  c: SpeConnection,
  set: (d: Driver) => void,
): Promise<boolean> {
  const sleep = c.sleep ?? wait;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= c.attempts; attempt++) {
    const d = c.create();
    try {
      const info = await d.getServerInfo();
      set(d);
      c.onConnected?.(info?.address, attempt);
      return true;
    } catch (err) {
      lastErr = err;
      try {
        await d.close();
      } catch {
        // a driver that never connected has nothing to close
      }
      if (attempt < c.attempts) await sleep(c.intervalMs);
    }
  }
  c.onGiveUp?.(lastErr);
  return false;
}

export function connectSpe2(c: SpeConnection): Promise<boolean> {
  return connectSpe(c, setSpe2Driver);
}

export function connectSpe1(c: SpeConnection): Promise<boolean> {
  return connectSpe(c, setSpe1Driver);
}
