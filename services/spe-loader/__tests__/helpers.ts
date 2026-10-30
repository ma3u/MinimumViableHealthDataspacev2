import { EXTRACT_FORMAT, toJsonl, type Extract } from "../src/extract.js";

/** An unsigned EAR token shaped like Trustee v0.22.0's (the loader never verifies it). */
export function earToken(
  tee: string,
  status = "affirming",
  claims: Record<string, unknown> = {},
): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const payload = {
    iss: "mvhd-trustee (MedReg DE, access body)",
    iat: 1793404800,
    exp: 1793405100,
    // runtime_data_claims carries the TEE's public key: never copied out.
    // (Trustee puts it under the annotated evidence; see below.)
    eat_profile: "tag:github.com,2024:confidential-containers/Trustee",
    "ear.verifier-id": {
      developer: "https://confidentialcontainers.org",
      build: "attestation-service 0.1.0",
    },
    submods: {
      cpu0: {
        "ear.status": status,
        "ear.trustworthiness-vector": {
          configuration: 2,
          executables: status === "affirming" ? 3 : 33,
          hardware: 2,
        },
        "ear.veraison.annotated-evidence": {
          report_data: "x",
          runtime_data_claims: {
            "tee-pubkey": { kty: "RSA", n: "secret-looking" },
          },
          [tee]: { svn: "1", launch_digest: "abcde", ...claims },
        },
      },
    },
  };
  return `${b64({ alg: "ES256", typ: "JWT" })}.${b64(payload)}.c2ln`;
}

/** A small extract: two patients, one condition, one concept. */
export function sampleExtract(
  speId: "SPE-1" | "SPE-2" = "SPE-2",
  permitId = "permit-test",
): Extract {
  const nodes: Extract["nodes"] = [
    {
      k: "node",
      primary: "Patient",
      key: "p1",
      labels: ["Patient"],
      props: {
        id: "p1",
        gender: "female",
        birthYear: { $t: "Int", v: "1970" },
      },
    },
    {
      k: "node",
      primary: "Patient",
      key: "p2",
      labels: ["OptedOut", "Patient"],
      props: { id: "p2", gender: "male" },
    },
    {
      k: "node",
      primary: "Condition",
      key: "c1",
      labels: ["Condition"],
      props: { id: "c1", onset: { $t: "Date", v: [2020, 3, 1] } },
    },
    {
      k: "node",
      primary: "SnomedConcept",
      key: "44054006",
      labels: ["SnomedConcept"],
      props: { code: "44054006", display: "Diabetes" },
    },
  ];
  const rels: Extract["rels"] = [
    {
      k: "rel",
      type: "HAS_CONDITION",
      s: { primary: "Patient", key: "p1" },
      e: { primary: "Condition", key: "c1" },
      props: {},
    },
    {
      k: "rel",
      type: "CODED_BY",
      s: { primary: "Condition", key: "c1" },
      e: { primary: "SnomedConcept", key: "44054006" },
      props: {},
    },
  ];
  return {
    header: {
      k: "header",
      format: EXTRACT_FORMAT,
      speId,
      holder:
        speId === "SPE-1" ? "AlphaKlinik Berlin" : "Limburg Medical Centre",
      permitId,
      policyHash: `sha256:${"a".repeat(64)}`,
      createdAt: "2026-10-31T08:00:00.000Z",
      eligible: 4,
      patients: 2,
      nodes: nodes.length,
      relationships: rels.length,
    },
    nodes,
    rels,
  };
}

export const sampleJsonl = (
  speId: "SPE-1" | "SPE-2" = "SPE-2",
  permitId = "permit-test",
) => Buffer.from(toJsonl(sampleExtract(speId, permitId)), "utf8");
