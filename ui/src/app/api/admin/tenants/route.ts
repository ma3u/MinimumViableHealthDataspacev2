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

interface Neo4jVpa {
  id: string | null;
  version: number | null;
  state: string | null;
  stateTimestamp: string | null;
  type: string | null;
  cellId: string | null;
}

interface Neo4jProfile {
  id: string | null;
  version: number | null;
  identifier: string | null;
  tenantId: string | null;
  role: string | null;
  displayName: string | null;
  vpas: Neo4jVpa[];
}

/**
 * Backfill tenants/participants from Neo4j when CFM tenant-manager and
 * EDC-V management API are unreachable (Azure deployment, or any environment
 * where the JAD services aren't yet wired). Mirrors the fallback already used
 * by /api/admin/components so the operator dashboard never shows zero
 * participants while the seeded knowledge graph clearly has them.
 *
 * Returns the same shape as CFM's /v1alpha1/tenants + per-tenant
 * /participant-profiles endpoints, with :ParticipantProfile and :VPA nodes
 * seeded by neo4j/seed-tenant-profiles.cypher driving the
 * `participantProfiles[*].vpas[*]` arrays.
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
    profiles: Neo4jProfile[];
  }>(
    `MATCH (p:Participant)
     WHERE p.name IS NOT NULL AND p.name <> ''
     OPTIONAL MATCH (vc:VerifiableCredential)-[:ISSUED_TO]->(p)
     WITH p, count(vc) AS vcCount
     RETURN p.participantId                  AS id,
            p.name                           AS name,
            coalesce(p.participantType, '—') AS type,
            p.legalName                      AS legalName,
            p.jurisdiction                   AS jurisdiction,
            vcCount                          AS vcCount,
            [(pp:ParticipantProfile)-[:OF_TENANT]->(p) | {
              id: pp.profileId,
              version: coalesce(pp.version, 1),
              identifier: pp.identifier,
              tenantId: pp.tenantId,
              role: pp.role,
              displayName: pp.displayName,
              vpas: [(v:VPA)-[:OF_PROFILE]->(pp) | {
                id: v.vpaId,
                version: coalesce(v.version, 1),
                state: v.state,
                stateTimestamp: toString(v.stateTimestamp),
                type: v.vpaType,
                cellId: v.cellId
              }]
            }]                               AS profiles
     ORDER BY p.name`,
  );

  const tenants: TenantRow[] = rows.map((r) => {
    const profiles =
      Array.isArray(r.profiles) && r.profiles.length > 0
        ? r.profiles.map((pp) => ({
            id: pp.id ?? `${r.id}-profile`,
            version: pp.version ?? 1,
            identifier: pp.identifier ?? r.id,
            tenantId: pp.tenantId ?? r.id,
            // CFM's API key is an opaque dataspace-role UUID; for the Neo4j
            // fallback we synthesise a stable label so the UI's
            // Object.values(participantRoles).flat() still renders something.
            participantRoles: { "neo4j-fallback": [pp.role ?? "—"] },
            vpas: (pp.vpas ?? []).map((v) => ({
              id: v.id ?? "",
              version: v.version ?? 1,
              state: v.state ?? "unknown",
              stateTimestamp: v.stateTimestamp ?? "",
              type: v.type ?? "",
              cellId: v.cellId ?? "",
            })),
            properties: {},
          }))
        : // No :ParticipantProfile seeded yet — synthesise one minimal entry
          // so the operator UI still shows the tenant as having a presence
          // (mirrors the synthetic-profile fallback used on the CFM path).
          [
            {
              id: `${r.id}-synthetic`,
              version: 1,
              identifier: r.id,
              tenantId: r.id,
              participantRoles: { "neo4j-fallback": [r.type] },
              vpas: [],
              properties: { synthetic: true } as Record<string, unknown>,
            },
          ];

    return {
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
      participantProfiles: profiles,
    };
  });

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
        // CFM may return zero profiles even though the tenant is fully
        // registered (Azure deployment hasn't run the participant-profile
        // seed yet). The operator UI counts every tenant that has at
        // least one profile entry as "active", so synthesize a minimal
        // entry from the tenant's own metadata when CFM gives us nothing.
        // Marker `synthetic: true` lets future deltas distinguish these
        // from real CFM-provisioned profiles.
        if (!Array.isArray(profiles) || profiles.length === 0) {
          profiles = [
            {
              id: `${t.id}-synthetic`,
              participantContextId: t.id,
              displayName: t.properties?.displayName ?? t.id,
              role:
                t.properties?.ehdsParticipantType ??
                t.properties?.role ??
                "Unknown",
              vpas: [],
              synthetic: true,
            },
          ];
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
