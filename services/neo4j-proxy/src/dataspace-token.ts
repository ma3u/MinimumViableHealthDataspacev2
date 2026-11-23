import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

// ---------------------------------------------------------------------------
// Access to a dataset after a dataspace transfer (EDC 1.0, #881).
//
// EDC 1.0 ships no data plane. siglet answers the control plane's Data Plane
// Signaling and issues the consumer a short-lived JWT for a pull transfer; the
// transfer's endpoint is this proxy. The token names the dataset (datasetId),
// the consumer (sub) and the provider (aud). It is checked here against
// siglet's public JWKS, never trusted on its claims alone.
// ---------------------------------------------------------------------------

export const SIGLET_JWKS_URL =
  process.env.SIGLET_JWKS_URL ?? "http://siglet:8080/keys";
export const SIGLET_ISSUER = process.env.SIGLET_ISSUER ?? "siglet-issuer";

/**
 * Where each seeded asset's data lives on this proxy (jad/seed-data-assets.sh).
 * `query` fixes parameters of the route for this dataset: the hand-on adds
 * them when the caller's query does not set them, and refuses (400) a
 * caller that sets one to another value, so a token for a shorter dataset
 * cannot read a longer one.
 */
export const DATASET_ROUTES: Record<
  string,
  {
    method: "GET" | "POST";
    path: string;
    query?: Readonly<Record<string, string>>;
  }
> = {
  "fhir-patient-search": { method: "GET", path: "/fhir/Patient" },
  "fhir-patient-everything": { method: "GET", path: "/fhir/Patient" },
  // A searchset of Observations with their Patients included (#898).
  "fhir-observation-bundle": { method: "GET", path: "/fhir/Observation" },
  "fhir-cohort-bundle": { method: "POST", path: "/fhir/Bundle" },
  "omop-cohort-statistics": { method: "POST", path: "/omop/cohort" },
  "healthdcatap-catalog": { method: "GET", path: "/catalog/datasets" },
  "federated-healthdcatap-catalog": {
    method: "GET",
    path: "/catalog/datasets",
  },
  // A bonus program's yes or no, for the insurer that published it (#934
  // step 8, ADR-091; scripts/seed-second-data-space.sh).
  "bonus-programme-answer": { method: "GET", path: "/programmes/answers" },
  // A synthetic 24 hour Holter ECG, read window by window and streamed into
  // an SPE (ADR-095, ecg-holter.ts); `next` pages through it.
  // Ten minutes a page, the route's largest window: a page is a heavy
  // request, of which a participant has 20 a minute, and the day in one
  // minute pages is 1,440 of them (docs/gotchas.md, 2026-11-20).
  "ecg-holter-stream": {
    method: "GET",
    path: "/synthetic/ecg-holter",
    query: { seconds: "600" },
  },
  // The same recording cut at one hour, for the routine check.
  "ecg-holter-hour": {
    method: "GET",
    path: "/synthetic/ecg-holter",
    query: { durationSeconds: "3600", seconds: "600" },
  },
};

export interface DataspaceGrant {
  datasetId: string;
  consumer: string;
  provider: string;
  agreementId?: string;
}

let remoteJwks: JWTVerifyGetKey | undefined;
function sigletJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(new URL(SIGLET_JWKS_URL));
  return remoteJwks;
}

/**
 * Verifies a siglet access token and returns what it grants. Throws when the
 * signature, issuer or expiry is wrong, or when the token names no dataset.
 * `keys` is for tests; in service it is siglet's JWKS.
 */
export async function verifyDataspaceToken(
  token: string,
  keys: JWTVerifyGetKey = sigletJwks(),
): Promise<DataspaceGrant> {
  const { payload } = await jwtVerify(token, keys, { issuer: SIGLET_ISSUER });
  return toGrant(payload);
}

/**
 * What a verified token grants. Shared with the data plane's dataset:read
 * token (dataplane-token.ts, ADR-095 decision 8), which carries the same
 * three claims, so both issuers grant the same way.
 */
export function toGrant(payload: JWTPayload): DataspaceGrant {
  const datasetId = payload.datasetId;
  if (typeof datasetId !== "string" || datasetId.length === 0) {
    throw new Error("the token names no dataset");
  }
  if (typeof payload.sub !== "string" || typeof payload.aud !== "string") {
    throw new Error("the token names no consumer or provider");
  }
  return {
    datasetId,
    consumer: payload.sub,
    provider: payload.aud,
    agreementId:
      typeof payload.agreementId === "string" ? payload.agreementId : undefined,
  };
}
