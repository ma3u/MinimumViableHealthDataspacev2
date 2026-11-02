/**
 * The Mermaid charts of the hand-written docs pages in the picked language
 * (ADR-071): a language's own text when the chart has one, English else.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/diagrams", () => ({
  DIAGRAMS: {
    "user-guide-workflow": {
      en: "graph LR\n  A[Sign in] --> B[Overview]",
      de: "graph LR\n  A[Anmelden] --> B[Übersicht]",
    },
  },
}));

import { localizedChart } from "@/lib/i18n/diagrams";

describe("localizedChart", () => {
  it("returns the chart in the picked language", () => {
    expect(localizedChart("user-guide-workflow", "de")).toContain("Anmelden");
  });

  it("falls back to English for a language the chart is not in", () => {
    expect(localizedChart("user-guide-workflow", "fr")).toContain("Sign in");
    expect(localizedChart("user-guide-workflow", "en")).toContain("Sign in");
  });
});
