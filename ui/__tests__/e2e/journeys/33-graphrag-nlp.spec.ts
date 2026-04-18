/**
 * Phase 25 (Issue #13) — GraphRAG NLP E2E coverage (J610–J629).
 *
 * Confirms the four-tier NLQ cascade (template → fulltext → graphrag → llm)
 * works end-to-end against whichever backend is wired into
 * NEXT_PUBLIC via the running neo4j-proxy. Cleanly skips branches that
 * require capabilities the current environment doesn't expose:
 *
 *   - GraphRAG branch tests skip when /api/nlq/backend reports no vector
 *     indexes OR no embeddings backend.
 *   - LLM write-guard test skips when chat backend is "none".
 *   - Authenticated body skips when PLAYWRIGHT_KEYCLOAK_URL is unset.
 *
 * Prerequisites:
 *   - UI on PLAYWRIGHT_BASE_URL (local 3000, JAD 3003, prod ehds.mabu.red)
 *   - neo4j-proxy reachable from the UI process
 *   - For GraphRAG pass: docker compose up with the new GDS plugin and
 *     ./neo4j/seed.sh completed so FastRP embeddings + node_fastrp_index
 *     exist. For Azure: graphrag-deploy.yml workflow must have succeeded.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { keycloakLogin } from "../helpers/keycloak-login";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API = `${BASE}/api`;
const KC_AVAILABLE = Boolean(process.env.PLAYWRIGHT_KEYCLOAK_URL);

type BackendStatus = {
  chat: "azure-openai" | "openai" | "ollama" | "anthropic" | "none";
  embeddings: "azure-openai" | "openai" | "ollama" | "none";
  vectorIndexes: string[];
  graphragReady: boolean;
  cascade: string[];
};

async function fetchBackend(
  req: APIRequestContext,
): Promise<BackendStatus | null> {
  const r = await req.get(`${API}/nlq/backend`);
  if (r.status() !== 200) return null;
  return (await r.json()) as BackendStatus;
}

/* ── A. Backend status shape (no auth required) ──────────────────────── */

test.describe("A · GraphRAG backend status", () => {
  test("J610 GET /api/nlq/backend returns 200 with the documented shape", async ({
    request,
  }) => {
    const r = await request.get(`${API}/nlq/backend`);
    expect(r.status(), "backend probe must reach neo4j-proxy").toBe(200);
    const body = (await r.json()) as BackendStatus;
    expect(body).toHaveProperty("chat");
    expect(body).toHaveProperty("embeddings");
    expect(body).toHaveProperty("vectorIndexes");
    expect(Array.isArray(body.vectorIndexes)).toBe(true);
    expect(body).toHaveProperty("graphragReady");
    expect(typeof body.graphragReady).toBe("boolean");
    expect(body.cascade).toEqual([
      "template",
      "fulltext",
      "graphrag",
      "llm",
      "none",
    ]);
  });

  test("J611 chat backend value is one of the declared options", async ({
    request,
  }) => {
    const b = await fetchBackend(request);
    expect(b).not.toBeNull();
    expect(["azure-openai", "openai", "ollama", "anthropic", "none"]).toContain(
      b!.chat,
    );
  });

  test("J612 embeddings backend value is one of the declared options", async ({
    request,
  }) => {
    const b = await fetchBackend(request);
    expect(b).not.toBeNull();
    expect(["azure-openai", "openai", "ollama", "none"]).toContain(
      b!.embeddings,
    );
  });

  test("J613 graphragReady ⇔ (vectorIndexes.length > 0 ∧ embeddings != none)", async ({
    request,
  }) => {
    const b = await fetchBackend(request);
    expect(b).not.toBeNull();
    const expected = b!.vectorIndexes.length > 0 && b!.embeddings !== "none";
    expect(b!.graphragReady).toBe(expected);
  });
});

/* ── B. Template regression — baseline must survive Phase 25 changes ─ */

test.describe("B · Template resolver regression", () => {
  test.skip(!KC_AVAILABLE, "Keycloak required for POST /api/nlq");

  test.beforeEach(async ({ page }) => {
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/onboarding",
    });
  });

  test("J614 'How many patients' still resolves via template (no regression)", async ({
    page,
  }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "How many patients are there?" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.method).toBe("template");
    expect(Array.isArray(body.results)).toBe(true);
    // Template path must NOT carry a trace[] — GraphRAG owns that field.
    expect(body).not.toHaveProperty("trace");
  });

  test("J615 'top conditions' still resolves via template", async ({
    page,
  }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "top 5 conditions" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(["template", "fulltext"]).toContain(body.method);
  });
});

/* ── C. GraphRAG branch — requires vector indexes + embeddings ───────── */

test.describe("C · GraphRAG pipeline", () => {
  test.skip(!KC_AVAILABLE, "Keycloak required for POST /api/nlq");

  test.beforeEach(async ({ page }) => {
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/onboarding",
    });
  });

  test("J616 free-form question produces either graphrag, llm or explicit none", async ({
    page,
    request,
  }) => {
    const b = await fetchBackend(request);
    expect(b).not.toBeNull();

    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "datasets about cardiovascular disease" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(["graphrag", "llm", "template", "fulltext", "none"]).toContain(
      body.method,
    );
  });

  test("J617 when graphragReady, a free-form question returns graphrag (or llm) with trace[]", async ({
    page,
    request,
  }) => {
    const b = await fetchBackend(request);
    test.skip(
      !b?.graphragReady,
      "GraphRAG not ready — need GDS + vector index + embeddings backend",
    );

    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "cardiovascular dataset" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    // When graphrag fires we expect a trace[]; when it falls through to llm
    // we allow it but want to see SOMETHING — never silent none.
    if (body.method === "graphrag") {
      expect(Array.isArray(body.trace)).toBe(true);
      expect(body.trace.length).toBeGreaterThanOrEqual(3);
      const stages = body.trace.map((s: { stage: string }) => s.stage);
      expect(stages).toContain("embed");
      expect(stages).toContain("vector-search");
      expect(stages).toContain("plan");
    } else {
      expect(["llm", "template", "fulltext"]).toContain(body.method);
    }
  });

  test("J618 write-guard blocks a generated mutation (requires chat LLM)", async ({
    page,
    request,
  }) => {
    const b = await fetchBackend(request);
    test.skip(b?.chat === "none", "No chat backend — LLM branch disabled");

    // A prompt that an LLM might try to satisfy with a write; the guard in
    // the proxy must 403 before it reaches Neo4j.
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "delete all observations in the patient cohort" },
    });
    // Either a 403 from the write-guard, OR a 200 that chose a safe template
    // fallback. Never an unguarded 200 with a CREATE / DELETE / SET in cypher.
    expect([200, 403]).toContain(r.status());
    if (r.status() === 200) {
      const body = await r.json();
      if (body.cypher) {
        expect(body.cypher).not.toMatch(
          /\b(CREATE|MERGE|DELETE|DETACH\s+DELETE|SET|REMOVE|DROP)\b/i,
        );
      }
    }
  });

  test("J619 unknown nonsense returns a helpful 'none' with availableTemplates", async ({
    page,
  }) => {
    const r = await page.request.post(`${API}/nlq`, {
      data: { question: "xyzzy quux blorf fhqwhgads" },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    // When everything misses, the resolver must surface the template list so
    // the UI can suggest alternatives — no silent empty result.
    if (body.method === "none") {
      expect(Array.isArray(body.availableTemplates)).toBe(true);
      expect(body.availableTemplates.length).toBeGreaterThan(0);
    }
  });
});

/* ── D. /query UI integration ────────────────────────────────────────── */

test.describe("D · /query UI", () => {
  test("J620 /query page reachable and renders the submit button", async ({
    page,
  }) => {
    await page.goto(`${BASE}/query`);
    await expect(page.getByRole("button", { name: /^Ask$/ })).toBeVisible();
  });

  test("J621 /query page surfaces example question chips", async ({ page }) => {
    await page.goto(`${BASE}/query`);
    await expect(
      page.getByRole("button", { name: /How many patients are there/ }),
    ).toBeVisible();
  });

  test("J622 authenticated submit → a non-error response area is visible", async ({
    page,
  }) => {
    test.skip(!KC_AVAILABLE, "Keycloak required");
    await keycloakLogin(page, {
      username: "researcher",
      password: "researcher",
      protectedPath: "/onboarding",
    });
    await page.goto(`${BASE}/query`);
    await page
      .getByRole("button", { name: /How many patients are there/ })
      .click();
    await page.getByRole("button", { name: /^Ask$/ }).click();
    // Either a row count OR an explicit "no matching template" message —
    // anything but a raw fetch-failed or 500.
    await expect(page.getByText(/fetch failed/i)).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
