/**
 * The extract and its split: SPE-1 and SPE-2 hold disjoint halves of the
 * hub's synthetic patients (the split scripts/seed-spe2.py made), values keep
 * their Neo4j types through JSON, and an extract whose counts do not match
 * its header is refused.
 */
import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import { decodeValue, encodeValue } from "../src/codec.js";
import {
  ident,
  nodeKey,
  parseJsonl,
  primaryLabel,
  splitStatements,
  toJsonl,
} from "../src/extract.js";
import { keyPath, selectHalf, speByNumber } from "../src/spes.js";
import { sampleExtract } from "./helpers.js";

describe("the split", () => {
  it("gives SPE-1 the first half and SPE-2 the rest, never the same patient", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const one = selectHalf(ids, speByNumber(1).half);
    const two = selectHalf(ids, speByNumber("spe-2").half);
    expect(one).toEqual(["a", "b"]);
    expect(two).toEqual(["c", "d", "e"]);
    expect(one.filter((x) => two.includes(x))).toEqual([]);
  });

  it("names the Trustee resource of the contract", () => {
    expect(keyPath(1)).toBe("default/spe-1/extract-key");
    expect(() => speByNumber(3)).toThrow(/unknown SPE/);
  });
});

describe("keys and labels", () => {
  it("merges on the primary label, and OptedOut is never one", () => {
    expect(primaryLabel(["OptedOut", "Patient"])).toBe("Patient");
    expect(primaryLabel(["OptedOut", "SnomedConcept"])).toBe("SnomedConcept");
    expect(() => primaryLabel([])).toThrow();
  });

  it("keys a node on its own id, the elementId last", () => {
    expect(nodeKey("4:x:1", { id: "p1", resourceId: "r" })).toBe("p1");
    expect(nodeKey("4:x:1", { code: "44054006" })).toBe("44054006");
    expect(nodeKey("4:x:1", { id: "" })).toBe("4:x:1");
  });

  it("refuses a label that is not a plain identifier", () => {
    expect(ident("Patient")).toBe("`Patient`");
    expect(() => ident("Patient` DETACH DELETE n //")).toThrow(/refusing/);
  });
});

describe("JSON lines", () => {
  it("round-trips an extract", () => {
    const extract = sampleExtract();
    expect(parseJsonl(toJsonl(extract))).toEqual(extract);
  });

  it("refuses an extract with a node more than its header says", () => {
    const extract = sampleExtract();
    extract.header.nodes -= 1;
    expect(() => parseJsonl(toJsonl(extract))).toThrow(/header says/);
  });

  it("refuses a relationship type that is not an identifier", () => {
    const extract = sampleExtract();
    extract.rels[0].type = "X]->() DELETE n //";
    expect(() => parseJsonl(toJsonl(extract))).toThrow(/refusing/);
  });
});

describe("values keep their Neo4j type", () => {
  const cases: Array<[string, unknown]> = [
    ["integer", neo4j.int("9007199254740993")],
    ["date", new neo4j.types.Date(1970, 3, 1)],
    [
      "datetime with offset",
      new neo4j.types.DateTime(2026, 10, 31, 8, 0, 0, 5, 3600),
    ],
    [
      "datetime with zone",
      new neo4j.types.DateTime(
        2026,
        10,
        31,
        8,
        0,
        0,
        0,
        undefined,
        "Europe/Berlin",
      ),
    ],
    ["local datetime", new neo4j.types.LocalDateTime(2026, 1, 2, 3, 4, 5, 6)],
    ["duration", new neo4j.types.Duration(1, 2, 3, 4)],
    ["point", new neo4j.types.Point(4326, 13.4, 52.5)],
  ];
  for (const [name, value] of cases) {
    it(name, () => {
      const back = decodeValue(JSON.parse(JSON.stringify(encodeValue(value))));
      expect(String(back)).toBe(String(value));
      expect(back?.constructor).toBe((value as object).constructor);
    });
  }

  it("leaves strings, floats, booleans and lists as they are", () => {
    const v = ["a", 1.5, true, null];
    expect(encodeValue(v)).toEqual(v);
  });

  it("refuses a value it cannot write back", () => {
    expect(() => encodeValue(new Map())).toThrow(/cannot put/);
  });
});

describe("splitStatements", () => {
  it("splits on ; outside strings and comments", () => {
    const text =
      "MERGE (a {x: 'a;b'});\n// Art. 75; adopted\nMATCH (n) RETURN n;\n";
    expect(splitStatements(text)).toEqual([
      "MERGE (a {x: 'a;b'})",
      "MATCH (n) RETURN n",
    ]);
  });
});
