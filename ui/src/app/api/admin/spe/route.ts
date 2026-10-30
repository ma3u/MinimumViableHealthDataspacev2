import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { isAzureDeployment } from "@/lib/azure-arm";
import { userToParticipantId } from "@/lib/odrl-engine";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  SPE_LABEL_SIMULATED,
  type SpeEntry,
  type SpeStatusResponse,
} from "@/lib/spe";

export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 5_000;

/** The holders of the two demo SPEs (#774): fictional, as everywhere. */
const SPE_HOLDERS: Record<string, string> = {
  "SPE-1": "AlphaKlinik Berlin",
  "SPE-2": "Limburg Medical Centre",
};

const SPE_RUNS_ON: Record<string, string> = {
  "SPE-1": "Hub graph Neo4j, an ordinary container",
  "SPE-2": "Second Neo4j (NEO4J_SPE2_URI), an ordinary container",
};

function isSpeStatusResponse(v: unknown): v is SpeStatusResponse {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.environment === "string" && Array.isArray(o.spes);
}

/**
 * An SPE as far as the proxy's existing information goes: no attestation, no
 * key release, no permit, labelled "Simulated attestation". Nothing here may
 * claim more than the proxy said.
 */
function unattested(
  id: string,
  patients: number | null,
  answered: boolean,
): SpeEntry {
  return {
    id,
    holder: SPE_HOLDERS[id] ?? "Unknown holder",
    runsOn: SPE_RUNS_ON[id] ?? "Unknown",
    teeType: "none",
    attestationScope: "none",
    simulated: true,
    label: SPE_LABEL_SIMULATED,
    attestedAt: null,
    keyReleasedAt: null,
    permitId: null,
    policyHash: null,
    policyCheckedByHardware: false,
    patients,
    status: answered ? "ready" : "unreachable",
  };
}

/**
 * Before the proxy has `/spe/status` (#774 WP1), the only thing that says
 * which SPEs exist is `/federated/stats`: SPE-1 always, SPE-2 only when the
 * proxy has a driver for it. When that fails too, SPE-1 is listed as
 * unreachable and SPE-2 not at all, since nothing says it exists.
 */
async function fallbackStatus(
  reason: string,
  headers: Record<string, string>,
): Promise<SpeStatusResponse> {
  const environment = isAzureDeployment() ? "azure" : "local";
  let spes: SpeEntry[] = [unattested("SPE-1", null, false)];
  try {
    const resp = await fetch(`${NEO4J_PROXY_URL}/federated/stats`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        perSpe?: { source?: string; patients?: number }[];
      };
      const perSpe = Array.isArray(data.perSpe) ? data.perSpe : [];
      const byId = new Map(
        perSpe
          .filter((s) => typeof s.source === "string")
          .map((s) => [s.source as string, s]),
      );
      const ids = ["SPE-1", ...[...byId.keys()].filter((k) => k !== "SPE-1")];
      spes = ids.sort().map((id) => {
        const s = byId.get(id);
        return unattested(
          id,
          typeof s?.patients === "number" ? s.patients : null,
          Boolean(s),
        );
      });
    }
  } catch {
    /* SPE-1 stays listed as unreachable */
  }
  return {
    environment,
    trustee: null,
    spes,
    residualTrust: [],
    fallback: { reason },
  };
}

/**
 * GET /api/admin/spe: the confidential SPEs of ADR-068 (#774), for the
 * operator and the access body. Passes the proxy's `/spe/status` through;
 * when the proxy does not have it yet or cannot be reached, answers with what
 * the proxy's federated statistics say, labelled "Simulated attestation".
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth(["EDC_ADMIN", "HDAB_AUTHORITY"]);
  if (isAuthError(auth)) return auth;
  const { session } = auth;

  // The proxy records the federated statistics call as a TransferEvent; this
  // header makes the entry name who asked (issue #205).
  const headers: Record<string, string> = {
    "X-Participant": userToParticipantId(
      session.user.email ?? session.user.name ?? session.user.id,
      session.roles,
    ),
    ...callerHeaders(session),
  };

  let reason: string;
  try {
    const resp = await fetch(`${NEO4J_PROXY_URL}/spe/status`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    if (resp.ok) {
      const data: unknown = await resp.json();
      if (isSpeStatusResponse(data)) return NextResponse.json(data);
      reason = "The query proxy's /spe/status answered in an unknown shape";
    } else if (resp.status === 404) {
      reason = "The query proxy has no /spe/status yet";
    } else {
      reason = `The query proxy's /spe/status answered ${resp.status}`;
    }
  } catch {
    reason = "The query proxy is unreachable";
  }

  return NextResponse.json(await fallbackStatus(reason, headers));
}
