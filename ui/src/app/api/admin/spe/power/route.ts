import { type NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { IS_STATIC } from "@/lib/static-export";
import { SPE_COLD_START_SECONDS } from "@/lib/spe";
import {
  SPE_IDS,
  SPE_POWER_ROLES,
  identityLacksRoleBody,
  powerGroup,
  speGroup,
  spePowerAvailable,
  type SpeId,
} from "@/lib/spe-power";

export const dynamic = "force-dynamic";

type Action = "start" | "stop";

function parse(
  body: unknown,
): { action: Action; ids: SpeId[] } | { error: string } {
  const b = (body ?? {}) as { action?: unknown; spe?: unknown };
  if (b.action !== "start" && b.action !== "stop") {
    return { error: 'action must be "start" or "stop"' };
  }
  if (b.spe === "all") return { action: b.action, ids: [...SPE_IDS] };
  if (
    typeof b.spe === "string" &&
    (SPE_IDS as readonly string[]).includes(b.spe)
  ) {
    return { action: b.action, ids: [b.spe as SpeId] };
  }
  return { error: 'spe must be "SPE-1", "SPE-2" or "all"' };
}

/**
 * POST /api/admin/spe/power {action: "start"|"stop", spe: "SPE-1"|"SPE-2"|"all"}
 *
 * Starts or stops the SPE workspaces, the ACI confidential container groups
 * mvhd-spe-1 and mvhd-spe-2, with the UI's managed identity (ADR-072). For
 * the operator and the access body. 202 with each workspace's new state;
 * a start takes about 3 to 4 minutes (attest, release the key, load). 403
 * with the command that fixes it when the hub's identity lacks the role, 501
 * off Azure, where the workspaces are compose services.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(SPE_POWER_ROLES);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = parse(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { action, ids } = parsed;

  // The static demo starts nothing; it says what a start would answer.
  if (IS_STATIC) {
    return NextResponse.json(
      {
        action,
        static: true,
        spes: ids.map((id) => ({
          id,
          group: speGroup(id),
          state: action === "start" ? "starting" : "stopped",
          ...(action === "start" ? { etaSeconds: SPE_COLD_START_SECONDS } : {}),
        })),
      },
      { status: 202 },
    );
  }

  if (!spePowerAvailable()) {
    return NextResponse.json(
      {
        error:
          "Starting and stopping a workspace needs the Azure deployment (ACI container groups, ADR-072). Locally the workspaces are compose services: docker compose -f docker-compose.trustee.yml start or stop them.",
      },
      { status: 501 },
    );
  }

  // Side by side: each may wait a few seconds for ARM (powerGroup).
  const outcomes = await Promise.all(ids.map((id) => powerGroup(action, id)));
  const failed = outcomes.find((o) => !o.ok);
  if (failed && !failed.ok) {
    if (failed.status === 403) {
      return NextResponse.json(identityLacksRoleBody(failed.group), {
        status: 403,
      });
    }
    if (failed.status === 404) {
      return NextResponse.json(
        {
          error: `No container group ${failed.group}: the workspace has not been created (scripts/azure/21-aci-confidential-spe.sh --workspaces)`,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: `ARM refused to ${action} ${failed.group}: ${failed.message}` },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      action,
      spes: outcomes.map((o) =>
        o.ok
          ? {
              id: o.id,
              group: o.group,
              state: o.state,
              ...(o.state === "starting"
                ? { etaSeconds: SPE_COLD_START_SECONDS }
                : {}),
            }
          : null,
      ),
    },
    { status: 202 },
  );
}
