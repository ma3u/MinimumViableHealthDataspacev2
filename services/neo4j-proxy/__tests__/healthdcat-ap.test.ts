/**
 * HealthDCAT-AP Release 8 serialisation (#700, ADR-063).
 *
 * toCatalog() of the fixture records must equal the golden JSON-LD, which CI
 * validates with the official SHACL (scripts/healthdcat-ap/validate.py). A
 * change to the serialiser shows up here; regenerate the golden on purpose:
 *
 *   UPDATE_GOLDEN=1 npx vitest run __tests__/healthdcat-ap.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  toCatalog,
  toDataset,
  EHDS_ELI,
  type DatasetRecord,
} from "../src/healthdcat-ap.js";

const RECORDS = new URL(
  "./fixtures/healthdcat-ap-records.json",
  import.meta.url,
);
const GOLDEN = new URL("./fixtures/healthdcat-ap-r8.jsonld", import.meta.url);
const { records } = JSON.parse(readFileSync(RECORDS, "utf8")) as {
  records: DatasetRecord[];
};

describe("toCatalog", () => {
  it("is the golden Release 8 catalogue the SHACL check validates", () => {
    const catalog = JSON.parse(JSON.stringify(toCatalog(records)));
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(GOLDEN, JSON.stringify(catalog, null, 2) + "\n");
    }
    expect(catalog).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
  });
});

describe("toDataset", () => {
  const [fhir, omop] = records;

  it("carries every mandatory Release 8 property", () => {
    const d = toDataset(fhir);
    for (const p of [
      "dct:identifier",
      "dct:title",
      "dct:description",
      "dct:accessRights",
      "dcatap:applicableLegislation",
      "healthdcatap:healthCategory",
      "healthdcatap:hdab",
      "healthdcatap:hasStructuredData",
      "healthdcatap:hasVariables",
      "dcat:distribution",
    ]) {
      expect(d, p).toHaveProperty([p]);
    }
  });

  it("names controlled values by their vocabulary IRIs", () => {
    const d = toDataset(fhir) as Record<string, any>;
    expect(d["dct:accessRights"]["@id"]).toBe(
      "http://publications.europa.eu/resource/authority/access-right/NON_PUBLIC",
    );
    expect(d["healthdcatap:healthCategory"].map((c: any) => c["@id"])).toEqual([
      "https://hdeu-dcat.data.health.europa.eu/resource/authority/healthcategories/EHRS",
      "https://hdeu-dcat.data.health.europa.eu/resource/authority/healthcategories/MRMR",
    ]);
    expect(d["dcat:distribution"][0]["dct:format"]["@id"]).toBe(
      "http://publications.europa.eu/resource/authority/file-type/JSON",
    );
    expect(d["dct:conformsTo"]["@id"]).toMatch(/standard\/FHIR$/);
    expect(toDataset(omop)["dct:conformsTo"]).toMatchObject({
      "@id": expect.stringMatching(/standard\/OMOP-CDM$/),
    });
  });

  it("types the counts as non-negative integers", () => {
    const d = toDataset(fhir) as Record<string, any>;
    expect(d["healthdcatap:numberOfRecords"]).toEqual({
      "@value": "4200",
      "@type": "xsd:nonNegativeInteger",
    });
  });

  it("states the recommended properties the dataset has, typed as the ranges ask", () => {
    const ds = toDataset(fhir) as Record<string, any>;
    expect(ds["healthdcatap:populationCoverage"]).toEqual({
      "@value": "Synthetic adults after an acute coronary syndrome, Berlin",
      "@language": "en",
    });
    expect(ds["healthdcatap:hasCodeValues"]).toEqual([
      "ICD-10:I21",
      "ICD-10:I50",
    ]);
    expect(ds["dct:accrualPeriodicity"]["@type"]).toEqual([
      "skos:Concept",
      "dct:Frequency",
    ]);
    expect(ds["dcat:temporalResolution"]).toEqual({
      "@value": "P1D",
      "@type": "xsd:duration",
    });
    expect(ds["healthdcatap:retentionPeriod"]["@type"]).toBe(
      "dct:PeriodOfTime",
    );
    expect(ds["dct:license"]["@type"]).toBe("dct:LicenseDocument");
    expect(ds["healthdcatap:analytics"]["@type"]).toBe("dcat:Distribution");
    expect(ds["foaf:page"]["@id"]).toMatch(/^https:\/\/ma3u\.github\.io\//);
  });

  it("leaves out what it cannot state rather than guessing", () => {
    const ds = toDataset(omop) as Record<string, any>;
    // A licence with no stable IRI, no analytics, no population text.
    expect(ds["dct:license"]).toBeUndefined();
    expect(ds["healthdcatap:analytics"]).toBeUndefined();
    expect(ds["healthdcatap:populationCoverage"]).toBeUndefined();
  });

  it("falls back to the Regulation and to non-public access", () => {
    const bare = toDataset({
      ds: { datasetId: "x", title: "X" },
      distributions: [],
      publisher: null,
      contact: null,
      hdab: null,
      variables: [],
    }) as Record<string, any>;
    expect(bare["dct:accessRights"]["@id"]).toMatch(/NON_PUBLIC$/);
    expect(bare["dcatap:applicableLegislation"][0]["@id"]).toBe(EHDS_ELI);
  });

  it("gives a shared agent one contact point, so many datasets name the same one", () => {
    const a = toDataset(fhir) as Record<string, any>;
    expect(a["healthdcatap:hdab"]["cv:contactPoint"]["@id"]).toBe(
      "did:web:medreg.de:hdab#contact-point",
    );
  });
});
