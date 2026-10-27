/**
 * The UI writes the proxy's HealthDCAT-AP JSON-LD as Turtle (#700). The
 * golden Turtle is what toTurtle() makes of the proxy's golden catalogue; CI
 * validates it with the official SHACL and checks it is the same graph as the
 * JSON-LD (scripts/healthdcat-ap/validate.py --same-as). Regenerate on purpose:
 *
 *   UPDATE_GOLDEN=1 npx vitest run __tests__/unit/lib/healthdcat-ap.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  HEALTH_CATEGORIES,
  minimalDescription,
  toTurtle,
} from "@/lib/healthdcat-ap";

// The tests run in ui/, under jsdom, where import.meta.url is no file URL.
const JSONLD = path.resolve(
  "../services/neo4j-proxy/__tests__/fixtures/healthdcat-ap-r8.jsonld",
);
const GOLDEN = path.resolve("__tests__/unit/lib/fixtures/healthdcat-ap-r8.ttl");

describe("toTurtle", () => {
  it("writes the golden catalogue as the golden Turtle", () => {
    const ttl = toTurtle(JSON.parse(readFileSync(JSONLD, "utf8")));
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, ttl);
    expect(ttl).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("writes typed and language-tagged values", () => {
    const ttl = toTurtle({
      "@context": {
        dct: "http://purl.org/dc/terms/",
        xsd: "http://www.w3.org/2001/XMLSchema#",
      },
      "@id": "https://example.org/d",
      "@type": "dct:Dataset",
      "dct:issued": { "@value": "2026-01-15", "@type": "xsd:date" },
      "dct:title": { "@value": 'A "quoted" title', "@language": "en" },
    });
    expect(ttl).toContain('dct:issued "2026-01-15"^^xsd:date');
    expect(ttl).toContain('dct:title "A \\"quoted\\" title"@en');
    expect(ttl).toContain("<https://example.org/d>\n    a dct:Dataset");
  });

  it("writes a nested named node as its own subject, once", () => {
    const agent = { "@id": "https://example.org/a", "foaf:name": "MedReg DE" };
    const ttl = toTurtle({
      "@context": {
        foaf: "http://xmlns.com/foaf/0.1/",
        dct: "http://purl.org/dc/terms/",
      },
      "@graph": [
        { "@id": "https://example.org/1", "dct:publisher": agent },
        { "@id": "https://example.org/2", "dct:publisher": agent },
      ],
    });
    expect(ttl.match(/foaf:name "MedReg DE"/g)).toHaveLength(1);
    expect(ttl).toContain("dct:publisher <https://example.org/a>");
  });

  it("drops a key the context does not define, as JSON-LD does", () => {
    const ttl = toTurtle({
      "@context": { dct: "http://purl.org/dc/terms/" },
      "@id": "https://example.org/d",
      "dct:title": "t",
      year: 2026,
    });
    expect(ttl).not.toContain("year");
  });
});

describe("the editor's vocabulary", () => {
  it("offers the 17 categories of Art. 51(1), each once", () => {
    const codes = HEALTH_CATEGORIES.map((c) => c.code);
    expect(codes).toHaveLength(17);
    expect(new Set(codes).size).toBe(17);
  });

  it("builds the static export's minimal description", () => {
    const d = minimalDescription({ id: "dataset:x", title: "X" });
    expect(d["@type"]).toBe("dcat:Dataset");
    expect(d["dct:title"]).toBe("X");
  });
});
