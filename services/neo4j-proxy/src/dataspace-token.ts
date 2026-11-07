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

/** Where each seeded asset's data lives on this proxy (jad/seed-data-assets.sh). */
export const DATASET_ROUTES: Record<
  string,
  { method: "GET" | "POST"; path: string }
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

function toGrant(payload: JWTPayload): DataspaceGrant {
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
