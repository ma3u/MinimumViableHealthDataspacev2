/**
 * Tests for ui/src/lib/overview/hospital.ts (issue #271 M3).
 *
 * The holder overview from AlphaKlinik's side: the consumers that read its
 * data with their chain of trust, its datasets with their use, its own
 * quality label with the assessor's scores against the renewal band.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHospitalView,
  LABEL_BAND,
  type HospitalViewInput,
} from "@/lib/overview/hospital";
import type { HdabAccessEvent } from "@/lib/overview/hdab";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const LMC_DID = "did:web:lmc.nl:clinic";
const PHARMACO = "did:web:pharmaco.de:research";
const IRS = "did:web:irs.fr:hdab";
const SYNTHEA = "dataset:synthea-fhir-r4-mvd";
const LABEL = "vc:data-quality-label:clinic-alphaklinik";

function ev(
  consumerDid: string,
  accessedAt: string,
  extra: Partial<HdabAccessEvent> = {},
): HdabAccessEvent {
  return {
    id: `${consumerDid}-${accessedAt}`,
    consumerDid,
    accessedAt,
    providerDid: ALPHA,
    datasetId: SYNTHEA,
    statusCode: 200,
    responseBytes: 125000,
    ...extra,
  };
}

const EVENTS: HdabAccessEvent[] = [
  ...["2026-05-02", "2026-07-02", "2026-09-02"].map((d) =>
    ev(PHARMACO, `${d}T09:15:00Z`, {
      consumerName: "PharmaCo Research AG",
      permitId: "hdab-decision-medreg-2025-001",
      contractId: "contract-fhir-t2d-001",
    }),
  ),
  ...["2026-03-02", "2026-09-02"].map((d) =>
    ev(LMC_DID, `${d}T09:15:00Z`, {
      consumerName: "Limburg Medical Centre",
      permitId: "hdab-irs-lmc-2026-001",
    }),
  ),
  ev(IRS, "2026-08-02T09:15:00Z", {
    consumerName: "Institut de Recherche Santé",
    datasetId: "dataset:prostate-cancer-registry",
    statusCode: 403,
    responseBytes: 180,
  }),
  // another holder's event must not count
  ev(PHARMACO, "2026-09-03T09:15:00Z", {
    providerDid: LMC_DID,
    datasetId: "dataset-fhir-lmc",
  }),
];

const SCORES = [
  ["2024-12-31", 0.95],
  ["2025-06-30", 0.93],
  ["2025-12-31", 0.91],
  ["2026-03-31", 0.9],
  ["2026-06-30", 0.89],
  ["2026-09-23", 0.88],
] as const;

function input(over: Partial<HospitalViewInput> = {}): HospitalViewInput {
  const compliance = read("compliance");
  return {
    asOf: "2026-09-23",
    me: { did: ALPHA, name: "AlphaKlinik Berlin" },
    consumers: compliance.consumers,
    datasets: compliance.datasets,
    matrix: compliance.matrix,
    register: read("permits").entries,
    credentials: read("credentials").credentials,
    contracts: [],
    events: EVENTS,
    assessments: SCORES.map(([date, conformance]) => ({
      credentialId: LABEL,
      date,
      conformance,
    })),
    ...over,
  };
}

describe("buildHospitalView", () => {
  const view = buildHospitalView(input());
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const codes = view.signals.map((s) => s.code);

  it("asks the holder's question", () => {
    expect(view.persona).toBe("hospital");
    expect(view.me.name).toBe("AlphaKlinik Berlin");
    expect(view.article).toMatch(/\b78\b/);
    expect(view.layers.map((l) => l.id)).toEqual([
      "me",
      "chain",
      "consumers",
      "data",
      "time",
    ]);
  });

  it("Limburg's flow without a contract is a warning on its node", () => {
    const s = view.signals.find((x) => x.code === "transfer-without-contract");
    expect(s).toMatchObject({ severity: "warn", nodeId: `c:${LMC_DID}` });
    expect(byId.get(`c:${LMC_DID}`)!.status).toBe("warn");
  });

  it("PharmaCo after credential expiry is untrusted, IRS shows refused attempts", () => {
    expect(byId.get(`c:${PHARMACO}`)!.status).toBe("bad");
    expect(codes).toContain("access-after-credential-expiry");
    const irs = byId.get(`c:${IRS}`)!;
    expect(irs.measure).toContain("Refused");
    expect(irs.range).toMatchObject({ low: 0, high: 0 });
    const flow = view.links.find(
      (l) => l.source === `c:${IRS}` && l.target.startsWith("ds:"),
    );
    expect(flow?.status).toBe("bad");
  });

  it("my quality label carries the assessor's scores against the renewal band", () => {
    const label = byId.get(`vc:${LABEL}`)!;
    expect(label.kind).toBe("Quality label");
    expect(label.layer).toBe("me");
    expect(label.series).toHaveLength(6);
    expect(label.series!.at(-1)!.value).toBeLessThan(LABEL_BAND.low);
    expect(label.higherIsWorse).toBe(false);
    expect(label.range).toMatchObject({ low: 0.9, high: 1 });
    expect(label.status).toBe("bad");
    expect(label.description).toContain("renew");
    const s = view.signals.find((x) => x.code === "label-expired");
    expect(s?.nodeId).toBe(label.id);
    expect(s?.article).toContain("Art. 78");
    expect(s?.text).toContain("0.88");
  });

  it("counts only the events on my data, per dataset and in volume", () => {
    expect(byId.has("ds:dataset-fhir-lmc")).toBe(false);
    const synthea = byId.get(`ds:${SYNTHEA}`)!;
    expect(synthea.measure).toBe("Accesses per month");
    expect(synthea.series!.at(-1)!.value).toBe(2);
    const me = byId.get("me")!;
    expect(me.measure).toBe("Data made available per month");
    expect(me.unit).toBe("MB");
    expect(me.series!.at(-1)!.value).toBeCloseTo(0.25, 2);
    const log = view.signals.find((s) => s.code === "access-log");
    expect(log?.text).toContain("5 accesses served and 1 refused");
  });

  it("puts the permits and credentials behind each consumer on the chain layer", () => {
    expect(byId.get("permit:hdab-irs-lmc-2026-001")).toMatchObject({
      layer: "chain",
      status: "ok",
    });
    const purpose = byId.get("vc:vc:data-processing-purpose:cro-pharmaco")!;
    expect(purpose.layer).toBe("chain");
    expect(purpose.status).toBe("bad");
    expect(view.links.find((l) => l.source === purpose.id)?.target).toBe(
      `c:${PHARMACO}`,
    );
    // the other holder's label is not mine
    expect(byId.has("vc:vc:data-quality-label:clinic-lmc")).toBe(false);
  });

  it("scores each dataset's Art. 77 description and warns below the band", () => {
    const v = buildHospitalView(
      input({
        catalog: [
          {
            id: SYNTHEA,
            title: "Synthea Synthetic FHIR R4 Patient Cohort",
            description:
              "A synthetic cohort of 127 patients generated with Synthea in FHIR R4 for the demo.",
            publisher: "AlphaKlinik Berlin",
            license: "CC-BY-4.0",
            conformsTo: ["http://hl7.org/fhir/R4"],
            theme: "health",
            datasetType: "EHR",
            legalBasis: "Art. 53(1)(e)",
            recordCount: 127,
          },
          {
            id: "dataset:prostate-cancer-registry",
            title: "Prostate Cancer Registry 2024",
            description: "Registry",
            publisher: "Limburg Medical Centre",
          },
        ],
      }),
    );
    const synthea = v.nodes.find((n) => n.id === `ds:${SYNTHEA}`)!;
    expect(synthea.facts).toContainEqual([
      "description (Art. 77)",
      "9 of 9 fields",
    ]);
    expect(synthea.status).not.toBe("warn");
    const registry = v.nodes.find(
      (n) => n.id === "ds:dataset:prostate-cancer-registry",
    )!;
    expect(registry.status).toBe("warn");
    expect(
      registry.facts!.find(([k]) => k.startsWith("description"))?.[1],
    ).toContain("missing");
    const s = v.signals.find((x) => x.code === "description-incomplete")!;
    expect(s.nodeId).toBe(registry.id);
    expect(s.article).toContain("Art. 77");
    expect(v.signals.find((x) => x.code === "catalogue")?.text).toMatch(
      /1 fully described/,
    );
  });

  it("warns when I carry no label at all", () => {
    const v = buildHospitalView(
      input({
        credentials: read("credentials").credentials.filter(
          (c: { credentialId: string }) => !c.credentialId.includes("quality"),
        ),
        assessments: [],
      }),
    );
    expect(v.signals.find((s) => s.code === "label-missing")?.nodeId).toBe(
      "me",
    );
  });

  it("orders the signals worst first and keeps links closed", () => {
    const rank = { bad: 3, warn: 2, info: 1, ok: 0 };
    const ranks = view.signals.map((s) => rank[s.severity]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    const ids = new Set(view.nodes.map((n) => n.id));
    for (const l of view.links) {
      expect(ids.has(l.source), l.source).toBe(true);
      expect(ids.has(l.target), l.target).toBe(true);
    }
    expect(JSON.stringify(view)).not.toContain("HOLDS_CREDENTIAL");
  });
});
