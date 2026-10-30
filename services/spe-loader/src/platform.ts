import { createHash } from "node:crypto";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// What the TEE platform offers the loader (ACI confidential containers)
// ---------------------------------------------------------------------------
//
// kbs-client's snp attester asks /dev/sev-guest for a report. ACI's utility
// VM exposes the SEV-SNP guest device to the containers of a confidential
// group; older UVM kernels name it /dev/sev. SPE_SNP_DEVICE names the device
// this platform has; when it is not /dev/sev-guest and that path is free, the
// loader links it there before it attests. Whether the attester's ioctls work
// through the older device is not established (see ADR-069); when no device
// answers, kbs-client falls back to the sample attester, and Trustee's Azure
// policy refuses sample evidence: no key, no data.
//
// ACI also puts three files in UVM_SECURITY_CONTEXT_DIR: the ccePolicy
// (security-policy-base64), the AMD certificate chain for this host
// (host-amd-cert-base64) and Microsoft's endorsement of the UVM's launch
// measurement (reference-info-base64). The loader records their digests with
// the attestation, and checks that the policy file's hash is what the report
// carries as HOST_DATA. Their content stays in the container.

export interface PlatformFacts {
  [key: string]: string | boolean | null;
  snpDevice: string | null;
  securityPolicySha256: string | null;
  hostAmdCertSha256: string | null;
  referenceInfoSha256: string | null;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function decodedDigest(file: string): string | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").trim();
  return text ? sha256(Buffer.from(text, "base64")) : null;
}

export function inspectPlatform(
  env: NodeJS.ProcessEnv = process.env,
  log: (m: string) => void = () => undefined,
): PlatformFacts {
  const wanted = env.SPE_SNP_DEVICE || "/dev/sev-guest";
  let snpDevice: string | null = null;
  if (existsSync("/dev/sev-guest")) snpDevice = "/dev/sev-guest";
  else if (existsSync(wanted)) {
    snpDevice = wanted;
    if (wanted !== "/dev/sev-guest") {
      try {
        symlinkSync(wanted, "/dev/sev-guest");
        log(`linked ${wanted} to /dev/sev-guest for the snp attester`);
      } catch (err) {
        log(
          `could not link ${wanted} to /dev/sev-guest: ${
            (err as Error).message
          }`,
        );
      }
    }
  }
  const dir = env.UVM_SECURITY_CONTEXT_DIR;
  const facts: PlatformFacts = {
    snpDevice,
    securityPolicySha256: dir
      ? decodedDigest(join(dir, "security-policy-base64"))
      : null,
    hostAmdCertSha256: dir
      ? decodedDigest(join(dir, "host-amd-cert-base64"))
      : null,
    referenceInfoSha256: dir
      ? decodedDigest(join(dir, "reference-info-base64"))
      : null,
  };
  log(
    `platform: SNP device ${
      snpDevice ?? "none (sample attester)"
    }, UVM security context ${dir ? "present" : "absent"}`,
  );
  return facts;
}

/**
 * True when the report's HOST_DATA is the hash of the policy file the UVM
 * enforces; null when there is nothing to compare.
 */
export function hostDataMatchesPolicy(
  facts: PlatformFacts,
  hostData: string | null,
): boolean | null {
  if (!facts.securityPolicySha256 || !hostData) return null;
  return facts.securityPolicySha256 === hostData.toLowerCase();
}
