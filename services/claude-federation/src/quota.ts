/**
 * A per-person daily cap on provider-paid inference.
 *
 * ## Why there is a limit at all
 *
 * The default provider is paid for by whoever runs this deployment, not by the
 * person using it. An endpoint that authenticates a user and then spends the
 * operator's money without bound is a bill waiting to happen, whether through
 * enthusiasm, a retry loop, or someone who found the URL.
 *
 * ## Why it counts requests rather than tokens
 *
 * Tokens are what cost money, so counting them would be the precise thing to
 * do. Requests are what a person can reason about: "you have 6 questions left
 * today" is actionable, "you have 14,200 tokens left" is not, and a limit
 * nobody can predict feels arbitrary when it bites.
 *
 * Requests are only a fair proxy because each one is already bounded: at most
 * 40 values, a 2,000 character question and a capped response. Those caps are
 * what make one request roughly comparable to another, so they are part of this
 * limit rather than separate from it.
 *
 * ## Why Postgres rather than memory
 *
 * The service runs one to three replicas. An in-memory counter would be
 * per-replica, so the real limit would silently be three times the configured
 * one, and would reset on every deploy. A limit that does not hold is worse
 * than no limit, because it is trusted.
 */
import { createHash } from "node:crypto";

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  /** UTC midnight when the count resets. */
  resetsAt: string;
}

export interface QuotaStore {
  /** Increments and returns the decision atomically. */
  consume(subject: string, limit: number): Promise<QuotaDecision>;
  /** Reads without consuming, for showing the remaining count. */
  peek(subject: string, limit: number): Promise<QuotaDecision>;
}

/** The UTC day a moment falls in, as `YYYY-MM-DD`. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: Date = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * Subjects are hashed before storage.
 *
 * The counter needs to tell people apart, not to know who they are. A table of
 * identity-provider subjects is a list of who uses this service; a table of
 * hashes counts the same thing and is worth nothing if read.
 */
export function subjectKey(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 32);
}

/**
 * In-memory store. Correct only at one replica, and honest about it.
 *
 * Used for tests and for a single-replica deployment that accepts losing the
 * count on restart. `createQuotaStore` picks this only when no database is
 * configured, and the service says which one it is using at startup so the
 * choice is never invisible.
 */
export class MemoryQuotaStore implements QuotaStore {
  private counts = new Map<string, number>();
  private day = utcDay();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private rollover(): void {
    const today = utcDay(this.now());
    if (today !== this.day) {
      this.counts.clear();
      this.day = today;
    }
  }

  async consume(subject: string, limit: number): Promise<QuotaDecision> {
    this.rollover();
    const key = subjectKey(subject);
    const used = (this.counts.get(key) ?? 0) + 1;
    if (used > limit) {
      return {
        allowed: false,
        used: used - 1,
        limit,
        resetsAt: nextUtcMidnight(this.now()),
      };
    }
    this.counts.set(key, used);
    return {
      allowed: true,
      used,
      limit,
      resetsAt: nextUtcMidnight(this.now()),
    };
  }

  async peek(subject: string, limit: number): Promise<QuotaDecision> {
    this.rollover();
    const used = this.counts.get(subjectKey(subject)) ?? 0;
    return {
      allowed: used < limit,
      used,
      limit,
      resetsAt: nextUtcMidnight(this.now()),
    };
  }
}

/**
 * Postgres-backed store, correct across replicas and restarts.
 *
 * One statement per request, relying on the primary key for atomicity: two
 * replicas racing on the same subject both reach the upsert and the second sees
 * the first's increment, because the increment happens inside the statement
 * rather than between a read and a write in application code.
 */
export class PostgresQuotaStore implements QuotaStore {
  constructor(
    private readonly query: (
      sql: string,
      params: unknown[],
    ) => Promise<{ rows: { used: number }[] }>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static readonly SCHEMA = `
    CREATE TABLE IF NOT EXISTS inference_quota (
      subject_key TEXT NOT NULL,
      day         DATE NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (subject_key, day)
    );
  `;

  async consume(subject: string, limit: number): Promise<QuotaDecision> {
    const now = this.now();
    // The guard lives in the WHERE clause, so a request over the limit does not
    // increment. Counting refusals would let a client burn through tomorrow's
    // allowance by retrying today.
    const result = await this.query(
      `INSERT INTO inference_quota (subject_key, day, used)
       VALUES ($1, $2, 1)
       ON CONFLICT (subject_key, day) DO UPDATE
         SET used = inference_quota.used + 1
         WHERE inference_quota.used < $3
       RETURNING used`,
      [subjectKey(subject), utcDay(now), limit],
    );

    if (result.rows.length === 0) {
      const current = await this.peek(subject, limit);
      return { ...current, allowed: false };
    }
    const used = Number(result.rows[0]!.used);
    return { allowed: true, used, limit, resetsAt: nextUtcMidnight(now) };
  }

  async peek(subject: string, limit: number): Promise<QuotaDecision> {
    const now = this.now();
    const result = await this.query(
      `SELECT used FROM inference_quota WHERE subject_key = $1 AND day = $2`,
      [subjectKey(subject), utcDay(now)],
    );
    const used = result.rows.length > 0 ? Number(result.rows[0]!.used) : 0;
    return {
      allowed: used < limit,
      used,
      limit,
      resetsAt: nextUtcMidnight(now),
    };
  }
}

/**
 * The default daily limit, and the reasoning behind the number.
 *
 * A person scans a lab report and works through it: what is Lp(a), why is my
 * LDL flagged, what does the printed range mean. That is a handful of questions
 * in one sitting, and they stop when they are satisfied rather than when they
 * are cut off. Twenty covers that twice over.
 *
 * Five would interrupt an ordinary first session with a new report, which is
 * exactly the moment the feature is worth anything. A hundred is past any
 * genuine single-day use and only raises the ceiling for a script.
 *
 * Each request is already bounded at 40 values and a capped response, so twenty
 * is a few tens of thousands of tokens a day per person at the very worst, and
 * far less in practice.
 */
export const DEFAULT_DAILY_LIMIT = 20;
