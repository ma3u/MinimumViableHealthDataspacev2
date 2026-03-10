import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ consumers, datasets });
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
