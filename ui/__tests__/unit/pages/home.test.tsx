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

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
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
    expect(
      screen.getByText(/secure cross-border health data sharing/i),
    ).toBeInTheDocument();
  });

  it("renders data stats badges", () => {
    render(<Home />);
    expect(screen.getByText(/127 synthetic patients/)).toBeInTheDocument();
    expect(screen.getByText(/5,300\+ graph nodes/)).toBeInTheDocument();
    expect(screen.getByText(/7 demo personas/)).toBeInTheDocument();
  });

  it("renders Why EHDS Matters section", () => {
    render(<Home />);
    expect(
      screen.getByText(/Why the European Health Data Space Matters/i),
    ).toBeInTheDocument();
  });

  it("explains value for researchers", () => {
    render(<Home />);
    expect(screen.getByText("For Researchers")).toBeInTheDocument();
    expect(screen.getByText(/cross-border access/i)).toBeInTheDocument();
  });

  it("explains value for hospitals", () => {
    render(<Home />);
    expect(screen.getByText("For Hospitals")).toBeInTheDocument();
    expect(screen.getByText(/legal basis for sharing/i)).toBeInTheDocument();
  });

  it("renders link to official EHDS regulation", () => {
    render(<Home />);
    const ehdsLink = screen.getByRole("link", {
      name: /read the official ehds regulation/i,
    });
    expect(ehdsLink).toHaveAttribute(
      "href",
      expect.stringContaining("health.ec.europa.eu"),
    );
  });

  it("renders persona journey cards", () => {
    render(<Home />);
    expect(screen.getByText(/How the EHDS Demo Works/i)).toBeInTheDocument();
    // Should show all 5 persona journeys (some role names may appear
    // in both journey cards and DemoPersonaCards role labels)
    expect(screen.getAllByText("Patient").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Researcher").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Hospital").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Regulator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);
    // Each journey has numbered steps
    expect(screen.getByText(/View your EHR/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Run OMOP CDM cohort analytics/i),
    ).toBeInTheDocument();
  });

  it("renders persona journey sign-in buttons", () => {
    render(<Home />);
    // Each persona journey card should have a sign-in button
    const journeyButtons = screen.getAllByText(/Sign in & start/i);
    expect(journeyButtons.length).toBe(5);
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

  it("renders section headings with descriptions", () => {
    render(<Home />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Govern · Manage · Docs")).toBeInTheDocument();
    expect(screen.getByText(/5-layer knowledge graph/i)).toBeInTheDocument();
    expect(
      screen.getByText(/DSP data exchange lifecycle/i),
    ).toBeInTheDocument();
  });

  it("renders Standards & Interoperability section", () => {
    render(<Home />);
    expect(
      screen.getByText(/Standards & Interoperability/i),
    ).toBeInTheDocument();
    expect(screen.getByText("HL7 FHIR R4")).toBeInTheDocument();
    expect(screen.getByText("OMOP Common Data Model")).toBeInTheDocument();
    expect(screen.getByText("Dataspace Protocol")).toBeInTheDocument();
    expect(
      screen.getByText("Decentralised Claims Protocol"),
    ).toBeInTheDocument();
    // Standards section links to external references
    const fhirStd = screen.getByText("HL7 FHIR R4").closest("a");
    expect(fhirStd).toHaveAttribute("href", "https://hl7.org/fhir/R4/");
  });

  it("renders stakeholder cards for patients and regulators", () => {
    render(<Home />);
    expect(screen.getByText("For Patients")).toBeInTheDocument();
    expect(screen.getByText("For Regulators")).toBeInTheDocument();
  });

  it("renders footer with linked regulation references", () => {
    render(<Home />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/EHDS Art/i);
    expect(footer).toHaveTextContent(/FHIR R4/i);
    // Footer references should be links
    const fhirLink = footer.querySelector('a[href*="hl7.org/fhir"]');
    expect(fhirLink).toBeInTheDocument();
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

  it("persona journeys have sign-in buttons in live mode", () => {
    render(<Home />);
    // The journey cards contain sign-in buttons that call signIn("keycloak")
    const signinButtons = screen.getAllByText(/Sign in & start/i);
    expect(signinButtons.length).toBeGreaterThan(0);
    // Each button should be a <button> element (not an <a> link)
    const firstButton = signinButtons[0].closest("button");
    expect(firstButton).toBeInTheDocument();
  });
});
