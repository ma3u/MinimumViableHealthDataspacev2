/**
 * /docs/roadmap: the Gantt chart of the roadmap to 2031, the drivers behind it
 * with their sources, and every item as a table with its issue.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/MermaidDiagram", () => ({
  default: ({ chart }: { chart: string }) => (
    <pre data-testid="mermaid-diagram">{chart}</pre>
  ),
}));

import RoadmapDocsPage from "@/app/docs/roadmap/page";
import { ITEMS } from "@/lib/docs/roadmap";

describe("/docs/roadmap", () => {
  it("renders the chart from the roadmap data", () => {
    render(<RoadmapDocsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Roadmap/ }),
    ).toBeInTheDocument();
    const chart = screen.getByTestId("mermaid-diagram");
    expect(chart.textContent).toMatch(/^---\nconfig:/);
    expect(chart.textContent).toContain("section Identity and wallets");
  });

  it("names the six drivers, each with its sources", () => {
    render(<RoadmapDocsPage />);
    for (const name of [
      "The EHDS Regulation, to 2031",
      "Simpl, the EU's data space middleware",
      "eIDAS 2.0: the EUDI Wallet and the Business Wallet",
      "Health standards: HL7 FHIR, OMOP, HealthDCAT-AP",
      "Eclipse Dataspace: DSP, DCP and DPS",
      "Apache Iceberg and the lakehouse formats",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /Regulation \(EU\) 2025\/327/ }),
    ).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025R0327",
    );
    expect(
      screen.getByRole("link", { name: "What the hub implements" }),
    ).toHaveAttribute("href", "/docs/ehds");
  });

  it("lists every item with a link to its issue", () => {
    render(<RoadmapDocsPage />);
    const items = screen.getByRole("heading", {
      level: 2,
      name: "Every item",
    }).parentElement!;
    for (const i of ITEMS) {
      expect(
        within(items).getByRole("link", { name: `#${i.issue}` }),
      ).toHaveAttribute(
        "href",
        `https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/${i.issue}`,
      );
    }
  });

  it("says the bars are planning windows and links the plan", () => {
    render(<RoadmapDocsPage />);
    expect(
      screen.getByText(/the bars are\s+planning windows set on 2026-10-28/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#725" })).toHaveAttribute(
      "href",
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725",
    );
  });
});
