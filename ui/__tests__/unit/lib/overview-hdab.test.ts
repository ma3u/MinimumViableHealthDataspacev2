/**
 * Tests for ui/src/lib/overview/hdab.ts (issue #271 M2).
 *
 * The access body overview built from the mock fixtures (compliance matrix,
 * permit register, credential wallet) and an access log carrying the seed's
 * three stories: PharmaCo accessing after its purpose credential expired,
 * Limburg under a permit without a contract, Institut de Recherche Santé
 * refused and still attempting. Plus the body's own clocks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHdabView,
  holderOf,
  type HdabAccessEvent,
  type HdabViewInput,
} from "@/lib/overview/hdab";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const PHARMACO = "did:web:pharmaco.de:research";
const LMC = "did:web:lmc.nl:clinic";
const IRS = "did:web:irs.fr:hdab";
const SYNTHEA = "dataset:synthea-fhir-r4-mvd";

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
    providerName: "AlphaKlinik Berlin",
    datasetId: SYNTHEA,
    statusCode: 200,
    ...extra,
  };
}

const EVENTS: HdabAccessEvent[] = [
  // PharmaCo: before and after 2026-06-20, under permit and contract
  ...["2026-05-02", "2026-06-02", "2026-07-02", "2026-08-02", "2026-09-02"].map(
    (d) =>
      ev(PHARMACO, `${d}T09:15:00Z`, {
        consumerName: "PharmaCo Research AG",
        permitId: "hdab-decision-medreg-2025-001",
        contractId: "contract-fhir-t2d-001",
      }),
  ),
  // Limburg: under permit, no contract
  ...["2026-03-02", "2026-06-02", "2026-09-02"].map((d) =>
    ev(LMC, `${d}T09:15:00Z`, {
      consumerName: "Limburg Medical Centre",
      permitId: "hdab-irs-lmc-2026-001",
    }),
  ),
  // IRS: refused
  ...["2026-04-02", "2026-08-02", "2026-09-02"].map((d) =>
    ev(IRS, `${d}T09:15:00Z`, {
      consumerName: "Institut de Recherche Santé",
      datasetId: "dataset:prostate-cancer-registry",
      statusCode: 403,
    }),
  ),
];

function input(over: Partial<HdabViewInput> = {}): HdabViewInput {
  const compliance = read("compliance");
  return {
    asOf: "2026-09-23",
    me: { did: "did:web:medreg.de:hdab", name: "MedReg DE" },
    consumers: compliance.consumers,
    datasets: compliance.datasets,
    matrix: compliance.matrix,
    register: read("permits").entries,
    credentials: read("credentials").credentials,
    contracts: [],
    events: EVENTS,
    ...over,
  };
}

describe("holderOf", () => {
  const participants = read("compliance").consumers;
  it("finds the holder by name, else by the credential id's tail", () => {
    expect(
      holderOf(
        {
          credentialId: "x",
          credentialType: "T",
          holderName: "PharmaCo Research AG",
        },
        participants,
      ),
    ).toBe(PHARMACO);
    expect(
      holderOf(
        { credentialId: "vc:membership:cro-pharmaco", credentialType: "T" },
        participants,
      ),
    ).toBe(PHARMACO);
    expect(
      holderOf(
        {
          credentialId: "vc:data-quality-label:clinic-alphaklinik",
          credentialType: "T",
        },
        participants,
      ),
    ).toBe(ALPHA);
    expect(
      holderOf(
        { credentialId: "vc:ehds-participant:clinic-lmc", credentialType: "T" },
        participants,
      ),
    ).toBe(LMC);
    expect(
      holderOf(
        { credentialId: "vc:ehds-participant:hdab-irs", credentialType: "T" },
        participants,
      ),
    ).toBe(IRS);
    expect(
      holderOf(
        { credentialId: "vc:x:nobody", credentialType: "T" },
        participants,
      ),
    ).toBeNull();
  });
});

describe("buildHdabView", () => {
  const view = buildHdabView(input());
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const codes = view.signals.map((s) => s.code);

  it("asks the access body's question", () => {
    expect(view.persona).toBe("hdab");
    expect(view.me.name).toBe("MedReg DE");
    expect(view.article).toMatch(/\b63\b/);
    expect(view.layers.map((l) => l.id)).toEqual([
      "me",
      "chain",
      "users",
      "data",
      "time",
    ]);
  });

  it("PharmaCo's accesses after the credential expired are a bad signal on its node", () => {
    const s = view.signals.find(
      (x) => x.code === "access-after-credential-expiry",
    );
    expect(s).toMatchObject({ severity: "bad", nodeId: `p:${PHARMACO}` });
    expect(s!.text).toContain("3 accesses");
    expect(s!.article).toContain("Art. 61(1)");
    expect(byId.get(`p:${PHARMACO}`)!.status).toBe("bad");
  });

  it("IRS's attempts after the refusal are a matter for Art. 63, shown as refusals per month", () => {
    const s = view.signals.find(
      (x) => x.code === "access-attempt-after-refusal",
    );
    expect(s).toMatchObject({ severity: "bad", nodeId: `p:${IRS}` });
    expect(s!.article).toContain("Art. 63");
    const irs = byId.get(`p:${IRS}`)!;
    expect(irs.measure).toContain("Refused");
    expect(irs.series!.at(-1)!.value).toBe(1);
    expect(irs.range).toMatchObject({ low: 0, high: 0 });
    const flow = view.links.find(
      (l) => l.source === `p:${IRS}` && l.target.startsWith("ds:"),
    );
    expect(flow?.status).toBe("bad");
  });

  it("Limburg's flow without a contract is a warning, the permit being valid", () => {
    const s = view.signals.find((x) => x.code === "transfer-without-contract");
    expect(s).toMatchObject({ severity: "warn", nodeId: `p:${LMC}` });
    expect(byId.get(`p:${LMC}`)!.status).toBe("warn");
    expect(byId.get(`p:${LMC}`)!.measure).toBe("Accesses per month");
  });

  it("my own overdue decisions are listed against the Art. 68(4) clock", () => {
    const overdue = view.signals.filter((s) => s.code === "decision-overdue");
    expect(overdue.length).toBeGreaterThanOrEqual(2);
    expect(overdue.every((s) => s.severity === "bad")).toBe(true);
    expect(overdue[0].article).toContain("Art. 68(4)");
    expect(overdue.map((s) => s.nodeId)).toContain(
      "app:app-alpha-medreg-2026-001",
    );
    expect(byId.get("app:app-alpha-medreg-2026-001")!.status).toBe("bad");
    const due = view.signals.find((s) => s.code === "decision-due");
    expect(due?.nodeId).toBe("app:app-pharmaco-medreg-2026-002");
  });

  it("the queue by month sits on my own node with its band", () => {
    const me = byId.get("me")!;
    expect(me.measure).toContain("Pending applications");
    expect(me.range).toMatchObject({ low: 0, high: 2 });
    expect(me.series).toHaveLength(12);
    expect(me.series!.at(-1)!.value).toBe(3);
    expect(me.expand?.nodes).toHaveLength(12);
    expect(codes).toContain("pending-queue");
  });

  it("permits, refusals and credentials sit on the chain layer with their state", () => {
    const permit = byId.get("permit:hdab-irs-lmc-2026-001")!;
    expect(permit).toMatchObject({
      layer: "chain",
      kind: "Data permit",
      status: "ok",
    });
    const refusal = byId.get("permit:hdab-medreg-irs-2026-001");
    expect(refusal?.kind).toBe("Refusal");
    const purpose = byId.get("vc:vc:data-processing-purpose:cro-pharmaco")!;
    expect(purpose.status).toBe("bad");
    expect(purpose.label).toContain("expired");
    const label = byId.get("vc:vc:data-quality-label:clinic-alphaklinik")!;
    expect(label.kind).toBe("Quality label");
    expect(codes).toContain("label-expired");
    const held = view.links.find((l) => l.source === purpose.id);
    expect(held?.target).toBe(`p:${PHARMACO}`);
  });

  it("orders the signals worst first and never lists the body among the consumers", () => {
    const rank = { bad: 3, warn: 2, info: 1, ok: 0 };
    const ranks = view.signals.map((s) => rank[s.severity]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(byId.has("p:did:web:medreg.de:hdab")).toBe(false);
  });

  it("keeps only links whose ends exist and speaks no Neo4j", () => {
    const ids = new Set(view.nodes.map((n) => n.id));
    for (const l of view.links) {
      expect(ids.has(l.source), l.source).toBe(true);
      expect(ids.has(l.target), l.target).toBe(true);
    }
    const text = JSON.stringify(view);
    expect(text).not.toContain("HDABApproval");
    expect(text).not.toContain("HOLDS_CREDENTIAL");
  });

  it("a consumer with a contract on file and a valid permit is in order", () => {
    const v = buildHdabView(
      input({
        contracts: [
          { contractId: "c-lmc", consumerDid: LMC, datasetId: SYNTHEA },
        ],
        events: EVENTS.filter((e) => e.consumerDid === LMC).map((e) => ({
          ...e,
          contractId: "c-lmc",
        })),
      }),
    );
    expect(v.nodes.find((n) => n.id === `p:${LMC}`)?.status).toBe("ok");
    expect(
      v.signals.some((s) => s.nodeId === `p:${LMC}` && s.severity !== "ok"),
    ).toBe(false);
    expect(v.nodes.find((n) => n.id === "contract:c-lmc")?.kind).toBe(
      "Contract",
    );
  });
});
