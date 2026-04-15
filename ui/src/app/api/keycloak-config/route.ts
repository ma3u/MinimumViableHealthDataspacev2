import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public config endpoint read by client components (UserMenu) that need to
// construct Keycloak-facing URLs at runtime instead of baking a
// NEXT_PUBLIC_* value into the browser bundle at build time. The URL is
// already visible to the browser once the user signs in, so exposing it
// unauthenticated is not a disclosure risk.
export async function GET() {
  return NextResponse.json({
    publicUrl:
      process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:8080/realms/edcv",
    clientId:
      process.env.KEYCLOAK_CLIENT_ID ??
      process.env.KEYCLOAK_ID ??
      "health-dataspace-ui",
  });
}
