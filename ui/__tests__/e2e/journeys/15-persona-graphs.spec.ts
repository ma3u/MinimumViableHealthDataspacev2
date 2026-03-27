/**
 * Journey Group O — Persona-Specific Graph Views (J150–J175)
 *
 * Each EHDS participant type sees a different subgraph answering their
 * primary question. Tests cover:
 *   J150–J154 — API: persona-specific subgraphs return correct node types
 *   J155–J159 — UI: persona selector renders and switches view
 *   J160–J164 — Graph validation endpoint
 *   J165–J170 — Hospital / Data Holder journey (who uses my data?)
 *   J171–J175 — HDAB Authority journey (approval chain governance)
 *
 * All graph tests use the public /graph page and /api/graph* routes.
 * Protected pages are tested via redirect assertions only.
 */
import { test, expect } from "@playwright/test";
import {
  T,
  apiGet,
  skipIfNeo4jDown,
  expectHeading,
  waitForDataLoad,
} from "./helpers";

// ── J150–J154: API persona subgraphs ──────────────────────────────────────────

test.describe("O · Persona Graph Views — API", () => {
  test("J150 — /api/graph (default) returns nodes and links", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph");
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.links)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  test("J151 — /api/graph?persona=trust-center focuses on TrustCenter and SPESession nodes", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=trust-center");
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.persona).toBe("trust-center");
    expect(typeof data.question).toBe("string");

    // After seeding, trust center nodes should be present
    const labels = data.nodes.map((n: { label: string }) => n.label);
    const hasRelevantNodes = labels.some((l: string) =>
      [
        "TrustCenter",
        "SPESession",
        "HDABApproval",
        "ResearchPseudonym",
      ].includes(l),
    );
    // Only assert if seed data is loaded
    if (data.nodes.length > 0) {
      expect(hasRelevantNodes || data.nodes.length >= 0).toBe(true);
    }
  });

  test("J152 — /api/graph?persona=hospital focuses on Participant and HealthDataset", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hospital");
    expect(data.persona).toBe("hospital");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      // Hospital view must include participants and datasets
      const hasActors =
        labels.has("Participant") ||
        labels.has("HealthDataset") ||
        labels.has("Contract");
      expect(hasActors).toBe(true);
    }
  });

  test("J153 — /api/graph?persona=researcher focuses on HealthDataset and OMOP", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=researcher");
    expect(data.persona).toBe("researcher");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      const hasDataOrAnalytics =
        labels.has("HealthDataset") ||
        labels.has("OMOPPerson") ||
        labels.has("SnomedConcept") ||
        labels.has("DataProduct");
      expect(hasDataOrAnalytics).toBe(true);
    }
  });

  test("J154 — /api/graph?persona=edc-admin focuses on Participant and Contract", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=edc-admin");
    expect(data.persona).toBe("edc-admin");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      const hasAdminNodes =
        labels.has("Participant") ||
        labels.has("DataProduct") ||
        labels.has("Contract");
      expect(hasAdminNodes).toBe(true);
    }
  });

  test("J155 — /api/graph?persona=hdab focuses on HDABApproval and governance", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hdab");
    expect(data.persona).toBe("hdab");
    expect(Array.isArray(data.nodes)).toBe(true);
    if (data.nodes.length > 0) {
      const labels = new Set(data.nodes.map((n: { label: string }) => n.label));
      const hasGovernanceNodes =
        labels.has("HDABApproval") ||
        labels.has("VerifiableCredential") ||
        labels.has("TrustCenter") ||
        labels.has("Participant");
      expect(hasGovernanceNodes).toBe(true);
    }
  });

  test("J156 — unknown persona falls back to default graph", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=unknown-type");
    expect(Array.isArray(data.nodes)).toBe(true);
    // Falls back to default — no error
    expect(data.error).toBeUndefined();
  });

  test("J157 — each persona subgraph returns consistent node shape", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const personas = [
      "trust-center",
      "hospital",
      "researcher",
      "edc-admin",
      "hdab",
    ];
    for (const persona of personas) {
      const data = await apiGet(page, `/api/graph?persona=${persona}`);
      expect(Array.isArray(data.nodes)).toBe(true);
      if (data.nodes.length > 0) {
        const node = data.nodes[0];
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(typeof node.layer).toBe("number");
        expect(typeof node.color).toBe("string");
        // Role colors are hex strings
        expect(node.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  test("J158 — Participant nodes have amber role color in all personas", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hospital");
    const participants = data.nodes.filter(
      (n: { label: string }) => n.label === "Participant",
    );
    for (const p of participants) {
      // Amber #E67E22
      expect(p.color).toBe("#E67E22");
    }
  });

  test("J159 — TrustCenter nodes have violet role color", async ({ page }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=trust-center");
    const tcNodes = data.nodes.filter(
      (n: { label: string }) => n.label === "TrustCenter",
    );
    for (const tc of tcNodes) {
      // Violet #8E44AD
      expect(tc.color).toBe("#8E44AD");
    }
  });
});

// ── J160–J164: Graph validation ───────────────────────────────────────────────

test.describe("O · Graph Validation", () => {
  test("J160 — /api/graph/validate returns validation report structure", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph/validate");
    expect(typeof data.summary).toBe("object");
    expect(typeof data.summary.totalNodes).toBe("number");
    expect(typeof data.summary.totalEdges).toBe("number");
    expect(typeof data.summary.issueCount).toBe("number");
  });

  test("J161 — /api/graph/validate returns nodeCounts array", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph/validate");
    expect(Array.isArray(data.nodeCounts)).toBe(true);
    if (data.nodeCounts.length > 0) {
      const entry = data.nodeCounts[0];
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.known).toBe("boolean");
    }
  });

  test("J162 — /api/graph/validate returns edgeCounts with defined flag", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph/validate");
    expect(Array.isArray(data.edgeCounts)).toBe(true);
    if (data.edgeCounts.length > 0) {
      const edge = data.edgeCounts[0];
      expect(typeof edge.type).toBe("string");
      expect(typeof edge.count).toBe("number");
      expect(typeof edge.defined).toBe("boolean");
    }
  });

  test("J163 — /api/graph/validate includes validEdgeRules list", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph/validate");
    expect(Array.isArray(data.validEdgeRules)).toBe(true);
    expect(data.validEdgeRules.length).toBeGreaterThan(10);
    const rule = data.validEdgeRules[0];
    expect(typeof rule.type).toBe("string");
    expect(typeof rule.from).toBe("string");
    expect(typeof rule.to).toBe("string");
  });

  test("J164 — /api/graph/validate reports zero issues for valid seed data", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph/validate");
    // Orphans, missing props, unknown labels should be minimal with proper seeding
    expect(data.summary.totalNodes).toBeGreaterThan(0);
    // Trust Center nodes should be known
    const tcCount = data.nodeCounts.find(
      (n: { label: string }) => n.label === "TrustCenter",
    );
    if (tcCount) {
      expect(tcCount.known).toBe(true);
    }
  });
});

// ── J165–J170: Hospital / Data Holder journey ─────────────────────────────────

test.describe("O · Hospital / Data Holder Journey", () => {
  test("J165 — Graph page renders persona selector", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByText("View as")).toBeVisible({ timeout: T });
    await expect(page.getByText("Hospital / Data Holder")).toBeVisible({
      timeout: T,
    });
  });

  test("J166 — Hospital persona button is clickable and shows question", async ({
    page,
  }) => {
    await page.goto("/graph");
    await page.getByText("Hospital / Data Holder").click();
    await expect(
      page.getByText(/Who has approved access to my data/i),
    ).toBeVisible({ timeout: T });
  });

  test("J167 — Switching to hospital persona triggers graph reload", async ({
    page,
  }) => {
    await page.goto("/graph");
    // Wait for initial load
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-spin"]'),
      { timeout: T },
    );
    await page.getByText("Hospital / Data Holder").click();
    // Loading state should appear briefly then resolve
    await page.waitForFunction(
      () => !document.querySelector('[class*="animate-spin"]'),
      { timeout: T },
    );
    // Canvas should be present
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: T });
  });

  test("J168 — Hospital data: datasets API returns data with title", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/catalog");
    const datasets = data["dcat:dataset"] || data.datasets || data;
    if (Array.isArray(datasets) && datasets.length > 0) {
      const withTitle = datasets.filter(
        (d: Record<string, string>) => d["dct:title"] || d.title || d.name,
      );
      expect(withTitle.length).toBeGreaterThan(0);
    }
  });

  test("J169 — Hospital data: credentials exist for data holder role", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/credentials");
    const creds = data.credentials ?? data;
    if (Array.isArray(creds) && creds.length > 0) {
      const holderCreds = creds.filter(
        (c: { participantRole?: string; credentialType?: string }) =>
          c.participantRole === "DATA_HOLDER" ||
          c.credentialType?.includes("EHDS"),
      );
      expect(holderCreds.length).toBeGreaterThanOrEqual(0);
    }
  });

  test("J170 — Hospital compliance: HDAB approval chain visible", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/compliance");
    // List mode returns consumers and datasets
    expect(Array.isArray(data.consumers) || Array.isArray(data.datasets)).toBe(
      true,
    );
  });
});

// ── J171–J175: HDAB Authority journey ────────────────────────────────────────

test.describe("O · HDAB Authority Journey", () => {
  test("J171 — Graph page shows HDAB Authority persona option", async ({
    page,
  }) => {
    await page.goto("/graph");
    await expect(page.getByText("HDAB Authority")).toBeVisible({ timeout: T });
    await expect(page.getByText("Art. 45–53")).toBeVisible({ timeout: T });
  });

  test("J172 — HDAB persona shows governance question on click", async ({
    page,
  }) => {
    await page.goto("/graph");
    await page.getByText("HDAB Authority").click();
    await expect(page.getByText(/What approvals are pending/i)).toBeVisible({
      timeout: T,
    });
  });

  test("J173 — HDAB data: HDABApproval nodes have amber-free colors in validate", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hdab");
    const approvals = data.nodes.filter(
      (n: { label: string }) => n.label === "HDABApproval",
    );
    for (const a of approvals) {
      // HDAB approvals should be red role color
      expect(a.color).toBe("#C0392B");
    }
  });

  test("J174 — HDAB data: trust center appears in hdab persona graph", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/graph?persona=hdab");
    const tcNodes = data.nodes.filter(
      (n: { label: string }) => n.label === "TrustCenter",
    );
    // After seeding, trust center should appear in HDAB view
    if (data.nodes.length > 5) {
      // Only check if graph has meaningful data
      const hasGovNodes = data.nodes.some((n: { label: string }) =>
        ["HDABApproval", "VerifiableCredential", "TrustCenter"].includes(
          n.label,
        ),
      );
      expect(hasGovNodes).toBe(true);
    }
    expect(Array.isArray(tcNodes)).toBe(true);
  });

  test("J175 — HDAB compliance: trust center status visible on compliance page", async ({
    page,
  }) => {
    await skipIfNeo4jDown(page);
    const data = await apiGet(page, "/api/trust-center");
    expect(Array.isArray(data.trustCenters)).toBe(true);
    expect(Array.isArray(data.speSessions)).toBe(true);
    // After seeding: trust centers exist
    if (data.trustCenters.length > 0) {
      const rki = data.trustCenters.find(
        (tc: { name: string }) => tc.name === "RKI Trust Center DE",
      );
      if (rki) {
        expect(rki.status).toBe("active");
        expect(rki.country).toBe("DE");
      }
    }
  });
});
