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
  default: ({
    chart,
    caption,
  }: {
    chart: string;
    caption?: React.ReactNode;
  }) => (
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

  const EHDS = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";
  const hrefsOf = (name: string) =>
    screen.getAllByRole("link", { name }).map((a) => a.getAttribute("href"));

  it("cites the Trust Center's duties where the Regulation states them", () => {
    render(<UserGuidePage />);
    // Reversible pseudonyms are Art. 66(3); 73(1)(e) is the access log.
    expect(hrefsOf("Art. 66(3)")).toContain(`${EHDS}#066.003`);
    expect(hrefsOf("Art. 73(1)(e)")).toContain(`${EHDS}#073.001`);
    expect(hrefsOf("Art. 53(1)(e)")).toContain(`${EHDS}#053.001`);
    expect(hrefsOf("Art. 68(4)")).toContain(`${EHDS}#068.004`);
  });

  it("names no article that does not say what the text claims", () => {
    const { container } = render(<UserGuidePage />);
    const text = container.textContent ?? "";
    // The proposal's numbers and an operator role the Regulation lacks.
    expect(text).not.toMatch(/Art\. 3[34]\b|Art\. 52\b|EHDS Art\. 75:/);
    expect(text).not.toContain("Credential Federated Manager");
    expect(screen.getAllByText("Not in the Regulation").length).toBe(1);
  });

  it("says the protocol checks are the hub's own, not the Eclipse TCK", () => {
    const { container } = render(<UserGuidePage />);
    expect(hrefsOf("DSP Technology Compatibility Kit")).toEqual([
      "https://github.com/eclipse-dataspacetck/dsp-tck/releases/tag/v1.0.2",
    ]);
    expect(container.textContent).toContain("which has not yet been run");
    expect(hrefsOf("run-ehds-dataspace-checks.sh")[0]).toMatch(
      /scripts\/run-ehds-dataspace-checks\.sh#L5-L9$/,
    );
  });

  it("dates HealthDCAT-AP by the implementing act, not by Release 8", () => {
    render(<UserGuidePage />);
    expect(hrefsOf("latest release")).toEqual([
      "https://data.health.europa.eu/healthdcat-ap/releases/latest/",
    ]);
    expect(hrefsOf("Art. 4")).toEqual([
      "https://eur-lex.europa.eu/eli/reg_impl/2026/2098/oj/eng#art_4",
    ]);
  });

  it("links the sources in the diagram captions", () => {
    render(<UserGuidePage />);
    const [workflow, compliance] = screen.getAllByTestId("mermaid-diagram");
    expect(
      within(workflow).getByRole("link", { name: "EHDS Art. 57" }),
    ).toHaveAttribute("href", `${EHDS}#art_57`);
    expect(
      within(compliance).getByRole("link", { name: "Art. 67" }),
    ).toHaveAttribute("href", `${EHDS}#art_67`);
  });

  it("says the hub provisions participants, CFM only under edc018", () => {
    const { container } = render(<UserGuidePage />);
    expect(container.textContent).toContain(
      "On the default stack the hub provisions it itself",
    );
    expect(hrefsOf("ADR-078")[0]).toMatch(/ADR-078-.*#L62-L72$/);
  });
});
