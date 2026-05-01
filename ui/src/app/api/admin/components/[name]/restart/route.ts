import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  azureSubscriptionId,
  azureResourceGroup,
  isAzureDeployment,
  listContainerApps,
  restartContainerApp,
  setContainerAppMinReplicas,
} from "@/lib/azure-arm";

export const dynamic = "force-dynamic";

const ALLOWED_APPS = new Set([
  "mvhd-controlplane",
  "mvhd-dp-fhir",
  "mvhd-dp-omop",
  "mvhd-identityhub",
  "mvhd-issuerservice",
  "mvhd-keycloak",
  "mvhd-vault",
  "mvhd-tenant-mgr",
  "mvhd-provision-mgr",
  "mvhd-postgres",
  "mvhd-nats",
  "mvhd-neo4j",
  "mvhd-neo4j-proxy",
  "mvhd-ui",
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await getServerSession(authOptions);
  const roles = (session as { roles?: string[] } | null)?.roles ?? [];
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes("EDC_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await params;
  if (!ALLOWED_APPS.has(name)) {
    return NextResponse.json(
      { error: `Unknown component: ${name}` },
      { status: 400 },
    );
  }

  if (!isAzureDeployment()) {
    return NextResponse.json(
      { error: "Restart is only available on Azure deployment" },
      { status: 400 },
    );
  }

  const sub = azureSubscriptionId();
  const rg = azureResourceGroup();
  if (!sub || !rg) {
    return NextResponse.json(
      { error: "Azure subscription / resource group not configured" },
      { status: 500 },
    );
  }

  try {
    // If currently scaled to zero, bump min-replicas to 1 first so restart
    // actually spins up a replica.
    let scaledUp = false;
    const apps = await listContainerApps(sub, rg);
    const app = apps.find((a) => a.name === name);
    const currentMin = app?.properties.template?.scale?.minReplicas ?? 1;
    if (currentMin === 0) {
      await setContainerAppMinReplicas(sub, rg, name, 1);
      scaledUp = true;
    }

    await restartContainerApp(sub, rg, name);

    return NextResponse.json({
      ok: true,
      name,
      scaledUp,
      message: scaledUp
        ? `${name}: bumped min-replicas 0→1 and restarted. Replica will boot shortly. Check diagnosis if it crashes.`
        : `${name}: restart triggered. Replicas will cycle within ~30s.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Restart failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
