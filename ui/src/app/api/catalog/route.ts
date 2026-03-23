import { NextRequest, NextResponse } from "next/server";
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
  providers: string[];
  consumers: string[];
  fhirResources: string[];
  transfers: string[];
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
       OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(pub:Participant)
       OPTIONAL MATCH (dp)-[:DESCRIBED_BY]->(d)
       OPTIONAL MATCH (d)-[:DESCRIBED_BY]->(dp2:DataProduct)
       WITH d, pub, coalesce(dp, dp2) AS product
       OPTIONAL MATCH (product)<-[:OFFERS]-(prov:Participant)
       OPTIONAL MATCH (product)<-[:CONSUMES]-(cons:Participant)
       OPTIONAL MATCH (fhir:Patient)-[:FROM_DATASET]->(d)
       OPTIONAL MATCH (dt:DataTransfer)-[:TRANSFERS]->(d)
       RETURN coalesce(d.id, d.datasetId)  AS id,
              d.title                   AS title,
              d.description             AS description,
              d.license                 AS license,
              d.conformsTo              AS conformsTo,
              coalesce(pub.name, pub.participantId) AS publisher,
              d.theme                   AS theme,
              d.hdcatapDatasetType      AS datasetType,
              d.hdcatapLegalBasisForAccess AS legalBasis,
              coalesce(d.hdcatapNumberOfRecords, d.statPatients) AS recordCount,
              collect(DISTINCT prov.name) AS providers,
              collect(DISTINCT cons.name) AS consumers,
              collect(DISTINCT fhir.name) AS fhirResources,
              collect(DISTINCT dt.name)   AS transfers`,
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

/** Create or update a HealthDCAT-AP dataset entry. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, description, publisher, ...rest } = body;

    if (!id || !title) {
      return NextResponse.json(
        { error: "id and title are required" },
        { status: 400 },
      );
    }

    // Try Neo4j first
    try {
      await runQuery(
        `MERGE (d:HealthDataset {id: $id})
         SET d.title                      = $title,
             d.description                = $description,
             d.license                    = $license,
             d.conformsTo                 = $conformsTo,
             d.theme                      = $theme,
             d.hdcatapDatasetType         = $datasetType,
             d.hdcatapLegalBasisForAccess  = $legalBasis,
             d.hdcatapNumberOfRecords      = $recordCount,
             d.hdcatapPersonalData         = $personalData,
             d.hdcatapSensitiveData        = $sensitiveData,
             d.hdcatapPurpose              = $purpose,
             d.hdcatapPopulationCoverage   = $populationCoverage,
             d.hdcatapNumberOfUniqueIndividuals = $numberOfUniqueIndividuals,
             d.hdcatapHealthCategory       = $healthCategory,
             d.hdcatapMinTypicalAge        = $minTypicalAge,
             d.hdcatapMaxTypicalAge        = $maxTypicalAge,
             d.hdcatapPublisherType        = $publisherType,
             d.language                    = $language,
             d.dctSpatial                  = $spatial,
             d.modifiedAt                  = datetime()
         WITH d
         MERGE (p:Participant {name: $publisher})
         MERGE (p)-[:PUBLISHES]->(d)`,
        {
          id,
          title,
          description: description ?? "",
          publisher: publisher ?? "",
          license: rest.license ?? "",
          conformsTo: rest.conformsTo ?? "",
          theme: rest.theme ?? "",
          datasetType: rest.datasetType ?? "",
          legalBasis: rest.legalBasis ?? "",
          recordCount: rest.recordCount ?? null,
          personalData: rest.personalData ?? false,
          sensitiveData: rest.sensitiveData ?? false,
          purpose: rest.purpose ?? "",
          populationCoverage: rest.populationCoverage ?? "",
          numberOfUniqueIndividuals: rest.numberOfUniqueIndividuals ?? null,
          healthCategory: rest.healthCategory ?? "",
          minTypicalAge: rest.minTypicalAge ?? null,
          maxTypicalAge: rest.maxTypicalAge ?? null,
          publisherType: rest.publisherType ?? "",
          language: rest.language ?? "en",
          spatial: rest.spatial ?? "",
        },
      );
      return NextResponse.json({ ok: true, id });
    } catch (neo4jErr) {
      console.warn(
        "Neo4j unavailable, falling back to mock catalog:",
        neo4jErr,
      );
    }

    // Fallback: append to mock JSON
    const mockPath = path.join(process.cwd(), "public", "mock", "catalog.json");
    let catalog: CatalogRow[] = [];
    try {
      const raw = await fs.readFile(mockPath, "utf-8");
      catalog = JSON.parse(raw);
    } catch {
      /* start fresh */
    }

    const entry: CatalogRow = {
      id,
      title,
      description: description ?? "",
      license: rest.license ?? "",
      conformsTo: rest.conformsTo ?? "",
      publisher: publisher ?? "",
      theme: rest.theme ?? "",
      datasetType: rest.datasetType ?? "",
      legalBasis: rest.legalBasis ?? "",
      recordCount: rest.recordCount ?? 0,
      providers: publisher ? [publisher] : [],
      consumers: [],
      fhirResources: [],
      transfers: [],
    };

    const idx = catalog.findIndex((c) => c.id === id);
    if (idx >= 0) {
      catalog[idx] = entry;
    } else {
      catalog.push(entry);
    }

    await fs.writeFile(mockPath, JSON.stringify(catalog, null, 2) + "\n");
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("POST /api/catalog error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** Delete a HealthDCAT-AP dataset entry. */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Try Neo4j first
  try {
    await runQuery(
      `MATCH (d:HealthDataset {id: $id})
       DETACH DELETE d`,
      { id },
    );
    return NextResponse.json({ ok: true });
  } catch (neo4jErr) {
    console.warn("Neo4j unavailable, falling back to mock catalog:", neo4jErr);
  }

  // Fallback: remove from mock JSON
  const mockPath = path.join(process.cwd(), "public", "mock", "catalog.json");
  try {
    const raw = await fs.readFile(mockPath, "utf-8");
    const catalog: CatalogRow[] = JSON.parse(raw);
    const filtered = catalog.filter((c) => c.id !== id);
    await fs.writeFile(mockPath, JSON.stringify(filtered, null, 2) + "\n");
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
