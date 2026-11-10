/**
 * Removing a participant the hub onboarded (ADR-085 step 3, #973).
 *
 * Only a context registered through /onboarding can be removed: it carries
 * `registeredAt` (provision.ts and CFM's connector activity both write it).
 * The seeded participants carry none and stay, or every suite would lose its
 * provider and consumer.
 *
 * The order is the reverse of provisioning, the control plane context last,
 * so a removal that stops halfway can be run again: the context, which the
 * check above reads, is still there.
 *
 * With CFM_TENANT_URL set, the Tenant Manager's tenant and profile are removed
 * first, best effort (cfm-provision.ts, removeFromCfm). CFM 0.0.7's dispose
 * removes nothing on the stack (it reaches no agent with the context id), so
 * the hub removes the rest itself either way.
 */
import { edcClient } from "@/lib/edc";
import { getContext, type HubContext } from "@/lib/edc/participants";
import { cfmProvisioning, removeFromCfm } from "@/lib/edc/cfm-provision";
import type { ProvisionStep } from "@/lib/edc/provision";

const ISSUER_CTX = process.env.EDC_ISSUER_CTX || "issuer";
const SIGLET_MANAGEMENT_URL =
  process.env.SIGLET_MANAGEMENT_URL || "http://siglet:8083";

/** No context with that id: 404. */
export class ParticipantNotFound extends Error {}

/** A context the hub did not onboard: 409, nothing is touched. */
export class RemovalRefused extends Error {}

export interface Removed {
  contextId: string;
  did: string;
  steps: ProvisionStep[];
}

/** An answer of the EDC client that says the thing is not there. */
const notFound = (err: unknown) =>
  err instanceof Error && /: 404 /.test(err.message);

const detail = (err: unknown) =>
  err instanceof Error ? err.message.split("\n")[0] : String(err);

/**
 * Removes one onboarded participant. Throws ParticipantNotFound or
 * RemovalRefused before touching anything; afterwards it reports every step,
 * and a step that fails does not stop the others.
 */
export async function removeParticipant(contextId: string): Promise<Removed> {
  let ctx: HubContext;
  try {
    ctx = await getContext(contextId);
  } catch (err) {
    if (notFound(err)) throw new ParticipantNotFound(contextId);
    throw err;
  }
  if (!ctx || !ctx["@id"]) throw new ParticipantNotFound(contextId);
  const did = ctx.identity ?? "";
  if (typeof ctx.properties?.registeredAt !== "string") {
    throw new RemovalRefused(
      "only a participant registered through /onboarding can be removed; " +
        "the seeded participants stay",
    );
  }

  const steps: ProvisionStep[] = [];
  const run = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      steps.push({ step, ok: true });
    } catch (err) {
      if (notFound(err)) steps.push({ step, ok: true, detail: "not there" });
      else steps.push({ step, ok: false, detail: detail(err) });
    }
  };

  if (cfmProvisioning() && did) steps.push(...(await removeFromCfm(did)));

  // provision.ts keys the holder by the context id. CFM's registration agent
  // keys it by the DID, whose '%3A' the IssuerService refuses in a path
  // (400 "Ambiguous URI path encoding"), so that holder cannot be removed
  // through the API; it is reported, not hidden.
  await run("issuer holder", () =>
    edcClient.issuer(
      `/v1/participants/${ISSUER_CTX}/holders/${encodeURIComponent(contextId)}`,
      "DELETE",
    ),
  );
  if (did) {
    try {
      const holders = await edcClient.issuer<
        { holderId?: string; did?: string }[]
      >(`/v1/participants/${ISSUER_CTX}/holders/query`, "POST", {});
      if (
        Array.isArray(holders) &&
        holders.some((h) => h.did === did && h.holderId !== contextId)
      ) {
        steps.push({
          step: "issuer holder keyed by DID",
          ok: false,
          detail:
            "the IssuerService cannot delete a holder whose id holds '%3A' through its API",
        });
      }
    } catch {
      // the query is a report, not a step of the removal
    }
  }

  // Only CFM's siglet agent writes a transfer type mapping, so this runs only
  // when the hub provisions through CFM.
  if (cfmProvisioning()) {
    await run("siglet transfer type mapping", async () => {
      const res = await fetch(
        `${SIGLET_MANAGEMENT_URL}/transfer-type-mappings/${encodeURIComponent(
          contextId,
        )}`,
        { method: "DELETE", cache: "no-store" },
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`siglet answered ${res.status}`);
      }
    });
  }

  // Takes the participant's keys, STS client and credentials with it.
  await run("IdentityHub participant", () =>
    edcClient.identity(
      `/v1/participants/${encodeURIComponent(contextId)}`,
      "DELETE",
    ),
  );

  await run("control plane context", () =>
    edcClient.management(
      `/v5/participants/${encodeURIComponent(contextId)}`,
      "DELETE",
    ),
  );

  return { contextId, did, steps };
}
