import { NextRequest, NextResponse } from "next/server";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import {
  recordDemo,
  DEMO_ONBOARDING_SCOPE,
  type DemoRecord,
} from "@/lib/demo-records";
import { summariseVpas, type Vpa } from "@/lib/provisioning";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Approved fictional participants — display names by DID slug.
 * Slug = last path segment of the participant's DID
 * (e.g. "did:web:identityhub%3A7083:alpha-klinik" → "alpha-klinik").
 * Used as fallback when the CFM Tenant Manager is unavailable.
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

/** Extract DID slug from a participantId DID string. */
function didSlug(did: string): string {
  return decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
}

interface EdcParticipant {
  "@id": string;
  participantId?: string;
  identity?: string;
  [key: string]: unknown;
}

interface CfmTenant {
  id: string;
  properties?: {
    displayName?: string;
    organization?: string;
    role?: string;
    participantDid?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * GET /api/participants — List all participant contexts (EDC-V Management API)
 * enriched with human-readable display names from CFM Tenant Manager.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const participants = await edcClient.management<EdcParticipant[]>(
      "/v5alpha/participants",
    );

    // Attempt to fetch CFM tenants for display names — non-blocking
    const tenantMap: Record<string, string> = {};
    try {
      const tenants = await edcClient.tenant<CfmTenant[]>("/v1alpha1/tenants");
      if (Array.isArray(tenants)) {
        for (const t of tenants) {
          const dn = t.properties?.displayName;
          if (!dn) continue;
          // Match by DID slug stored in properties
          const did = t.properties?.participantDid ?? "";
          const slug = did ? didSlug(did) : "";
          if (slug) tenantMap[slug] = dn;
          // Also index by lowercase displayName slug for looser matching
          const dnSlug = dn
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
          tenantMap[dnSlug] = dn;
        }
      }
    } catch {
      // CFM may be down — fall back to static map below
    }

    // Enrich each participant with a displayName — skip stale CREATED contexts
    const enriched = (Array.isArray(participants) ? participants : [])
      .filter((p) => {
        // Only show ACTIVATED participants in the UI
        const state = (p as Record<string, unknown>).state as
          | string
          | undefined;
        return state === "ACTIVATED";
      })
      .map((p) => {
        const did = p.participantId ?? p.identity ?? "";
        const slug = did ? didSlug(did) : "";
        const staticEntry = SLUG_DISPLAY_NAMES[slug];
        const displayName =
          tenantMap[slug] ||
          staticEntry?.displayName ||
          slug ||
          p["@id"].slice(0, 12);
        const role = staticEntry?.role ?? "";
        return {
          ...p,
          participantId: p["@id"],
          displayName,
          role,
          slug,
          identity: did,
        };
      });

    if (enriched.length > 0) {
      return NextResponse.json(enriched);
    }

    // Say which of the two very different cases this is. Both used to end in
    // the same mock fallback and the same shrug of a log line, which is how
    // the live site listed fixtures for months without anyone noticing
    // (#317). "The API answered and nothing is activated" is a seeding or
    // lifecycle problem; "the API did not answer" is a transport one.
    const total = Array.isArray(participants) ? participants.length : 0;
    if (total > 0) {
      const states = [
        ...new Set(
          (participants as Record<string, unknown>[]).map(
            (p) => (p.state as string) ?? "unknown",
          ),
        ),
      ].sort();
      console.warn(
        `Management API answered with ${total} participant context(s), none ACTIVATED ` +
          `(states: ${states.join(
            ", ",
          )}). Serving mock data. A context created through ` +
          `the Management API stays CREATED and cannot currently be activated — see #328.`,
      );
    } else {
      console.warn(
        "Management API answered with an empty participant list. Serving mock data. " +
          "The control plane holds no contexts; see #316 for how they are seeded.",
      );
    }
  } catch (err) {
    // A throw here is transport, not state: a wrong port or a wrong API
    // version segment both land in this branch (#307, #317).
    console.error(
      "Management API unreachable, serving mock data. Check EDC_MANAGEMENT_URL " +
        "(the Management API is on the control plane's 8081, not the ingress " +
        "FQDN) and EDC_MGMT_API_VERSION (the deployment serves v4alpha):",
      err,
    );
  }

  // Fall back to bundled mock data so the UI works offline / pre-seed
  try {
    const mockPath = path.join(
      process.cwd(),
      "public",
      "mock",
      "participants.json",
    );
    const raw = await fs.readFile(mockPath, "utf-8");
    const mock = JSON.parse(raw);
    console.warn("Serving mock participants");
    return NextResponse.json(mock);
  } catch {
    // Mock file not available either
  }

  return NextResponse.json(
    { error: "Failed to list participants" },
    { status: 502 },
  );
}

/**
 * Can this deployment provision a participant?
 *
 * Onboarding needs a CFM cell and a dataspace profile to attach the new tenant
 * to. On the Azure deployment neither exists and the Tenant Manager may not be
 * running at all: `scripts/azure/02-data-layer.sh` creates only the `keycloak`
 * database, so the manager's `cfm` database is missing; nothing outside
 * `jad/seed-jad.sh` ever creates a cell or a profile; and CI deploys only the UI
 * and the proxy. That is the scope split of ADR-022, now superseded by ADR-024
 * but still the live state. Issue #203.
 *
 * So "no" is the expected answer on Azure rather than an error, and it is the
 * same answer whether the manager refuses the call or answers with an empty
 * list. `unavailable` carries the reason for the response to pass on; it is
 * empty when provisioning can go ahead.
 */
async function canProvision(): Promise<{
  cellId: string;
  profileId: string;
  unavailable: string;
}> {
  try {
    const cells = await edcClient.tenant<{ id: string }[]>("/v1alpha1/cells");
    const cellId = Array.isArray(cells) && cells.length ? cells[0].id : "";
    if (!cellId) {
      return {
        cellId: "",
        profileId: "",
        unavailable:
          "The CFM Tenant Manager has no cell to attach a tenant to.",
      };
    }

    const profiles = await edcClient.tenant<{ id: string }[]>(
      "/v1alpha1/dataspace-profiles",
    );
    const profileId =
      Array.isArray(profiles) && profiles.length ? profiles[0].id : "";
    if (!profileId) {
      return {
        cellId,
        profileId: "",
        unavailable: "The CFM Tenant Manager has no dataspace profile.",
      };
    }

    return { cellId, profileId, unavailable: "" };
  } catch (err) {
    return {
      cellId: "",
      profileId: "",
      unavailable: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The registration recorded when nothing can provision it.
 *
 * Shaped like a CFM tenant so `/api/participants/me` can list it beside the real
 * ones, but with an empty `participantProfiles` and `provisioned: false`: no DID
 * was registered, no key pair generated and no credential issued, and the page
 * must not claim otherwise. The demo- prefix on the id keeps it distinguishable
 * from anything the Tenant Manager issued.
 */
function buildDemoParticipant(
  displayName: string,
  organization: string,
  role: string,
  ehdsParticipantType: string,
  reason: string,
): DemoRecord {
  const slug = displayName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return {
    "@id": `demo-tenant:${slug}`,
    id: `demo-tenant:${slug}`,
    version: 0,
    properties: {
      displayName,
      organization: organization || displayName,
      role,
      ehdsParticipantType: ehdsParticipantType || role,
    },
    participantProfiles: [],
    displayName,
    role,
    status: "not-provisioned",
    provisioned: false,
    demo: true,
    demoReason:
      "This deployment does not run the CFM provisioning stack, so the " +
      "registration was recorded for the demonstration only. No DID was " +
      "registered, no key pair generated and no credential issued. The five " +
      "seeded participants are unaffected. Tracked in issue #203.",
    upstreamError: reason,
    createdAt: Date.now(),
  };
}

/**
 * POST /api/participants — Create a new tenant + participant context.
 *
 * Body: { displayName, organization, role, ehdsParticipantType }
 *
 * Steps:
 * 1. Create tenant in CFM TenantManager
 * 2. Create participant profile (triggers provisioning via CFM agents)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { displayName, organization, role, ehdsParticipantType } = body;

    if (!displayName || !role) {
      return NextResponse.json(
        { error: "displayName and role are required" },
        { status: 400 },
      );
    }

    // 1+2. The cell and the dataspace profile a tenant has to be attached to.
    // Read together because they answer one question: can this deployment
    // provision a participant at all? See canProvision() for why that is not a
    // given, and why an answer of "no" is not a failed registration.
    const { cellId, profileId, unavailable } = await canProvision();

    if (unavailable) {
      const participant = buildDemoParticipant(
        displayName,
        organization,
        role,
        ehdsParticipantType,
        unavailable,
      );
      recordDemo("participant", DEMO_ONBOARDING_SCOPE, participant);
      return NextResponse.json(participant, { status: 201 });
    }

    // 3. Create tenant
    const tenantPayload = {
      properties: {
        displayName,
        organization: organization || displayName,
        role,
        ehdsParticipantType: ehdsParticipantType || role,
      },
    };

    const tenant = await edcClient.tenant<{ id: string }>(
      "/v1alpha1/tenants",
      "POST",
      tenantPayload,
    );

    // 4. Create participant profile for this tenant (triggers DID + key provisioning)
    const participantPayload = {
      cellId,
      dataspaceProfileId: profileId,
    };

    const participant = await edcClient.tenant<{ id: string; vpas?: Vpa[] }>(
      `/v1alpha1/tenants/${tenant.id}/participant-profiles`,
      "POST",
      participantPayload,
    );

    // What was actually created is a tenant, a participant profile and a set
    // of provisioning activities, all of them pending. The DID and the
    // credential arrive only when an agent completes those activities, and
    // this request cannot know whether one will: a freshly created activity
    // looks the same either way. So report the activities rather than promise
    // their outcome, and let /api/participants/me call it stalled once they
    // have sat pending past the point an agent would have taken them
    // (lib/provisioning.ts). Issue #203.
    const vpas = Array.isArray(participant?.vpas) ? participant.vpas : [];
    const summary = summariseVpas([{ vpas }]);

    return NextResponse.json(
      {
        tenantId: tenant.id,
        participantId: participant?.id,
        displayName,
        role,
        status: "provisioning",
        provisioned: true,
        vpas,
        activitiesPending: summary.pending,
        activityTypes: summary.pendingTypes,
      },
      { status: 201 },
    );
  } catch (err) {
    // A TenantManager that answered the two reads and then refused the write is
    // a genuine fault: report it, with the reason. Swallowing it was the whole
    // problem (issue #203) — the page had nothing to show but "Failed to create
    // participant", which reads as though the form input were at fault.
    console.error("Failed to create participant:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to create participant", detail },
      { status: 502 },
    );
  }
}
