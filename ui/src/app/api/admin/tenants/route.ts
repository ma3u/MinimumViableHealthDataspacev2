import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { runQuery } from "@/lib/neo4j";

import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  version: number;
  properties: Record<string, string>;
  participantProfiles?: unknown[];
}

interface ParticipantRow {
  "@id": string;
  identity: string;
  state: string;
}

/**
 * Backfill tenants/participants from Neo4j when CFM tenant-manager and
 * EDC-V management API are unreachable (Azure deployment, or any environment
 * where the JAD services aren't yet wired). Mirrors the fallback already used
 * by /api/admin/components so the operator dashboard never shows zero
 * participants while the seeded knowledge graph clearly has them.
 */
async function loadFromNeo4j(): Promise<{
  tenants: TenantRow[];
  participants: ParticipantRow[];
}> {
  const rows = await runQuery<{
    id: string;
    name: string;
    type: string;
    legalName: string | null;
    jurisdiction: string | null;
    vcCount: number;
  }>(
    `MATCH (p:Participant)
     WHERE p.name IS NOT NULL AND p.name <> ''
     OPTIONAL MATCH (vc:VerifiableCredential)-[:ISSUED_TO]->(p)
     RETURN p.participantId                  AS id,
            p.name                           AS name,
            coalesce(p.participantType, '—') AS type,
            p.legalName                      AS legalName,
            p.jurisdiction                   AS jurisdiction,
            count(vc)                        AS vcCount
     ORDER BY p.name`,
  );

  const tenants: TenantRow[] = rows.map((r) => ({
    id: r.id,
    version: 1,
    properties: {
      displayName: r.name,
      organization: r.legalName ?? r.name,
      ehdsParticipantType: r.type,
      role: r.type,
      did: r.id,
      jurisdiction: r.jurisdiction ?? "—",
    },
    participantProfiles: [],
  }));

  const participants: ParticipantRow[] = rows.map((r) => ({
    "@id": r.id,
    identity: r.id,
    // Marker so the UI can distinguish seeded fallback rows from live CFM rows.
    state: "SEEDED",
  }));

  return { tenants, participants };
}

/**
 * GET /api/admin/tenants — List all tenants with their participant profiles.
 * Admin-only endpoint used by the operator dashboard.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let tenants: TenantRow[] = [];
  let participants: ParticipantRow[] = [];
  let source: "cfm" | "neo4j" | "mixed" = "cfm";

  try {
    tenants = await edcClient.tenant<TenantRow[]>("/v1alpha1/tenants");

    try {
      participants = await edcClient.management<ParticipantRow[]>(
        "/v5alpha/participants",
      );
    } catch (err) {
      console.warn(
        "Could not fetch participants from EDC-V (auth may be unavailable):",
        err,
      );
    }

    tenants = await Promise.all(
      tenants.map(async (t) => {
        let profiles: unknown[] = [];
        try {
          profiles = await edcClient.tenant<unknown[]>(
            `/v1alpha1/tenants/${t.id}/participant-profiles`,
          );
        } catch {
          /* no profiles yet */
        }
        return { ...t, participantProfiles: profiles };
      }),
    );
  } catch (err) {
    console.warn("CFM tenant-manager unreachable, falling back to Neo4j:", err);
    source = "neo4j";
  }

  // If CFM returned nothing — either it errored above or the deployment hasn't
  // provisioned tenants yet — backfill from the seeded knowledge graph.
  if (tenants.length === 0) {
    try {
      const fallback = await loadFromNeo4j();
      tenants = fallback.tenants;
      if (participants.length === 0) participants = fallback.participants;
      source = "neo4j";
    } catch (neoErr) {
      console.error("Neo4j fallback also failed:", neoErr);
      return NextResponse.json(
        { error: "Failed to list tenants" },
        { status: 502 },
      );
    }
  } else if (participants.length === 0) {
    // CFM has tenants but EDC-V participants endpoint failed — pull DIDs from
    // Neo4j so the participants column is at least populated.
    try {
      const fallback = await loadFromNeo4j();
      participants = fallback.participants;
      source = "mixed";
    } catch {
      /* leave participants empty */
    }
  }

  return NextResponse.json({
    source,
    tenants,
    participants,
    summary: {
      totalTenants: tenants.length,
      totalParticipants: participants.length,
      byRole: tenants.reduce(
        (acc, t) => {
          const role = t.properties?.role || "unknown";
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
  });
}
