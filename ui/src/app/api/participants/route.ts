import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { PROVISIONING_HOURS } from "@/lib/provisioning";
import { provisionParticipant, ProvisioningError } from "@/lib/edc/provision";
import {
  listContexts,
  contextNames,
  type HubContext,
} from "@/lib/edc/participants";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/participants — List all participant contexts (EDC-V Management API)
 * with their display names: the context's own properties for a participant
 * onboarded through the hub, the seeded five's names otherwise (ADR-078).
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const participants = await listContexts();

    // Enrich each participant with a displayName. ACTIVATED contexts win, so
    // the stale CREATED ones a re-seed leaves on the compose stack stay hidden.
    // When none is ACTIVATED, the CREATED ones are the real contexts: on Azure
    // all of them have stayed CREATED since the 2026-10-28 re-seed and still
    // answer DSP catalog requests. Dropping them served the compose stack's
    // mock participants, whose ids and DIDs do not exist there, so every
    // catalog request fell back to the demo catalogue (#876).
    const all = participants;
    const stateOf = (p: HubContext) => p.state;
    const activated = all.filter((p) => stateOf(p) === "ACTIVATED");
    const usable = activated.length
      ? activated
      : all.filter((p) => stateOf(p) === "CREATED");
    if (!activated.length && usable.length) {
      console.warn(
        `Management API answered with no ACTIVATED participant context; ` +
          `using ${usable.length} CREATED context(s) (#876).`,
      );
    }
    const enriched = usable.map((p) => {
      const { did, slug, displayName, role } = contextNames(p);
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
    const total = participants.length;
    if (total > 0) {
      const states = [
        ...new Set(participants.map((p) => p.state ?? "unknown")),
      ].sort();
      console.warn(
        `Management API answered with ${total} participant context(s), none ACTIVATED ` +
          `or CREATED (states: ${states.join(", ")}). Serving mock data.`,
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
 * POST /api/participants — Provision a participant on the control plane.
 *
 * Body: { displayName, organization, role, ehdsParticipantType }
 *
 * The hub provisions it itself, without CFM (ADR-078, lib/edc/provision.ts):
 * control plane context, IdentityHub participant with DID and key, context
 * config and DSP profile, data plane, issuer holder, and a MembershipCredential
 * requested over DCP. A failed step undoes the ones before it, so the answer is
 * a whole participant or none. The credential arrives a few seconds later;
 * /api/participants/me says when it has.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const displayName = str(body.displayName);
  const role = str(body.role);
  if (!displayName || !role) {
    return NextResponse.json(
      { error: "displayName and role are required" },
      { status: 400 },
    );
  }

  try {
    const { contextId, did, steps } = await provisionParticipant({
      displayName,
      organization: str(body.organization),
      role,
      ehdsParticipantType: str(body.ehdsParticipantType),
    });
    return NextResponse.json(
      {
        tenantId: contextId,
        participantId: contextId,
        did,
        displayName,
        role,
        status: "provisioning",
        provisioned: true,
        steps,
      },
      { status: 201 },
    );
  } catch (err) {
    // A control plane that does not answer is a stopped stack (off hours,
    // ADR-053), not a refused registration: say so and record nothing.
    if (err instanceof ProvisioningError && err.unreachable) {
      return NextResponse.json(
        {
          error: "The provisioning stack is not running",
          detail:
            "The control plane did not answer, so nothing was registered. " +
            `${PROVISIONING_HOURS} Please register again then.`,
          upstreamError: err.message,
        },
        { status: 503 },
      );
    }
    // Detail first: "Failed to create participant" on its own reads as though
    // the form input were at fault (issue #203). The steps say what was
    // created and undone.
    console.error("Failed to create participant:", err);
    return NextResponse.json(
      {
        error: "Failed to create participant",
        detail: err instanceof Error ? err.message : String(err),
        ...(err instanceof ProvisioningError ? { steps: err.steps } : {}),
      },
      { status: 502 },
    );
  }
}
