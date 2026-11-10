/**
 * Provisioning a participant through CFM 0.0.7 (ADR-085, #973), behind the
 * setting CFM_TENANT_URL. Unset, /api/participants provisions with
 * provision.ts as before (ADR-078); set, it asks CFM's Tenant Manager.
 *
 * The Tenant Manager takes a tenant and a participant profile and runs the
 * orchestration scripts/seed-cfm.sh defines: jwtlet, IdentityHub, the hub's
 * own connector activity, siglet, issuer holder, MembershipCredential. This
 * waits until the profile's agents are active or one failed, then finds the
 * control plane context by its DID, so the answer has the shape
 * provisionParticipant() returns.
 *
 * Dispose stays with the hub: CFM 0.0.7 sends dispose without the context id
 * (docs/planning/current/issue-973-cfm-0-0-7-spike.md).
 */
import { edcClient } from "@/lib/edc";
import { newDidSlug } from "@/lib/cfm-participant";
import {
  ProvisioningError,
  type Provisioned,
  type ProvisionStep,
  type Registration,
} from "@/lib/edc/provision";

// The data plane siglet serves for every participant, as jad/siglet-edc1.toml
// declares it; CFM's siglet agent configures and registers it per context.
const DATA_ENDPOINT =
  process.env.CFM_SIGLET_DATA_ENDPOINT ||
  "http://neo4j-proxy:9090/dataspace/data";

const DID_BASE =
  process.env.EDC_DID_BASE ||
  process.env.CFM_DID_BASE ||
  "did:web:identityhub%3A7083";

/** Whether /api/participants provisions through CFM. */
export function cfmProvisioning(): boolean {
  return Boolean(process.env.CFM_TENANT_URL);
}

function settings() {
  const keycloak =
    process.env.KEYCLOAK_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_KEYCLOAK_URL ||
    "http://keycloak:8080";
  const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "edcv";
  return {
    tenantUrl: (process.env.CFM_TENANT_URL || "").replace(/\/$/, ""),
    tokenUrl: `${keycloak}/realms/${realm}/protocol/openid-connect/token`,
    clientId: process.env.CFM_CLIENT_ID || "cfm-agents",
    clientSecret: process.env.CFM_CLIENT_SECRET || "",
    timeoutMs: Number(process.env.CFM_DEPLOY_TIMEOUT_MS || 90_000),
    pollMs: Number(process.env.CFM_DEPLOY_POLL_MS || 2_000),
  };
}

interface ParticipantProfile {
  id: string;
  identifier?: string;
  error?: boolean;
  errorDetail?: string;
  vpas?: { type: string; state: string }[];
}

type Settings = ReturnType<typeof settings>;
type TenantManager = <T>(path: string, init?: RequestInit) => Promise<T>;

/** A client-credentials token of the cfm-agents client for the Tenant Manager. */
async function cfmToken(s: Settings): Promise<string> {
  const res = await fetch(s.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: s.clientId,
      client_secret: s.clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Keycloak answered ${res.status}`);
  return (await res.json()).access_token;
}

function tenantManager(s: Settings, token: string): TenantManager {
  return async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${s.tenantUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Tenant Manager ${res.status}: ${text}`);
    return (text ? JSON.parse(text) : {}) as T;
  };
}

/** Provisions one participant through the Tenant Manager. */
export async function provisionThroughCfm(
  r: Registration,
): Promise<Provisioned> {
  const s = settings();
  const did = `${DID_BASE}:${newDidSlug(r.displayName)}`;
  const steps: ProvisionStep[] = [];

  const fail = (step: string, detail: string, unreachable = false) => {
    steps.push({ step, ok: false, detail });
    return new ProvisioningError(
      `${step} failed: ${detail}`,
      steps,
      unreachable,
    );
  };

  let tm: TenantManager;
  try {
    tm = tenantManager(s, await cfmToken(s));
  } catch (err) {
    throw fail("CFM token", err instanceof Error ? err.message : String(err));
  }

  let dataspaceProfileId = process.env.CFM_DATASPACE_PROFILE_ID || "";
  try {
    if (!dataspaceProfileId) {
      const profiles = await tm<{ id: string }[]>(
        "/v1alpha1/dataspace-profiles",
      );
      dataspaceProfileId = profiles[0]?.id || "";
    }
    if (!dataspaceProfileId) throw new Error("no dataspace profile");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw fail(
      "CFM dataspace profile",
      detail,
      !detail.includes("Tenant Manager"),
    );
  }

  const properties = {
    displayName: r.displayName,
    organization: r.organization || r.displayName,
    role: r.role,
    ehdsParticipantType: r.ehdsParticipantType || r.role,
    registeredAt: new Date().toISOString(),
  };

  let tenantId: string;
  let profileId: string;
  try {
    tenantId = (
      await tm<{ id: string }>("/v1alpha1/tenants", {
        method: "POST",
        body: JSON.stringify({ properties }),
      })
    ).id;
    steps.push({ step: "CFM tenant", ok: true });
    profileId = (
      await tm<ParticipantProfile>(
        `/v1alpha1/tenants/${tenantId}/participant-profiles`,
        {
          method: "POST",
          body: JSON.stringify({
            identifier: did,
            dataspaceProfileIds: [dataspaceProfileId],
            participantRoles: { [dataspaceProfileId]: ["participant"] },
            vpaProperties: {
              "cfm.connector": { contextProperties: properties },
              "cfm.dataplane": {
                transferTypeMappings: {
                  "HttpData-PULL": {
                    transferType: "HttpData-PULL",
                    endpointType: "HTTP",
                    tokenSource: "provider",
                    endpoint: DATA_ENDPOINT,
                  },
                },
              },
              "cfm.issuer": { id: did },
            },
            properties: {},
          }),
        },
      )
    ).id;
    steps.push({ step: "CFM participant profile", ok: true });
  } catch (err) {
    throw fail(
      "CFM participant profile",
      err instanceof Error ? err.message : String(err),
    );
  }

  const deadline = Date.now() + s.timeoutMs;
  let states = "";
  for (;;) {
    const p = await tm<ParticipantProfile>(
      `/v1alpha1/tenants/${tenantId}/participant-profiles/${profileId}`,
    );
    const vpaStates = (p.vpas || []).map((v) => v.state);
    states = (p.vpas || []).map((v) => `${v.type}: ${v.state}`).join(", ");
    if (p.error || vpaStates.includes("error")) {
      throw fail("CFM orchestration", p.errorDetail || states);
    }
    if (vpaStates.length > 0 && vpaStates.every((v) => v === "active")) break;
    if (Date.now() > deadline) {
      throw fail("CFM orchestration", `still pending: ${states}`);
    }
    await new Promise((resolve) => setTimeout(resolve, s.pollMs));
  }
  steps.push({ step: "CFM orchestration", ok: true, detail: states });

  const contexts =
    await edcClient.management<{ "@id"?: string; identity?: string }[]>(
      "/v5/participants",
    );
  const contextId =
    (Array.isArray(contexts) ? contexts : []).find((c) => c.identity === did)?.[
      "@id"
    ] || "";
  if (!contextId) {
    throw fail("control plane context", `no context for ${did}`);
  }
  steps.push({ step: "control plane context", ok: true });
  return { contextId, did, steps };
}

/** What CFM's Tenant Manager holds for one participant, by its DID. */
export interface CfmState {
  tenantId: string;
  profileId: string;
  /**
   * active: every agent deployed; pending: deploying or disposing; disposed:
   * removed; error: an agent failed (detail says which).
   */
  state: "active" | "pending" | "disposed" | "error";
  detail?: string;
}

function profileState(p: ParticipantProfile): CfmState["state"] {
  const states = (p.vpas ?? []).map((v) => v.state);
  if (p.error || states.includes("error")) return "error";
  if (states.length > 0 && states.every((s) => s === "disposed")) {
    return "disposed";
  }
  if (states.length > 0 && states.every((s) => s === "active")) return "active";
  return "pending";
}

/**
 * The Tenant Manager's participant profiles, by DID, so the participant list
 * can say which contexts CFM provisioned and in what state (ADR-085 step 3).
 * Of several profiles for one DID, a live one wins over a disposed one.
 * Throws when the Tenant Manager cannot be asked; the caller lists the
 * contexts without CFM's view then.
 */
export async function cfmStatesByDid(): Promise<Map<string, CfmState>> {
  const s = settings();
  const tm = tenantManager(s, await cfmToken(s));
  const byDid = new Map<string, CfmState>();
  for (const tenant of await tm<{ id: string }[]>("/v1alpha1/tenants")) {
    const profiles = await tm<ParticipantProfile[]>(
      `/v1alpha1/tenants/${tenant.id}/participant-profiles`,
    );
    for (const p of profiles) {
      if (!p.identifier) continue;
      const state: CfmState = {
        tenantId: tenant.id,
        profileId: p.id,
        state: profileState(p),
        ...(p.errorDetail ? { detail: p.errorDetail } : {}),
      };
      const known = byDid.get(p.identifier);
      if (!known || known.state === "disposed") byDid.set(p.identifier, state);
    }
  }
  return byDid;
}

/**
 * Removes the participant's tenant and profile from CFM, best effort. CFM
 * 0.0.7's dispose reaches no agent with the context id
 * (docs/planning/current/issue-973-cfm-0-0-7-spike.md), so it removes nothing
 * on the stack; the hub removes that itself (remove-participant.ts). This only
 * keeps the Tenant Manager from listing a participant that is gone. A step
 * that fails is reported, never thrown.
 */
export async function removeFromCfm(did: string): Promise<ProvisionStep[]> {
  const s = settings();
  const steps: ProvisionStep[] = [];
  const detail = (err: unknown) =>
    err instanceof Error ? err.message : String(err);
  let tm: TenantManager;
  try {
    tm = tenantManager(s, await cfmToken(s));
  } catch (err) {
    return [{ step: "CFM token", ok: false, detail: detail(err) }];
  }
  let found = false;
  try {
    for (const tenant of await tm<{ id: string }[]>("/v1alpha1/tenants")) {
      const profiles = await tm<ParticipantProfile[]>(
        `/v1alpha1/tenants/${tenant.id}/participant-profiles`,
      );
      const mine = profiles.filter((p) => p.identifier === did);
      if (mine.length === 0) continue;
      found = true;
      for (const p of mine) {
        try {
          await tm(
            `/v1alpha1/tenants/${tenant.id}/participant-profiles/${p.id}`,
            { method: "DELETE" },
          );
          steps.push({ step: "CFM participant profile", ok: true });
        } catch (err) {
          steps.push({
            step: "CFM participant profile",
            ok: false,
            detail: detail(err),
          });
        }
      }
      if (mine.length === profiles.length) {
        try {
          await tm(`/v1alpha1/tenants/${tenant.id}`, { method: "DELETE" });
          steps.push({ step: "CFM tenant", ok: true });
        } catch (err) {
          steps.push({ step: "CFM tenant", ok: false, detail: detail(err) });
        }
      }
    }
  } catch (err) {
    steps.push({ step: "CFM tenants", ok: false, detail: detail(err) });
  }
  if (!found && steps.length === 0) {
    steps.push({
      step: "CFM participant profile",
      ok: true,
      detail: "none for this DID",
    });
  }
  return steps;
}
