import type pg from "pg";

/** The compose stack's task store (jad/init-postgres.sql). */
const COMPOSE_TASK_DB_URL =
  "postgresql://taskuser:taskuser@postgres:5432/taskdb";

/**
 * Where the task store is, from the environment.
 *
 * - `TASK_DB_URL`: a full connection string (compose, CI).
 * - `TASK_DB_HOST` with `TASK_DB_USER`, `TASK_DB_PASSWORD`, `TASK_DB_NAME`
 *   and `TASK_DB_SSL=require`: the parts, so the password can come from a
 *   Key Vault reference on its own (Azure, ADR-036) and nobody has to build a
 *   URL around it.
 * - neither: the compose URL outside production; in production `null`, so a
 *   missing setting fails loudly once instead of a DNS error per request. On
 *   Azure the fallback host `postgres` was the container retired on
 *   2026-10-04, and every `/tasks` call answered 500 (#566).
 */
export function taskDbConfig(
  env: NodeJS.ProcessEnv = process.env,
): pg.PoolConfig | null {
  if (env.TASK_DB_URL) return { connectionString: env.TASK_DB_URL, max: 5 };
  if (env.TASK_DB_HOST) {
    return {
      host: env.TASK_DB_HOST,
      port: Number(env.TASK_DB_PORT ?? 5432),
      user: env.TASK_DB_USER,
      password: env.TASK_DB_PASSWORD,
      database: env.TASK_DB_NAME ?? "taskdb",
      ssl: env.TASK_DB_SSL === "require" ? { rejectUnauthorized: true } : false,
      max: 5,
    };
  }
  if (env.NODE_ENV === "production") return null;
  return { connectionString: COMPOSE_TASK_DB_URL, max: 5 };
}
