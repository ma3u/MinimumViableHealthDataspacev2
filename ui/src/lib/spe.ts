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

/** "1 added, 0 removed, 6 opted out in the hub" for spe.optout_synced. */
export function optOutCountsText(c: SpeOptOutCounts): string {
  const n = (v: number | null) => (v === null ? "?" : String(v));
  return `${n(c.added)} added, ${n(c.removed)} removed, ${n(
    c.inHub,
  )} opted out in the hub`;
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
