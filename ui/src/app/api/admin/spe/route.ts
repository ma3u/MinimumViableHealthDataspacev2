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
 * An SPE as far as the UI knows without the proxy's `/spe/status`: no
 * attestation, no key release, no permit, no patient count, labelled
 * "Simulated attestation", status "unreachable" (unknown). Nothing here may
 * claim more than the proxy said.
 */
function unattested(id: string): SpeEntry {
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
    patients: null,
    status: "unreachable",
    attestation: null,
  };
}

/**
 * True when the deployment says a second SPE exists. `NEO4J_SPE2_CONFIGURED`
 * ("true" or "1") is set on the UI where the proxy has `NEO4J_SPE2_URI`; the
 * UI never sees the proxy's environment, and asking the proxy would cost a
 * query.
 */
function spe2Configured(): boolean {
  const v = (process.env.NEO4J_SPE2_CONFIGURED ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Without the proxy's `/spe/status` (#774 WP1 not deployed, or the proxy
 * down): SPE-1 always, SPE-2 only when `NEO4J_SPE2_CONFIGURED` says it
 * exists. It asks the proxy nothing else: `/federated/stats` would run the
 * statistics on every SPE and record a TransferEvent, so every visit to an
 * admin page would write access-log rows.
 */
function fallbackStatus(reason: string): SpeStatusResponse {
  const ids = spe2Configured() ? ["SPE-1", "SPE-2"] : ["SPE-1"];
  return {
    environment: isAzureDeployment() ? "azure" : "local",
    trustee: null,
    spes: ids.map(unattested),
    residualTrust: [],
    fallback: { reason },
  };
}

/**
 * GET /api/admin/spe: the confidential SPEs of ADR-068 (#774), for the
 * operator and the access body. Passes the proxy's `/spe/status` through;
 * when the proxy does not have it yet or cannot be reached, answers with the
 * fallback above, labelled "Simulated attestation", and the reason.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth(["EDC_ADMIN", "HDAB_AUTHORITY"]);
  if (isAuthError(auth)) return auth;
  const { session } = auth;

  // Names who asked, should the proxy record the status call (issue #205).
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

  return NextResponse.json(fallbackStatus(reason));
}
