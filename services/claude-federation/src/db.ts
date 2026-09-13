/**
 * Postgres access for the quota counter.
 *
 * The cluster already runs Postgres for the EDC stack (`mvhd-postgres`,
 * internal ingress), so the counter gets durable shared state without adding a
 * dependency the deployment did not already have.
 *
 * Only the quota lives here. No health data reaches this database, and none
 * should: the store on the phone is the record, and this is a row of integers
 * keyed by a hash.
 */
import { Pool } from "pg";
import {
  PostgresQuotaStore,
  type QuotaStore,
  MemoryQuotaStore,
} from "./quota.js";

let pool: Pool | undefined;

/**
 * Chooses the store, and says which one it chose.
 *
 * A limit that does not hold is worse than no limit, because it is trusted. So
 * when there is no database the service falls back to counting in memory and
 * announces it at startup, rather than appearing to enforce a limit that three
 * replicas would each apply separately.
 */
export async function createQuotaStore(): Promise<{
  store: QuotaStore;
  kind: "postgres" | "memory";
  detail?: string;
}> {
  const connectionString = process.env.QUOTA_DATABASE_URL;
  if (!connectionString) {
    return {
      store: new MemoryQuotaStore(),
      kind: "memory",
      detail: "QUOTA_DATABASE_URL is unset; the limit applies per replica only",
    };
  }

  try {
    pool = new Pool({
      connectionString,
      max: 4,
      // A quota check must never be the slow part of a request. If the database
      // is unreachable the request should fail quickly and loudly rather than
      // hanging while someone waits for an answer about their blood test.
      connectionTimeoutMillis: 4000,
      idle_in_transaction_session_timeout: 5000,
    });
    await pool.query(PostgresQuotaStore.SCHEMA);
    const store = new PostgresQuotaStore((sql, params) =>
      pool!.query(sql, params as unknown[]).then((r) => ({
        rows: r.rows as { used: number }[],
      })),
    );
    return { store, kind: "postgres" };
  } catch (error) {
    // Falling back rather than refusing to start: a database outage should not
    // take down analysis entirely, and the operator is told which mode is live.
    return {
      store: new MemoryQuotaStore(),
      kind: "memory",
      detail: `postgres unavailable (${
        error instanceof Error ? error.message : "unknown"
      }); the limit applies per replica only`,
    };
  }
}

export async function closeQuotaStore(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
