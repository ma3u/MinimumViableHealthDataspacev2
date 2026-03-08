import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";

export async function GET() {
  const rows = await runQuery<{
    id: string;
    title: string;
    description: string;
    license: string;
    conformsTo: string;
    publisher: string;
    theme: string;
  }>(
    `MATCH (d:HealthDataset)
     OPTIONAL MATCH (p:Participant)-[:PUBLISHES]->(d)
     RETURN d.id AS id,
            d.title AS title,
            d.description AS description,
            d.license AS license,
            d.conformsTo AS conformsTo,
            coalesce(p.name, p.id) AS publisher,
            d.theme AS theme`,
  );

  return NextResponse.json(rows);
}
