import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, type Driver, type Session } from "neo4j-driver";

// ---------------------------------------------------------------------------
// Neo4j drivers: the hub graph, and the SPE workspaces
// ---------------------------------------------------------------------------
//
// `driver` is the hub graph: catalog, permits, audit chain, the single-SPE
// NLQ path (POST /nlq without `federated`, getSession()), and SPE-1 in the
// federation for as long as SPE-1 is not a workspace of its own.
// NEO4J_SPE1_URI makes it one (ADR-068 decision 3, ADR-069): getSpeDrivers(),
// which the federated path and the spe_access template use, then returns
// `spe1Driver` for SPE-1, never the hub, which holds every patient of both
// halves. While a configured SPE-1 workspace does not answer it is left out
// of the federation rather than replaced by the hub. getSession() stays the
// hub's either way: the single-SPE path answers from the hub on purpose
// (catalog questions need it), and ADR-069 says so.

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
  /** How many tries; Infinity keeps trying for as long as the proxy runs. */
  attempts: number;
  /** The wait after the first failed try. */
  intervalMs: number;
  /** The wait doubles after each failure up to this; unset, it stays intervalMs. */
  maxIntervalMs?: number;
  /** A try that has not answered after this long counts as failed. */
  timeoutMs?: number;
  /** Injected by tests; a real wait otherwise. */
  sleep?: (ms: number) => Promise<void>;
  onConnected?: (address: string | undefined, attempt: number) => void;
  /** Called once, on the first failure: logs follow state changes, not tries. */
  onFirstFailure?: (err: unknown) => void;
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
 * brings Trustee, the ACI workspaces and the proxy up within minutes of each
 * other, and a workspace answers Bolt only once it has attested and loaded,
 * so one try could lose an SPE for the whole day (ADR-069). The proxy calls
 * this without waiting for it (index.ts), so it listens whatever the
 * workspaces do. True once the workspace answered and its driver is set;
 * false after the last attempt, with no driver set.
 */
export async function connectSpe(
  c: SpeConnection,
  set: (d: Driver) => void,
): Promise<boolean> {
  const sleep = c.sleep ?? wait;
  let lastErr: unknown;
  let interval = c.intervalMs;
  for (let attempt = 1; attempt <= c.attempts; attempt++) {
    const d = c.create();
    try {
      const info = await answersWithin(d, c.timeoutMs);
      set(d);
      c.onConnected?.(info?.address, attempt);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) c.onFirstFailure?.(err);
      // Not awaited: closing a driver whose connection hangs can hang too.
      void Promise.resolve()
        .then(() => d.close())
        .catch(() => undefined);
      if (attempt < c.attempts) {
        await sleep(interval);
        if (c.maxIntervalMs) interval = Math.min(interval * 2, c.maxIntervalMs);
      }
    }
  }
  c.onGiveUp?.(lastErr);
  return false;
}

/** getServerInfo(), given up after `timeoutMs` (a hung connection never answers). */
function answersWithin(
  d: Driver,
  timeoutMs?: number,
): Promise<{ address?: string } | undefined> {
  const info = d.getServerInfo();
  if (!timeoutMs) return info;
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
    timer.unref();
  });
  return Promise.race([info, late]).finally(() => clearTimeout(timer));
}

export function connectSpe2(c: SpeConnection): Promise<boolean> {
  return connectSpe(c, setSpe2Driver);
}

export function connectSpe1(c: SpeConnection): Promise<boolean> {
  return connectSpe(c, setSpe1Driver);
}
