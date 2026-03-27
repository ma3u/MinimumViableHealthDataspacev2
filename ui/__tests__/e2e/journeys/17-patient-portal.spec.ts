/**
 * Journey Group P — Patient Portal & EHDS Chapter II Primary Use (J176–J200)
 *
 * Tests the patient portal features implementing GDPR Art. 15-22 and
 * EHDS Chapter II (Art. 3-12) patient data rights:
 *
 *   J176–J180 — /api/patient/profile  (GDPR Art. 15 / EHDS Art. 3)
 *   J181–J185 — /api/patient/research (EHDS Art. 10 — consent)
 *   J186–J190 — /api/patient/insights (EHDS Art. 50 — findings)
 *   J191–J195 — Patient portal UI pages
 *   J196–J200 — Patient persona graph + navigation
 */
import { test, expect } from "@playwright/test";
import { T, apiGet, skipIfNeo4jDown } from "./helpers";

// ── J176–J180: Patient profile API ───────────────────────────────────────────

test.describe("P · Patient Profile — GDPR Art. 15 / EHDS Art. 3", () => {
  test("J176 — /api/patient/profile lists patients", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/patient/profile");
    expect(Array.isArray(data.patients)).toBe(true);
  });

  test("J177 — Patient list entries have required fields", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/patient/profile");
    if (data.patients.length > 0) {
      const p = data.patients[0];
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.gender).toBe("string");
    }
  });

  test("J178 — Patient profile returns risk scores", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const list = await apiGet(page, "/api/patient/profile");
    if (list.patients.length === 0) {
      test.skip(true, "No patients in graph");
      return;
    }
    const pid = list.patients[0].id;
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(pid)}`,
    );
    expect(data.patient).toBeDefined();
    expect(data.riskScores).toBeDefined();
    expect(typeof data.riskScores.cardiovascular.score).toBe("number");
    expect(["low", "moderate", "high"]).toContain(
      data.riskScores.cardiovascular.level,
    );
  });

  test("J179 — Profile includes GDPR rights metadata", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const list = await apiGet(page, "/api/patient/profile");
    if (list.patients.length === 0) {
      test.skip(true, "No patients");
      return;
    }
    const pid = list.patients[0].id;
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(pid)}`,
    );
    expect(data.gdprRights).toBeDefined();
    expect(data.gdprRights.rightToAccess).toContain("Art. 15");
    expect(data.gdprRights.ehdsAccess).toContain("EHDS Art. 3");
  });

  test("J180 — Profile includes conditions list", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const list = await apiGet(page, "/api/patient/profile");
    if (list.patients.length === 0) {
      test.skip(true, "No patients");
      return;
    }
    const pid = list.patients[0].id;
    const data = await apiGet(
      page,
      `/api/patient/profile?patientId=${encodeURIComponent(pid)}`,
    );
    expect(Array.isArray(data.conditions)).toBe(true);
    expect(Array.isArray(data.interests)).toBe(true);
    expect(data.interests).toContain("longevity");
  });
});

// ── J181–J185: Research program API ──────────────────────────────────────────

test.describe("P · Research Programs — EHDS Art. 10 Consent", () => {
  test("J181 — /api/patient/research returns programs array", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/patient/research");
    expect(Array.isArray(data.programs)).toBe(true);
    expect(typeof data.ehdsArticle).toBe("string");
    expect(data.ehdsArticle).toContain("Art. 10");
  });

  test("J182 — Programs have required fields", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/patient/research");
    if (data.programs.length > 0) {
      const prog = data.programs[0];
      expect(typeof prog.studyId).toBe("string");
      expect(typeof prog.studyName).toBe("string");
      expect(typeof prog.institution).toBe("string");
    }
  });

  test("J183 — POST /api/patient/research registers consent", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const programs = await apiGet(page, "/api/patient/research");
    if (programs.programs.length === 0) {
      test.skip(true, "No programs available");
      return;
    }
    const studyId = programs.programs[0].studyId;
    const res = await page.request.post("/api/patient/research", {
      data: { patientId: "test-patient-e2e", studyId },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(typeof data.consentId).toBe("string");
    expect(data.ehdsArticle).toContain("Art. 10");
  });

  test("J184 — GET with patientId returns consents array", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/research?patientId=test-patient-e2e",
    );
    expect(Array.isArray(data.consents)).toBe(true);
  });

  test("J185 — DELETE /api/patient/research revokes consent", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    // First create a consent to revoke
    const programs = await apiGet(page, "/api/patient/research");
    if (programs.programs.length === 0) {
      test.skip(true, "No programs");
      return;
    }
    const studyId = programs.programs[0].studyId;
    const patientId = "test-patient-revoke-e2e";
    const createRes = await page.request.post("/api/patient/research", {
      data: { patientId, studyId },
      headers: { "Content-Type": "application/json" },
    });
    const consent = await createRes.json();
    if (!consent.consentId) {
      test.skip(true, "Consent creation failed");
      return;
    }
    // Now revoke it
    const delRes = await page.request.delete(
      `/api/patient/research?consentId=${consent.consentId}&patientId=${patientId}`,
    );
    expect(delRes.ok()).toBe(true);
    const data = await delRes.json();
    expect(data.revoked).toBe(true);
    expect(data.gdprArticle).toContain("Art. 17");
  });
});

// ── J186–J190: Research insights API ─────────────────────────────────────────

test.describe("P · Research Insights — EHDS Art. 50", () => {
  test("J186 — /api/patient/insights returns insights structure", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/insights?patientId=demo-patient-1",
    );
    expect(typeof data.activeDonations).toBe("number");
    expect(Array.isArray(data.findings)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
  });

  test("J187 — Insights include privacy note about k-anonymity", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/insights?patientId=demo-patient-1",
    );
    expect(typeof data.privacyNote).toBe("string");
    expect(data.privacyNote.toLowerCase()).toMatch(/k.*5|aggregate|pseudonym/);
  });

  test("J188 — Insights include EHDS article references", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/insights?patientId=demo-patient-1",
    );
    expect(data.ehdsArticles).toBeDefined();
    expect(data.ehdsArticles.primaryAccess).toContain("Art. 3");
    expect(data.ehdsArticles.speProtection).toContain("Art. 50");
  });

  test("J189 — Findings have required fields", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/insights?patientId=demo-patient-1",
    );
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
    await skipIfNeo4jDown(page);
    const data = await apiGet(
      page,
      "/api/patient/insights?patientId=demo-patient-1",
    );
    if (data.recommendations.length > 0) {
      const rec = data.recommendations[0];
      expect(typeof rec.action).toBe("string");
      expect(["high", "medium", "low"]).toContain(rec.priority);
    }
  });
});

// ── J191–J195: Patient portal UI pages ───────────────────────────────────────

test.describe("P · Patient Portal UI", () => {
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

  test("J194 — Research page shows EHDS Art. 10 banner", async ({ page }) => {
    await page.goto("/patient/research");
    await expect(page.getByText(/EHDS Art\. 10/i).first()).toBeVisible({
      timeout: T,
    });
  });

  test("J195 — /patient/insights page renders", async ({ page }) => {
    await page.goto("/patient/insights");
    await expect(
      page.getByText(/Research Insights|Medical Recommendations/i).first(),
    ).toBeVisible({ timeout: T });
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

  test("J197 — Graph persona selector shows Patient/Citizen option", async ({
    page,
  }) => {
    await page.goto("/graph");
    await expect(page.getByText("Patient / Citizen").first()).toBeVisible({
      timeout: T,
    });
  });

  test("J198 — Patient persona shows EHDS Art. 3-12 article", async ({
    page,
  }) => {
    await page.goto("/graph");
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
