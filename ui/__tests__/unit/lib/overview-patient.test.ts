/**
 * Tests for ui/src/lib/overview/patient.ts (issue #271 M1).
 *
 * The patient overview built from the mock fixtures, which mirror the live
 * routes: the measured parameters against their printed range come first,
 * the risks and their factors, the record, what to do next, and who uses
 * the data. Nothing from another patient, no Neo4j label in the output.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPatientView,
  ownPatientId,
  ownPatientIdForSession,
  type PatientViewInput,
} from "@/lib/overview/patient";

const MOCK = join(__dirname, "../../../public/mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const PHARMACO = "did:web:pharmaco.de:research";

function input(over: Partial<PatientViewInput> = {}): PatientViewInput {
  return {
    asOf: "2026-09-23",
    profile: read("patient_profile_patient1"),
    insights: read("patient_insights"),
    research: read("patient_research"),
    observations: read("patient_observations"),
    holder: { did: ALPHA, name: "AlphaKlinik Berlin" },
    accessLog: [
      {
        id: "te-1",
        accessedAt: "2026-08-03T09:15:00Z",
        consumerDid: PHARMACO,
        consumerName: "PharmaCo Research AG",
        providerDid: ALPHA,
        statusCode: 200,
      },
      {
        id: "te-2",
        accessedAt: "2026-09-03T09:15:00Z",
        consumerDid: PHARMACO,
        consumerName: "PharmaCo Research AG",
        providerDid: ALPHA,
        statusCode: 200,
      },
      {
        id: "te-3",
        accessedAt: "2026-09-04T09:15:00Z",
        consumerDid: "did:web:irs.fr:hdab",
        consumerName: "Institut de Recherche Santé",
        providerDid: ALPHA,
        statusCode: 403,
      },
    ],
    ...over,
  };
}

describe("buildPatientView", () => {
  const view = buildPatientView(input());
  const byId = new Map(view.nodes.map((n) => [n.id, n]));

  it("answers the patient's question with the adopted articles", () => {
    expect(view.persona).toBe("patient");
    expect(view.me).toEqual({ id: "P1", name: "Maria Schmidt" });
    expect(view.article).toContain("Art. 3");
    expect(view.article).not.toMatch(/Art\. (46|50|51)\b/);
    expect(view.layers.map((l) => l.id)).toEqual([
      "prevent",
      "risk",
      "me",
      "use",
    ]);
  });

  it("puts HbA1c first: rising, outside the printed range, red", () => {
    expect(view.signals[0]).toMatchObject({
      severity: "bad",
      nodeId: "param:4548-4",
      code: "parameter-out-of-range",
    });
    const hba1c = byId.get("param:4548-4")!;
    expect(hba1c.status).toBe("bad");
    expect(hba1c.pulse).toBe(true);
    expect(hba1c.series).toHaveLength(6);
    expect(hba1c.range).toMatchObject({ low: 4, high: 6 });
    expect(hba1c.unit).toBe("%");
    expect(hba1c.description).toContain("glucose");
  });

  it("orders the signals worst first", () => {
    const rank = { bad: 3, warn: 2, info: 1, ok: 0 };
    const ranks = view.signals.map((s) => rank[s.severity]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it("unfolds a parameter into its measurements, chained in time", () => {
    const hba1c = byId.get("param:4548-4")!;
    expect(hba1c.expand?.nodes).toHaveLength(6);
    expect(hba1c.expand?.nodes.every((n) => n.kind === "Measurement")).toBe(
      true,
    );
    // 6 parent links and 5 chain links
    expect(hba1c.expand?.links).toHaveLength(11);
    const chain = hba1c.expand!.links.filter((l) => l.kind === "next");
    expect(chain).toHaveLength(5);
    expect(chain.every((l) => l.arrow)).toBe(true);
    const outOfRange = hba1c.expand!.nodes.filter(
      (n) => n.sub?.includes("outside"),
    );
    expect(outOfRange).toHaveLength(6);
  });

  it("eGFR falling below an open-ended range is bad, LDL improving is a warning", () => {
    expect(byId.get("param:33914-3")?.status).toBe("bad");
    expect(byId.get("param:33914-3")?.higherIsWorse).toBe(false);
    expect(byId.get("param:2089-1")?.status).toBe("warn");
  });

  it("links every parameter to the factor or risk it drives", () => {
    const hba1cLink = view.links.find((l) => l.source === "param:4548-4");
    expect(hba1cLink?.target).toMatch(/^fac:.*hba1c|^risk:diabetes/);
    const bp = view.links.find((l) => l.source === "param:8480-6");
    expect(bp?.target).toMatch(/^fac:hypertension|^risk:cardiovascular/);
  });

  it("carries the risks, the record, the recommendations and the studies", () => {
    expect(byId.get("risk:diabetes")).toMatchObject({
      status: "bad",
      kind: "Risk",
    });
    expect(byId.get("risk:cardiovascular")).toMatchObject({ status: "warn" });
    expect(view.nodes.filter((n) => n.kind === "Diagnosis")).toHaveLength(8);
    expect(view.nodes.filter((n) => n.kind === "Medication")).toHaveLength(4);
    expect(
      view.nodes.filter((n) => n.kind === "Recommendation").length,
    ).toBeGreaterThan(0);
    expect(view.nodes.filter((n) => n.kind === "Study")).toHaveLength(3);
    expect(view.nodes.filter((n) => n.kind === "Consent")).toHaveLength(2);
    const consent = view.signals.find((s) => s.code === "consent-summary");
    expect(consent?.text).toContain("2 consents active");
  });

  it("shows who read data from my holder in the last twelve months (Art. 8)", () => {
    const holder = byId.get("holder:did-web-alpha-klinik-de-participant")!;
    expect(holder.kind).toBe("Health data holder");
    const pharmaco = byId.get("access:did-web-pharmaco-de-research")!;
    expect(pharmaco.series).toHaveLength(12);
    expect(pharmaco.series!.at(-1)).toEqual({ date: "2026-09-01", value: 1 });
    expect(pharmaco.sub).toContain("2 accesses");
    // the refused attempt is not an access
    expect(byId.has("access:did-web-irs-fr-hdab")).toBe(false);
    const signal = view.signals.find((s) => s.code === "access-log");
    expect(signal?.text).toContain("1 organisations");
    expect(signal?.article).toContain("Art. 8");
  });

  it("names one patient only and speaks no Neo4j", () => {
    const patients = view.nodes.filter((n) => n.kind === "Patient");
    expect(patients).toHaveLength(1);
    expect(patients[0].label).toBe("Maria Schmidt");
    const text = JSON.stringify(view);
    expect(text).not.toContain("OMOPConditionOccurrence");
    expect(text).not.toContain("FROM_DATASET");
    expect(text).not.toContain("MAPPED_TO");
    expect(text).not.toContain("Anisha16");
  });

  it("keeps only links whose ends exist", () => {
    const ids = new Set(view.nodes.map((n) => n.id));
    for (const l of view.links) {
      expect(ids.has(l.source), l.source).toBe(true);
      expect(ids.has(l.target), l.target).toBe(true);
    }
    expect(new Set(view.nodes.map((n) => n.id)).size).toBe(view.nodes.length);
  });

  it("works without a holder, an access log or observations", () => {
    const bare = buildPatientView(
      input({
        holder: null,
        accessLog: [],
        observations: {
          resourceType: "Bundle",
          type: "searchset",
          total: 0,
          entry: [],
        },
      }),
    );
    expect(bare.nodes.some((n) => n.kind === "Parameter")).toBe(false);
    expect(bare.signals[0].nodeId).toBe("risk:diabetes");
    expect(bare.signals.some((s) => s.code === "access-log")).toBe(false);
  });

  it("adds a study the registry knows only through a consent", () => {
    const v = buildPatientView(
      input({
        research: {
          programs: [],
          consents: [
            {
              consentId: "C-9",
              studyId: "STUDY-X",
              grantedAt: "2026-01-01",
              revoked: false,
            },
          ],
        },
      }),
    );
    expect(v.nodes.find((n) => n.id === "study:STUDY-X")?.label).toBe(
      "STUDY-X",
    );
    expect(v.nodes.find((n) => n.id === "consent:C-9")?.status).toBe("ok");
  });
});

describe("buildPatientView, M6", () => {
  it("names who read my record when the log knows (Art. 8)", () => {
    const v = buildPatientView(
      input({
        recordLog: [
          {
            id: "r-1",
            accessedAt: "2026-07-03T09:15:00Z",
            consumerDid: PHARMACO,
            consumerName: "PharmaCo Research AG",
            providerDid: ALPHA,
            statusCode: 200,
          },
          {
            id: "r-2",
            accessedAt: "2026-09-03T09:15:00Z",
            consumerDid: PHARMACO,
            consumerName: "PharmaCo Research AG",
            providerDid: ALPHA,
            statusCode: 200,
          },
        ],
      }),
    );
    const reader = v.nodes.find(
      (n) => n.id === "access:did-web-pharmaco-de-research",
    )!;
    expect(reader.sub).toBe("read my record 2 times in the last 12 months");
    expect(reader.measure).toBe("Reads of my record per month");
    expect(reader.article).not.toContain("still missing");
    const s = v.signals.find((x) => x.code === "access-log")!;
    expect(s.text).toContain("1 organisations read my record 2 times");
    // the holder's other readers are not shown as readers of my record
    expect(v.nodes.some((n) => n.id === "access:did-web-irs-fr-hdab")).toBe(
      false,
    );
  });

  it("falls back to the holder's log and says so when no read touched my record", () => {
    const v = buildPatientView(input({ recordLog: [] }));
    const s = v.signals.find((x) => x.code === "access-log")!;
    expect(s.text).toContain("no read of my record is on file");
  });

  it("shows an opted-out study with the withdrawal date (Art. 71)", () => {
    const research = read("patient_research");
    const v = buildPatientView(
      input({
        research: {
          ...research,
          consents: [
            ...research.consents,
            {
              consentId: "CONSENT-003",
              studyId: "STUDY-RESP-2025",
              grantedAt: "2026-01-12T10:00:00Z",
              revoked: true,
              revokedAt: "2026-05-01T08:00:00Z",
              purpose: "secondary-use",
            },
          ],
        },
      }),
    );
    const consent = v.nodes.find((n) => n.id === "consent:CONSENT-003")!;
    expect(consent.label).toBe("opted out 2026-05-01");
    expect(consent.status).toBe("none");
    expect(consent.facts!.find(([k]) => k === "state")?.[1]).toContain(
      "Art. 71",
    );
    const s = v.signals.find((x) => x.code === "opt-out")!;
    expect(s.nodeId).toBe(consent.id);
    expect(s.text).toContain("Respiratory EHDS Cohort");
    expect(v.signals.find((x) => x.code === "consent-summary")?.text).toContain(
      "2 consents active",
    );
    const flow = v.links.find(
      (l) => l.source === "me" && l.target === consent.id,
    )!;
    expect(flow.particles).toBe(0);
  });
});

describe("ownPatientIdForSession", () => {
  it("reads the login name Keycloak carries, not the display name", () => {
    // Keycloak: display name in user.name, login name in preferredUsername
    expect(
      ownPatientIdForSession({
        preferredUsername: "patient1",
        user: {
          name: "Maria Schmidt",
          email: "patient1@health-dataspace.local",
        },
      }),
    ).toBe("P1");
    // the static demo and the unit tests: login name in user.name
    expect(ownPatientIdForSession({ user: { name: "patient2" } })).toBe("P2");
    // the mail's local part as the last resort
    expect(
      ownPatientIdForSession({
        user: { name: "Anna", email: "patient1@x.example" },
      }),
    ).toBe("P1");
    expect(
      ownPatientIdForSession({ user: { name: "Maria Schmidt" } }),
    ).toBeNull();
    expect(ownPatientIdForSession(null)).toBeNull();
  });
});

describe("ownPatientId", () => {
  it("maps the demo logins to their seeded records", () => {
    expect(ownPatientId("patient1")).toBe("P1");
    expect(ownPatientId("patient2")).toBe("P2");
    expect(ownPatientId("edcadmin")).toBeNull();
    expect(ownPatientId(null)).toBeNull();
  });
});
