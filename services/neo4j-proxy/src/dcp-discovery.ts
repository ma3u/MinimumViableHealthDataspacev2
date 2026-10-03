import neo4j from "neo4j-driver";
import { driver } from "./db.js";

// ---- Startup ---------------------------------------------------------------

/**
 * Phase 26a (issue #8): DCP trust-anchor discovery loop.
 * When DCP_DISCOVERY_URL is set, periodically pull the trust anchor's
 * participant list and MERGE each entry as :Participant {source: 'dcp'}.
 * Idempotent — existing nodes keep their properties unless the anchor
 * supplies fresher values. The catalog crawler picks new entries up on
 * its next tick, so onboarding needs no restart anywhere.
 */
const DCP_DISCOVERY_URL = process.env.DCP_DISCOVERY_URL ?? "";
const DCP_DISCOVERY_INTERVAL_MS = parseInt(
  process.env.DCP_DISCOVERY_INTERVAL_MS ?? "300000",
  10,
);

export async function dcpDiscoveryTick(): Promise<number> {
  if (!DCP_DISCOVERY_URL || !driver) return 0;
  const res = await fetch(DCP_DISCOVERY_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`trust anchor returned HTTP ${res.status}`);
  }
  const body: any = await res.json();
  const entries: any[] = Array.isArray(body) ? body : body.participants ?? [];
  const rows = entries
    .filter((e) => typeof e?.did === "string" && e.did.startsWith("did:"))
    .map((e) => ({
      did: e.did,
      name: typeof e.name === "string" ? e.name : null,
      walletType: e.walletType === "private" ? "private" : "business",
      country: typeof e.country === "string" ? e.country : null,
      dspCatalogUrl:
        typeof e.dspCatalogUrl === "string" ? e.dspCatalogUrl : null,
    }));
  if (rows.length === 0) return 0;

  const session = driver.session({ database: "neo4j" });
  try {
    await session.run(
      `UNWIND $rows AS row
       MERGE (p:Participant {participantId: row.did})
       ON CREATE SET p.source = 'dcp',
                     p.onboardedAt = datetime(),
                     p.crawlerEnabled = true
       SET p.name          = coalesce(row.name, p.name),
           p.walletType    = coalesce(p.walletType, row.walletType),
           p.country       = coalesce(row.country, p.country),
           p.dspCatalogUrl = coalesce(row.dspCatalogUrl, p.dspCatalogUrl)`,
      { rows },
    );
  } finally {
    await session.close();
  }
  return rows.length;
}

export function startDcpDiscoveryLoop(): void {
  if (!DCP_DISCOVERY_URL) {
    console.log(
      "[neo4j-proxy] DCP discovery disabled (set DCP_DISCOVERY_URL to enable)",
    );
    return;
  }
  const tick = () =>
    dcpDiscoveryTick()
      .then((n) => {
        if (n > 0)
          console.log(
            `[neo4j-proxy] DCP discovery: upserted ${n} participants`,
          );
      })
      .catch((err) =>
        console.warn("[neo4j-proxy] DCP discovery tick failed:", err.message),
      );
  tick();
  const timer = setInterval(tick, DCP_DISCOVERY_INTERVAL_MS);
  timer.unref();
  console.log(
    `[neo4j-proxy] DCP discovery loop every ${
      DCP_DISCOVERY_INTERVAL_MS / 1000
    }s → ${DCP_DISCOVERY_URL}`,
  );
}
