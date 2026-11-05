import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { newDidSlug } from "@/lib/cfm-participant";

/**
 * Provisioning a dataspace participant on EDC 1.0, without CFM (ADR-078).
 *
 * The same sequence the seeds run, measured green on 1.0 from empty databases
 * (#881): 05-cp-participants.sh, seed-identityhub-participants.sh,
 * seed-cp-participant-config.sh, seed-issuer-holders.sh and
 * request-participant-credentials.sh. A failed step undoes the steps before
 * it, in reverse order, so a registration leaves a whole participant or none.
 * The MembershipCredential is requested, not awaited: the issuer delivers it
 * over DCP a few seconds later, and /api/participants/me reports when it has.
 *
 * Not yet: the participant's signing-key mapping in siglet, which renewing an
 * access token after its hour needs (#881 finding 23). siglet accepts only key
 * names without '%' and '#', and signs through Vault Transit.
 */

const DID_BASE =
  process.env.EDC_DID_BASE ||
  process.env.CFM_DID_BASE ||
  "did:web:identityhub%3A7083";
const CREDENTIAL_SERVICE_BASE =
  process.env.EDC_CREDENTIAL_SERVICE_BASE ||
  "http://identityhub:7082/api/credentials/v1/participants";
const PROTOCOL_BASE =
  process.env.EDC_PROTOCOL_BASE || "http://controlplane:8082/api/dsp";
const STS_TOKEN_URL =
  process.env.EDC_STS_TOKEN_URL || "http://identityhub:7084/api/sts/token";
const DSP_PROFILE = process.env.DSP_PROFILE || "http-dsp-profile-2025-1";
const SIGLET_SIGNALING_URL =
  process.env.SIGLET_SIGNALING_URL || "http://siglet:8081/api/v1";
const ISSUER_DID =
  process.env.EDC_ISSUER_DID || "did:web:issuerservice%3A10016:issuer";
const ISSUER_CTX = process.env.EDC_ISSUER_CTX || "issuer";

export interface Registration {
  displayName: string;
  organization?: string;
  role: string;
  ehdsParticipantType?: string;
}

export interface ProvisionStep {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface Provisioned {
  contextId: string;
  did: string;
  steps: ProvisionStep[];
}

/**
 * A step failed; `steps` says which, and what was undone. `unreachable` when
 * the first step got no answer at all: a stopped stack (ADR-053's off hours),
 * not a refused registration.
 */
export class ProvisioningError extends Error {
  constructor(
    message: string,
    readonly steps: ProvisionStep[],
    readonly unreachable = false,
  ) {
    super(message);
  }
}

/** apiRequest's own error for an HTTP answer; anything else is transport. */
const answered = (err: unknown) =>
  err instanceof Error && err.message.startsWith("EDC API error");

/**
 * A 2xx whose body is empty or not JSON is a success: apiRequest skips the
 * parse only for a 204, and its JSON parse throws a SyntaxError otherwise.
 */
async function bodyNotNeeded(call: Promise<unknown>): Promise<void> {
  try {
    await call;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }
}

/** The registration's details, kept on the control plane's context. */
export function contextProperties(r: Registration): Record<string, string> {
  return {
    displayName: r.displayName,
    organization: r.organization || r.displayName,
    role: r.role,
    ehdsParticipantType: r.ehdsParticipantType || r.role,
    registeredAt: new Date().toISOString(),
  };
}

/** The IdentityHub manifest: DID, a generated key, and the two endpoints. */
export function identityManifest(contextId: string, did: string) {
  return {
    participantContextId: contextId,
    did,
    active: true,
    roles: ["participant"],
    serviceEndpoints: [
      {
        type: "CredentialService",
        serviceEndpoint: `${CREDENTIAL_SERVICE_BASE}/${contextId}`,
        id: `${contextId}-credentialservice`,
      },
      {
        type: "ProtocolEndpoint",
        serviceEndpoint: `${PROTOCOL_BASE}/${contextId}/${DSP_PROFILE}`,
        id: `${contextId}-dsp`,
      },
    ],
    keys: [
      {
        keyId: `${did}#key1`,
        // A fresh Vault alias per context: 1.0 will not generate a key under
        // an alias Vault already holds (#881 finding 18). Without the DID: the
        // compose Vault's file storage turns an alias of 93 characters or more
        // into a file name over 255 bytes ("file name too long"), and a
        // registered name makes a DID of up to 74 (measured 2026-11-05).
        privateKeyAlias: `${contextId}-key1`,
        active: true,
        keyGeneratorParams: { algorithm: "EdDSA" },
        usage: ["sign_token", "sign_presentation", "sign_credentials"],
      },
    ],
  };
}

/** The STS settings the control plane needs before it can send DSP for the context. */
export function stsConfig(contextId: string, did: string) {
  return {
    "@context": [EDC_CONTEXT],
    "@type": "ParticipantContextConfig",
    entries: {
      "edc.participant.id": did,
      "edc.iam.issuer.id": did,
      "edc.iam.sts.oauth.client.id": did,
      "edc.iam.sts.oauth.token.url": STS_TOKEN_URL,
      "edc.iam.sts.oauth.client.secret.alias": `${contextId}-sts-client-secret`,
    },
    privateEntries: {},
  };
}

/** The MembershipCredential definition on the issuer, by type, as the seed finds it. */
async function membershipDefinitionId(): Promise<string> {
  const defs = await edcClient.issuer<
    { id?: string; credentialType?: string }[]
  >(`/v1/participants/${ISSUER_CTX}/credentialdefinitions/query`, "POST", {});
  const def = (Array.isArray(defs) ? defs : []).find(
    (d) => d.credentialType === "MembershipCredential",
  );
  if (!def?.id) {
    throw new Error("the issuer has no MembershipCredential definition");
  }
  return def.id;
}

/**
 * Provisions one participant. Throws ProvisioningError after undoing what it
 * had created; on success the credential request is on its way.
 */
export async function provisionParticipant(
  r: Registration,
): Promise<Provisioned> {
  const did = `${DID_BASE}:${newDidSlug(r.displayName)}`;
  const steps: ProvisionStep[] = [];
  const undo: { step: string; run: () => Promise<unknown> }[] = [];
  let contextId = "";

  const run = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      steps.push({ step, ok: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      steps.push({ step, ok: false, detail });
      for (const u of undo.reverse()) {
        try {
          await u.run();
          steps.push({ step: `undo: ${u.step}`, ok: true });
        } catch (e) {
          steps.push({
            step: `undo: ${u.step}`,
            ok: false,
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }
      throw new ProvisioningError(
        `${step} failed: ${detail}`,
        steps,
        steps.length === 1 && !answered(err),
      );
    }
  };

  // The context stays CREATED: 1.0 accepts a PUT to ACTIVATED with 204 and
  // keeps the state (measured 2026-11-05), as it does for the seeded five, and
  // GET /api/participants lists CREATED contexts when none is ACTIVATED.
  await run("control plane context", async () => {
    const created = await edcClient.management<{ "@id"?: string }>(
      "/v5/participants",
      "POST",
      {
        "@context": [EDC_CONTEXT],
        "@type": "ParticipantContext",
        identity: did,
        properties: contextProperties(r),
      },
    );
    contextId = created?.["@id"] ?? "";
    if (!contextId) throw new Error("the control plane returned no context id");
    undo.push({
      step: "control plane context",
      run: () =>
        edcClient.management(`/v5/participants/${contextId}`, "DELETE"),
    });
  });

  await run("IdentityHub participant", async () => {
    await edcClient.identity(
      "/v1/participants",
      "POST",
      identityManifest(contextId, did),
    );
    undo.push({
      step: "IdentityHub participant",
      run: () => edcClient.identity(`/v1/participants/${contextId}`, "DELETE"),
    });
  });

  await run("context config", () =>
    edcClient.management(
      `/v5/participants/${contextId}/config`,
      "PUT",
      stsConfig(contextId, did),
    ),
  );

  await run("DSP profile", () =>
    edcClient.management(`/v5/participants/${contextId}/profiles`, "PUT", {
      "@context": [EDC_CONTEXT],
      "@type": "AssociateDataspaceProfile",
      profiles: [DSP_PROFILE],
    }),
  );

  // 1.0 answers 200 with an empty body here, not 204 (measured 2026-11-05).
  await run("data plane (siglet)", () =>
    bodyNotNeeded(
      edcClient.management(`/v5/participants/${contextId}/dataplanes`, "PUT", {
        dataplaneId: `siglet-${contextId}`,
        endpoint: `${SIGLET_SIGNALING_URL}/${contextId}/dataflows`,
        transferTypes: ["HttpData-PULL"],
      }),
    ),
  );

  // Keyed by the context id, not the DID as the seeds do: a did:web carries
  // '%3A', and the IssuerService's Jetty refuses any path holding '%25' (400
  // "Ambiguous URI path encoding"), so a holder keyed by its DID can never be
  // deleted again. The issuer finds the holder by its DID either way.
  await run("issuer holder", async () => {
    // Created answers 2xx with an empty body (measured 2026-11-05).
    await bodyNotNeeded(
      edcClient.issuer(`/v1/participants/${ISSUER_CTX}/holders`, "POST", {
        holderId: contextId,
        did,
        name: r.displayName,
      }),
    );
    undo.push({
      step: "issuer holder",
      run: () =>
        edcClient.issuer(
          `/v1/participants/${ISSUER_CTX}/holders/${contextId}`,
          "DELETE",
        ),
    });
  });

  await run("MembershipCredential request", async () => {
    const definitionId = await membershipDefinitionId();
    // A 2xx whose body is the bare holderPid, not JSON, is a success.
    await bodyNotNeeded(
      edcClient.identity(
        `/v1/participants/${contextId}/credentials/request`,
        "POST",
        {
          issuerDid: ISSUER_DID,
          credentials: [
            {
              id: definitionId,
              type: "MembershipCredential",
              format: "VC1_0_JWT",
            },
          ],
        },
      ),
    );
  });

  return { contextId, did, steps };
}

/** Whether a participant holds a MembershipCredential the issuer delivered. */
export async function holdsMembership(contextId: string): Promise<boolean> {
  try {
    const creds = await edcClient.identity<
      { verifiableCredential?: { credential?: { type?: string[] } } }[]
    >(`/v1/participants/${contextId}/credentials?type=MembershipCredential`);
    return Array.isArray(creds) && creds.length > 0;
  } catch {
    return false;
  }
}
