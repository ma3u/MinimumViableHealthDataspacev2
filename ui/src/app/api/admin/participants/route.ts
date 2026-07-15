import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Phase 26a (issue #8): dynamic participant directory.
 *
 * CRUD over :Participant nodes carrying the crawl-target fields the catalog
 * crawler reads from Neo4j (source, walletType, country, dspCatalogUrl,
 * crawlerEnabled). Adding or removing a participant here changes the next
 * crawler tick — no restart, no YAML edit.
 */

const SOURCES = ["seed", "dcp", "business-wallet", "private-wallet"] as const;
const WALLET_TYPES = ["business", "private"] as const;

interface ParticipantRow {
  participantId: string;
  name: string | null;
  participantType: string | null;
  source: string | null;
  walletType: string | null;
  country: string | null;
  dspCatalogUrl: string | null;
  crawlerEnabled: boolean | null;
  onboardedAt: string | null;
  datasetCount: number;
}

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function listParticipants(): Promise<ParticipantRow[]> {
  return runQuery<ParticipantRow>(
    `MATCH (p:Participant)
     OPTIONAL MATCH (d:HealthDataset {publisherDid: p.participantId})
     WITH p, count(d) AS datasetCount
     RETURN p.participantId            AS participantId,
            p.name                     AS name,
            p.participantType          AS participantType,
            p.source                   AS source,
            p.walletType               AS walletType,
            p.country                  AS country,
            p.dspCatalogUrl            AS dspCatalogUrl,
            p.crawlerEnabled           AS crawlerEnabled,
            toString(p.onboardedAt)    AS onboardedAt,
            datasetCount               AS datasetCount
     ORDER BY p.name`,
  );
}

/** GET /api/admin/participants — list the participant directory. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const participants = await listParticipants();
    return NextResponse.json({
      participants,
      summary: {
        total: participants.length,
        crawlable: participants.filter(
          (p) => p.crawlerEnabled && p.dspCatalogUrl,
        ).length,
        bySource: participants.reduce(
          (acc, p) => {
            const s = p.source ?? "unknown";
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    });
  } catch (err) {
    console.error("Failed to list participants:", err);
    return NextResponse.json(
      { error: "Failed to list participants" },
      { status: 502 },
    );
  }
}

/** POST /api/admin/participants — add or update a wallet/participant. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const participantId = String(body.participantId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const walletType = String(body.walletType ?? "business");
  const source = String(body.source ?? "business-wallet");
  const country = String(body.country ?? "")
    .trim()
    .toUpperCase();
  const dspCatalogUrl = String(body.dspCatalogUrl ?? "").trim();
  const participantType = String(body.participantType ?? "").trim();

  if (!participantId.startsWith("did:")) {
    return NextResponse.json(
      { error: "participantId must be a DID (did:web:...)" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!(WALLET_TYPES as readonly string[]).includes(walletType)) {
    return NextResponse.json(
      { error: `walletType must be one of ${WALLET_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!(SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json(
      { error: `source must be one of ${SOURCES.join(", ")}` },
      { status: 400 },
    );
  }
  if (dspCatalogUrl && !/^https?:\/\//.test(dspCatalogUrl)) {
    return NextResponse.json(
      { error: "dspCatalogUrl must be an http(s) URL" },
      { status: 400 },
    );
  }

  try {
    await runQuery(
      `MERGE (p:Participant {participantId: $participantId})
       ON CREATE SET p.onboardedAt = datetime()
       SET p.name           = $name,
           p.walletType     = $walletType,
           p.source         = $source,
           p.country        = CASE WHEN $country = '' THEN p.country ELSE $country END,
           p.dspCatalogUrl  = CASE WHEN $dspCatalogUrl = '' THEN null ELSE $dspCatalogUrl END,
           p.participantType = CASE WHEN $participantType = '' THEN p.participantType ELSE $participantType END,
           p.crawlerEnabled = coalesce($crawlerEnabled, p.crawlerEnabled, true)`,
      {
        participantId,
        name,
        walletType,
        source,
        country,
        dspCatalogUrl,
        participantType,
        crawlerEnabled:
          typeof body.crawlerEnabled === "boolean" ? body.crawlerEnabled : null,
      },
    );
    return NextResponse.json({ ok: true, participantId }, { status: 201 });
  } catch (err) {
    console.error("Failed to upsert participant:", err);
    return NextResponse.json(
      { error: "Failed to save participant" },
      { status: 502 },
    );
  }
}

/** DELETE /api/admin/participants?id=<did> — remove a wallet from the directory. */
export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const participantId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!participantId) {
    return NextResponse.json(
      { error: "Query parameter 'id' (participant DID) is required" },
      { status: 400 },
    );
  }

  try {
    const rows = await runQuery<{ source: string | null }>(
      `MATCH (p:Participant {participantId: $participantId})
       RETURN p.source AS source`,
      { participantId },
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // The 5 seeded demo participants anchor contracts, datasets, and E2E
    // fixtures — deleting them would orphan large parts of the graph.
    if (rows[0].source === "seed") {
      return NextResponse.json(
        { error: "Seeded demo participants cannot be deleted" },
        { status: 409 },
      );
    }
    await runQuery(
      `MATCH (p:Participant {participantId: $participantId})
       DETACH DELETE p`,
      { participantId },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete participant:", err);
    return NextResponse.json(
      { error: "Failed to delete participant" },
      { status: 502 },
    );
  }
}
