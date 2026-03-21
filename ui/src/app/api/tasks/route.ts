import { NextResponse } from "next/server";
import { edcClient, EDC_CONTEXT } from "@/lib/edc";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/* ── Helpers ── */

/** Read a field from an EDC object that may be edc:-prefixed or unprefixed */
function f(obj: Record<string, unknown>, field: string): string {
  return (obj[field] ?? obj[`edc:${field}`] ?? "") as string;
}

/**
 * Approved fictional participants — DID slug → display name.
 * Matches the lookup in participants/route.ts and negotiate/page.tsx.
 */
const SLUG_NAMES: Record<string, string> = {
  "alpha-klinik": "AlphaKlinik Berlin",
  pharmaco: "PharmaCo Research AG",
  medreg: "MedReg DE",
  lmc: "Limburg Medical Centre",
  irs: "Institut de Recherche Santé",
};

function didToName(did: string): string {
  const slug = decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
  return SLUG_NAMES[slug] || slug || did.slice(0, 16);
}

function assetLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Types ── */

interface Task {
  id: string;
  type: "negotiation" | "transfer";
  participant: string; // human-readable participant name
  participantId: string; // UUID context ID
  asset: string; // human-readable asset name
  assetId: string; // raw asset ID
  state: string; // DSP state (REQUESTED, STARTED, FINALIZED, COMPLETED, etc.)
  counterParty: string; // human-readable counter-party name
  timestamp: number; // last state update
  contractId?: string; // contract agreement ID (if available)
  transferType?: string; // e.g. HttpData-PULL
  edrAvailable?: boolean; // DPS: true when contentDataAddress has an endpoint (transfer STARTED)
}

interface EdcParticipant {
  "@id": string;
  participantId?: string;
  identity?: string;
  [key: string]: unknown;
}

/**
 * GET /api/tasks — Aggregate all negotiations and transfers across
 * all participant contexts into a unified task list.
 *
 * Aligns with the EDC Data Plane Signaling (DPS) framework:
 * - Negotiations follow DSP: REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED
 * - Transfers follow DSP: REQUESTED → STARTED → SUSPENDED → COMPLETED
 * - EDR availability is checked for STARTED transfers via contentDataAddress
 *
 * Returns: { tasks: Task[], counts: { total, negotiations, transfers, active } }
 */
export async function GET() {
  try {
    // 1. List all participant contexts
    const participants = await edcClient.management<EdcParticipant[]>(
      "/v5alpha/participants",
    );

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({
        tasks: [],
        counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
      });
    }

    const tasks: Task[] = [];

    // 2. For each participant, fetch negotiations + transfers in parallel
    //    (all participants included — HDABs can have negotiations too)
    await Promise.all(
      participants.map(async (p) => {
        const ctxId = p["@id"];
        const did = (p.participantId || p.identity || ctxId) as string;
        const pName = didToName(did);

        const [negotiations, transfers] = await Promise.all([
          edcClient
            .management<Record<string, unknown>[]>(
              `/v5alpha/participants/${ctxId}/contractnegotiations/request`,
              "POST",
              {
                "@context": [EDC_CONTEXT],
                "@type": "QuerySpec",
                filterExpression: [],
              },
            )
            .catch(() => []),
          edcClient
            .management<Record<string, unknown>[]>(
              `/v5alpha/participants/${ctxId}/transferprocesses/request`,
              "POST",
              {
                "@context": [EDC_CONTEXT],
                "@type": "QuerySpec",
                filterExpression: [],
              },
            )
            .catch(() => []),
        ]);

        // Map negotiations → tasks
        if (Array.isArray(negotiations)) {
          for (const n of negotiations) {
            const state = f(n, "state");
            const assetId = f(n, "assetId");
            const counterPartyId = f(n, "counterPartyId");
            const ts = (n.stateTimestamp ??
              n["edc:stateTimestamp"] ??
              0) as number;

            tasks.push({
              id: n["@id"] as string,
              type: "negotiation",
              participant: pName,
              participantId: ctxId,
              asset: assetId ? assetLabel(assetId) : "Unknown Asset",
              assetId,
              state,
              counterParty: counterPartyId ? didToName(counterPartyId) : "—",
              timestamp: ts,
              contractId: f(n, "contractAgreementId") || undefined,
            });
          }
        }

        // Map transfers → tasks (with DPS EDR indicator)
        if (Array.isArray(transfers)) {
          for (const t of transfers) {
            const state = f(t, "state");
            const assetId = (t.assetId as string) || f(t, "assetId");
            const ts = (t.stateTimestamp ??
              t["edc:stateTimestamp"] ??
              0) as number;
            const contractId = f(t, "contractId");

            // Resolve counter-party from the transfer's counterPartyAddress or correlationId
            const counterPartyAddr = f(t, "counterPartyAddress");
            const counterPartyId = f(t, "counterPartyId");
            let counterParty = "—";
            if (counterPartyId) {
              counterParty = didToName(counterPartyId);
            } else if (counterPartyAddr) {
              // Extract DID-like slug from DSP address
              const match = counterPartyAddr.match(/\/([^/]+)\/dsp/);
              if (match) counterParty = match[1];
            }

            // DPS: Check contentDataAddress for EDR availability
            // When the Control Plane signals the Data Plane via DPS /api/control/v1/dataflows,
            // the Data Plane writes back an EDR with endpoint + authorization token
            const cda = t.contentDataAddress as
              | Record<string, unknown>
              | undefined;
            const edrEndpoint =
              cda?.["https://w3id.org/edc/v0.0.1/ns/endpoint"] ??
              cda?.["edc:endpoint"] ??
              cda?.endpoint;
            const edrAvailable =
              !!edrEndpoint && state?.toUpperCase() === "STARTED";

            tasks.push({
              id: t["@id"] as string,
              type: "transfer",
              participant: pName,
              participantId: ctxId,
              asset: assetId ? assetLabel(assetId) : "Unknown Asset",
              assetId,
              state,
              counterParty,
              timestamp: ts,
              contractId: contractId || undefined,
              transferType: f(t, "transferType") || "HttpData-PULL",
              edrAvailable,
            });
          }
        }
      }),
    );

    // 3. Sort by timestamp descending (newest first)
    tasks.sort((a, b) => b.timestamp - a.timestamp);

    // 4. Sync tasks to persistent storage (neo4j-proxy → PostgreSQL)
    const NEO4J_PROXY = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";
    try {
      await fetch(`${NEO4J_PROXY}/tasks/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasks.map((t) => ({
            id: t.id,
            type: t.type,
            participant: t.participant,
            participant_id: t.participantId,
            asset: t.asset,
            asset_id: t.assetId,
            state: t.state,
            counter_party: t.counterParty,
            timestamp_ms: t.timestamp,
            contract_id: t.contractId ?? null,
            transfer_type: t.transferType ?? null,
            edr_available: t.edrAvailable ?? false,
          })),
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Sync best-effort — don't fail the request
    }

    // 5. Compute counts
    const active = tasks.filter(
      (t) =>
        !["FINALIZED", "COMPLETED", "TERMINATED", "ERROR"].includes(
          t.state?.toUpperCase() || "",
        ),
    ).length;

    return NextResponse.json({
      tasks,
      counts: {
        total: tasks.length,
        negotiations: tasks.filter((t) => t.type === "negotiation").length,
        transfers: tasks.filter((t) => t.type === "transfer").length,
        active,
      },
    });
  } catch (err) {
    console.error("Failed to aggregate tasks from EDC-V:", err);

    // Fall back to persistent task storage (PostgreSQL via neo4j-proxy)
    const NEO4J_PROXY = process.env.NEO4J_PROXY_URL ?? "http://localhost:9090";
    try {
      const fallbackRes = await fetch(`${NEO4J_PROXY}/tasks`, {
        signal: AbortSignal.timeout(5000),
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return NextResponse.json(data);
      }
    } catch {
      // Both EDC-V and persistent storage unavailable
    }

    // Fall back to bundled mock data so the UI works offline
    try {
      const mockPath = path.join(process.cwd(), "public", "mock", "tasks.json");
      const raw = await fs.readFile(mockPath, "utf-8");
      const mock = JSON.parse(raw);
      console.warn("EDC-V offline — serving mock tasks");
      return NextResponse.json(mock);
    } catch {
      // Mock file not available either
    }

    return NextResponse.json(
      {
        error: "Failed to aggregate tasks",
        tasks: [],
        counts: { total: 0, negotiations: 0, transfers: 0, active: 0 },
      },
      { status: 502 },
    );
  }
}
