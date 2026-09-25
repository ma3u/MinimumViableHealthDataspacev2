import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import { RETENTION_ARTICLE, RETENTION_MONTHS } from "@/lib/retention";

export const dynamic = "force-dynamic";

/**
 * The retention of the secure processing environment's logs, Regulation (EU)
 * 2025/327 Art. 73(1)(e): at least one year.
 *
 * GET: the policy and the state of the records: how many access events and
 * recorded transfers there are, the oldest, how many are past their retention
 * date and may go, how many are protected.
 * POST { confirm: true }: deletes what is past its retention date, and
 * nothing else: a record without `retainUntil` is never touched, a record
 * younger than a year neither. Access body and operator only. Issue #206, M3.
 */

interface Counts {
  total: number;
  withRetention: number;
  expired: number;
  protectedCount: number;
  oldest: string | null;
  newest: string | null;
}

async function counts(): Promise<{ events: Counts; transfers: Counts }> {
  const [events, transfers] = await Promise.all([
    runQuery<Counts>(
      `MATCH (te:TransferEvent)
       RETURN count(te) AS total,
              count(te.retainUntil) AS withRetention,
              count(CASE WHEN te.retainUntil IS NOT NULL
                          AND datetime(toString(te.retainUntil)) < datetime() THEN 1 END) AS expired,
              count(CASE WHEN te.retainUntil IS NULL
                          OR datetime(toString(te.retainUntil)) >= datetime() THEN 1 END) AS protectedCount,
              min(toString(te.timestamp)) AS oldest,
              max(toString(te.timestamp)) AS newest`,
    ),
    runQuery<Counts>(
      `MATCH (t:DataTransfer)
       RETURN count(t) AS total,
              count(t.retainUntil) AS withRetention,
              count(CASE WHEN t.retainUntil IS NOT NULL
                          AND datetime(toString(t.retainUntil)) < datetime() THEN 1 END) AS expired,
              count(CASE WHEN t.retainUntil IS NULL
                          OR datetime(toString(t.retainUntil)) >= datetime() THEN 1 END) AS protectedCount,
              min(toString(t.timestamp)) AS oldest,
              max(toString(t.timestamp)) AS newest`,
    ),
  ]);
  const num = (c: Counts | undefined): Counts => ({
    total: Number(c?.total ?? 0),
    withRetention: Number(c?.withRetention ?? 0),
    expired: Number(c?.expired ?? 0),
    protectedCount: Number(c?.protectedCount ?? 0),
    oldest: c?.oldest ?? null,
    newest: c?.newest ?? null,
  });
  return { events: num(events[0]), transfers: num(transfers[0]) };
}

const policy = {
  months: RETENTION_MONTHS,
  article: RETENTION_ARTICLE,
  rule: "Every access event and recorded transfer carries retainUntil, one year after it was recorded. Nothing is deleted before that date, and nothing without it.",
};

export async function GET() {
  const auth = await requireAuth(["HDAB_AUTHORITY", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ policy, ...(await counts()) });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["HDAB_AUTHORITY", "EDC_ADMIN"]);
  if (isAuthError(auth)) return auth;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* an empty body is a dry run */
  }
  if (body.confirm !== true) {
    return NextResponse.json(
      {
        error:
          "Send { confirm: true } to delete the records past their retention date",
        policy,
        ...(await counts()),
      },
      { status: 400 },
    );
  }
  try {
    const [ev, tr] = await Promise.all([
      runQuery<{ deleted: number }>(
        `MATCH (te:TransferEvent)
         WHERE te.retainUntil IS NOT NULL
           AND datetime(toString(te.retainUntil)) < datetime()
         WITH te LIMIT 10000
         DETACH DELETE te
         RETURN count(*) AS deleted`,
      ),
      runQuery<{ deleted: number }>(
        `MATCH (t:DataTransfer)
         WHERE t.retainUntil IS NOT NULL
           AND datetime(toString(t.retainUntil)) < datetime()
         WITH t LIMIT 10000
         DETACH DELETE t
         RETURN count(*) AS deleted`,
      ),
    ]);
    return NextResponse.json({
      policy,
      deleted: {
        events: Number(ev[0]?.deleted ?? 0),
        transfers: Number(tr[0]?.deleted ?? 0),
      },
      ...(await counts()),
      article: RETENTION_ARTICLE,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Neo4j unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}
