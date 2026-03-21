import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Approved fictional participants — display names by DID slug.
 * Slug = last path segment of the participant's DID
 * (e.g. "did:web:identityhub%3A7083:alpha-klinik" → "alpha-klinik").
 * Used as fallback when the CFM Tenant Manager is unavailable.
 */
const SLUG_DISPLAY_NAMES: Record<
  string,
  { displayName: string; org: string; role: string }
> = {
  "alpha-klinik": {
    displayName: "AlphaKlinik Berlin",
    org: "AlphaKlinik Berlin",
    role: "DATA_HOLDER",
  },
  lmc: {
    displayName: "Limburg Medical Centre",
    org: "Limburg Medical Centre",
    role: "DATA_HOLDER",
  },
  pharmaco: {
    displayName: "PharmaCo Research AG",
    org: "PharmaCo Research AG",
    role: "DATA_USER",
  },
  medreg: { displayName: "MedReg DE", org: "MedReg DE", role: "HDAB" },
  irs: {
    displayName: "Institut de Recherche Santé",
    org: "Institut de Recherche Santé",
    role: "HDAB",
  },
};

/** Extract DID slug from a participantId DID string. */
function didSlug(did: string): string {
  return decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
}

interface EdcParticipant {
  "@id": string;
  participantId?: string;
  identity?: string;
  [key: string]: unknown;
}

interface CfmTenant {
  id: string;
  properties?: {
    displayName?: string;
    organization?: string;
    role?: string;
    participantDid?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * GET /api/participants — List all participant contexts (EDC-V Management API)
 * enriched with human-readable display names from CFM Tenant Manager.
 */
export async function GET() {
  try {
    const participants = await edcClient.management<EdcParticipant[]>(
      "/v5alpha/participants",
    );

    // Attempt to fetch CFM tenants for display names — non-blocking
    const tenantMap: Record<string, string> = {};
    try {
      const tenants = await edcClient.tenant<CfmTenant[]>("/v1alpha1/tenants");
      if (Array.isArray(tenants)) {
        for (const t of tenants) {
          const dn = t.properties?.displayName;
          if (!dn) continue;
          // Match by DID slug stored in properties
          const did = t.properties?.participantDid ?? "";
          const slug = did ? didSlug(did) : "";
          if (slug) tenantMap[slug] = dn;
          // Also index by lowercase displayName slug for looser matching
          const dnSlug = dn
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
          tenantMap[dnSlug] = dn;
        }
      }
    } catch {
      // CFM may be down — fall back to static map below
    }

    // Enrich each participant with a displayName — skip stale CREATED contexts
    const enriched = (Array.isArray(participants) ? participants : [])
      .filter((p) => {
        // Only show ACTIVATED participants in the UI
        const state = (p as Record<string, unknown>).state as
          | string
          | undefined;
        return state === "ACTIVATED";
      })
      .map((p) => {
        const did = p.participantId ?? p.identity ?? "";
        const slug = did ? didSlug(did) : "";
        const staticEntry = SLUG_DISPLAY_NAMES[slug];
        const displayName =
          tenantMap[slug] ||
          staticEntry?.displayName ||
          slug ||
          p["@id"].slice(0, 12);
        const role = staticEntry?.role ?? "";
        return {
          ...p,
          participantId: p["@id"],
          displayName,
          role,
          slug,
          identity: did,
        };
      });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Failed to list participants:", err);

    // Fall back to bundled mock data so the UI works offline
    try {
      const mockPath = path.join(
        process.cwd(),
        "public",
        "mock",
        "participants.json",
      );
      const raw = await fs.readFile(mockPath, "utf-8");
      const mock = JSON.parse(raw);
      console.warn("EDC-V offline — serving mock participants");
      return NextResponse.json(mock);
    } catch {
      // Mock file not available either
    }

    return NextResponse.json(
      { error: "Failed to list participants" },
      { status: 502 },
    );
  }
}

/**
 * POST /api/participants — Create a new tenant + participant context.
 *
 * Body: { displayName, organization, role, ehdsParticipantType }
 *
 * Steps:
 * 1. Create tenant in CFM TenantManager
 * 2. Create participant profile (triggers provisioning via CFM agents)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { displayName, organization, role, ehdsParticipantType } = body;

    if (!displayName || !role) {
      return NextResponse.json(
        { error: "displayName and role are required" },
        { status: 400 },
      );
    }

    // 1. Get the cell ID (there is typically one cell in dev)
    const cells = await edcClient.tenant<{ id: string }[]>("/v1alpha1/cells");
    if (!cells || cells.length === 0) {
      return NextResponse.json(
        { error: "No cells found in TenantManager" },
        { status: 503 },
      );
    }
    const cellId = cells[0].id;

    // 2. Get the dataspace profile ID
    const profiles = await edcClient.tenant<{ id: string }[]>(
      "/v1alpha1/dataspace-profiles",
    );
    if (!profiles || profiles.length === 0) {
      return NextResponse.json(
        { error: "No dataspace profiles found" },
        { status: 503 },
      );
    }
    const profileId = profiles[0].id;

    // 3. Create tenant
    const tenantPayload = {
      properties: {
        displayName,
        organization: organization || displayName,
        role,
        ehdsParticipantType: ehdsParticipantType || role,
      },
    };

    const tenant = await edcClient.tenant<{ id: string }>(
      "/v1alpha1/tenants",
      "POST",
      tenantPayload,
    );

    // 4. Create participant profile for this tenant (triggers DID + key provisioning)
    const participantPayload = {
      cellId,
      dataspaceProfileId: profileId,
    };

    const participant = await edcClient.tenant<{ id: string }>(
      `/v1alpha1/tenants/${tenant.id}/participant-profiles`,
      "POST",
      participantPayload,
    );

    return NextResponse.json(
      {
        tenantId: tenant.id,
        participantId: participant?.id,
        displayName,
        role,
        status: "provisioning",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to create participant:", err);
    return NextResponse.json(
      { error: "Failed to create participant" },
      { status: 502 },
    );
  }
}
