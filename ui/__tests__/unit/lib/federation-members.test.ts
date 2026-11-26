/**
 * ADR-100 decision 5 (#1236, draft SPE implementing act Art. 18(1)): the
 * register of the federation's members has one source,
 * `src/lib/federation-members.ts`. The public JSON-LD file and the node each
 * workspace's registration cypher writes must say the same thing.
 *
 * Regenerate the public file after a change to the register:
 *
 *   WRITE_FEDERATION_REGISTER=1 npx vitest run __tests__/unit/lib/federation-members.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  FEDERATION_MEMBERS,
  FEDERATION_REGISTER_PATH,
  COORDINATOR_ENDPOINT,
  CONFORMS_TO,
  federationRegisterFile,
  federationRegisterJsonLd,
} from "@/lib/federation-members";

const UI = path.resolve(__dirname, "../../..");
const REPO = path.resolve(UI, "..");
const PUBLIC_FILE = path.join(UI, "public", FEDERATION_REGISTER_PATH);

describe("the published register", () => {
  it("is the file generated from the register", () => {
    if (process.env.WRITE_FEDERATION_REGISTER === "1") {
      mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
      writeFileSync(PUBLIC_FILE, federationRegisterFile());
    }
    expect(readFileSync(PUBLIC_FILE, "utf8")).toBe(federationRegisterFile());
  });

  it("lists every member as a dcat:DataService with an endpoint and a dataset", () => {
    const services = federationRegisterJsonLd()["dcat:service"] as Array<
      Record<string, unknown>
    >;
    expect(services).toHaveLength(FEDERATION_MEMBERS.length);
    for (const s of services) {
      expect(s["@type"]).toBe("dcat:DataService");
      expect(s["dcat:endpointURL"]).toEqual({ "@id": COORDINATOR_ENDPOINT });
      expect(s["ehds:servesDatasetId"]).toMatch(/^dataset:/);
      expect(s["ehds:membershipStatus"]).toMatch(
        /^(admitted|suspended|excluded)$/,
      );
    }
  });

  it("names each member once", () => {
    const ids = FEDERATION_MEMBERS.map((m) => m.serviceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("each workspace's registration cypher", () => {
  for (const m of FEDERATION_MEMBERS) {
    const n = m.speId.slice(-1);
    const cypher = readFileSync(
      path.join(REPO, `neo4j/register-fhir-dataset-hdcatap-spe${n}.cypher`),
      "utf8",
    );

    it(`writes ${m.serviceId} as the register has it`, () => {
      expect(cypher).toContain(
        `MERGE (svc:DataService {serviceId: '${m.serviceId}'})`,
      );
      for (const expected of [
        `svc.title               = '${m.title}'`,
        `svc.publisherDid        = '${m.publisher.id}'`,
        `svc.publisherName       = '${m.publisher.name}'`,
        `svc.endpointUrl         = '${COORDINATOR_ENDPOINT}'`,
        `svc.conformsTo          = [${CONFORMS_TO.map((c) => `'${c}'`).join(
          ", ",
        )}]`,
        `svc.membershipStatus    = '${m.status}'`,
        `svc.admitted            = date('${m.admitted}')`,
        `svc.agreementVersion    = '${m.agreementVersion}'`,
        `svc.attestationRequired = '${m.attestationRequired}'`,
      ]) {
        // Once on create, once on match: a re-run corrects a changed value.
        expect(cypher.split(expected).length - 1).toBe(2);
      }
      expect(cypher).toContain(
        `MATCH (ds:HealthDataset {datasetId: '${m.servesDataset}'})`,
      );
      expect(cypher).toContain("MERGE (svc)-[:SERVES_DATASET]->(ds)");
    });
  }
});
