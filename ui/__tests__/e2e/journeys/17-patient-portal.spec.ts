/**
 * Journey Group P — Patient Portal & EHDS Chapter II Primary Use (J176–J200)
 *
 * Tests the patient portal features implementing GDPR Art. 15-22 and
 * EHDS Chapter II (Art. 3-12) patient data rights:
 *
 *   J176–J180 — /api/patient/profile  (GDPR Art. 15 / EHDS Art. 3)
 *   J181–J185 — /api/patient/research (study consent, GDPR Art. 9(2)(a))
 *   J186–J190 — /api/patient/insights (findings; SPE, EHDS Art. 73)
 *   J191–J195 — Patient portal UI pages
 *   J1081–J1082 — patient1 sees their own insights and programmes
 *   J196–J200 — Patient persona graph + navigation
 *
 * API tests (J176–J190) and UI tests (J191–J195) require Keycloak
 * authentication as patient1 because the patient routes check session roles.
 * They sign in before the Neo4j probe, which needs a session (#404), and ask
 * for patient1's own record, P1 (#475).
 *
 * J183 and J185 write: a consent of P1, which each removes again before it
 * ends (Bolt, E2E_NEO4J_BOLT, default bolt://localhost:7687). They skip
 * unless PLAYWRIGHT_BASE_URL is localhost or 127.0.0.1, so they never write
 * to the live hub.
 */
import { test, expect, type Page } from "@playwright/test";
import neo4j, { type Driver } from "neo4j-driver";
import {
  T,
  apiGet,
  skipIfNeo4jDown,
  skipIfKeycloakDown,
  loginAs,
} from "./helpers";

/** patient1 owns P1; the routes refuse any other record with a 403 (#475). */
const OWN = "P1";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
/** Writes run only against a stack on this machine, never the live hub. */
const LOCAL_STACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(
  BASE_URL,
);
const BOLT = process.env.E2E_NEO4J_BOLT ?? "bolt://localhost:7687";

/**
 * A Neo4j connection to take back what a test wrote, or null. DELETE
 * /api/patient/research only revokes (the consent stays, marked revoked), so
 * a test that consents removes its consent node itself afterwards.
 */
async function cleanupDriver(): Promise<Driver | null> {
  const driver = neo4j.driver(
    BOLT,
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  try {
    await driver.verifyConnectivity();
    return driver;
  } catch {
    await driver.close();
    return null;
  }
}

/**
 * Remove the consent of `patientId` to `studyId`. Called only for a pair that
 * had no consent before the test: the route MERGEs on the pair, so whatever
 * is there now is the test's own.
 */
async function removeConsent(
  driver: Driver,
  patientId: string,
  studyId: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (pc:PatientConsent {patientId: $patientId, studyId: $studyId})
       DETACH DELETE pc`,
      { patientId, studyId },
    );
  } finally {
    await session.close();
  }
}

/** A programme the patient has never consented to, or null. */
async function studyWithoutConsent(page: Page): Promise<string | null> {
  const data = await apiGet(page, `/api/patient/research?patientId=${OWN}`);
  const taken = new Set(
    (data.consents as { studyId: string }[]).map((c) => c.studyId),
  );
  const free = (data.programs as { studyId: string }[]).find(
    (p) => !taken.has(p.studyId),
  );
  return free?.studyId ?? null;
}

/**
 * Skips unless the test may write and can undo it; returns what it needs.
 * The caller removes the consent in a `finally`.
 */
async function prepareWrite(
  page: Page,
): Promise<{ driver: Driver; studyId: string } | null> {
  if (!LOCAL_STACK) {
    test.skip(
      true,
      `Writes a consent: runs only against a local stack (localhost or 127.0.0.1), not ${BASE_URL}`,
    );
    return null;
  }
  const driver = await cleanupDriver();
  if (!driver) {
    test.skip(
      true,
      `Cannot remove the test's consent afterwards: no Neo4j on ${BOLT} (set E2E_NEO4J_BOLT)`,
    );
    return null;
  }
  const studyId = await studyWithoutConsent(page);
  if (!studyId) {
    await driver.close();
    test.skip(true, `Every programme already holds a consent of ${OWN}`);
    return null;
  }
  return { driver, studyId };
}

// ── J176–J180: Patient profile API ───────────────────────────────────────────

test.describe("P · Patient Profile — GDPR Art. 15 / EHDS Art. 3", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    // Signed in first: /api/graph, the Neo4j probe, needs a session (#404).
    await loginAs(page, "patient1", "patient1");
    await skipIfNeo4jDown(page);
  });

  test("J176 — /api/patient/profile lists the patient's own record", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/patient/profile");
    expect(Array.isArray(data.patients)).toBe(true);
    for (const p of data.patients) expect(p.id).toBe(OWN);
  });

  test("J177 — Patient list entries have required fields", async ({ page }) => {
    const data = await apiGet(page, "/api/patient/profile");
    if (data.patients.length > 0) {
      const p = data.patients[0];
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.gender).toBe("string");
    }
  });

  test("J178 — Patient profile returns risk scores", async ({ page }) => {
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(OWN)}`,
    );
    expect(data.patient).toBeDefined();
    expect(data.riskScores).toBeDefined();
    expect(typeof data.riskScores.cardiovascular.score).toBe("number");
    expect(["low", "moderate", "high"]).toContain(
      data.riskScores.cardiovascular.level,
    );
  });

  test("J179 — Profile includes GDPR rights metadata", async ({ page }) => {
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(OWN)}`,
    );
    expect(data.gdprRights).toBeDefined();
    expect(data.gdprRights.rightToAccess).toContain("Art. 15");
    expect(data.gdprRights.ehdsAccess).toContain("EHDS Art. 3");
  });

  test("J180 — Profile includes conditions list", async ({ page }) => {
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(OWN)}`,
    );
    expect(Array.isArray(data.conditions)).toBe(true);
    expect(Array.isArray(data.interests)).toBe(true);
    expect(data.interests).toContain("longevity");
  });
});

// ── J181–J185: Research program API ──────────────────────────────────────────

test.describe("P · Research Programs — study consent and the Art. 71 opt-out", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    // Signed in first: /api/graph, the Neo4j probe, needs a session (#404).
    await loginAs(page, "patient1", "patient1");
    await skipIfNeo4jDown(page);
  });

  test("J181 — /api/patient/research returns programs array", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/patient/research");
    expect(Array.isArray(data.programs)).toBe(true);
    expect(typeof data.ehdsArticle).toBe("string");
    expect(data.ehdsArticle).toContain("GDPR Art. 9(2)(a)");
  });

  test("J182 — Programs have required fields", async ({ page }) => {
    const data = await apiGet(page, "/api/patient/research");
    if (data.programs.length > 0) {
      const prog = data.programs[0];
      expect(typeof prog.studyId).toBe("string");
      expect(typeof prog.studyName).toBe("string");
      expect(typeof prog.institution).toBe("string");
    }
  });

  test("J184 — GET with the patient's own id returns consents array", async ({
    page,
  }) => {
    const data = await apiGet(
      page,
      `/api/patient/research?patientId=${encodeURIComponent(OWN)}`,
    );
    expect(Array.isArray(data.consents)).toBe(true);
  });

  // The two that write: one after the other, so they never pick the same
  // programme, and each removes its consent before it ends.
  test.describe("consent and withdrawal, on a local stack only", () => {
    test.describe.configure({ mode: "serial" });

    test("J183 — POST /api/patient/research registers the patient's own consent", async ({
      page,
    }) => {
      const ready = await prepareWrite(page);
      if (!ready) return;
      const { driver, studyId } = ready;
      try {
        const res = await page.request.post("/api/patient/research", {
          data: { patientId: OWN, studyId },
          headers: { "Content-Type": "application/json" },
        });
        expect(res.ok()).toBe(true);
        const data = await res.json();
        expect(typeof data.consentId).toBe("string");
        expect(data.patientId).toBe(OWN);
        expect(data.ehdsArticle).toContain("GDPR Art. 9(2)(a)");

        const after = await apiGet(
          page,
          `/api/patient/research?patientId=${OWN}`,
        );
        expect(
          after.consents.some(
            (c: { consentId: string; revoked: boolean }) =>
              c.consentId === data.consentId && !c.revoked,
          ),
        ).toBe(true);
      } finally {
        await removeConsent(driver, OWN, studyId);
        await driver.close();
      }
      const end = await apiGet(page, `/api/patient/research?patientId=${OWN}`);
      expect(
        end.consents.some((c: { studyId: string }) => c.studyId === studyId),
      ).toBe(false);
    });

    test("J185 — DELETE /api/patient/research withdraws the patient's consent", async ({
      page,
    }) => {
      const ready = await prepareWrite(page);
      if (!ready) return;
      const { driver, studyId } = ready;
      try {
        const createRes = await page.request.post("/api/patient/research", {
          data: { patientId: OWN, studyId },
          headers: { "Content-Type": "application/json" },
        });
        expect(createRes.ok()).toBe(true);
        const consent = await createRes.json();
        expect(typeof consent.consentId).toBe("string");

        const delRes = await page.request.delete(
          `/api/patient/research?consentId=${encodeURIComponent(
            consent.consentId,
          )}&patientId=${OWN}`,
        );
        expect(delRes.ok()).toBe(true);
        const data = await delRes.json();
        expect(data.revoked).toBe(true);
        expect(data.gdprArticle).toContain("Art. 7(3)");
      } finally {
        await removeConsent(driver, OWN, studyId);
        await driver.close();
      }
      const end = await apiGet(page, `/api/patient/research?patientId=${OWN}`);
      expect(
        end.consents.some((c: { studyId: string }) => c.studyId === studyId),
      ).toBe(false);
    });
  });
});

// ── J186–J190: Research insights API ─────────────────────────────────────────

// patient1 owns P1; any other record is refused with a 403 (#475).
test.describe("P · Research Insights — EHDS Art. 73", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    // Signed in first: /api/graph, the Neo4j probe, needs a session (#404).
    await loginAs(page, "patient1", "patient1");
    await skipIfNeo4jDown(page);
  });

  test("J186 — /api/patient/insights returns insights structure", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/patient/insights?patientId=P1");
    expect(typeof data.activeDonations).toBe("number");
    expect(Array.isArray(data.findings)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
  });

  test("J187 — Insights include privacy note about k-anonymity", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/patient/insights?patientId=P1");
    expect(typeof data.privacyNote).toBe("string");
    expect(data.privacyNote.toLowerCase()).toMatch(/k.*5|aggregate|pseudonym/);
  });

  test("J188 — Insights include EHDS article references", async ({ page }) => {
    const data = await apiGet(page, "/api/patient/insights?patientId=P1");
    expect(data.ehdsArticles).toBeDefined();
    expect(data.ehdsArticles.primaryAccess).toContain("Art. 3");
    expect(data.ehdsArticles.speProtection).toContain("Art. 73");
  });

  test("J189 — Findings have required fields", async ({ page }) => {
    const data = await apiGet(page, "/api/patient/insights?patientId=P1");
    if (data.findings.length > 0) {
      const f = data.findings[0];
      expect(typeof f.insightId).toBe("string");
      expect(typeof f.finding).toBe("string");
      expect(["high", "moderate", "low"]).toContain(f.evidenceLevel);
    }
  });

  test("J190 — Recommendations include priority and action", async ({
    page,
  }) => {
    const data = await apiGet(page, "/api/patient/insights?patientId=P1");
    if (data.recommendations.length > 0) {
      const rec = data.recommendations[0];
      expect(typeof rec.action).toBe("string");
      expect(["high", "medium", "low"]).toContain(rec.priority);
    }
  });
});

// ── J191–J195: Patient portal UI pages ───────────────────────────────────────

test.describe("P · Patient Portal UI", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfKeycloakDown();
    await loginAs(page, "patient1", "patient1");
  });

  test("J191 — /patient/profile page renders", async ({ page }) => {
    await page.goto("/patient/profile");
    await expect(page.getByText(/Health Profile.*Risk/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J192 — Profile page shows GDPR rights banner", async ({ page }) => {
    await page.goto("/patient/profile");
    await expect(
      page.getByText(/GDPR Art\. 15|Your data rights/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J193 — /patient/research page renders", async ({ page }) => {
    await page.goto("/patient/research");
    await expect(page.getByText(/Research Programs/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J194 — Research page shows the Art. 71 opt-out panel", async ({
    page,
  }) => {
    await page.goto("/patient/research");
    await expect(
      page.getByText(/Secondary use of your health data \(EHDS Art\. 71\)/i),
    ).toBeVisible({ timeout: T });
  });

  test("J195 — /patient/insights page renders", async ({ page }) => {
    await page.goto("/patient/insights");
    await expect(
      page.getByText(/Research Insights|Medical Recommendations/i).first(),
    ).toBeVisible({ timeout: T });
  });

  // Both pages asked for "demo-patient-1", which the routes refuse a patient
  // (#475), so patient1 saw no insights and no programmes.
  test("J1081 — patient1 sees their own research insights", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    await page.goto("/patient/insights");
    await expect(page.getByTestId("research-finding").first()).toBeVisible({
      timeout: T,
    });
    await expect(page.getByText("No insights available.")).toHaveCount(0);
  });

  test("J1082 — patient1 sees the research programmes", async ({ page }) => {
    await skipIfNeo4jDown(page);
    await page.goto("/patient/research");
    await expect(page.getByTestId("research-program-card").first()).toBeVisible(
      { timeout: T },
    );
  });
});

// ── J196–J200: Patient persona + navigation ───────────────────────────────────

test.describe("P · Patient Persona & Navigation", () => {
  test("J196 — /api/graph?persona=patient returns patient-focused nodes", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=patient");
    expect(data.persona).toBe("patient");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      const hasClinical =
        labels.has("Patient") ||
        labels.has("Condition") ||
        labels.has("OMOPPerson");
      expect(hasClinical).toBe(true);
    }
  });

  test("J197 — Graph shows Patient/Citizen persona via URL", async ({
    page,
  }) => {
    await page.goto("/graph?persona=patient");
    await expect(page.getByText("Patient / Citizen").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J198 — Patient persona shows EHDS Art. 3-12 article", async ({
    page,
  }) => {
    await page.goto("/graph?persona=patient");
    await expect(page.getByText("Art. 3–12").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J199 — Sign-in page shows patient1 persona card", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByText("patient1").first()).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText(/EHDS Art\. 3|access own EHR/i).first(),
    ).toBeVisible({ timeout: T });
  });

  test("J200 — Sign-in page shows patient2 persona card", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByText("patient2").first()).toBeVisible({
      timeout: T,
    });
    await expect(
      page.getByText(/MyHealth@EU|Art\. 7|portability/i).first(),
    ).toBeVisible({ timeout: T });
  });
});
