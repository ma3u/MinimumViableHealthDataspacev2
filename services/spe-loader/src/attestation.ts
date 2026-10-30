import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// What an attestation token says, in the words of the contract (#774)
// ---------------------------------------------------------------------------
//
// Trustee's built-in Attestation Service answers with an EAR token (a JWT):
//   submods.cpu0["ear.status"]                         affirming | warning | contraindicated | none
//   submods.cpu0["ear.trustworthiness-vector"]         the AR4SI claims
//   submods.cpu0["ear.appraisal-policy-id"]            the attestation policy applied
//   submods.cpu0["ear.veraison.annotated-evidence"]    { <tee>: claims, report_data, runtime_data_claims }
// The <tee> key says what produced the evidence. This module turns it into
// the fields the SPE status carries (ADR-068 decision 5): which TEE, at which
// scope, whether it was simulated, the label the UI shows, and the
// `attestation` object of the administration. The token itself is never
// stored, and nothing is taken from runtime_data_claims: it carries the TEE's
// public key.

export type TeeType = "AMD SEV-SNP" | "Intel TDX" | "none";
export type AttestationScope = "node" | "workload" | "none";

export interface EvidenceDescription {
  tee: string;
  teeType: TeeType;
  attestationScope: AttestationScope;
  simulated: boolean;
  label: string;
}

/** The labels of ADR-068 decision 5, exactly as the administration shows them. */
export const LABELS = {
  simulated: "Simulated attestation",
  node: "Attested: SEV-SNP node",
  workload: "Attested: confidential workload",
} as const;

/**
 * Azure's vTPM evidence comes from the paravisor of a confidential VM: it
 * proves the node, not the container (A1). Bare SEV-SNP or TDX evidence comes
 * from a CoCo guest whose agent policy is measured: the workload (A2). The
 * sample attester, which any process can run, proves nothing. Azure TDX
 * nodes are not mapped: AKS has none (ADR-068), and resource-azure.rego
 * releases keys to `az-snp-vtpm` evidence only.
 */
export function describeEvidence(tee: string): EvidenceDescription {
  switch (tee) {
    case "az-snp-vtpm":
      return {
        tee,
        teeType: "AMD SEV-SNP",
        attestationScope: "node",
        simulated: false,
        label: LABELS.node,
      };
    case "snp":
      return {
        tee,
        teeType: "AMD SEV-SNP",
        attestationScope: "workload",
        simulated: false,
        label: LABELS.workload,
      };
    case "tdx":
      return {
        tee,
        teeType: "Intel TDX",
        attestationScope: "workload",
        simulated: false,
        label: LABELS.workload,
      };
    default:
      return {
        tee,
        teeType: "none",
        attestationScope: "none",
        simulated: true,
        label: LABELS.simulated,
      };
  }
}

/**
 * The `attestation` object of an SPE in /spe/status. Read from the EAR token
 * Trustee issued, never from the raw report, and holding no key. Anything the
 * token does not say is null.
 */
export interface AttestationRecord {
  verifier: string | null;
  result: "pass" | "fail";
  /** SHA-256 over the canonical JSON of the TEE's claims in the token. */
  evidenceDigest: string | null;
  tokenIssuedAt: string | null;
  tokenExpiresAt: string | null;
  policyId: string | null;
  claims: {
    tee: string | null;
    measurement: string | null;
    reportedTcb: string | null;
    hostData: string | null;
    reportData: string | null;
    pcrs: Record<string, string> | null;
    vmId: string | null;
  };
  refusalReason: string | null;
}

export interface AttestationSummary extends EvidenceDescription {
  /** The worst ear.status over every submodule; "affirming" only if all are. */
  earStatus: string;
  trustVector: Record<string, number>;
  verifier: string;
  issuer: string;
  issuedAt: string | null;
  /**
   * The claims a reference value is pinned to (Azure: measurement, PCR 11,
   * reported TCB). Public values; they describe the platform, not the data.
   */
  evidence: Record<string, string | number | boolean>;
  record: AttestationRecord;
}

const STATUS_RANK: Record<string, number> = {
  affirming: 0,
  none: 1,
  warning: 2,
  contraindicated: 3,
};

function decodePayload(jwt: string): Record<string, unknown> {
  const parts = jwt.trim().split(".");
  if (parts.length !== 3) throw new Error("the attestation token is not a JWT");
  return JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

const PINNED = [
  "measurement",
  "reported_tcb_bootloader",
  "reported_tcb_microcode",
  "reported_tcb_snp",
  "reported_tcb_tee",
  "platform_smt_enabled",
  "platform_tsme_enabled",
  "policy_abi_major",
  "policy_abi_minor",
  "policy_single_socket",
  "policy_smt_allowed",
  "policy_debug_allowed",
  "policy_migrate_ma",
  "launch_digest",
  "svn",
];

function pinnedClaims(
  claims: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const name of PINNED) {
    const v = claims[name];
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    )
      out[name] = v;
  }
  const tpm = claims.tpm as Record<string, unknown> | undefined;
  if (tpm && typeof tpm.pcr11 === "string") out["tpm.pcr11"] = tpm.pcr11;
  return out;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}

const isoOf = (seconds: unknown): string | null =>
  typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;

/** Hex as it is; base64 (the sample attester's report_data) turned into hex. */
function hexOf(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  if (/^[0-9a-fA-F]+$/.test(v)) return v.toLowerCase();
  const bytes = Buffer.from(v, "base64");
  return bytes.length > 0 ? bytes.toString("hex") : null;
}

function attestationRecord(
  tee: string | null,
  status: string,
  claims: Record<string, unknown>,
  annotated: Record<string, unknown>,
  sub: Record<string, unknown>,
  payload: Record<string, unknown>,
): AttestationRecord {
  const tpm = claims.tpm as Record<string, unknown> | undefined;
  const pcrEntries =
    tpm && typeof tpm === "object"
      ? (Object.entries(tpm).filter(
          ([k, v]) => /^pcr\d+$/.test(k) && typeof v === "string",
        ) as Array<[string, string]>)
      : [];
  const tcb = ["bootloader", "tee", "snp", "microcode"]
    .filter((k) => claims[`reported_tcb_${k}`] !== undefined)
    .map((k) => `${k}=${String(claims[`reported_tcb_${k}`])}`);
  const vmConfig = claims["vm-configuration"] as
    | Record<string, unknown>
    | undefined;
  const vmId = claims.vm_id ?? claims.vmid ?? vmConfig?.vmUniqueId;
  return {
    verifier: tee,
    result: status === "affirming" ? "pass" : "fail",
    evidenceDigest: tee
      ? `sha256:${createHash("sha256")
          .update(canonical(claims), "utf8")
          .digest("hex")}`
      : null,
    tokenIssuedAt: isoOf(payload.iat),
    tokenExpiresAt: isoOf(payload.exp),
    policyId:
      typeof sub["ear.appraisal-policy-id"] === "string"
        ? (sub["ear.appraisal-policy-id"] as string)
        : null,
    claims: {
      tee,
      measurement: hexOf(claims.measurement),
      reportedTcb: tcb.length > 0 ? tcb.join(" ") : null,
      hostData: hexOf(claims.init_data ?? claims.host_data),
      reportData: hexOf(claims.report_data ?? annotated.report_data),
      pcrs: pcrEntries.length > 0 ? Object.fromEntries(pcrEntries) : null,
      vmId: typeof vmId === "string" ? vmId : null,
    },
    refusalReason: null,
  };
}

/** Reads an EAR token without verifying it: Trustee verified the evidence, and KBS checks the token itself. */
export function summariseToken(jwt: string): AttestationSummary {
  const payload = decodePayload(jwt);
  const submods = (payload.submods ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const entries = Object.values(submods);
  if (entries.length === 0)
    throw new Error("the attestation token has no submodules");
  let earStatus = "affirming";
  let tee: string | null = null;
  let trustVector: Record<string, number> = {};
  let claims: Record<string, unknown> = {};
  let annotatedOfTee: Record<string, unknown> = {};
  let subOfTee: Record<string, unknown> = entries[0];
  for (const sub of entries) {
    const status = String(sub["ear.status"] ?? "none");
    if ((STATUS_RANK[status] ?? 3) > (STATUS_RANK[earStatus] ?? 3))
      earStatus = status;
    const annotated = (sub["ear.veraison.annotated-evidence"] ?? {}) as Record<
      string,
      unknown
    >;
    const teeKey = Object.keys(annotated).find(
      (k) =>
        k !== "report_data" &&
        k !== "runtime_data_claims" &&
        k !== "init_data_claims" &&
        typeof annotated[k] === "object" &&
        annotated[k] !== null,
    );
    if (teeKey && tee === null) {
      tee = teeKey;
      claims = annotated[teeKey] as Record<string, unknown>;
      annotatedOfTee = annotated;
      subOfTee = sub;
      trustVector = (sub["ear.trustworthiness-vector"] ?? {}) as Record<
        string,
        number
      >;
    }
  }
  const verifierId = (payload["ear.verifier-id"] ?? {}) as Record<
    string,
    unknown
  >;
  return {
    ...describeEvidence(tee ?? "unknown"),
    earStatus,
    trustVector,
    verifier: String(verifierId.build ?? verifierId.developer ?? "unknown"),
    issuer: String(payload.iss ?? "unknown"),
    issuedAt: isoOf(payload.iat),
    evidence: pinnedClaims(claims),
    record: attestationRecord(
      tee,
      earStatus,
      claims,
      annotatedOfTee,
      subOfTee,
      payload,
    ),
  };
}
