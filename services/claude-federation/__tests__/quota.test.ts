import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_LIMIT,
  MemoryQuotaStore,
  PostgresQuotaStore,
  nextUtcMidnight,
  subjectKey,
  utcDay,
} from "../src/quota.js";

describe("the daily limit", () => {
  it("is a number a person can work with, not a round guess", () => {
    // Five interrupts an ordinary first session with a new report, which is
    // exactly when the feature is worth anything. A hundred is past any genuine
    // single-day use and only raises the ceiling for a script.
    expect(DEFAULT_DAILY_LIMIT).toBe(20);
  });
});

describe("MemoryQuotaStore", () => {
  it("allows up to the limit and then refuses", async () => {
    const store = new MemoryQuotaStore();
    for (let i = 1; i <= 3; i += 1) {
      const decision = await store.consume("user-a", 3);
      expect(decision.allowed).toBe(true);
      expect(decision.used).toBe(i);
    }
    const over = await store.consume("user-a", 3);
    expect(over.allowed).toBe(false);
    expect(over.used).toBe(3);
  });

  it("does not count a refusal against the next request", async () => {
    // Counting refusals would let a client burn through tomorrow's allowance by
    // retrying today, which turns a limit into a punishment.
    const store = new MemoryQuotaStore();
    await store.consume("user-a", 1);
    await store.consume("user-a", 1);
    await store.consume("user-a", 1);
    expect((await store.peek("user-a", 1)).used).toBe(1);
  });

  it("counts each person separately", async () => {
    const store = new MemoryQuotaStore();
    await store.consume("user-a", 1);
    expect((await store.consume("user-b", 1)).allowed).toBe(true);
  });

  it("resets at UTC midnight", async () => {
    let now = new Date("2026-09-13T23:59:00Z");
    const store = new MemoryQuotaStore(() => now);
    await store.consume("user-a", 1);
    expect((await store.consume("user-a", 1)).allowed).toBe(false);

    now = new Date("2026-09-14T00:01:00Z");
    expect((await store.consume("user-a", 1)).allowed).toBe(true);
  });

  it("reports when the count resets, so the refusal can say so", async () => {
    const store = new MemoryQuotaStore(() => new Date("2026-09-13T10:00:00Z"));
    expect((await store.peek("user-a", 20)).resetsAt).toBe(
      "2026-09-14T00:00:00.000Z",
    );
  });
});

describe("subject storage", () => {
  it("stores a hash, never the identity-provider subject", () => {
    // The counter needs to tell people apart, not to know who they are. A table
    // of subjects is a list of who uses this service; a table of hashes counts
    // the same thing and is worth nothing if read.
    const subject = "22067ff4-3c16-4f62-a7c4-d9c5ba36d5f1";
    const key = subjectKey(subject);
    expect(key).not.toContain(subject);
    expect(key).toHaveLength(32);
    expect(subjectKey(subject)).toBe(key);
    expect(subjectKey("someone-else")).not.toBe(key);
  });
});

describe("PostgresQuotaStore", () => {
  it("guards inside the statement, so two replicas cannot both pass the last slot", async () => {
    // The limit is in the WHERE clause of the upsert rather than in a read
    // followed by a write, so the increment and the check are one operation.
    const calls: { sql: string; params: unknown[] }[] = [];
    const store = new PostgresQuotaStore(async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ used: 1 }] };
    });

    await store.consume("user-a", 20);
    expect(calls[0]!.sql).toContain("ON CONFLICT");
    expect(calls[0]!.sql).toContain("WHERE inference_quota.used < $3");
    expect(calls[0]!.params[2]).toBe(20);
  });

  it("treats an empty result as refused rather than as an error", async () => {
    // The upsert returns no row when the guard rejects it. That is the refusal
    // path, not a failure, and confusing the two would 500 on a normal limit.
    let first = true;
    const store = new PostgresQuotaStore(async () => {
      if (first) {
        first = false;
        return { rows: [] };
      }
      return { rows: [{ used: 20 }] };
    });
    const decision = await store.consume("user-a", 20);
    expect(decision.allowed).toBe(false);
    expect(decision.used).toBe(20);
  });

  it("hashes the subject before it reaches the database", async () => {
    const calls: unknown[][] = [];
    const store = new PostgresQuotaStore(async (_sql, params) => {
      calls.push(params);
      return { rows: [{ used: 1 }] };
    });
    await store.consume("22067ff4-3c16-4f62-a7c4-d9c5ba36d5f1", 20);
    expect(calls[0]![0]).not.toBe("22067ff4-3c16-4f62-a7c4-d9c5ba36d5f1");
  });
});

describe("day boundaries", () => {
  it("uses UTC, so the reset is the same moment everywhere", () => {
    expect(utcDay(new Date("2026-09-13T23:30:00Z"))).toBe("2026-09-13");
    expect(utcDay(new Date("2026-09-14T00:30:00Z"))).toBe("2026-09-14");
    expect(nextUtcMidnight(new Date("2026-09-13T00:00:01Z"))).toBe(
      "2026-09-14T00:00:00.000Z",
    );
  });
});
