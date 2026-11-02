import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { isAzureDeployment } from "@/lib/azure-arm";
import { runQuery } from "@/lib/neo4j";
import { userToParticipantId } from "@/lib/odrl-engine";
import { NEO4J_PROXY_URL, callerHeaders } from "@/lib/proxy";
import {
  SPE_LABEL_SIMULATED,
  SPE_POWER_REASONS,
  spePowerState,
  type SpeArmPower,
  type SpeEntry,
  type SpePermitRecord,
  type SpeStatusResponse,
} from "@/lib/spe";
import {
  SPE_IDS,
  SPE_POWER_ROLES,
  readArmPower,
  spePowerAvailable,
} from "@/lib/spe-power";

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
 * Each SPE's power state (ADR-072): ARM's view of its ACI group on Azure,
 * combined with the proxy's read of the workspace. A group ARM reports and
 * the proxy did not list (SPE-2 in the fallback without
 * NEO4J_SPE2_CONFIGURED) is added, so a stopped workspace still shows.
 */
function withPower(
  status: SpeStatusResponse,
  arm: Record<string, SpeArmPower | null>,
  roles: string[],
): SpeStatusResponse {
  const spes = [...status.spes];
  for (const id of SPE_IDS) {
    if (arm[id] && !spes.some((s) => s.id === id)) spes.push(unattested(id));
  }
  const available = spePowerAvailable();
  const allowed = roles.some((r) => (SPE_POWER_ROLES as string[]).includes(r));
  return {
    ...status,
    spes: spes.map((spe) => ({
      ...spe,
      powerState: spePowerState(arm[spe.id] ?? null, spe.status),
      armState: arm[spe.id]?.state ?? null,
      lastQueriedAt: spe.lastQueriedAt ?? null,
    })),
    power: {
      available: available && allowed,
      reason: !available
        ? SPE_POWER_REASONS.notAzure
        : allowed
          ? null
          : SPE_POWER_REASONS.notAllowed,
    },
  };
}

const PERMIT_TIMEOUT_MS = 3_000;

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** "SPE-1=sha256:..." entries, as `spe-loader record-permit` writes them. */
function hashBySpe(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of strings(v)) {
    const at = entry.indexOf("=");
    if (at > 0) out[entry.slice(0, at)] = entry.slice(at + 1);
  }
  return out;
}

/**
 * The data permits the hub holds a policy hash or Trustee resource for
 * (#833), so the policies page shows a stopped workspace's permit too. Best
 * effort: an unreachable hub, or one slower than three seconds, gives none,
 * and the page shows what the workspaces reported.
 */
async function readPermits(): Promise<SpePermitRecord[]> {
  const query = runQuery<Record<string, unknown>>(
    `MATCH (a:HDABApproval)
     WHERE a.policyHash IS NOT NULL OR size(coalesce(a.trusteeResources, [])) > 0
     RETURN a.approvalId AS permitId, a.name AS name, a.status AS status,
            a.policyHash AS policyHash, a.policyHashBySpe AS policyHashBySpe,
            coalesce(a.speWorkspaces, []) AS speWorkspaces,
            coalesce(a.trusteeResources, []) AS trusteeResources,
            toString(a.policyHashRecordedAt) AS recordedAt
     ORDER BY permitId`,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PERMIT_TIMEOUT_MS);
  });
  try {
    const rows = await Promise.race([query, timeout]);
    if (!rows) return [];
    return rows
      .filter((r) => typeof r.permitId === "string")
      .map((r) => ({
        permitId: r.permitId as string,
        name: strOrNull(r.name),
        status: strOrNull(r.status),
        policyHash: strOrNull(r.policyHash),
        policyHashBySpe: hashBySpe(r.policyHashBySpe),
        speWorkspaces: strings(r.speWorkspaces),
        trusteeResources: strings(r.trusteeResources),
        recordedAt: strOrNull(r.recordedAt),
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    query.catch(() => undefined);
  }
}

/**
 * GET /api/admin/spe: the confidential SPEs of ADR-068 (#774), for the
 * operator and the access body. Passes the proxy's `/spe/status` through;
 * when the proxy does not have it yet or cannot be reached, answers with the
 * fallback above, labelled "Simulated attestation", and the reason. Each SPE
 * carries its power state (ADR-072). A workspace ARM reports stopped is
 * named in `skip`, so the proxy does not wait for it. `permits` are the data
 * permits the hub records a policy hash for (#833).
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

  const permitsRead = readPermits();
  const arm = await readArmPower();
  const stopped = SPE_IDS.filter(
    (id) => arm[id] && spePowerState(arm[id], undefined) === "stopped",
  );
  const query = stopped.length > 0 ? `?skip=${stopped.join(",")}` : "";

  let reason: string;
  try {
    const resp = await fetch(`${NEO4J_PROXY_URL}/spe/status${query}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    if (resp.ok) {
      const data: unknown = await resp.json();
      if (isSpeStatusResponse(data)) {
        return NextResponse.json({
          ...withPower(data, arm, session.roles),
          permits: await permitsRead,
        });
      }
      reason = "The query proxy's /spe/status answered in an unknown shape";
    } else if (resp.status === 404) {
      reason = "The query proxy has no /spe/status yet";
    } else {
      reason = `The query proxy's /spe/status answered ${resp.status}`;
    }
  } catch {
    reason = "The query proxy is unreachable";
  }

  return NextResponse.json({
    ...withPower(fallbackStatus(reason), arm, session.roles),
    permits: await permitsRead,
  });
}
