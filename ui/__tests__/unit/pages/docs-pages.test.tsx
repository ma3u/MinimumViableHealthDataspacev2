/**
 * Tests for Docs pages: Hub, Developer Guide, Architecture, User Guide
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("Roadmap").closest("a")).toHaveAttribute(
      "href",
      "/docs/roadmap",
    );
    expect(screen.getByText("EHDS Regulation").closest("a")).toHaveAttribute(
      "href",
      "/docs/ehds",
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

  it("links a source a card cites without putting a link inside the card's link", () => {
    render(<DocsPage />);
    const art105 = screen.getByRole("link", { name: "EHDS dates" });
    expect(art105).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_105",
    );
    expect(art105.parentElement?.closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ArchiMate 3.2" })).toHaveAttribute(
      "href",
      "https://pubs.opengroup.org/architecture/archimate32-doc/",
    );
  });

  it("calls the hub a demonstrator on EDC 1.0, with CFM only in the edc018 profile (ADR-078)", () => {
    render(<DocsPage />);
    expect(screen.queryByText(/EHDS-compliant/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/A demonstrator aligned with the/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Eclipse EDC 1.0" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC5",
    );
    expect(screen.getByRole("link", { name: "ADR-078" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "docs/ADRs/ADR-078-edc-1-on-container-apps-without-cfm.md",
      ),
    );
    expect(
      screen.getByRole("link", { name: "edc018 profile" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/docker-compose\.jad\.yml#L\d+-L\d+$/),
    );
  });
});

describe("DeveloperPage", () => {
  it("renders heading", () => {
    render(<DeveloperPage />);
    // Its own name also appears as a link, among the sections a published
    // document can go in; the title is the level-1 heading.
    expect(
      screen.getByRole("heading", { level: 1, name: "Developer Guide" }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(/Persona Overview: one view per role/),
    ).toBeInTheDocument();
  });

  it("shows each feature's page on mouse-over", () => {
    render(<UserGuidePage />);
    expect(screen.getByAltText("Screenshot: Protocol TCK")).toHaveAttribute(
      "src",
      "/images/guide/compliance-tck.webp",
    );
  });

  it("opens the screenshot full size on a click on the card's text", () => {
    render(<UserGuidePage />);
    const dialog = screen.getByLabelText("Screenshot: Protocol TCK", {
      selector: "dialog",
    });
    expect(dialog).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("heading", { name: "Protocol TCK" }));
    expect(dialog).toHaveAttribute("open");
  });

  it("opens it from the Screenshot button, and not from Try it", () => {
    render(<UserGuidePage />);
    const dialog = screen.getByLabelText("Screenshot: Protocol TCK", {
      selector: "dialog",
    });
    const card = screen
      .getByRole("heading", { name: "Protocol TCK" })
      .closest("div.group") as HTMLElement;

    fireEvent.click(within(card).getByRole("link", { name: /Try it/ }));
    expect(dialog).not.toHaveAttribute("open");

    fireEvent.click(
      screen.getByRole("button", { name: "Show screenshot: Protocol TCK" }),
    );
    expect(dialog).toHaveAttribute("open");
  });
});
