/**
 * Tests for Docs pages: Hub, Developer Guide, Architecture, User Guide
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

// Mock MermaidDiagram for pages that use it
vi.mock("@/components/MermaidDiagram", () => ({
  default: ({ chart, caption }: { chart: string; caption?: string }) => (
    <div data-testid="mermaid-diagram">{caption && <span>{caption}</span>}</div>
  ),
}));

import DocsPage from "@/app/docs/page";
import DeveloperPage from "@/app/docs/developer/page";
import ArchitecturePage from "@/app/docs/architecture/page";
import UserGuidePage from "@/app/docs/user-guide/page";

describe("DocsPage (Hub)", () => {
  it("renders heading", () => {
    render(<DocsPage />);
    expect(screen.getByText("Documentation")).toBeInTheDocument();
  });

  it("renders section cards", () => {
    render(<DocsPage />);
    expect(screen.getByText("User Guide")).toBeInTheDocument();
    expect(screen.getByText("Developer Guide")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(
      screen.getByText("Security and Data Protection").closest("a"),
    ).toHaveAttribute("href", "/docs/security");
    expect(screen.getByText("Klarbefund").closest("a")).toHaveAttribute(
      "href",
      "/docs/klarbefund",
    );
    expect(screen.getByText("Operations").closest("a")).toHaveAttribute(
      "href",
      "/docs/operations",
    );
  });

  it("renders correct links", () => {
    render(<DocsPage />);
    expect(screen.getByText("User Guide").closest("a")).toHaveAttribute(
      "href",
      "/docs/user-guide",
    );
    expect(screen.getByText("Developer Guide").closest("a")).toHaveAttribute(
      "href",
      "/docs/developer",
    );
    expect(screen.getByText("Architecture").closest("a")).toHaveAttribute(
      "href",
      "/docs/architecture",
    );
  });
});

describe("DeveloperPage", () => {
  it("renders heading", () => {
    render(<DeveloperPage />);
    expect(screen.getByText("Developer Guide")).toBeInTheDocument();
  });

  it("shows its four diagrams from the hub, each opening at full size", () => {
    render(<DeveloperPage />);
    const figures = document.querySelectorAll("a.doc-figure");
    expect([...figures].map((a) => a.getAttribute("href"))).toEqual([
      "/published-docs/deployment.svg",
      "/published-docs/graph-schema.svg",
      "/published-docs/cicd-pipeline.svg",
      "/published-docs/developer-data-flow.svg",
    ]);
    for (const a of figures) {
      expect(
        existsSync(join(__dirname, "../../../public", a.getAttribute("href")!)),
        `${a.getAttribute("href")} is not copied to public/`,
      ).toBe(true);
    }
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });

  it("renders key sections", () => {
    render(<DeveloperPage />);
    // "Quick Start" appears in both TOC link and section heading
    const matches = screen.getAllByText(/Quick Start/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("ArchitecturePage", () => {
  it("renders heading", () => {
    render(<ArchitecturePage />);
    expect(screen.getByText("Architecture")).toBeInTheDocument();
  });

  it("shows the four ArchiMate views and two sequences from the hub, each opening at full size", () => {
    render(<ArchitecturePage />);
    const figures = document.querySelectorAll("a.doc-figure");
    expect([...figures].map((a) => a.getAttribute("href"))).toEqual([
      "/published-docs/knowledge-graph-layers.svg",
      "/published-docs/data-flow-sequence.svg",
      "/published-docs/deployment.svg",
      "/published-docs/dsp-negotiation-sequence.svg",
      "/published-docs/dsp-negotiation.svg",
      "/published-docs/identity-trust.svg",
    ]);
    for (const a of figures) {
      const img = a.querySelector("img")!;
      expect(img.getAttribute("alt")).toMatch(/ArchiMate|sequence diagram/);
      expect(
        existsSync(join(__dirname, "../../../public", a.getAttribute("href")!)),
        `${a.getAttribute("href")} is not copied to public/`,
      ).toBe(true);
    }
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });
});

describe("UserGuidePage", () => {
  it("renders heading", () => {
    render(<UserGuidePage />);
    expect(screen.getByText("User Guide")).toBeInTheDocument();
  });

  it("renders Mermaid diagrams", () => {
    render(<UserGuidePage />);
    const diagrams = screen.getAllByTestId("mermaid-diagram");
    expect(diagrams.length).toBeGreaterThan(0);
  });

  it("renders feature sections", () => {
    render(<UserGuidePage />);
    expect(screen.getAllByText(/Graph Explorer/)[0]).toBeInTheDocument();
  });
});
