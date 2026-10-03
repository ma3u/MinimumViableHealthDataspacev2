import { type Request, type Response } from "express";
import pg from "pg";
import { app } from "../app.js";

// ---- Persistent Task Management (Phase 13) ---------------------------------

const TASK_DB_URL =
  process.env.TASK_DB_URL ??
  "postgresql://taskuser:taskuser@postgres:5432/taskdb";

let taskPool: pg.Pool | null = null;

function getTaskPool(): pg.Pool {
  if (!taskPool) {
    taskPool = new pg.Pool({ connectionString: TASK_DB_URL, max: 5 });
  }
  return taskPool;
}

/** Ensure the tasks table exists (idempotent). */
async function ensureTaskTable(): Promise<void> {
  const pool = getTaskPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL CHECK (type IN ('negotiation', 'transfer')),
      participant     TEXT NOT NULL,
      participant_id  TEXT NOT NULL,
      asset           TEXT NOT NULL DEFAULT '',
      asset_id        TEXT NOT NULL DEFAULT '',
      state           TEXT NOT NULL DEFAULT 'REQUESTED',
      counter_party   TEXT NOT NULL DEFAULT '',
      timestamp_ms    BIGINT NOT NULL DEFAULT 0,
      contract_id     TEXT,
      transfer_type   TEXT,
      edr_available   BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_tasks_participant_id ON tasks(participant_id)`,
  );
}

interface TaskRow {
  id: string;
  type: "negotiation" | "transfer";
  participant: string;
  participant_id: string;
  asset: string;
  asset_id: string;
  state: string;
  counter_party: string;
  timestamp_ms: string;
  contract_id: string | null;
  transfer_type: string | null;
  edr_available: boolean;
}

/**
 * POST /tasks/sync — Upsert tasks from EDC-V into PostgreSQL.
 * Body: { tasks: Task[] }
 */
app.post("/tasks/sync", async (req: Request, res: Response) => {
  try {
    await ensureTaskTable();
    const pool = getTaskPool();
    const tasks: TaskRow[] = req.body?.tasks ?? [];

    let upserted = 0;
    for (const t of tasks) {
      await pool.query(
        `INSERT INTO tasks (id, type, participant, participant_id, asset, asset_id, state, counter_party, timestamp_ms, contract_id, transfer_type, edr_available)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           timestamp_ms = EXCLUDED.timestamp_ms,
           contract_id = EXCLUDED.contract_id,
           transfer_type = EXCLUDED.transfer_type,
           edr_available = EXCLUDED.edr_available,
           updated_at = now()`,
        [
          t.id,
          t.type,
          t.participant,
          t.participant_id,
          t.asset,
          t.asset_id,
          t.state,
          t.counter_party,
          t.timestamp_ms,
          t.contract_id,
          t.transfer_type,
          t.edr_available ?? false,
        ],
      );
      upserted++;
    }

    res.json({ upserted });
  } catch (err) {
    console.error("[tasks/sync] Error:", err);
    res.status(500).json({ error: "Failed to sync tasks" });
  }
});

/**
 * GET /tasks — Retrieve all persisted tasks from PostgreSQL.
 * Query params: ?participantId=<ctx> (optional filter)
 */
app.get("/tasks", async (req: Request, res: Response) => {
  try {
    await ensureTaskTable();
    const pool = getTaskPool();
    const participantId = req.query.participantId as string | undefined;

    let query = "SELECT * FROM tasks";
    const params: string[] = [];
    if (participantId) {
      query += " WHERE participant_id = $1";
      params.push(participantId);
    }
    query += " ORDER BY timestamp_ms DESC";

    const result = await pool.query(query, params);
    const tasks = result.rows.map((r: TaskRow) => ({
      id: r.id,
      type: r.type,
      participant: r.participant,
      participantId: r.participant_id,
      asset: r.asset,
      assetId: r.asset_id,
      state: r.state,
      counterParty: r.counter_party,
      timestamp: parseInt(r.timestamp_ms as string, 10) || 0,
      contractId: r.contract_id,
      transferType: r.transfer_type,
      edrAvailable: r.edr_available,
    }));

    const active = tasks.filter(
      (t: { state: string }) =>
        !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
          t.state?.toUpperCase() || "",
        ),
    ).length;

    res.json({
      tasks,
      counts: {
        total: tasks.length,
        negotiations: tasks.filter(
          (t: { type: string }) => t.type === "negotiation",
        ).length,
        transfers: tasks.filter((t: { type: string }) => t.type === "transfer")
          .length,
        active,
      },
    });
  } catch (err) {
    console.error("[tasks] Error:", err);
    res.status(500).json({
      error: "Failed to retrieve tasks",
      tasks: [],
      counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
    });
  }
});
