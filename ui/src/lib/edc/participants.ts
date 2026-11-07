import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { PROVISIONING_STALL_MS, type VpaSummary } from "@/lib/provisioning";
import { holdsMembership } from "@/lib/edc/provision";

/**
 * Participants as the hub sees them on EDC 1.0: control plane contexts
 * (ADR-078). The tenant, participant profile and VPA of CFM are gone; the
 * routes still answer in the tenant shape the onboarding, settings and admin
 * pages read, with the context id as the tenant id.
 */

/**
 * Approved fictional participants, display names by DID slug. The seeded
 * five carry no properties on their context, so their names come from here;
 * a participant onboarded through the hub carries its own.
 */
const SLUG_DISPLAY_NAMES: Record<
  string,
  { displayName: string; org: string; role: string }
> = {
  "alpha-klinik": {
    displayName: "AlphaKlinik Berlin",
    org: "AlphaKlinik Berlin",
    role: "DATA_HOLDER",
  },
  lmc: {
    displayName: "Limburg Medical Centre",
    org: "Limburg Medical Centre",
    role: "DATA_HOLDER",
  },
  pharmaco: {
    displayName: "PharmaCo Research AG",
    org: "PharmaCo Research AG",
    role: "DATA_USER",
  },
  medreg: { displayName: "MedReg DE", org: "MedReg DE", role: "HDAB" },
  irs: {
    displayName: "Institut de Recherche Santé",
    org: "Institut de Recherche Santé",
    role: "HDAB",
  },
};

/** The last segment of a did:web ("did:web:identityhub%3A7083:lmc" is "lmc"). */
function didSlug(did: string): string {
  return decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
}

export interface HubContext {
  "@id": string;
  identity?: string;
  participantId?: string;
  state?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function listContexts(): Promise<HubContext[]> {
  const all = await edcClient.management<HubContext[]>("/v5/participants");
  return Array.isArray(all) ? all : [];
}

export function getContext(id: string): Promise<HubContext> {
  return edcClient.management<HubContext>(
    `/v5/participants/${encodeURIComponent(id)}`,
  );
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Name, organisation and role: the context's own, else the seeded five's. */
export function contextNames(ctx: HubContext) {
  const did = ctx.identity ?? ctx.participantId ?? "";
  const slug = did ? didSlug(did) : "";
  const known = SLUG_DISPLAY_NAMES[slug];
  const p = ctx.properties ?? {};
  const displayName =
    str(p.displayName) || known?.displayName || slug || ctx["@id"].slice(0, 12);
  return {
    did,
    slug,
    displayName,
    organization: str(p.organization) || known?.org || displayName,
    role: str(p.role) || known?.role || "",
    ehdsParticipantType:
      str(p.ehdsParticipantType) || str(p.role) || known?.role || "",
    registeredAt: str(p.registeredAt),
  };
}

/**
 * Replaces the context's properties with `properties` merged over them. 1.0
 * replaces the whole map on PUT (an update without it empties it), so the
 * current one is read first.
 */
export async function updateContextProperties(
  id: string,
  properties: Record<string, string>,
): Promise<void> {
  const ctx = await getContext(id);
  await edcClient.management(
    `/v5/participants/${encodeURIComponent(id)}`,
    "PUT",
    {
      "@context": [EDC_CONTEXT],
      "@type": "ParticipantContext",
      "@id": ctx["@id"],
      identity: ctx.identity,
      state: ctx.state,
      properties: { ...(ctx.properties ?? {}), ...properties },
    },
  );
}

/**
 * One context in the tenant shape of /api/participants/me. Provisioning is
 * synchronous now, so a context that exists has its DID and keys; what can
 * still be outstanding is the MembershipCredential, which the issuer delivers
 * over DCP. Until it has, the card says provisioning, and after
 * PROVISIONING_STALL_MS it says stalled, with the reason.
 */
export function toTenantView(
  ctx: HubContext,
  holdsCredential: boolean,
  now: number = Date.now(),
) {
  const n = contextNames(ctx);
  const since = n.registeredAt ? Date.parse(n.registeredAt) : NaN;
  const waiting = !holdsCredential;
  const stalled =
    waiting && (Number.isNaN(since) || now - since > PROVISIONING_STALL_MS);
  const vpaSummary: VpaSummary = {
    total: 1,
    pending: waiting ? 1 : 0,
    pendingTypes: waiting ? ["MembershipCredential"] : [],
    oldestPendingSince:
      waiting && !Number.isNaN(since) ? new Date(since).toISOString() : null,
    stalled,
  };
  return {
    id: ctx["@id"],
    version: 0,
    properties: {
      displayName: n.displayName,
      organization: n.organization,
      role: n.role,
      ehdsParticipantType: n.ehdsParticipantType,
      ...(n.registeredAt ? { registeredAt: n.registeredAt } : {}),
    },
    participantProfiles: [
      {
        id: ctx["@id"],
        participantContextId: ctx["@id"],
        identifier: n.did,
        did: n.did,
        state: ctx.state,
      },
    ],
    vpaSummary,
    provisioningComplete: holdsCredential,
    provisioningFailed: false,
    provisioningStalled: stalled,
    ...(stalled
      ? {
          stalledReason:
            `The participant context, its DID and keys exist, but the issuer ` +
            `has not delivered its MembershipCredential` +
            (Number.isNaN(since)
              ? ""
              : ` since ${new Date(since).toISOString()}`) +
            `. The IssuerService's log names the cause; without the credential ` +
            `no other participant will negotiate with it.`,
        }
      : {}),
  };
}

/** Every context in the tenant shape, each with whether it holds its credential. */
export async function listTenantViews() {
  const contexts = await listContexts();
  return Promise.all(
    contexts.map(async (c) => toTenantView(c, await holdsMembership(c["@id"]))),
  );
}
