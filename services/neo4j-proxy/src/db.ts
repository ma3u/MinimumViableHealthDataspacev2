import { type Driver, type Session } from "neo4j-driver";

// ---------------------------------------------------------------------------
// Neo4j drivers (primary SPE + optional secondary SPE)
// ---------------------------------------------------------------------------

export let driver: Driver;
export let spe2Driver: Driver | null = null;

export function getSession(): Session {
  return driver.session({ database: "neo4j" });
}

function getSpe2Session(): Session | null {
  return spe2Driver?.session({ database: "neo4j" }) ?? null;
}

/** Returns all active SPE labels and their drivers */
export function getSpeDrivers(): Array<{ label: string; driver: Driver }> {
  const spes = [{ label: "SPE-1", driver }];
  if (spe2Driver) spes.push({ label: "SPE-2", driver: spe2Driver });
  return spes;
}

export function setDriver(d: Driver): void {
  driver = d;
}

export function setSpe2Driver(d: Driver | null): void {
  spe2Driver = d;
}

export interface Spe2Connection {
  /** Makes a fresh driver for SPE-2; called once per attempt. */
  create: () => Driver;
  attempts: number;
  intervalMs: number;
  /** Injected by tests; a real wait otherwise. */
  sleep?: (ms: number) => Promise<void>;
  onConnected?: (address: string | undefined, attempt: number) => void;
  onGiveUp?: (err: unknown) => void;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/**
 * Connects the optional SPE-2 and keeps trying while it does not answer yet.
 *
 * The proxy used to try once at startup and, if SPE-2 was not up, run without
 * it until the next restart. On Azure the morning start (ADR-053) brings
 * mvhd-neo4j-spe2 and the proxy up within a minute of each other, and Neo4j
 * answers Bolt only once its plugins are in place, so one try could lose SPE-2
 * for the whole day (ADR-069). True once SPE-2 answered and its driver is set;
 * false after the last attempt, with no driver set.
 */
export async function connectSpe2(c: Spe2Connection): Promise<boolean> {
  const sleep = c.sleep ?? wait;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= c.attempts; attempt++) {
    const d = c.create();
    try {
      const info = await d.getServerInfo();
      setSpe2Driver(d);
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
