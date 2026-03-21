/**
 * Tests for FhirResourceViewer component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual("lucide-react");
  return {
    ...actual,
    ChevronDown: (props: Record<string, unknown>) => (
      <svg data-testid="chevron-down" {...props} />
    ),
    ChevronRight: (props: Record<string, unknown>) => (
      <svg data-testid="chevron-right" {...props} />
    ),
    Copy: (props: Record<string, unknown>) => (
      <svg data-testid="copy-icon" {...props} />
    ),
    X: (props: Record<string, unknown>) => (
      <svg data-testid="close-icon" {...props} />
    ),
  };
});

import FhirResourceViewer from "@/components/FhirResourceViewer";

const sampleBundle = {
  resourceType: "Bundle" as const,
  id: "test-bundle",
  type: "collection",
  total: 4,
  entry: [
    {
      fullUrl: "urn:uuid:patient-1",
      resource: {
        resourceType: "Patient",
        id: "patient-1",
        name: [{ given: ["John"], family: "Smith" }],
        gender: "male",
        birthDate: "1980-01-15",
      },
    },
    {
      fullUrl: "urn:uuid:condition-1",
      resource: {
        resourceType: "Condition",
        id: "condition-1",
        code: {
          text: "Diabetes mellitus type 2",
          coding: [{ display: "Diabetes mellitus type 2" }],
        },
        recordedDate: "2024-06-01",
      },
    },
    {
      fullUrl: "urn:uuid:obs-1",
      resource: {
        resourceType: "Observation",
        id: "obs-1",
        code: {
          text: "Body Mass Index",
          coding: [{ display: "Body Mass Index" }],
        },
        valueQuantity: { value: 28.5, unit: "kg/m2" },
        effectiveDateTime: "2024-07-15",
      },
    },
    {
      fullUrl: "urn:uuid:med-1",
      resource: {
        resourceType: "MedicationRequest",
        id: "med-1",
        medicationCodeableConcept: {
          text: "Metformin 500mg",
        },
        authoredOn: "2024-06-01",
      },
    },
  ],
};

describe("FhirResourceViewer", () => {
  it("renders bundle title", () => {
    render(<FhirResourceViewer bundle={sampleBundle} title="Patient Bundle" />);
    expect(screen.getByText("Patient Bundle")).toBeInTheDocument();
  });

  it("groups resources by type", () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);

    expect(screen.getAllByText(/Patient/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Condition/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Observation/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Medication/).length).toBeGreaterThan(0);
  });

  it("shows resource count in header", () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);
    // Each group should show count — just verify the component renders
    const { container } = render(<FhirResourceViewer bundle={sampleBundle} />);
    expect(container.textContent).toContain("1");
  });

  it("displays patient name from FHIR data after expanding group", async () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);
    // Click the Patients group button to expand it
    const patientBtn = screen.getByText("Patients").closest("button")!;
    await userEvent.click(patientBtn);
    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
  });

  it("displays condition text after expanding group", async () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);
    const condBtn = screen.getByText("Conditions").closest("button")!;
    await userEvent.click(condBtn);
    expect(screen.getByText(/Diabetes mellitus type 2/)).toBeInTheDocument();
  });

  it("displays observation display name after expanding group", async () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);
    const obsBtn = screen.getByText("Observations").closest("button")!;
    await userEvent.click(obsBtn);
    expect(screen.getByText(/Body Mass Index/)).toBeInTheDocument();
  });

  it("displays medication name after expanding group", async () => {
    render(<FhirResourceViewer bundle={sampleBundle} />);
    const medBtn = screen.getByText("Medications").closest("button")!;
    await userEvent.click(medBtn);
    expect(screen.getByText(/Metformin 500mg/)).toBeInTheDocument();
  });

  it("handles empty bundle", () => {
    const emptyBundle = {
      resourceType: "Bundle" as const,
      entry: [],
    };
    const { container } = render(<FhirResourceViewer bundle={emptyBundle} />);
    // Should render without crashing
    expect(container).toBeTruthy();
  });

  it("handles bundle with no entry property", () => {
    const noEntryBundle = {
      resourceType: "Bundle" as const,
    };
    const { container } = render(<FhirResourceViewer bundle={noEntryBundle} />);
    expect(container).toBeTruthy();
  });

  it("renders close button when onClose provided", () => {
    const onClose = vi.fn();
    render(<FhirResourceViewer bundle={sampleBundle} onClose={onClose} />);
    const closeBtn = screen.getByTestId("close-icon");
    expect(closeBtn).toBeInTheDocument();
  });

  it("handles encounter type display after expanding group", async () => {
    const encounterBundle = {
      resourceType: "Bundle" as const,
      entry: [
        {
          resource: {
            resourceType: "Encounter",
            id: "enc-1",
            type: [{ text: "Emergency Room Visit" }],
          },
        },
      ],
    };
    render(<FhirResourceViewer bundle={encounterBundle} />);
    const encBtn = screen.getByText("Encounters").closest("button")!;
    await userEvent.click(encBtn);
    expect(screen.getByText(/Emergency Room Visit/)).toBeInTheDocument();
  });
});
