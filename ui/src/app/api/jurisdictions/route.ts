import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { runQuery } from "@/lib/neo4j";
import {
  EHDS_ELI,
  EHDS_TITLE,
  JURISDICTIONS_CYPHER,
  type Jurisdiction,
  type JurisdictionsResponse,
} from "@/lib/jurisdictions";

export const dynamic = "force-dynamic";

/**
 * GET /api/jurisdictions: how DE, AT, BE, FR, NL and ES implement the
 * secondary use of Regulation (EU) 2025/327, and which of the hub's
 * participants is under which (#782). Any signed-in participant (ADR-044).
 * When the graph has no profiles yet (a stack seeded before #782), the
 * bundled profiles answer, the same ones the static export shows.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let rows: (Jurisdiction & { reviewedOn?: string | null })[] = [];
  try {
    rows = await runQuery<Jurisdiction & { reviewedOn?: string | null }>(
      JURISDICTIONS_CYPHER,
    );
  } catch (err) {
    console.warn("Neo4j jurisdictions query unavailable:", err);
  }

  if (rows.length === 0) {
    try {
      const file = path.join(
        process.cwd(),
        "public",
        "mock",
        "jurisdictions.json",
      );
      const bundled = JSON.parse(
        await fs.readFile(file, "utf-8"),
      ) as JurisdictionsResponse;
      return NextResponse.json(bundled);
    } catch {
      return NextResponse.json(
        { error: "No jurisdiction profiles available" },
        { status: 503 },
      );
    }
  }

  const reviewedOn =
    rows
      .map((r) => r.reviewedOn)
      .filter((d): d is string => !!d)
      .sort()[0] ?? "";
  const body: JurisdictionsResponse = {
    reviewedOn,
    regulation: { title: EHDS_TITLE, eli: EHDS_ELI },
    jurisdictions: rows.map(({ reviewedOn: _reviewedOn, ...j }) => ({
      ...j,
      // The CASE in the query leaves a null for each participant of the
      // other kind; collect() keeps none, but an empty match can.
      accessBodies: (j.accessBodies ?? []).filter(Boolean),
      participants: (j.participants ?? []).filter(Boolean),
    })),
  };
  return NextResponse.json(body);
}
