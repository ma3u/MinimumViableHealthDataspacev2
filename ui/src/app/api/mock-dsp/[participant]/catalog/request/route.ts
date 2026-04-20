import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mock DSP 2025-1 `/catalog/request` endpoint.
 *
 * Phase 26b catalog-crawler hits this URL once every 5 minutes for each
 * participant whose `dspCatalogUrl` is pointed here. The response is a
 * realistic `dcat:Catalog` JSON-LD doc so the enricher can materialise
 * federated `(:HealthDataset {source:"federated"})` nodes and the
 * Phase 26d NLQ templates can actually return something.
 *
 * Stand-in for real per-participant DSP connectors — avoids having to
 * run five separate mock servers or beg AlphaKlinik for HTTPS infra.
 *
 * POST body is the crawler's empty QuerySpec; ignored. The `participant`
 * path param drives the catalog payload via MOCK_CATALOGS below.
 */

type Coding = { system: string; code: string; display: string };
interface MockDataset {
  id: string;
  title: string;
  description: string;
  theme: Coding;
  license: string;
  requiresCredential?: string;
}
interface MockPublisher {
  did: string;
  name: string;
  country: string;
  datasets: MockDataset[];
}

const SNOMED = "http://snomed.info/sct";
const LICENSE_CC_BY = "https://creativecommons.org/licenses/by/4.0/";

const MOCK_CATALOGS: Record<string, MockPublisher> = {
  "alpha-klinik": {
    did: "did:web:alpha-klinik.de:participant",
    name: "AlphaKlinik Berlin",
    country: "DE",
    datasets: [
      {
        id: "dataset:alpha:t2dm-registry-2026",
        title: "Type 2 Diabetes Registry — Berlin 2026",
        description:
          "Longitudinal registry of 2,400 T2DM patients with HbA1c, BMI, treatment arm, and 5-year follow-up. OMOP-mapped.",
        theme: {
          system: SNOMED,
          code: "44054006",
          display: "Diabetes mellitus type 2",
        },
        license: LICENSE_CC_BY,
        requiresCredential: "DataQualityLabelCredential",
      },
      {
        id: "dataset:alpha:cv-icu-2025",
        title: "Cardiovascular ICU Outcomes — AlphaKlinik 2025",
        description:
          "De-identified ICU admissions with primary cardiovascular diagnoses, 30-day mortality, and length-of-stay.",
        theme: {
          system: SNOMED,
          code: "49601007",
          display: "Disorder of cardiovascular system",
        },
        license: LICENSE_CC_BY,
      },
    ],
  },
  "limburg-medical": {
    did: "did:web:lmc.nl:clinic",
    name: "Limburg Medical Centre",
    country: "NL",
    datasets: [
      {
        id: "dataset:lmc:t2dm-crossborder-2026",
        title: "Cross-border T2DM Cohort — Limburg 2026",
        description:
          "Type 2 Diabetes patients managed across NL/DE/BE border region with shared care coordination records.",
        theme: {
          system: SNOMED,
          code: "44054006",
          display: "Diabetes mellitus type 2",
        },
        license: LICENSE_CC_BY,
        requiresCredential: "DataQualityLabelCredential",
      },
    ],
  },
  "pharmaco-research": {
    did: "did:web:pharmaco.de:research",
    name: "PharmaCo Research AG",
    country: "DE",
    datasets: [
      {
        id: "dataset:pharmaco:oncology-phase2-2025",
        title: "Oncology Phase II Trial — Immunotherapy Cohort",
        description:
          "Phase II clinical trial data for PD-L1 inhibitor, 180 participants, 18-month follow-up, RECIST 1.1 endpoints.",
        theme: {
          system: SNOMED,
          code: "363346000",
          display: "Malignant neoplastic disease",
        },
        license: LICENSE_CC_BY,
        requiresCredential: "DataQualityLabelCredential",
      },
    ],
  },
  "institut-recherche-sante": {
    did: "did:web:irs.fr:hdab",
    name: "Institut de Recherche Santé",
    country: "FR",
    datasets: [
      {
        id: "dataset:irs:rare-diseases-fr-2026",
        title: "French National Rare Disease Registry Extract",
        description:
          "Pseudonymised cohort of 4,200 rare-disease patients with ICD-10 + Orphanet codes and longitudinal encounters.",
        theme: { system: SNOMED, code: "49649001", display: "Rare disease" },
        license: LICENSE_CC_BY,
      },
    ],
  },
};

function buildCatalog(pub: MockPublisher) {
  return {
    "@context": {
      dcat: "http://www.w3.org/ns/dcat#",
      dct: "http://purl.org/dc/terms/",
      odrl: "http://www.w3.org/ns/odrl/2/",
    },
    "@type": "dcat:Catalog",
    "dct:title": `${pub.name} — DSP Catalog`,
    "dct:publisher": {
      "@id": pub.did,
      "foaf:name": pub.name,
      "dct:spatial": pub.country,
    },
    "dcat:dataset": pub.datasets.map((ds) => ({
      "@id": ds.id,
      "@type": "dcat:Dataset",
      "dct:title": ds.title,
      "dct:description": ds.description,
      "dct:license": ds.license,
      "dct:spatial": pub.country,
      "dcat:theme": [
        {
          system: ds.theme.system,
          code: ds.theme.code,
          display: ds.theme.display,
        },
      ],
      "odrl:hasPolicy": ds.requiresCredential
        ? {
            "@id": `policy:${ds.id}`,
            "@type": "odrl:Set",
            "odrl:permission": [
              {
                "odrl:action": "use",
                "odrl:constraint": [
                  {
                    "odrl:leftOperand": "holdsCredential",
                    "odrl:operator": "eq",
                    "odrl:rightOperand": ds.requiresCredential,
                  },
                ],
              },
            ],
            requiresCredential: ds.requiresCredential,
          }
        : null,
    })),
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ participant: string }> },
): Promise<NextResponse> {
  const { participant } = await params;
  const pub = MOCK_CATALOGS[participant];
  if (!pub) {
    return NextResponse.json(
      { error: `No mock catalog for '${participant}'` },
      { status: 404 },
    );
  }
  return NextResponse.json(buildCatalog(pub));
}

// GET mirror for manual browser inspection. Real DSP 2025-1 uses POST, but
// a GET makes debugging from curl trivial without remembering the empty body.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ participant: string }> },
): Promise<NextResponse> {
  const { participant } = await params;
  const pub = MOCK_CATALOGS[participant];
  if (!pub) {
    return NextResponse.json(
      {
        error: `No mock catalog for '${participant}'`,
        available: Object.keys(MOCK_CATALOGS),
      },
      { status: 404 },
    );
  }
  return NextResponse.json(buildCatalog(pub));
}
