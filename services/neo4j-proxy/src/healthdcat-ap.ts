/**
 * HealthDCAT-AP Release 8 JSON-LD for the catalogue (#700, ADR-063).
 *
 * https://data.health.europa.eu/healthdcat-ap/releases/release-8/ extends
 * DCAT-AP 3.0 for the EHDS; Implementing Regulation (EU) 2026/2098 makes it the
 * form of every dataset description (Art. 77(4)). The values come from the
 * graph (neo4j/register-healthdcat-ap-r8.cypher writes them as vocabulary
 * codes); this module turns them into the vocabularies' IRIs and types every
 * object the way the official SHACL ranges expect. Every dataset the hub
 * serves is non-public, health data reached through an access body, and is
 * checked against the non-public shapes (scripts/healthdcat-ap/validate.py).
 */

/** Release 8 namespaces. */
export const HEALTHDCAT_AP_CONTEXT = {
  adms: "http://www.w3.org/ns/adms#",
  csvw: "http://www.w3.org/ns/csvw#",
  cv: "http://data.europa.eu/m8g/",
  dcat: "http://www.w3.org/ns/dcat#",
  dcatap: "http://data.europa.eu/r5r/",
  dct: "http://purl.org/dc/terms/",
  dpv: "https://w3id.org/dpv#",
  eli: "http://data.europa.eu/eli/ontology#",
  foaf: "http://xmlns.com/foaf/0.1/",
  geodcatap: "http://data.europa.eu/930/",
  healthdcatap: "http://healthdataportal.eu/ns/health#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  vcard: "http://www.w3.org/2006/vcard/ns#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
} as const;

export const RELEASE = "HealthDCAT-AP Release 8";

/** The Regulation every description and distribution names. */
export const EHDS_ELI = "http://data.europa.eu/eli/reg/2025/327/oj";

const NAL = {
  healthCategory:
    "https://hdeu-dcat.data.health.europa.eu/resource/authority/healthcategories/",
  codingSystem:
    "https://hdeu-dcat.data.health.europa.eu/resource/authority/coding-system/",
  accessRight: "http://publications.europa.eu/resource/authority/access-right/",
  datasetType: "http://publications.europa.eu/resource/authority/dataset-type/",
  dataTheme: "http://publications.europa.eu/resource/authority/data-theme/",
  fileType: "http://publications.europa.eu/resource/authority/file-type/",
  healthTheme:
    "https://hdeu-dcat.data.health.europa.eu/resource/authority/health-theme/",
  language: "http://publications.europa.eu/resource/authority/language/",
  standard:
    "https://hdeu-dcat.data.health.europa.eu/resource/authority/standard/",
  mediaType: "https://www.iana.org/assignments/media-types/",
};

/** A format as the graph writes it, to the EU file-type vocabulary. */
const FILE_TYPES: [RegExp, string][] = [
  [/json-ld|ld\+json/i, "JSON_LD"],
  [/parquet/i, "PARQUET"],
  [/turtle/i, "RDF_TURTLE"],
  [/csv/i, "CSV"],
  [/json|fhir/i, "JSON"],
];

/** A standard as the graph writes it, to the HealthDCAT-AP Standard vocabulary. */
const STANDARDS: [RegExp, string][] = [
  [/omop|ohdsi/i, "OMOP-CDM"],
  [/fhir/i, "FHIR"],
];

function fromList(table: [RegExp, string][], v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return table.find(([re]) => re.test(String(v)))?.[1];
}

/** dct:format: the file-type IRI, or nothing for a format the vocabulary lacks. */
function fileType(...values: unknown[]) {
  for (const v of values) {
    const code = fromList(FILE_TYPES, v);
    if (code) return iri(NAL.fileType + code);
  }
  return undefined;
}

/** dct:conformsTo: the Standard IRI, typed as the range asks. */
function standard(v: unknown) {
  const code = fromList(STANDARDS, v);
  return code
    ? { "@id": NAL.standard + code, "@type": "dct:Standard" }
    : undefined;
}

/** dcat:mediaType: an IANA media type as its registry IRI. */
function mediaType(...values: unknown[]) {
  const mt = values
    .map((v) => String(v ?? ""))
    .find((v) => /^[a-z]+\/[\w.+-]+$/i.test(v));
  return mt ? iri(NAL.mediaType + mt) : undefined;
}

/** Where a dataset's description lives; the IRI of the dcat:Dataset. */
const BASE = process.env.CATALOG_BASE_URL ?? "https://ehds.mabu.red";
/** Where the public information of the access body is (Art. 58). */
const HDAB_PAGE = `${BASE}/information`;

type Props = Record<string, unknown>;

export interface VariablesColumn {
  name: string;
  title: string;
  description: string;
  datatype: string;
}
export interface VariablesTable {
  tableId: string;
  name: string;
  title: string;
  columns: VariablesColumn[];
}
export interface VariablesGroup {
  groupId: string;
  title: string;
  tables: VariablesTable[];
}

/** One dataset as the catalogue query returns it. */
export interface DatasetRecord {
  ds: Props;
  distributions: Props[];
  publisher: Props | null;
  contact: Props | null;
  hdab: Props | null;
  variables: VariablesGroup[];
}

const iri = (id: string) => ({ "@id": id });
const DPV = "https://w3id.org/dpv#";
const nonNegative = (v: unknown) => {
  const n = Number((v as { toNumber?: () => number })?.toNumber?.() ?? v);
  return Number.isFinite(n) && n >= 0
    ? { "@value": String(Math.trunc(n)), "@type": "xsd:nonNegativeInteger" }
    : undefined;
};
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The IRI of a dataset's description. */
export function datasetIri(id: string): string {
  return `${BASE}/catalog/datasets/${encodeURIComponent(id)}`;
}

function agent(p: Props, role: string) {
  const name = String(p.name ?? p.legalName ?? role);
  const id = String(p.participantId ?? p.did ?? `${BASE}/agents/${slug(name)}`);
  return {
    "@id":
      id.startsWith("http") || id.startsWith("did:")
        ? id
        : `${BASE}/agents/${slug(id)}`,
    "@type": "foaf:Agent",
    "foaf:name": name,
  };
}

function variablesGroup(g: VariablesGroup) {
  return {
    "@id": `${BASE}/catalog/variables/${encodeURIComponent(g.groupId)}`,
    "@type": "csvw:TableGroup",
    "dct:title": g.title,
    "csvw:table": g.tables.map((t) => ({
      "@id": `${BASE}/catalog/variables/${encodeURIComponent(t.tableId)}`,
      "@type": "csvw:Table",
      "dct:title": t.title,
      "csvw:column": t.columns.map((c) => ({
        "@type": "csvw:Column",
        "csvw:name": c.name,
        "csvw:title": c.title,
        "dct:description": c.description,
        "csvw:datatype": c.datatype,
      })),
    })),
  };
}

/** A dcat:Dataset in Release 8, for the non-public profile. */
export function toDataset(r: DatasetRecord): Record<string, unknown> {
  const ds = r.ds;
  const id = String(ds.dctIdentifier ?? ds.datasetId);
  const legislation = list(ds.hdcatapApplicableLegislation);
  const structured = ds.hdcatapHasStructuredData !== false;
  const out: Record<string, unknown> = {
    "@id": datasetIri(id),
    "@type": "dcat:Dataset",
    "dct:identifier": id,
    "dct:title": ds.title,
    "dct:description": ds.description ?? ds.title,
    "dct:accessRights": iri(
      NAL.accessRight + String(ds.hdcatapAccessRights ?? "NON_PUBLIC"),
    ),
    "dcatap:applicableLegislation": (legislation.length
      ? legislation
      : [EHDS_ELI]
    ).map((l) => ({ "@id": l, "@type": "eli:LegalResource" })),
    "dct:type": iri(
      NAL.datasetType + String(ds.hdcatapDctType ?? "SYNTHETIC_DATA"),
    ),
    "dcat:theme": iri(NAL.dataTheme + "HEAL"),
    "dcat:keyword": list(ds.hdcatapKeywords),
    "dct:provenance": {
      "@type": "dct:ProvenanceStatement",
      "rdfs:label": String(ds.hdcatapProvenance ?? "Synthetic data"),
    },
    "healthdcatap:healthCategory": list(ds.hdcatapHealthCategories).map(
      (c) => ({
        "@id": NAL.healthCategory + c,
        "@type": "skos:Concept",
      }),
    ),
    "healthdcatap:healthTheme": list(ds.hdcatapHealthThemes).map((c) => ({
      "@id": NAL.healthTheme + c,
      "@type": "skos:Concept",
    })),
    "dct:language": iri(NAL.language + "ENG"),
    "dcat:landingPage": {
      "@id": `${BASE}/data/discover?dataset=${encodeURIComponent(id)}`,
      "@type": "foaf:Document",
    },
    // Offered for secondary use under an Art. 68 data permit, for research.
    "dpv:hasPurpose": {
      "@id": `${DPV}ScientificResearch`,
      "@type": "dpv:Purpose",
    },
    "dpv:hasLegalBasis": {
      "@id": `${BASE}/legal-basis/ehds-data-permit`,
      "@type": "dpv:LegalBasis",
      "rdfs:label":
        "Data permit of a health data access body, Regulation (EU) 2025/327, Art. 68",
      "dct:source": iri(EHDS_ELI),
    },
    "healthdcatap:hasCodingSystem": list(ds.hdcatapCodingSystems).map((c) => ({
      "@id": NAL.codingSystem + c,
      "@type": "dct:Standard",
    })),
    "healthdcatap:hasStructuredData": {
      "@value": String(structured),
      "@type": "xsd:boolean",
    },
    "healthdcatap:numberOfRecords": nonNegative(ds.hdcatapNumberOfRecords),
    "healthdcatap:numberOfUniqueIndividuals": nonNegative(
      ds.hdcatapNumberOfUniqueIndividuals,
    ),
    "healthdcatap:minTypicalAge": nonNegative(ds.hdcatapMinTypicalAge),
    "healthdcatap:maxTypicalAge": nonNegative(ds.hdcatapMaxTypicalAge),
    "dct:temporal":
      ds.dctTemporalStart && ds.dctTemporalEnd
        ? {
            "@type": "dct:PeriodOfTime",
            "dcat:startDate": {
              "@value": String(ds.dctTemporalStart),
              "@type": "xsd:date",
            },
            "dcat:endDate": {
              "@value": String(ds.dctTemporalEnd),
              "@type": "xsd:date",
            },
          }
        : undefined,
    "dct:issued": ds.issued,
    "dct:modified": ds.modified,
    "dct:conformsTo": standard(ds.conformsTo),
  };
  if (structured && r.variables.length) {
    out["healthdcatap:hasVariables"] = r.variables.map(variablesGroup);
  }
  // An agent is shared by many datasets: its contact point has its own IRI,
  // so every dataset that names the agent names the same single contact point
  // (the shapes allow exactly one per agent).
  if (r.hdab) {
    const a = agent(r.hdab, "Health data access body");
    out["healthdcatap:hdab"] = {
      ...a,
      "cv:contactPoint": {
        "@id": `${a["@id"]}#contact-point`,
        "@type": "cv:ContactPoint",
        "cv:contactPage": iri(HDAB_PAGE),
      },
    };
  }
  if (r.publisher) {
    const a = agent(r.publisher, "Health data holder");
    // The holder keeps the data: it is also the custodian (geodcatap:custodian).
    out["geodcatap:custodian"] = { "@id": a["@id"] };
    out["dct:publisher"] = {
      ...a,
      "cv:contactPoint": {
        "@id": `${a["@id"]}#contact-point`,
        "@type": "cv:ContactPoint",
        ...(r.contact?.email
          ? { "cv:email": String(r.contact.email) }
          : { "cv:contactPage": iri(HDAB_PAGE) }),
      },
    };
  }
  if (r.contact) {
    out["dcat:contactPoint"] = {
      "@type": "vcard:Kind",
      "vcard:fn": r.contact.name,
      ...(r.contact.email
        ? { "vcard:hasEmail": iri(`mailto:${r.contact.email}`) }
        : { "vcard:hasURL": iri(HDAB_PAGE) }),
    };
  }
  out["dcat:distribution"] = r.distributions.map((d) => {
    const dl = list(d.hdcatapApplicableLegislation);
    return {
      "@type": "dcat:Distribution",
      "dcat:accessURL": d.accessURL ? iri(String(d.accessURL)) : undefined,
      "dcat:downloadURL": d.downloadURL
        ? iri(String(d.downloadURL))
        : undefined,
      "dcatap:applicableLegislation": (dl.length ? dl : [EHDS_ELI]).map(
        (l) => ({
          "@id": l,
          "@type": "eli:LegalResource",
        }),
      ),
      "dcat:mediaType": mediaType(d.mediaType, d.format),
      "dct:format": fileType(d.format, d.mediaType),
      "dct:conformsTo": standard(d.conformsTo),
      "dct:title": d.title ?? d.name,
    };
  });
  return out;
}

/** The dcat:Catalog with its datasets. */
export function toCatalog(records: DatasetRecord[]): Record<string, unknown> {
  return {
    "@context": HEALTHDCAT_AP_CONTEXT,
    "@id": `${BASE}/catalog`,
    "@type": "dcat:Catalog",
    "dct:title": "EHDS integration hub, HealthDCAT-AP catalogue",
    "dct:description": `Health datasets of the hub, described in ${RELEASE}. All are synthetic.`,
    "dcatap:applicableLegislation": {
      "@id": EHDS_ELI,
      "@type": "eli:LegalResource",
    },
    "dct:conformsTo": iri(
      "https://data.health.europa.eu/healthdcat-ap/releases/release-8/",
    ),
    "dcat:themeTaxonomy": iri(
      "http://publications.europa.eu/resource/authority/data-theme",
    ),
    "dcat:dataset": records.map(toDataset),
  };
}

/** The query that reads what toDataset needs, for all datasets or one. */
export const CATALOG_CYPHER = `
  MATCH (ds:HealthDataset)
  WHERE $datasetId IS NULL OR ds.dctIdentifier = $datasetId OR ds.datasetId = $datasetId
  OPTIONAL MATCH (ds)-[:HAS_DISTRIBUTION]->(dist:Distribution)
  WITH ds, collect(DISTINCT properties(dist)) AS distributions
  OPTIONAL MATCH (ds)-[:PUBLISHED_BY]->(pub)
  WITH ds, distributions, head(collect(properties(pub))) AS publisher
  OPTIONAL MATCH (ds)-[:HAS_CONTACT_POINT]->(cp:ContactPoint)
  WITH ds, distributions, publisher, head(collect(properties(cp))) AS contact
  OPTIONAL MATCH (hdab:Participant)-[:GOVERNS]->(ds)
  WITH ds, distributions, publisher, contact, head(collect(properties(hdab))) AS hdab
  OPTIONAL MATCH (ds)-[:HAS_VARIABLES]->(tg:VariablesTableGroup)
  OPTIONAL MATCH (tg)-[:HAS_TABLE]->(tb:VariablesTable)
  OPTIONAL MATCH (tb)-[:HAS_COLUMN]->(col:VariablesColumn)
  WITH ds, distributions, publisher, contact, hdab, tg, tb,
       collect(col {.name, .title, .description, .datatype}) AS columns
  WITH ds, distributions, publisher, contact, hdab, tg,
       collect(CASE WHEN tb IS NULL THEN NULL ELSE
         {tableId: tb.tableId, name: tb.name, title: tb.title, columns: columns} END) AS tables
  WITH ds, distributions, publisher, contact, hdab,
       collect(CASE WHEN tg IS NULL THEN NULL ELSE
         {groupId: tg.groupId, title: tg.title, tables: tables} END) AS variables
  RETURN properties(ds) AS ds, distributions, publisher, contact, hdab, variables
  ORDER BY coalesce(ds.datasetId, ds.dctIdentifier)`;
