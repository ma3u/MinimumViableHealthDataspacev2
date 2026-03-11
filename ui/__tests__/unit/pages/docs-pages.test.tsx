/**
 * Tests for Docs pages: Hub, Developer Guide, Architecture, User Guide
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

  it("renders Mermaid diagrams", () => {
    render(<DeveloperPage />);
    const diagrams = screen.getAllByTestId("mermaid-diagram");
    expect(diagrams.length).toBeGreaterThan(0);
  });

  it("renders key sections", () => {
    render(<DeveloperPage />);
    // "Technology Stack" appears in both TOC link and section heading
    const matches = screen.getAllByText(/Technology Stack/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("ArchitecturePage", () => {
  it("renders heading", () => {
    render(<ArchitecturePage />);
    expect(screen.getByText("Architecture")).toBeInTheDocument();
  });

  it("renders Mermaid diagrams", () => {
    render(<ArchitecturePage />);
    const diagrams = screen.getAllByTestId("mermaid-diagram");
    expect(diagrams.length).toBeGreaterThan(0);
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
    expect(screen.getByText(/Graph Explorer/)).toBeInTheDocument();
  });
});
