/**
 * The task store's connection (#566). On Azure the proxy had no TASK_DB_URL,
 * fell back to the compose host `postgres` (retired 2026-10-04), and every
 * /tasks call answered 500 with `getaddrinfo ENOTFOUND postgres`, 155 times in
 * one load run. The parts form lets the password come from a Key Vault
 * reference; production without a setting answers 503 instead of guessing.
 */
import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { taskDbConfig } from "../src/task-db-config.js";

describe("taskDbConfig", () => {
  it("uses TASK_DB_URL as it is", () => {
    expect(
      taskDbConfig({ TASK_DB_URL: "postgresql://u:p@db:5432/taskdb" }),
    ).toEqual({ connectionString: "postgresql://u:p@db:5432/taskdb", max: 5 });
  });

  it("builds the connection from parts, with TLS when required", () => {
    expect(
      taskDbConfig({
        NODE_ENV: "production",
        TASK_DB_HOST: "pg.example.test",
        TASK_DB_USER: "admin",
        TASK_DB_PASSWORD: "from-key-vault",
        TASK_DB_SSL: "require",
      }),
    ).toEqual({
      host: "pg.example.test",
      port: 5432,
      user: "admin",
      password: "from-key-vault",
      database: "taskdb",
      ssl: { rejectUnauthorized: true },
      max: 5,
    });
  });

  it("prefers TASK_DB_URL over the parts", () => {
    const config = taskDbConfig({
      TASK_DB_URL: "postgresql://u:p@db/taskdb",
      TASK_DB_HOST: "other",
    });
    expect(config).toEqual({
      connectionString: "postgresql://u:p@db/taskdb",
      max: 5,
    });
  });

  it("falls back to the compose store outside production only", () => {
    expect(taskDbConfig({ NODE_ENV: "development" })).toEqual({
      connectionString: "postgresql://taskuser:taskuser@postgres:5432/taskdb",
      max: 5,
    });
    expect(taskDbConfig({ NODE_ENV: "production" })).toBeNull();
  });
});

describe("/tasks without a configured store in production", () => {
  it("answers 503 with the empty shape, without trying a host", async () => {
    const saved = { ...process.env };
    delete process.env.TASK_DB_URL;
    delete process.env.TASK_DB_HOST;
    process.env.NODE_ENV = "production";
    try {
      const { app } = await import("../src/app.js");
      await import("../src/routes/tasks.js");
      const res = await supertest(app).get("/tasks");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: "Task store not configured",
        tasks: [],
        counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
      });
      const sync = await supertest(app).post("/tasks/sync").send({ tasks: [] });
      expect(sync.status).toBe(503);
      expect(sync.body).toEqual({ error: "Task store not configured" });
    } finally {
      process.env = saved;
    }
  });
});
