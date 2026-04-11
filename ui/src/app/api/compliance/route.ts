import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { edcClient } from "@/lib/edc";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Approved fictional participants — DID slug → display info.
 * Used as fallback when no Participant nodes exist in Neo4j.
 */
const SLUG_DISPLAY: Record<string, { name: string; type: string }> = {
  "alpha-klinik": { name: "AlphaKlinik Berlin", type: "DATA_HOLDER" },
  pharmaco: { name: "PharmaCo Research AG", type: "DATA_USER" },
  medreg: { name: "MedReg DE", type: "HDAB" },
  lmc: { name: "Limburg Medical Centre", type: "DATA_HOLDER" },
  irs: { name: "Institut de Recherche Santé", type: "HDAB" },
};

function didSlug(did: string): string {
  return decodeURIComponent(did).split(":").pop()?.toLowerCase() ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const consumerId = searchParams.get("consumerId");
  const datasetId = searchParams.get("datasetId");

  // List mode: return participants, datasets, and the full compliance matrix
  if (!consumerId || !datasetId) {
    const [consumers, datasets, matrixRows] = await Promise.all([
      // Show ALL participants (not just those with access applications)
      runQuery<{ id: string; name: string; type: string }>(
        `MATCH (p:Participant)
         WHERE p.name IS NOT NULL AND p.name <> ''
         RETURN DISTINCT
                coalesce(p.participantId, p.id) AS id,
                p.name                          AS name,
                p.participantType               AS type
         ORDER BY p.name`,
      ),
      // Show ALL datasets (not just those with HDAB approvals)
      runQuery<{ id: string; title: string }>(
        `MATCH (ds:HealthDataset)
         WHERE ds.title IS NOT NULL OR ds.name IS NOT NULL
         RETURN DISTINCT
                coalesce(ds.id, ds.datasetId)   AS id,
                coalesce(ds.title, ds.name)     AS title
         ORDER BY title`,
      ),
      // Compliance matrix: for every participant, check what chain elements exist
      runQuery<{
        consumerId: string;
        consumerName: string;
        consumerType: string;
        hasApplication: boolean;
        applicationStatus: string | null;
        hasApproval: boolean;
        approvalStatus: string | null;
        datasetId: string | null;
        datasetTitle: string | null;
        hasContract: boolean;
        ehdsArticle: string | null;
      }>(
        `MATCH (p:Participant)
         WHERE p.name IS NOT NULL AND p.name <> ''
         WITH DISTINCT p
         OPTIONAL MATCH (p)-[:SUBMITTED]->(app:AccessApplication)
         OPTIONAL MATCH (approval:HDABApproval)-[:APPROVES]->(app)
         OPTIONAL MATCH (approval)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
         OPTIONAL MATCH (contract:Contract)-[:GOVERNS]->(dp:DataProduct)-[:DESCRIBED_BY]->(ds)
         RETURN coalesce(p.participantId, p.id) AS consumerId,
                p.name                          AS consumerName,
                p.participantType               AS consumerType,
                app IS NOT NULL                 AS hasApplication,
                app.status                      AS applicationStatus,
                approval IS NOT NULL            AS hasApproval,
                approval.status                 AS approvalStatus,
                coalesce(ds.id, ds.datasetId)   AS datasetId,
                coalesce(ds.title, ds.name)     AS datasetTitle,
                contract IS NOT NULL            AS hasContract,
                approval.ehdsArticle            AS ehdsArticle
         ORDER BY p.name`,
      ),
    ]);

    // If Neo4j has no consumers, fall back to EDC-V activated participants
    let finalConsumers = consumers;
    if (consumers.length === 0) {
      try {
        const participants = await edcClient.management<
          { "@id": string; identity?: string; state?: string }[]
        >("/v5alpha/participants");
        const active = (Array.isArray(participants) ? participants : []).filter(
          (p) => (p.state ?? "ACTIVATED") === "ACTIVATED",
        );
        finalConsumers = active.map((p) => {
          const did = p.identity ?? p["@id"];
          const slug = didSlug(did);
          const info = SLUG_DISPLAY[slug];
          return {
            id: p["@id"],
            name: info?.name ?? slug ?? p["@id"].slice(0, 12),
            type: info?.type ?? "PARTICIPANT",
          };
        });
      } catch {
        // EDC-V also unavailable — keep empty
      }
    }

    // If Neo4j has no datasets, provide discoverable HealthDatasets
    let finalDatasets = datasets;
    if (datasets.length === 0) {
      const graphDatasets = await runQuery<{ id: string; title: string }>(
        `MATCH (ds:HealthDataset)
         RETURN coalesce(ds.id, ds.datasetId) AS id,
                coalesce(ds.title, ds.name)   AS title
         ORDER BY ds.title`,
      );
      if (graphDatasets && graphDatasets.length > 0) {
        finalDatasets = graphDatasets;
      }
    }

    return NextResponse.json({
      consumers: finalConsumers,
      datasets: finalDatasets,
      matrix: matrixRows,
    });
  }

  // Check mode: walk the EHDS approval chain for the given consumer + dataset
  const rows = await runQuery<{
    consumer: string;
    applicationId: string;
    applicationStatus: string;
    approvalId: string;
    approvalStatus: string;
    ehdsArticle: string;
    dataset: string;
    contract: string;
  }>(
    `MATCH (consumer:Participant)
     WHERE coalesce(consumer.participantId, consumer.id) = $consumerId
     MATCH (consumer)-[:SUBMITTED]->(app:AccessApplication)
     MATCH (approval:HDABApproval)-[:APPROVES]->(app)
     MATCH (approval)-[:GRANTS_ACCESS_TO]->(dataset:HealthDataset)
     WHERE coalesce(dataset.id, dataset.datasetId) = $datasetId
     OPTIONAL MATCH (contract:Contract)-[:GOVERNS]->(dp:DataProduct)-[:DESCRIBED_BY]->(dataset)
     RETURN coalesce(consumer.participantId, consumer.id)  AS consumer,
            app.applicationId                              AS applicationId,
            app.status                                     AS applicationStatus,
            approval.approvalId                            AS approvalId,
            approval.status                                AS approvalStatus,
            approval.ehdsArticle                           AS ehdsArticle,
            coalesce(dataset.id, dataset.datasetId)        AS dataset,
            contract.contractId                            AS contract`,
    { consumerId, datasetId },
  );

  return NextResponse.json({ compliant: rows.length > 0, chain: rows });
}
