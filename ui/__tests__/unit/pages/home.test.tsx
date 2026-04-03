/**
 * Tests for the Home page (ui/src/app/page.tsx)
 * Server component — static card grid with EHDS demo guide
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

import Home from "@/app/page";

describe("Home Page", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(screen.getByText("European Health Data Space")).toBeInTheDocument();
  });

  it("renders the hero description explaining the EHDS demo", () => {
    render(<Home />);
    expect(screen.getByText(/interactive demo/i)).toBeInTheDocument();
    expect(screen.getByText(/EHDS regulation/i)).toBeInTheDocument();
  });

  it("renders data stats badges", () => {
    render(<Home />);
    expect(screen.getByText(/127 synthetic patients/)).toBeInTheDocument();
    expect(screen.getByText(/5,300\+ graph nodes/)).toBeInTheDocument();
    expect(screen.getByText(/7 demo personas/)).toBeInTheDocument();
  });

  it("renders workflow steps", () => {
    render(<Home />);
    expect(screen.getByText(/How the EHDS Demo Works/i)).toBeInTheDocument();
    expect(screen.getByText("Choose a Persona")).toBeInTheDocument();
    expect(screen.getByText("Browse the Catalog")).toBeInTheDocument();
    expect(screen.getByText("Negotiate Access")).toBeInTheDocument();
    expect(screen.getByText("Transfer & Analyze")).toBeInTheDocument();
    expect(screen.getByText("Verify Compliance")).toBeInTheDocument();
  });

  it("renders quick start role cards", () => {
    render(<Home />);
    expect(screen.getByText(/Quick Start by Role/i)).toBeInTheDocument();
    expect(screen.getByText("Patient")).toBeInTheDocument();
    expect(screen.getByText("Researcher")).toBeInTheDocument();
    expect(screen.getByText("Hospital")).toBeInTheDocument();
  });

  it("renders Explore section cards", () => {
    render(<Home />);
    expect(screen.getByText("Graph Explorer")).toBeInTheDocument();
    expect(screen.getByText("Dataset Catalog")).toBeInTheDocument();
    expect(screen.getByText("Patient Journey")).toBeInTheDocument();
    expect(screen.getByText("OMOP Analytics")).toBeInTheDocument();
    expect(screen.getByText("EEHRxF Profiles")).toBeInTheDocument();
  });

  it("renders action section cards", () => {
    render(<Home />);
    expect(screen.getByText("Governance & Compliance")).toBeInTheDocument();
    expect(screen.getByText("Portal Admin")).toBeInTheDocument();
    expect(screen.getByText("Documentation")).toBeInTheDocument();
  });

  it("renders correct links for explore cards", () => {
    render(<Home />);
    expect(screen.getByText("Graph Explorer").closest("a")).toHaveAttribute(
      "href",
      "/graph",
    );
    expect(screen.getByText("Dataset Catalog").closest("a")).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByText("Patient Journey").closest("a")).toHaveAttribute(
      "href",
      "/patient",
    );
  });

  it("renders correct links for action cards", () => {
    render(<Home />);
    expect(
      screen.getByText("Governance & Compliance").closest("a"),
    ).toHaveAttribute("href", "/compliance");
    expect(screen.getByText("Documentation").closest("a")).toHaveAttribute(
      "href",
      "/docs",
    );
  });

  it("renders section headings", () => {
    render(<Home />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Govern · Manage · Docs")).toBeInTheDocument();
  });

  it("renders footer with regulation references", () => {
    render(<Home />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/EHDS Art/i);
    expect(footer).toHaveTextContent(/FHIR R4/i);
  });

  it("renders accessible GitHub link", () => {
    render(<Home />);
    const ghLink = screen.getByRole("link", {
      name: /view source on github/i,
    });
    expect(ghLink).toBeInTheDocument();
    expect(ghLink).toHaveAttribute(
      "href",
      expect.stringContaining("github.com"),
    );
  });
});
