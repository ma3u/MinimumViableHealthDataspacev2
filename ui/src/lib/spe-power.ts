/**
 * Starting and stopping the SPE workspaces from the hub (ADR-072).
 *
 * The two workspaces are ACI confidential container groups (ADR-069). They
 * are stopped by default and start on demand: an operator or the access body
 * presses Start, or a federated query that needs one starts it and is told to
 * come back after the cold start. The hub calls ARM with the UI's
 * system-assigned managed identity (lib/azure-arm.ts), which needs the
 * built-in "Azure Container Instances Contributor Role" on the two groups.
 * Server only.
 */
import { NextResponse } from "next/server";
import type { Role } from "@/lib/auth";
import {
  ArmError,
  azureResourceGroup,
  azureSubscriptionId,
  getContainerGroupState,
  isAzureDeployment,
  startContainerGroup,
  stopContainerGroup,
} from "@/lib/azure-arm";
import {
  speEtaSeconds,
  spePowerState,
  type SpeArmPower,
  type SpeColdStartBody,
  type SpeColdStartEntry,
} from "@/lib/spe";

export const SPE_IDS = ["SPE-1", "SPE-2"] as const;
export type SpeId = (typeof SPE_IDS)[number];

/** Who may press Start and Stop on the admin pages. */
export const SPE_POWER_ROLES: Role[] = ["EDC_ADMIN", "HDAB_AUTHORITY"];
/**
 * Whose federated query may start a stopped workspace: the power roles and
 * the data user, whose query has passed the permit gate (Art. 61(1)) before
 * it gets here. Anyone else is told the workspace is stopped.
 */
const SPE_QUERY_START_ROLES: Role[] = [...SPE_POWER_ROLES, "DATA_USER"];

/** The ACI group each SPE runs in (ADR-069); SPE1_ACI_GROUP overrides. */
export function speGroup(id: SpeId): string {
  const n = id.slice(-1);
  return process.env[`SPE${n}_ACI_GROUP`] || `mvhd-spe-${n}`;
}

const UI_APP = "mvhd-ui";
const ACI_ROLE = "Azure Container Instances Contributor Role";

/** The command an owner runs so the hub may start and stop the groups. */
function grantCommand(
  rg: string = azureResourceGroup() ?? "rg-mvhd-dev",
): string {
  const groups = SPE_IDS.map(speGroup).join(" ");
  return (
    `UI_PRINCIPAL=$(az containerapp show -g ${rg} -n ${UI_APP} --query identity.principalId -o tsv); ` +
    `for g in ${groups}; do az role assignment create --assignee-object-id "$UI_PRINCIPAL" ` +
    `--assignee-principal-type ServicePrincipal --role "${ACI_ROLE}" ` +
    `--scope "$(az container show -g ${rg} -n "$g" --query id -o tsv)"; done`
  );
}

/** Subscription and resource group, when this deployment can call ARM at all. */
function armTarget(): { sub: string; rg: string } | null {
  if (!isAzureDeployment()) return null;
  const sub = azureSubscriptionId();
  const rg = azureResourceGroup();
  return sub && rg ? { sub, rg } : null;
}

export function spePowerAvailable(): boolean {
  return armTarget() !== null;
}

/**
 * ARM's power state of each group, or null for a group ARM could not tell
 * (not on Azure, no Reader role, group missing, ARM slow). Never throws.
 */
export async function readArmPower(
  ids: readonly SpeId[] = SPE_IDS,
): Promise<Record<string, SpeArmPower | null>> {
  const target = armTarget();
  const out: Record<string, SpeArmPower | null> = {};
  await Promise.all(
    ids.map(async (id) => {
      if (!target) {
        out[id] = null;
        return;
      }
      try {
        const g = await getContainerGroupState(
          target.sub,
          target.rg,
          speGroup(id),
        );
        out[id] = {
          provisioningState: g.provisioningState,
          state: g.state,
          startedAt: g.startedAt,
        };
      } catch (err) {
        console.warn(
          `[spe-power] ARM power state of ${id} unknown: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        out[id] = null;
      }
    }),
  );
  return out;
}

export type PowerOutcome =
  | { ok: true; id: SpeId; group: string; state: "starting" | "stopped" }
  | { ok: false; id: SpeId; group: string; status: number; message: string };

/**
 * How long a caller waits for ARM's answer to a start or stop. ARM refuses at
 * once (403 without the role, 404 without the group) and answers a stop
 * within a second, but accepts a start only after 15 to 40 s (lib/azure-arm.ts,
 * ARM_POWER_TIMEOUT_MS). A start it has not refused by then counts as asked:
 * nobody waits half a minute to be told a workspace is starting.
 */
const POWER_ANSWER_WAIT_MS = 3_000;

const NO_ANSWER = Symbol("no answer");

/** `p`'s value, or NO_ANSWER when it has not settled within `ms`. */
function answeredWithin<T>(
  p: Promise<T>,
  ms: number,
): Promise<T | typeof NO_ANSWER> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof NO_ANSWER>((resolve) => {
    timer = setTimeout(() => resolve(NO_ANSWER), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** Starts or stops one group; never throws, the outcome says what happened. */
export async function powerGroup(
  action: "start" | "stop",
  id: SpeId,
): Promise<PowerOutcome> {
  const group = speGroup(id);
  const target = armTarget();
  if (!target) {
    return {
      ok: false,
      id,
      group,
      status: 501,
      message: "not on the Azure deployment",
    };
  }
  const call = (
    action === "start"
      ? startContainerGroup(target.sub, target.rg, group)
      : stopContainerGroup(target.sub, target.rg, group)
  ).then(
    () => {
      console.warn(`[spe-power] ${action} ${group} (${id}) from the hub`);
      return null;
    },
    (err: unknown) => ({ err }),
  );
  const answer = await answeredWithin(call, POWER_ANSWER_WAIT_MS);
  if (answer === NO_ANSWER) {
    // ARM has the request and has not refused it; it goes on without us.
    void call.then((late) => {
      if (late) {
        console.warn(
          `[spe-power] ARM answered the ${action} of ${group} (${id}) late with an error: ${errorText(
            late.err,
          )}`,
        );
      }
    });
  }
  if (answer === NO_ANSWER || answer === null) {
    return {
      ok: true,
      id,
      group,
      state: action === "start" ? "starting" : "stopped",
    };
  }
  return {
    ok: false,
    id,
    group,
    status: answer.err instanceof ArmError ? answer.err.status : 502,
    message: errorText(answer.err),
  };
}

/** The answer to an ARM 403: the hub's identity lacks the role, and the fix. */
export function identityLacksRoleBody(group: string): {
  error: string;
  role: string;
  command: string;
} {
  return {
    error:
      `The hub's identity (the system-assigned identity of ${UI_APP}) may not start or stop ` +
      `the container group ${group}: it lacks the built-in role "${ACI_ROLE}" on the SPE groups. ` +
      `An owner of ${
        azureResourceGroup() ?? "rg-mvhd-dev"
      } runs the command in "command" once (ADR-072).`,
    role: ACI_ROLE,
    command: grantCommand(),
  };
}

/** A workspace ARM reports stopped or starting; null when it runs or ARM cannot tell. */
function notUpEntry(
  id: SpeId,
  power: SpeArmPower | null,
  now: number,
): SpeColdStartEntry | null {
  if (!power) return null;
  const state = spePowerState(power, undefined, now);
  if (state === "running" || state === "unreachable") return null;
  return { id, state, etaSeconds: speEtaSeconds(state, power, now) };
}

/**
 * The workspaces among `ids` that ARM reports stopped or starting, without
 * starting any. Empty off Azure and when ARM cannot tell: then the proxy
 * answers for them, leaving out one that does not answer, as before.
 */
export async function speNotUp(
  ids: readonly SpeId[] = SPE_IDS,
  now: number = Date.now(),
): Promise<SpeColdStartEntry[]> {
  if (!spePowerAvailable()) return [];
  const arm = await readArmPower(ids);
  return ids
    .map((id) => notUpEntry(id, arm[id], now))
    .filter((e): e is SpeColdStartEntry => e !== null);
}

function coldStartError(first: SpeColdStartEntry): string {
  return first.state === "starting"
    ? `${first.id} is starting (cold start, about 3 to 4 minutes): attesting, releasing the key, loading the data. Try again in a few minutes.`
    : `${first.id} is stopped. An operator or the access body starts it on /admin/attestation.`;
}

/** The 503 with Retry-After a request gets while workspaces it needs are not up. */
export function speColdStartResponse(
  notUp: SpeColdStartEntry[],
  started: boolean,
  error: string = coldStartError(notUp[0]),
): NextResponse<SpeColdStartBody> {
  const first = notUp[0];
  return NextResponse.json(
    { error, spe: first, spes: notUp, started },
    {
      status: 503,
      headers: { "Retry-After": String(first.etaSeconds) },
    },
  );
}

/**
 * The cold-start gate in front of a federated query (ADR-072), or of an
 * import into one workspace (`ids`, #915). On Azure, asks ARM whether the
 * workspaces run. When one does not, starts it if the caller's roles allow,
 * and answers 503 with which workspace and how long; otherwise null, and the
 * query goes on. ARM unknown means go on: the proxy leaves a workspace that
 * does not answer out, as before. The starts run side by side, each waiting
 * at most POWER_ANSWER_WAIT_MS for ARM.
 */
export async function speColdStartGate(
  roles: string[],
  now: number = Date.now(),
  ids: readonly SpeId[] = SPE_IDS,
): Promise<NextResponse<SpeColdStartBody> | null> {
  const notUp = await speNotUp(ids, now);
  if (notUp.length === 0) return null;
  const mayStart = roles.some((r) =>
    (SPE_QUERY_START_ROLES as string[]).includes(r),
  );
  let started = false;
  const entries = await Promise.all(
    notUp.map(async (entry): Promise<SpeColdStartEntry> => {
      if (entry.state !== "stopped" || !mayStart) return entry;
      const outcome = await powerGroup("start", entry.id as SpeId);
      if (outcome.ok) {
        started = true;
        return { ...entry, state: "starting" };
      }
      console.warn(
        `[spe-power] a query could not start ${entry.id}: ${outcome.status} ${outcome.message}`,
      );
      return entry;
    }),
  );
  return speColdStartResponse(entries, started);
}
