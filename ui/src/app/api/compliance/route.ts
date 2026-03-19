import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { edcClient } from "@/lib/edc";

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
  const { searchParams } = new URL(req.url);
  const consumerId = searchParams.get("consumerId");
  const datasetId = searchParams.get("datasetId");

  // List mode: return available consumers and datasets for the UI dropdowns
  if (!consumerId || !datasetId) {
    const [consumers, datasets] = await Promise.all([
      runQuery<{ id: string; name: string; type: string }>(
        `MATCH (p:Participant)-[:SUBMITTED]->(:AccessApplication)
         RETURN coalesce(p.participantId, p.id) AS id,
                p.name                          AS name,
                p.participantType               AS type
         ORDER BY p.name`,
      ),
      runQuery<{ id: string; title: string }>(
        `MATCH (approval:HDABApproval)-[:GRANTS_ACCESS_TO]->(ds:HealthDataset)
         RETURN coalesce(ds.id, ds.datasetId) AS id,
                coalesce(ds.title, ds.name)   AS title
         ORDER BY ds.title`,
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
      if (graphDatasets.length > 0) {
        finalDatasets = graphDatasets;
      }
    }

    return NextResponse.json({
      consumers: finalConsumers,
      datasets: finalDatasets,
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
