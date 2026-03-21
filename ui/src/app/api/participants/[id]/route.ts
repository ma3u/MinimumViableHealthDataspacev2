import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/participants/[id] — Update tenant properties (display name,
 * contact details, etc.) via CFM TenantManager.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { properties } = body as { properties: Record<string, string> };

    if (!properties || typeof properties !== "object") {
      return NextResponse.json(
        { error: "Missing properties" },
        { status: 400 },
      );
    }

    const result = await edcClient.tenant(
      `/v1alpha1/tenants/${params.id}`,
      "PATCH",
      { properties },
    );

    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    console.error("Failed to PATCH tenant:", err);
    return NextResponse.json(
      { error: "Failed to update participant" },
      { status: 502 },
    );
  }
}
