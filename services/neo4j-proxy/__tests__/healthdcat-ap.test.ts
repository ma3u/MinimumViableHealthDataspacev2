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
