import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const consumerId = searchParams.get("consumerId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";

  // EHDS Articles 45-52 approval chain query (Section 9.6 of graph schema)
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
    `MATCH (consumer:Participant {id: $consumerId})
     -[:SUBMITTED]->(app:AccessApplication)
     -[:REVIEWED_BY]->(approval:HDABApproval)
     -[:GRANTS_ACCESS_TO]->(dataset:HealthDataset {id: $datasetId})
     OPTIONAL MATCH (contract:Contract)-[:GOVERNS]->(dataset)
     RETURN consumer.id AS consumer,
            app.id AS applicationId,
            app.status AS applicationStatus,
            approval.id AS approvalId,
            approval.status AS approvalStatus,
            approval.ehdsArticle AS ehdsArticle,
            dataset.id AS dataset,
            contract.id AS contract`,
    { consumerId, datasetId },
  );

  return NextResponse.json({ compliant: rows.length > 0, chain: rows });
}
