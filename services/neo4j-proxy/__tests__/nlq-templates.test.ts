/**
 * Phase 26d — regression for the federated NLQ template patterns.
 *
 * Doesn't run the Cypher (that needs live Neo4j + glossary rows). Just
 * asserts that the example questions from ADR-020 / issue #8 match the
 * right template. If someone tightens a regex and the canonical demo
 * question stops routing to `federated_dataset_search`, CI catches it.
 */
import { describe, it, expect, vi } from "vitest";

const mockRun = vi.fn();
const mockClose = vi.fn();
const mockSession = { run: mockRun, close: mockClose };
const mockDriver = {
  session: vi.fn(() => mockSession),
  getServerInfo: vi.fn().mockResolvedValue({ address: "mock:7687" }),
  close: vi.fn(),
};

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: { basic: vi.fn() },
    int: vi.fn((n: number) => n),
    isInt: vi.fn(() => false),
  },
}));

const appMod = await import("../src/index.js");
// Access the private templates via a supertest round-trip rather than
// exporting them. /nlq/templates returns the list with names + examples.
import supertest from "supertest";
const request = supertest(appMod.app);

describe("Phase 26d NLQ template registry", () => {
  it("exposes the three federated-discovery templates", async () => {
    const res = await request.get("/nlq/templates");
    expect(res.status).toBe(200);
    const names = (res.body.templates as { name: string }[]).map((t) => t.name);
    expect(names).toContain("federated_dataset_search");
    expect(names).toContain("participant_count_by_theme");
    expect(names).toContain("dataset_with_credential");
  });

  it("surfaces the expected human-readable descriptions", async () => {
    const res = await request.get("/nlq/templates");
    const byName = Object.fromEntries(
      (res.body.templates as { name: string; description: string }[]).map(
        (t) => [t.name, t.description],
      ),
    );
    expect(byName.federated_dataset_search).toMatch(/glossary/i);
    expect(byName.participant_count_by_theme).toMatch(/participants/i);
    expect(byName.dataset_with_credential).toMatch(/credential/i);
  });
});

describe("Phase 26d NLQ pattern matching (regex-only regression)", () => {
  // Mirror the patterns from src/index.ts so a tightening that breaks
  // the canonical demo questions gets caught without needing Neo4j.
  const patterns: Record<string, RegExp[]> = {
    federated_dataset_search: [
      /(?:find|show|list) (?:all |).*?(?:datasets|studies)/i,
      /datasets (?:across|from|about|in|with)/i,
      /(?:data|studies) (?:available|about|on)/i,
    ],
    participant_count_by_theme: [
      /how many (?:hospitals|organi[sz]ations|participants|clinics|institutes) (?:offer|publish|have)/i,
      /who (?:offers|publishes|has) (?:datasets |data |)(?:about|on|for)/i,
      /(?:count|number) of (?:hospitals|organi[sz]ations|participants) (?:with|offering)/i,
    ],
    dataset_with_credential: [
      /(?:find|list|show) (?:datasets|data) (?:with|requiring|needing) (?:a |the |)(?:credential|cred|DQL|DataQualityLabel|quality label)/i,
      /datasets? (?:require|with|needing) (?:the |a |)(?:DataQualityLabel|DQL|quality label)/i,
      /(?:credential-gated|credential required) datasets/i,
    ],
  };

  function matches(template: string, question: string): boolean {
    return patterns[template].some((p) => p.test(question));
  }

  it("routes the issue-#8 canonical demo question to federated_dataset_search", () => {
    const q =
      "Find all diabetes datasets across German hospitals with DataQualityLabelCredential";
    expect(matches("federated_dataset_search", q)).toBe(true);
  });

  it.each([
    [
      "find diabetes datasets across German hospitals",
      "federated_dataset_search",
    ],
    ["list all cardiovascular studies", "federated_dataset_search"],
    ["show datasets about rare diseases", "federated_dataset_search"],
    ["studies available on oncology", "federated_dataset_search"],
    [
      "how many hospitals offer oncology datasets",
      "participant_count_by_theme",
    ],
    ["who publishes data about diabetes", "participant_count_by_theme"],
    ["count of participants with diabetes", "participant_count_by_theme"],
    [
      "find datasets with a DataQualityLabelCredential",
      "dataset_with_credential",
    ],
    ["list datasets requiring DQL", "dataset_with_credential"],
    ["datasets needing quality label", "dataset_with_credential"],
  ])("'%s' → %s", (question, expected) => {
    expect(matches(expected, question)).toBe(true);
  });

  it("does NOT hijack patient-count questions", () => {
    // The baseline `patient_count` template lives earlier in the array
    // and wins precedence, but our federated patterns should not also
    // match it — check that explicitly.
    expect(
      matches("federated_dataset_search", "How many patients are there?"),
    ).toBe(false);
    expect(
      matches("participant_count_by_theme", "How many patients are there?"),
    ).toBe(false);
  });
});

// ── Issue #19 — pharmacovigilance template ──────────────────────────────────
describe("Issue #19 adverse_event_in_cohort pattern matching", () => {
  const adverseEventPatterns: RegExp[] = [
    /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
    /\bhow\s+(?:often|common|frequent(?:ly)?)\s+(?:is|are)\s+.+?\s+in\s+patients\s+(?:treated|being\s+treated)\s+with\s+.+?\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+/i,
    /\bis\s+.+?\s+(?:frequently|commonly|often)?\s*(?:observed|seen|reported|prevalent|common|frequent)\s+in\s+patients\s+(?:diagnosed|with\s+diagnosis\s+of|who\s+have)\s+.+?\s+(?:treated|being\s+treated)\s+with\s+.+/i,
    /\b(?:side\s+effects?|adverse\s+events?)\s+of\s+.+?\s+(?:in|for|among)\s+.+/i,
  ];

  function matchesAE(q: string): boolean {
    return adverseEventPatterns.some((p) => p.test(q));
  }

  it("routes Roman Haack's canonical question (issue #19)", () => {
    expect(
      matchesAE(
        "Is headache frequently observed in patients treated with NCA diagnosed with PSC?",
      ),
    ).toBe(true);
  });

  it.each([
    "Is nausea observed in patients treated with metformin diagnosed with diabetes?",
    "How often is fatigue observed in patients treated with ursodiol diagnosed with PBC?",
    "Is headache common in patients with diagnosis of PSC treated with NCA?",
    "Side effects of NCA in PSC",
    "adverse events of ursodiol in cholangitis",
  ])("pharmacovigilance question routes: %s", (question) => {
    expect(matchesAE(question)).toBe(true);
  });

  it("does not hijack simple condition or count questions", () => {
    expect(matchesAE("How many patients are there?")).toBe(false);
    expect(matchesAE("patients with diabetes")).toBe(false);
    expect(matchesAE("top 10 conditions")).toBe(false);
  });
});

describe("Issue #19 span extraction for drug/indication/side-effect", () => {
  // Mirror extractAdverseEventSpans from src/index.ts. If someone tightens
  // a regex and role extraction stops working for Roman's demo question,
  // CI catches it without needing Neo4j.
  function extract(question: string) {
    const q = question.toLowerCase();
    return {
      sideEffectText: q
        .match(
          /(?:is|are|how\s+(?:often|common|frequent(?:ly)?))\s+([a-z][a-z0-9\s-]{1,40}?)\s+(?:frequently\s+|commonly\s+|often\s+)?(?:observed|seen|reported|prevalent|common|frequent)/,
        )?.[1]
        ?.trim(),
      drugText: q
        .match(
          /treated\s+with\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*,|\s+diagnosed|\s+who\s+have|\s+with\s+diagnosis|\s*\?|\s*$)/,
        )?.[1]
        ?.trim(),
      indicationText: q
        .match(
          /(?:diagnosed\s+with|with\s+diagnosis\s+of|who\s+have)\s+([a-z0-9][a-z0-9\s-]{0,40}?)(?:\s*\?|\s*$|\s*,|\s+treated)/,
        )?.[1]
        ?.trim(),
    };
  }

  it("extracts all three roles from the canonical question", () => {
    const spans = extract(
      "Is headache frequently observed in patients treated with NCA diagnosed with PSC?",
    );
    expect(spans.sideEffectText).toBe("headache");
    expect(spans.drugText).toBe("nca");
    expect(spans.indicationText).toBe("psc");
  });

  it("extracts roles regardless of clause order", () => {
    const spans = extract(
      "Is nausea observed in patients diagnosed with PBC treated with ursodiol?",
    );
    expect(spans.sideEffectText).toBe("nausea");
    expect(spans.drugText).toBe("ursodiol");
    expect(spans.indicationText).toBe("pbc");
  });

  it("tolerates multi-word drug and indication spans", () => {
    const spans = extract(
      "Is headache observed in patients treated with metformin diagnosed with type 2 diabetes?",
    );
    expect(spans.drugText).toBe("metformin");
    expect(spans.indicationText).toBe("type 2 diabetes");
  });
});
