/**
 * The secure processing environments (SPEs) of ADR-068, as the administration
 * shows them (#774, WP3).
 *
 * The shape is the contract of #774 between the query proxy's
 * `GET /spe/status` and the UI's `GET /api/admin/spe`. This module holds the
 * types and the presentation rules every admin page shares, so the dashboard,
 * the components page, the audit trail and the policies page say the same
 * thing about the same SPE. It has no server imports, so client components
 * use it too.
 */

export const ADR_068_URL =
  "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md";

export type SpeEnvironment = "azure" | "local" | "static";
export type AttestationScope = "node" | "workload" | "none";
export type SpeStatusValue = "ready" | "loading" | "refused" | "unreachable";
/**
 * Whether a workspace is up (ADR-072): from the ACI group's power state on
 * Azure, combined with what the proxy reads from the workspace; from the
 * proxy alone elsewhere.
 */
export type SpePowerState = "running" | "starting" | "stopped" | "unreachable";

/** The three labels of ADR-068 decision 5, one per depth. */
export const SPE_LABEL_SIMULATED = "Simulated attestation";
const SPE_LABEL_NODE = "Attested: SEV-SNP node";
const SPE_LABEL_WORKLOAD = "Attested: confidential workload";

export interface SpeTrustee {
  url: string | null;
  operator: string;
  /** "snp" on Azure (ADR-069), "sample" locally. */
  verifier: string;
  reachable: boolean;
}

export interface SpeEntry {
  id: string;
  holder: string;
  runsOn: string;
  /** "AMD SEV-SNP" or "none". */
  teeType: string;
  attestationScope: AttestationScope;
  simulated: boolean;
  label: string;
  /** ISO-8601; null when nothing was attested (the fallback, or before the first load). */
  attestedAt: string | null;
  keyReleasedAt: string | null;
  permitId: string | null;
  policyHash: string | null;
  policyCheckedByHardware: boolean;
  patients: number | null;
  status: SpeStatusValue;
  /**
   * The evidence the Trustee verified for this workspace (#774 contract
   * extension). null in the fallback and before the first attestation; an
   * older proxy may leave it out.
   */
  attestation?: SpeAttestation | null;
  /** running, starting, stopped or unreachable (ADR-072); set by the UI route. */
  powerState?: SpePowerState;
  /** The ACI group's instanceView.state on Azure ("Running", "Stopped"...), else null. */
  armState?: string | null;
  /** The last federated query that asked this workspace, as the proxy saw it. */
  lastQueriedAt?: string | null;
}

/** What the attestation measured, as the verifier reports it; any may be null. */
export interface SpeAttestationClaims {
  tee: string | null;
  measurement: string | null;
  reportedTcb: string | null;
  hostData: string | null;
  reportData: string | null;
  pcrs: Record<string, string> | null;
  vmId: string | null;
}

export interface SpeAttestation {
  /** "snp" on Azure (ADR-069), "sample" locally. */
  verifier: string | null;
  result: "pass" | "fail" | null;
  evidenceDigest: string | null;
  tokenIssuedAt: string | null;
  tokenExpiresAt: string | null;
  policyId: string | null;
  claims: SpeAttestationClaims | null;
  refusalReason: string | null;
}

export interface SpeStatusResponse {
  environment: SpeEnvironment;
  /** null when the proxy said nothing about a Trustee (the fallback). */
  trustee: SpeTrustee | null;
  spes: SpeEntry[];
  residualTrust: string[];
  /**
   * Set by the UI only when the proxy's `/spe/status` did not answer and the
   * route fell back to what it knows without it. Not part of the proxy's
   * contract.
   */
  fallback?: { reason: string };
  /**
   * Whether this caller may start and stop the workspaces from the hub
   * (ADR-072): an operator or the access body, on Azure. Set by the UI.
   */
  power?: { available: boolean; reason: string | null };
}

// ---- starting and stopping the workspaces (ADR-072) -------------------------

/** Why a caller may not start or stop a workspace; translated where shown. */
export const SPE_POWER_REASONS = {
  notAzure: "Starting and stopping needs the Azure deployment",
  notAllowed: "Only the operator and the access body start and stop workspaces",
} as const;

export const SPE_POWER_STATES: readonly SpePowerState[] = [
  "running",
  "starting",
  "stopped",
  "unreachable",
];

/** From the start command to both workspaces answering, measured 2026-11-02. */
export const SPE_COLD_START_SECONDS = 240;
/** From the neo4j container's start to the data being loaded. */
const SPE_LOAD_AFTER_START_SECONDS = 180;
/** A running group whose workspace still does not answer after this is unreachable. */
const SPE_START_GRACE_SECONDS = 600;

/** ARM's container group power, as getContainerGroupState() reads it. */
export interface SpeArmPower {
  provisioningState: string | null;
  state: string | null;
  startedAt: string | null;
}

const ARM_STARTING = new Set([
  "Pending",
  "Creating",
  "Starting",
  "Repairing",
  "Updating",
  "Waiting",
]);
const ARM_STOPPED = new Set(["Stopped", "Succeeded", "Failed", "Terminated"]);

/** What the proxy's workspace read alone says about power. */
function powerFromProxyStatus(
  status: SpeStatusValue | string | undefined,
): SpePowerState {
  if (status === "ready" || status === "refused") return "running";
  if (status === "loading") return "starting";
  return "unreachable";
}

/**
 * One workspace's power state. ARM decides whether the group runs at all;
 * the proxy decides whether a running group has loaded. A running group
 * whose workspace has not answered is starting for its first ten minutes and
 * unreachable after that. Without ARM (locally, or no Reader role) the
 * proxy's read alone decides. `proxyStatus` undefined means the proxy was not
 * asked (the query gate): then a group counts as starting for the three
 * minutes its load takes after its containers start.
 */
export function spePowerState(
  arm: SpeArmPower | null,
  proxyStatus: SpeStatusValue | string | undefined,
  now: number = Date.now(),
): SpePowerState {
  if (!arm) return powerFromProxyStatus(proxyStatus);
  const state = arm.state ?? "";
  const prov = arm.provisioningState ?? "";
  if (ARM_STARTING.has(state) || ARM_STARTING.has(prov)) return "starting";
  if (state === "Running") {
    if (proxyStatus === "ready" || proxyStatus === "refused") return "running";
    const since = arm.startedAt
      ? (now - Date.parse(arm.startedAt)) / 1000
      : null;
    if (proxyStatus === undefined) {
      return since !== null && since < SPE_LOAD_AFTER_START_SECONDS
        ? "starting"
        : "running";
    }
    return since === null || since < SPE_START_GRACE_SECONDS
      ? "starting"
      : "unreachable";
  }
  if (ARM_STOPPED.has(state)) return "stopped";
  return powerFromProxyStatus(proxyStatus);
}

/** Seconds until a workspace in this state should answer: 240 from stopped. */
export function speEtaSeconds(
  power: SpePowerState,
  arm: SpeArmPower | null,
  now: number = Date.now(),
): number {
  if (power !== "starting" || !arm?.startedAt) return SPE_COLD_START_SECONDS;
  const since = (now - Date.parse(arm.startedAt)) / 1000;
  return Math.max(30, Math.round(SPE_LOAD_AFTER_START_SECONDS - since));
}

/** One workspace in the 503 a query gets while it is not up (ADR-072). */
export interface SpeColdStartEntry {
  id: string;
  state: "starting" | "stopped";
  etaSeconds: number;
}

/** The 503 body of a query that needs a workspace that is not up. */
export interface SpeColdStartBody {
  error: string;
  /** The first workspace that is not up. */
  spe: SpeColdStartEntry;
  /** Every workspace that is not up. */
  spes: SpeColdStartEntry[];
  /** True when this request started at least one of them. */
  started: boolean;
}

export function isSpeColdStart(v: unknown): v is SpeColdStartBody {
  if (!v || typeof v !== "object") return false;
  const spe = (v as { spe?: unknown }).spe;
  if (!spe || typeof spe !== "object") return false;
  const s = spe as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    (s.state === "starting" || s.state === "stopped") &&
    typeof s.etaSeconds === "number"
  );
}

/** The six audit event types of #774 on the ADR-045 chain `spe`. */
export const SPE_EVENT_TYPES = [
  "spe.attestation",
  "spe.key_release",
  "spe.key_refused",
  "spe.workspace_loaded",
  "spe.workspace_destroyed",
  "spe.optout_synced",
] as const;

export type SpeEventType = (typeof SPE_EVENT_TYPES)[number];

export const SPE_EVENT_LABELS: Record<SpeEventType, string> = {
  "spe.attestation": "Attestation",
  "spe.key_release": "Key released",
  "spe.key_refused": "Key refused",
  "spe.workspace_loaded": "Workspace loaded",
  "spe.workspace_destroyed": "Workspace destroyed",
  "spe.optout_synced": "Opt-outs synced (Art. 71)",
};

export interface SpeAuditEvent {
  id: string;
  eventType: string;
  recorded: string | null;
  speId: string | null;
  permitId: string | null;
  policyHash: string | null;
  teeType: string | null;
  attestationScope: string | null;
  simulated: boolean | null;
  outcome: string | null;
  /**
   * spe.optout_synced only: the hub's Art. 71 opt-out labels pushed into the
   * workspace (ADR-062, ADR-069). Counts, never patient ids.
   */
  optOut?: SpeOptOutCounts | null;
}

export interface SpeOptOutCounts {
  added: number | null;
  removed: number | null;
  inHub: number | null;
}

function isSpeEventType(t: string): t is SpeEventType {
  return (SPE_EVENT_TYPES as readonly string[]).includes(t);
}

export function speEventLabel(t: string): string {
  return isSpeEventType(t) ? SPE_EVENT_LABELS[t] : t;
}

export type SpeLabelTone = "simulated" | "node" | "workload";

/**
 * Which badge an SPE gets. The label the proxy sends decides; when it is
 * missing or unknown, the fields decide, and anything unclear is treated as
 * simulated: the UI never shows more assurance than the proxy claimed.
 */
export function speLabelTone(spe: {
  label?: string | null;
  simulated?: boolean | null;
  attestationScope?: string | null;
}): SpeLabelTone {
  if (spe.label === SPE_LABEL_WORKLOAD) return "workload";
  if (spe.label === SPE_LABEL_NODE) return "node";
  if (spe.label === SPE_LABEL_SIMULATED) return "simulated";
  if (spe.simulated !== false) return "simulated";
  if (spe.attestationScope === "workload") return "workload";
  if (spe.attestationScope === "node") return "node";
  return "simulated";
}

export function speLabelText(spe: {
  label?: string | null;
  simulated?: boolean | null;
  attestationScope?: string | null;
}): string {
  const tone = speLabelTone(spe);
  if (tone === "workload") return SPE_LABEL_WORKLOAD;
  if (tone === "node") return SPE_LABEL_NODE;
  return SPE_LABEL_SIMULATED;
}

/** "SPE-2" opens `default/spe-2/extract-key` in the access body's Trustee. */
export function trusteeResource(speId: string): string {
  const n = /(\d+)\s*$/.exec(speId)?.[1] ?? speId.toLowerCase();
  return `default/spe-${n}/extract-key`;
}

/** "sha256:9f2c4a1b7e3d…" for display; the full hash goes in the title. */
export function shortPolicyHash(hash: string, hexChars = 12): string {
  const [algo, hex] = hash.includes(":") ? hash.split(":", 2) : ["", hash];
  if (hex.length <= hexChars) return hash;
  return `${algo ? `${algo}:` : ""}${hex.slice(0, hexChars)}…`;
}

/**
 * Whether hardware checks the permit's policy hash: only at A2, where the
 * workload's own evidence carries it. At M1 and A1 the hash is recorded on
 * the permit and in Trustee's reference values, but nothing measured proves
 * the running pod matches it (ADR-068 decisions 2 and 5).
 */
export function policyCheckDepth(spe: {
  policyCheckedByHardware?: boolean | null;
  attestationScope?: string | null;
  simulated?: boolean | null;
}): { checked: boolean; depth: string; text: string } {
  const checked =
    spe.policyCheckedByHardware === true &&
    spe.attestationScope === "workload" &&
    spe.simulated === false;
  if (checked) {
    return {
      checked,
      depth: "A2",
      text: "Checked by hardware (A2, workload evidence)",
    };
  }
  const depth = spe.simulated === false ? "A1" : "M1";
  return { checked, depth, text: `Recorded only (${depth})` };
}

export function formatSpeTime(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type AttestationVerdict = "pass" | "fail" | "refused" | "none";

/**
 * The verdict of an SPE's last attestation. "refused" is evidence that
 * verified but whose key the Trustee did not release (the permit's policy did
 * not match), or a workspace the proxy reports refused; "fail" is evidence
 * that did not verify; "none" is no attestation recorded.
 */
export function attestationVerdict(spe: {
  status?: string | null;
  keyReleasedAt?: string | null;
  attestation?: SpeAttestation | null;
}): { verdict: AttestationVerdict; text: string } {
  const a = spe.attestation;
  if (!a || !a.result) {
    return { verdict: "none", text: "No attestation recorded" };
  }
  if (a.result === "fail") {
    return { verdict: "fail", text: "Evidence did not verify" };
  }
  if (a.refusalReason || spe.status === "refused") {
    return { verdict: "refused", text: "Verified, key refused" };
  }
  return {
    verdict: "pass",
    text: spe.keyReleasedAt ? "Verified, key released" : "Verified",
  };
}

/** The anchor of an SPE's section on /admin/attestation. */
export function attestationAnchor(speId: string): string {
  return `attestation-${speId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
