import { describe, it, expect } from "vitest";
import { forbidsExtract } from "@/lib/agreement";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("forbidsExtract (#889)", () => {
  it("finds the prohibition in the SPE policy as the repo defines it", () => {
    const policy = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../jad/policies/mvhd-ehds-permit-spe.json"),
        "utf8",
      ),
    );
    expect(forbidsExtract(policy)).toBe(true);
  });

  it("reads the forms a connector answers with", () => {
    expect(
      forbidsExtract({
        "odrl:prohibition": { "odrl:action": { "@id": "odrl:extract" } },
      }),
    ).toBe(true);
    expect(
      forbidsExtract({
        "http://www.w3.org/ns/odrl/2/prohibition": [
          {
            "http://www.w3.org/ns/odrl/2/action": [
              { "@id": "http://www.w3.org/ns/odrl/2/extract" },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      forbidsExtract({
        prohibition: [{ action: { "rdf:value": { "@id": "odrl:extract" } } }],
      }),
    ).toBe(true);
  });

  it("is false for a policy that allows use and prohibits nothing else", () => {
    expect(forbidsExtract({ permission: [{ action: "use" }] })).toBe(false);
    expect(
      forbidsExtract({ prohibition: [{ action: "ehds:extractTrainingData" }] }),
    ).toBe(false);
  });
});
