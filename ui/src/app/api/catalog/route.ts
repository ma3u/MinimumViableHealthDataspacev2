import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { Roles } from "@/lib/auth";
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
  healthCategories?: string[];
  populationCoverage?: string | null;
  numberOfUniqueIndividuals?: number | null;
  minTypicalAge?: number | null;
  maxTypicalAge?: number | null;
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
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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
              d.hdcatapHealthCategories AS healthCategories,
              d.hdcatapPopulationCoverage AS populationCoverage,
              d.hdcatapNumberOfUniqueIndividuals AS numberOfUniqueIndividuals,
              d.hdcatapMinTypicalAge    AS minTypicalAge,
              d.hdcatapMaxTypicalAge    AS maxTypicalAge,
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

/**
 * Write a dataset under the property names the proxy's HealthDCAT-AP
 * serialiser reads (services/neo4j-proxy/src/healthdcat-ap.ts), and give it
 * what Release 8 requires of every dataset, as
 * neo4j/register-healthdcat-ap-r8.cypher does for the seeded ones: so a
 * dataset saved here passes the official SHACL at once, not after the next
 * seed. What the holder states (the Art. 51 categories above all) wins over a
 * default; a default never overwrites a value.
 */
const UPSERT_DATASET = `
  MERGE (d:HealthDataset {datasetId: $id})
  SET d.id                         = $id,
      d.title                      = $title,
      d.description                = $description,
      d.license                    = $license,
      d.conformsTo                 = $conformsTo,
      d.theme                      = $theme,
      d.hdcatapDatasetType         = $datasetType,
      d.hdcatapLegalBasisForAccess = $legalBasis,
      d.hdcatapNumberOfRecords     = $recordCount,
      d.hdcatapPersonalData        = $personalData,
      d.hdcatapSensitiveData       = $sensitiveData,
      d.hdcatapPurpose             = $purpose,
      d.hdcatapPopulationCoverage  = $populationCoverage,
      d.hdcatapNumberOfUniqueIndividuals = $numberOfUniqueIndividuals,
      d.hdcatapMinTypicalAge       = $minTypicalAge,
      d.hdcatapMaxTypicalAge       = $maxTypicalAge,
      d.hdcatapPublisherType       = $publisherType,
      d.language                   = $language,
      d.dctSpatial                 = $spatial,
      d.modifiedAt                 = datetime()
  // The holder states the categories; the seed's rule applies only when none.
  FOREACH (_ IN CASE WHEN size($healthCategories) > 0 THEN [1] ELSE [] END |
    SET d.hdcatapHealthCategories = $healthCategories)
  SET d.hdcatapHealthCategories = coalesce(d.hdcatapHealthCategories, ['EHRS']),
      d.hdcatapAccessRights = coalesce(d.hdcatapAccessRights, 'NON_PUBLIC'),
      d.hdcatapApplicableLegislation = coalesce(d.hdcatapApplicableLegislation,
        ['http://data.europa.eu/eli/reg/2025/327/oj']),
      d.hdcatapDctType = coalesce(d.hdcatapDctType, 'SYNTHETIC_DATA'),
      d.hdcatapHasStructuredData = coalesce(d.hdcatapHasStructuredData, true),
      d.hdcatapKeywords = [k IN [$theme, $datasetType, 'EHDS secondary use'] WHERE k <> ''],
      d.hdcatapCodingSystems = coalesce(d.hdcatapCodingSystems,
        CASE WHEN toLower($conformsTo) CONTAINS 'omop'
             THEN ['OHDSI-VOCAB', 'SNOMED-CT', 'LOINC', 'RXNORM']
             ELSE ['SNOMED-CT', 'LOINC', 'ICD-10', 'RXNORM'] END),
      d.hdcatapProvenance = coalesce(d.hdcatapProvenance,
        'Described in the hub editor by its data holder.')
  WITH d
  // Link to the publisher only when a participant of that name already
  // exists. MERGE on the display name used to create one whenever the
  // name did not match exactly, leaving a :Participant carrying nothing
  // but a name: no DID, no relationships. One of those broke
  // /api/overview for the access body, because the HDAB view compacts
  // every participant id and a null id has no toLowerCase (#349).
  OPTIONAL MATCH (p:Participant)
    WHERE $publisher <> '' AND p.name = $publisher
  FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END |
    MERGE (d)-[:PUBLISHED_BY]->(p))
  WITH d
  // The access body: the one that governs it, else MedReg DE.
  OPTIONAL MATCH (hdab:Participant {participantId: 'did:web:medreg.de:hdab'})
  FOREACH (_ IN CASE WHEN hdab IS NULL OR EXISTS { MATCH (:Participant)-[:GOVERNS]->(d) }
                     THEN [] ELSE [1] END |
    MERGE (hdab)-[:GOVERNS]->(d))
  WITH d
  // A distribution where access is asked for, under the Regulation.
  MERGE (x:Distribution {distributionId: 'dist:' + $id + ':access'})
    ON CREATE SET x.title = $title + ' (access through the health data access body)',
                  x.format = 'JSON-LD'
  SET x.accessURL = coalesce(x.accessURL,
        'https://ehds.mabu.red/data/discover?dataset=' + apoc.text.urlencode($id)),
      x.hdcatapApplicableLegislation = coalesce(x.hdcatapApplicableLegislation,
        ['http://data.europa.eu/eli/reg/2025/327/oj'])
  MERGE (d)-[:HAS_DISTRIBUTION]->(x)
  WITH d
  // A contact point at the holder, and the variables of its standard.
  OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(holder:Participant)
  WITH d, coalesce(holder.name, 'Health Dataspace Data Steward') AS owner
  WITH d, owner, toLower(apoc.text.regreplace(owner, '[^A-Za-z0-9]+', '-')) AS slug
  MERGE (cp:ContactPoint {contactId: 'contact:' + slug})
    ON CREATE SET cp.name = owner + ' data access desk',
                  cp.email = 'data-access@' + slug + '.example'
  MERGE (d)-[:HAS_CONTACT_POINT]->(cp)
  WITH d
  OPTIONAL MATCH (tg:VariablesTableGroup {groupId:
    CASE WHEN toLower($conformsTo) CONTAINS 'omop' THEN 'vars:omop-cdm-54' ELSE 'vars:fhir-r4' END})
  FOREACH (_ IN CASE WHEN tg IS NULL THEN [] ELSE [1] END |
    MERGE (d)-[:HAS_VARIABLES]->(tg))`;

/** Create or update a HealthDCAT-AP dataset entry. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth([Roles.DATA_HOLDER, Roles.EDC_ADMIN]);
  if (isAuthError(auth)) return auth;

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
      await runQuery(UPSERT_DATASET, {
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
        populationCoverage: rest.populationCoverage || null,
        numberOfUniqueIndividuals: rest.numberOfUniqueIndividuals ?? null,
        healthCategories: Array.isArray(rest.healthCategories)
          ? rest.healthCategories.map(String)
          : [],
        minTypicalAge: rest.minTypicalAge ?? null,
        maxTypicalAge: rest.maxTypicalAge ?? null,
        publisherType: rest.publisherType ?? "",
        language: rest.language ?? "en",
        spatial: rest.spatial ?? "",
      });
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
  const auth = await requireAuth([Roles.DATA_HOLDER, Roles.EDC_ADMIN]);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Try Neo4j first
  try {
    await runQuery(
      `MATCH (d:HealthDataset)
       WHERE d.datasetId = $id OR d.id = $id
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
