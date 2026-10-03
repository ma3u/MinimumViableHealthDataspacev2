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
