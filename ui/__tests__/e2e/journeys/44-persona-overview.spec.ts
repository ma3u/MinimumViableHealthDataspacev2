/**
 * Issue #271 (from discussion #265): the persona overview (J960 to J975).
 *
 * Four people, one question each, answered by state and not by structure:
 * the patient's parameters against their printed range, the researcher's
 * permits and clocks, the access body's broken chains of trust, the holder's
 * untrusted consumers and its own duties. Everything is fictional.
 *
 * What runs today is the data: the seed puts Anna Müller (P1) with 48
 * LOINC-coded measurements, her consents, twelve months of access events
 * and the quarterly quality assessments into the graph, and the existing
 * routes show it. M1 (the patient overview, `/api/overview?persona=patient`,
 * `/api/patient/observations`, `/overview`), M2 (the access body), M3 (the
 * holder), M4 (the researcher) and M5 (the static export) are in.
 *
 *   PLAYWRIGHT_BASE_URL=https://ehds.mabu.red \
 *     npx playwright test __tests__/e2e/journeys/44-persona-overview.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { apiGet, loginAsAdmin, skipIfNeo4jDown } from "./helpers";

const P1 = "P1";
const PHARMACO = "did:web:pharmaco.de:research";
const LMC = "did:web:lmc.nl:clinic";
const IRS = "did:web:irs.fr:hdab";

/**
 * Skip when the persona overview seed has not been applied to this graph.
 * Probes the public patient list, so it works before any login.
 */
async function skipIfSeedMissing(page: Page) {
  await skipIfNeo4jDown(page, "/api/patient");
  const list = await page.request.get("/api/patient");
  const data = list.ok() ? await list.json() : { patients: [] };
  const p1 = (data.patients ?? []).find((p: { id: string }) => p.id === P1);
  if (!p1 || p1.name !== "Anna Müller") {
    test.skip(true, "seed-persona-overview.cypher not applied (no P1)");
  }
}

// ── The seeded data through the routes that exist today ────────────────────

test.describe("Issue #271 · M0 the seed is visible through today's routes", () => {
  test("J960 P1 is Anna Müller with her eight diagnoses and four medications", async ({
    page,
  }) => {
    await skipIfSeedMissing(page);
    await loginAsAdmin(page);
    const data = await apiGet(page, `/api/patient/profile?patientId=${P1}`);
    expect(data.patient.name).toBe("Anna Müller");
    expect(data.conditions.length).toBeGreaterThanOrEqual(8);
    expect(data.conditions.map((c: { code: string }) => c.code)).toContain(
      "73211009",
    );
    expect(data.medications.length).toBeGreaterThanOrEqual(4);
  });

  test("J961 her laboratory values carry a LOINC code and a unit", async ({
    page,
  }) => {
    await skipIfSeedMissing(page);
    await loginAsAdmin(page);
    const data = await apiGet(page, `/api/patient/profile?patientId=${P1}`);
    const labs: { code: string; unit: string }[] = data.observations ?? [];
    expect(labs.length).toBeGreaterThan(0);
    for (const lab of labs) {
      expect(lab.code).toMatch(/^\d{4,5}-\d$/);
      expect(lab.unit).not.toBe("");
    }
  });

  test("J962 twelve months of access events per consumer are in the audit log", async ({
    page,
  }) => {
    await skipIfSeedMissing(page);
    await loginAsAdmin(page);
    const data = await apiGet(
      page,
      "/api/admin/audit?type=accesslogs&limit=200",
    );
    const logs: {
      id: string;
      accessedAt: string;
      consumerDid: string;
      statusCode?: number;
    }[] = data.accesslogs ?? [];
    const monthly = logs.filter((l) => l.id?.startsWith("te-m-"));
    expect(monthly.length).toBeGreaterThan(0);
    const months = new Set(monthly.map((l) => l.accessedAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(6);
    expect(monthly.some((l) => l.consumerDid === PHARMACO)).toBe(true);
    expect(monthly.some((l) => l.consumerDid === LMC)).toBe(true);
  });

  test("J963 the refused applicant's attempts are logged as refused, with the article", async ({
    page,
  }) => {
    await skipIfSeedMissing(page);
    await loginAsAdmin(page);
    const data = await apiGet(
      page,
      `/api/admin/audit?type=accesslogs&limit=200&consumerDid=${encodeURIComponent(
        IRS,
      )}`,
    );
    const logs: {
      consumerDid: string;
      statusCode?: number;
      errorMessage?: string | null;
    }[] = (data.accesslogs ?? []).filter(
      (l: { consumerDid: string }) => l.consumerDid === IRS,
    );
    expect(logs.length).toBeGreaterThan(0);
    const refused = logs.filter((l) => l.statusCode === 403);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0].errorMessage ?? "").toContain("Art. 61(1)");
  });
});

// ── M1 Patient ─────────────────────────────────────────────────────────────

test.describe("Issue #271 · M1 patient overview", () => {
  test("J964 /api/patient/observations returns a FHIR searchset with reference ranges", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const bundle = await apiGet(
      page,
      `/api/patient/observations?patientId=${P1}`,
    );
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBe(48);
    for (const { resource } of bundle.entry) {
      expect(resource.subject.reference).toBe(`Patient/${P1}`);
      expect(resource.code.coding[0].system).toBe("http://loinc.org");
      expect(resource.referenceRange[0].low.value).toBeDefined();
    }
  });

  test("J965 /api/overview?persona=patient names HbA1c as the first, red signal", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(
      page,
      `/api/overview?persona=patient&patientId=${P1}`,
    );
    expect(view.persona).toBe("patient");
    expect(view.signals[0].severity).toBe("bad");
    expect(view.signals[0].nodeId).toBe("param:4548-4");
    const hba1c = view.nodes.find(
      (n: { id: string }) => n.id === "param:4548-4",
    );
    expect(hba1c.series).toHaveLength(6);
    expect(hba1c.range.high).toBe(6);
    expect(hba1c.status).toBe("bad");
  });

  test("J966 the patient view never contains another patient's name or a Neo4j label", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(
      page,
      `/api/overview?persona=patient&patientId=${P1}`,
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain("OMOPConditionOccurrence");
    expect(text).not.toContain("FROM_DATASET");
    const people = view.nodes.filter(
      (n: { kind: string }) => n.kind === "Patient",
    );
    expect(people).toHaveLength(1);
    expect(people[0].label).toBe("Anna Müller");
  });

  test("J967 /overview: the list is readable without the canvas, a click opens the panel", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAsAdmin(page);
    await page.goto(`/overview?persona=patient&patientId=${P1}`);
    await expect(page.getByTestId("overview-question")).toBeVisible({
      timeout: 45_000,
    });
    const first = page.getByTestId("overview-signal").first();
    await expect(first).toHaveAttribute("data-severity", "bad");
    await expect(page.getByTestId("overview-canvas")).toHaveCount(0);
    await first.click();
    await expect(page.getByTestId("overview-detail")).toBeVisible();
    await expect(page.getByTestId("overview-detail")).toContainText("HbA1c");
    await expect(page.getByTestId("overview-trend")).toContainText("rising");
    await expect(page.getByTestId("overview-series-row")).toHaveCount(6);
  });
});

// ── M2 Access body ─────────────────────────────────────────────────────────

test.describe("Issue #271 · M2 access body overview", () => {
  test("J968 PharmaCo's accesses after credential expiry are a bad signal", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=hdab");
    const codes = view.signals.map((s: { code: string }) => s.code);
    expect(codes).toContain("access-after-credential-expiry");
    const s = view.signals.find(
      (x: { code: string }) => x.code === "access-after-credential-expiry",
    );
    expect(s.severity).toBe("bad");
    expect(s.nodeId).toBe(`p:${PHARMACO}`);
    expect(s.article).toContain("Art. 61(1)");
  });

  test("J969 the refused applicant's attempts are a matter for Art. 63", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=hdab");
    const s = view.signals.find(
      (x: { code: string }) => x.code === "access-attempt-after-refusal",
    );
    expect(s.nodeId).toBe(`p:${IRS}`);
    expect(s.article).toContain("Art. 63");
    const irs = view.nodes.find((n: { id: string }) => n.id === `p:${IRS}`);
    expect(irs.measure).toContain("Refused");
    expect(irs.series.at(-1).value).toBeGreaterThan(0);
  });

  test("J970 my own overdue decisions are listed against the Art. 68(4) clock", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=hdab");
    const overdue = view.signals.filter(
      (s: { code: string }) => s.code === "decision-overdue",
    );
    expect(overdue.length).toBeGreaterThanOrEqual(2);
    expect(overdue[0].article).toContain("Art. 68(4)");
    const me = view.nodes.find((n: { id: string }) => n.id === "me");
    expect(me.measure).toContain("Pending applications");
    expect(me.range.high).toBe(2);
  });

  test("J971 the signals are ordered bad, warn, info, ok", async ({ page }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=hdab");
    const rank: Record<string, number> = { bad: 3, warn: 2, info: 1, ok: 0 };
    const ranks = view.signals.map(
      (s: { severity: string }) => rank[s.severity],
    );
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });
});

// ── M3 Holder ──────────────────────────────────────────────────────────────

test.describe("Issue #271 · M3 holder overview", () => {
  test("J972 Limburg's flow without a contract and the label below its band", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=hospital");
    const codes = view.signals.map((s: { code: string }) => s.code);
    expect(codes).toContain("transfer-without-contract");
    // Limburg's monthly accesses carry no contract reference; the two demo
    // events of the audit seed do, so on Azure the finding is "partly".
    const lmc = view.signals.find(
      (s: { code: string; nodeId: string }) =>
        /^transfer-.*without-contract$/.test(s.code) && s.nodeId === `c:${LMC}`,
    );
    expect(lmc?.severity).toBe("warn");
    const label = view.nodes.find((n: { id: string }) =>
      n.id.startsWith("vc:vc:data-quality-label"),
    );
    expect(label.series).toHaveLength(8);
    expect(label.series.at(-1).value).toBeLessThan(0.9);
    expect(label.higherIsWorse).toBe(false);
    expect(label.status).toBe("bad");
  });
});

// ── M4 Researcher ──────────────────────────────────────────────────────────

test.describe("Issue #271 · M4 researcher overview", () => {
  test("J973 my pending application shows its clock and my expired credential is red", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const view = await apiGet(page, "/api/overview?persona=researcher");
    const app = view.nodes.find((n: { id: string }) =>
      n.id.startsWith("app:app-pharmaco-medreg-2026-002"),
    );
    expect(
      app.facts.some(([k]: [string, string]) => k === "decision due"),
    ).toBe(true);
    const cred = view.nodes.find((n: { id: string }) =>
      n.id.startsWith("vc:vc:data-processing-purpose"),
    );
    expect(cred.status).toBe("bad");
    const studies = view.nodes.filter(
      (n: { kind: string }) => n.kind === "Study",
    );
    expect(studies.length).toBeGreaterThanOrEqual(3);
    expect(
      studies.every((s: { series: unknown[] }) => s.series.length === 10),
    ).toBe(true);
  });
});

// ── M5 Static export ───────────────────────────────────────────────────────

test.describe("Issue #271 · M5 static export", () => {
  test("J974 the observations fixture is served and matches the API shape", async ({
    page,
  }) => {
    const res = await page.request.get("/mock/patient_observations.json");
    test.skip(!res.ok(), "mock fixtures are not served by this deployment");
    const bundle = await res.json();
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.total).toBe(48);
    expect(bundle.meta.tag[0].code).toBe("fictional");
  });

  test("J975 the four overview fixtures exist for the static site", async ({
    page,
  }) => {
    for (const persona of ["patient", "researcher", "hdab", "hospital"]) {
      const res = await page.request.get(`/mock/overview_${persona}.json`);
      expect(res.ok(), persona).toBe(true);
      const view = await res.json();
      expect(view.persona).toBe(persona);
      expect(view.signals.length).toBeGreaterThan(0);
    }
  });
});
