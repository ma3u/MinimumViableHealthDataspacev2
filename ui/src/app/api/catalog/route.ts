import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface CatalogRow {
  id: string;
  title: string;
  description: string;
  license: string;
  conformsTo: string;
  publisher: string;
  theme: string;
  datasetType: string;
  legalBasis: string;
  recordCount: number;
}

/** Load demo catalog entries from the bundled mock JSON file. */
async function loadMockCatalog(): Promise<CatalogRow[]> {
  try {
    const mockPath = path.join(process.cwd(), "public", "mock", "catalog.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw) as CatalogRow[];
  } catch {
    return [];
  }
}

export async function GET() {
  let realRows: CatalogRow[] = [];
  try {
    realRows = await runQuery<CatalogRow>(
      `MATCH (d:HealthDataset)
       OPTIONAL MATCH (p)-[:PUBLISHES|OWNS_DATASET]->(d)
       RETURN d.id                      AS id,
              d.title                   AS title,
              d.description             AS description,
              d.license                 AS license,
              d.conformsTo              AS conformsTo,
              coalesce(p.name, p.id)    AS publisher,
              d.theme                   AS theme,
              d.hdcatapDatasetType      AS datasetType,
              d.hdcatapLegalBasisForAccess AS legalBasis,
              coalesce(d.hdcatapNumberOfRecords, d.statPatients) AS recordCount`,
    );
  } catch (err) {
    console.warn("Neo4j catalog query unavailable, using demo data:", err);
  }

  // Merge with demo catalog so the catalog page is always demonstrable
  const mockCatalog = await loadMockCatalog();
  const realIds = new Set(realRows.map((r) => r.id));
  const deduped = mockCatalog.filter((m) => !realIds.has(m.id));
  const merged = [...realRows, ...deduped];

  return NextResponse.json(merged);
}
