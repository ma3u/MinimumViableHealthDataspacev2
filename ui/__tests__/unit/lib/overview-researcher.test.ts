/**
 * Tests for ui/src/lib/overview/researcher.ts (issue #271 M4).
 *
 * PharmaCo's view from the fixtures: its pending application with the
 * Art. 68 clock, its expired purpose credential, what it may use today,
 * its own study with enrolment, and the other studies and datasets ranked
 * by overlap with its data needs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildResearcherView,
  overlap,
  stems,
  type ResearcherViewInput,
  type StudyRecord,
} from "@/lib/overview/researcher";
import type { HdabAccessEvent } from "@/lib/overview/hdab";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const PHARMACO = "did:web:pharmaco.de:research";
const IRS = "did:web:irs.fr:hdab";
const MEDREG = "did:web:medreg.de:hdab";
const SYNTHEA = "dataset:synthea-fhir-r4-mvd";

const enrolment = (values: number[]) =>
  values.map((value, i) => ({
    date: `2024-${String(i + 1).padStart(2, "0")}-01`,
    value,
  }));

const STUDIES: StudyRecord[] = [
  {
    studyId: "STUDY-CARDIO-2024",
    studyName: "European Cardiovascular Risk Study",
    institution: "PharmaCo Research AG",
    institutionDid: PHARMACO,
    status: "open",
    dataNeeded:
      "FHIR Conditions, Observations (blood pressure, cholesterol), Medications",
    description: "Multi-centre cohort study of cardiovascular risk factors.",
    countries: ["DE", "NL"],
    participantCount: 4821,
    enrolment: enrolment([
      600, 1100, 1500, 2100, 2700, 3300, 3900, 4400, 4700, 4821,
    ]),
  },
  {
    studyId: "STUDY-DIAB-2023",
    studyName: "T2D Progression Biomarkers",
    institution: "Institut de Recherche Santé",
    institutionDid: IRS,
    status: "open",
    dataNeeded:
      "OMOP Drug Exposures, Condition Occurrences, Measurements (HbA1c, eGFR)",
    countries: ["FR"],
    participantCount: 2103,
    enrolment: enrolment([
      400, 800, 1100, 1400, 1700, 1900, 2000, 2080, 2100, 2103,
    ]),
  },
  {
    studyId: "STUDY-RESP-2025",
    studyName: "Respiratory EHDS Cohort",
    institution: "MedReg DE",
    institutionDid: MEDREG,
    status: "recruiting",
    dataNeeded: "FHIR Conditions (asthma, COPD), Observation spirometry values",
    countries: ["DE"],
    participantCount: 890,
    enrolment: enrolment([0, 0, 0, 0, 0, 0, 120, 340, 610, 890]),
  },
];

function ev(
  accessedAt: string,
  extra: Partial<HdabAccessEvent> = {},
): HdabAccessEvent {
  return {
    id: `pharmaco-${accessedAt}`,
    consumerDid: PHARMACO,
    accessedAt,
    providerDid: ALPHA,
    datasetId: SYNTHEA,
    statusCode: 200,
    permitId: "hdab-decision-medreg-2025-001",
    contractId: "contract-fhir-t2d-001",
    ...extra,
  };
}

function input(over: Partial<ResearcherViewInput> = {}): ResearcherViewInput {
  const compliance = read("compliance");
  const catalog = read("catalog") as {
    id: string;
    title: string;
    description: string;
    publisher: string;
  }[];
  const byKey = new Map<string, (typeof catalog)[number]>();
  for (const c of catalog) {
    byKey.set(c.id, c);
    byKey.set(c.title, c);
  }
  return {
    asOf: "2026-09-23",
    me: { did: PHARMACO, name: "PharmaCo Research AG" },
    consumers: compliance.consumers,
    datasets: compliance.datasets.map((d: { id: string; title: string }) => {
      const c = byKey.get(d.id) ?? byKey.get(d.title);
      return {
        id: d.id,
        title: d.title,
        description: c?.description,
        publisher: c?.publisher,
      };
    }),
    matrix: compliance.matrix,
    register: read("permits").entries,
    credentials: read("credentials").credentials,
    contracts: [],
    events: ["2026-05-02", "2026-07-02", "2026-09-02"].map((d) =>
      ev(`${d}T09:15:00Z`),
    ),
    studies: STUDIES,
    ...over,
  };
}

describe("stems and overlap", () => {
  it("shares the words that carry meaning, five letters at a time", () => {
    const a = stems(
      "FHIR Conditions, Observations (blood pressure, cholesterol)",
    );
    const b = stems("OMOP Condition Occurrences, Measurements (HbA1c)");
    expect(overlap(a, b)).toEqual(["condi"]);
    expect(overlap(a, stems("Observation spirometry values"))).toEqual([
      "obser",
    ]);
    expect(a.has("fhir")).toBe(false);
  });
});

describe("buildResearcherView", () => {
  const view = buildResearcherView(input());
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const codes = view.signals.map((s) => s.code);

  it("asks the researcher's question", () => {
    expect(view.persona).toBe("researcher");
    expect(view.me.name).toBe("PharmaCo Research AG");
    expect(view.layers.map((l) => l.id)).toEqual([
      "mine",
      "allowed",
      "me",
      "other",
      "time",
    ]);
  });

  it("my pending application shows its Art. 68 clock", () => {
    const app = byId.get("app:app-pharmaco-medreg-2026-002")!;
    expect(app.kind).toBe("Access application");
    expect(app.status).toBe("info");
    const due = app.facts!.find(([k]) => k === "decision due")!;
    expect(due[1]).toContain("2026-12-01");
    expect(due[1]).toContain("69 days left");
    const s = view.signals.find((x) => x.code === "decision-due");
    expect(s?.nodeId).toBe(app.id);
    expect(s?.article).toContain("Art. 68(4)");
  });

  it("my expired purpose credential is red and my accesses after it are a broken chain", () => {
    const cred = byId.get("vc:vc:data-processing-purpose:cro-pharmaco")!;
    expect(cred.status).toBe("bad");
    expect(cred.layer).toBe("me");
    expect(codes).toContain("access-after-credential-expiry");
    expect(view.signals[0].severity).toBe("bad");
    expect(byId.get("me")!.status).toBe("bad");
  });

  it("knows what I may use today from the matrix's approval and my accesses", () => {
    const synthea = byId.get(`ds:${SYNTHEA}`)!;
    expect(synthea.layer).toBe("allowed");
    expect(synthea.measure).toBe("My accesses per month");
    expect(synthea.series!.at(-1)!.value).toBe(1);
    const allowed = view.signals.find((s) => s.code === "allowed-today");
    expect(allowed?.text).toMatch(/^\d+ datasets permitted to me today/);
  });

  it("my study carries its enrolment; the others are ranked by overlap with my needs", () => {
    const mine = byId.get("study:STUDY-CARDIO-2024")!;
    expect(mine).toMatchObject({ kind: "Study", layer: "me", status: "ok" });
    expect(mine.series).toHaveLength(10);
    expect(mine.measure).toBe("Participants enrolled");
    const diab = byId.get("study:STUDY-DIAB-2023")!;
    expect(diab.layer).toBe("other");
    expect(diab.facts!.find(([k]) => k === "shares with mine")?.[1]).toContain(
      "condi",
    );
    const matches = view.signals.filter((s) => s.code === "study-match");
    expect(matches.map((s) => s.nodeId)).toContain("study:STUDY-DIAB-2023");
    expect(matches.map((s) => s.nodeId)).toContain("study:STUDY-RESP-2025");
    expect(
      view.links.some(
        (l) =>
          l.source === "study:STUDY-DIAB-2023" && l.target === `org:${IRS}`,
      ),
    ).toBe(true);
    expect(view.nodes.filter((n) => n.kind === "Study")).toHaveLength(3);
  });

  it("ranks other datasets near my needs and says so", () => {
    const v = buildResearcherView(
      input({
        datasets: [
          ...input().datasets,
          {
            id: "dataset:lipid-registry",
            title: "Lipid and blood pressure registry",
            description:
              "Cholesterol observations and blood pressure readings from three regions",
            publisher: "Limburg Medical Centre",
          },
        ],
      }),
    );
    const matches = v.signals.filter((s) => s.code === "dataset-match");
    expect(matches.map((m) => m.nodeId)).toContain("ds:dataset:lipid-registry");
    const lipid = v.nodes.find((n) => n.id === "ds:dataset:lipid-registry")!;
    expect(lipid.layer).toBe("other");
    expect(lipid.facts!.find(([k]) => k === "shares")?.[1]).toContain("chole");
    expect(
      v.links.some((l) => l.source === lipid.id && l.target === "me"),
    ).toBe(true);
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
    expect(JSON.stringify(view)).not.toContain("ResearchStudy");
  });

  it("a researcher in order sees no red", () => {
    const v = buildResearcherView(
      input({
        credentials: read("credentials").credentials.map(
          (c: { credentialId: string; expiresAt: string }) =>
            c.credentialId.includes("purpose")
              ? { ...c, expiresAt: "2027-06-20T00:00:00Z" }
              : c,
        ),
        matrix: read("compliance").matrix.map((r: { consumerId: string }) =>
          r.consumerId === PHARMACO ? { ...r, hasContract: true } : r,
        ),
      }),
    );
    expect(v.signals.some((s) => s.severity === "bad")).toBe(false);
    expect(v.nodes.find((n) => n.id === "me")?.status).toBe("ok");
  });
});
