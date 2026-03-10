import { NextRequest, NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * GET /api/participants — List all participant contexts (EDC-V Management API).
 * Used by admin dashboard and onboarding status pages.
 */
export async function GET() {
  try {
    const participants = await edcClient.management<unknown[]>(
      "/v5alpha/participants",
    );
    return NextResponse.json(participants);
  } catch (err) {
    console.error("Failed to list participants:", err);
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
