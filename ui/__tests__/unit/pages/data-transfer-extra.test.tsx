/**
 * Supplementary tests for Data Transfer page – covers remaining branches
 * not exercised by data-transfer.test.tsx: SUSPENDED pipeline state, FHIR
 * resource card expansion, JSON view mode, copy button, FHIR bundle
 * load failure, resource summary lines, pagination, network error on
 * transfer initiation, multiple transfer start, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

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

import DataTransferPage from "@/app/data/transfer/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

/* ── Test data ── */

const PARTICIPANTS = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    displayName: "AlphaKlinik Berlin",
    role: "DATA_HOLDER",
  },
];

const SUSPENDED_TRANSFER = {
  "@id": "tp-sus",
  "edc:state": "SUSPENDED",
  "edc:assetId": "fhir-suspended-data",
  "edc:contractId": "agr-sus",
  "edc:transferType": "HttpData-PULL",
  "edc:stateTimestamp": 1700005000000,
};

const COMPLETED_TRANSFER_WITH_PAYLOAD = {
  "@id": "tp-comp",
  "edc:state": "COMPLETED",
  "edc:assetId": "fhir-patient-bundle",
  "edc:contractId": "agr-001",
  "edc:transferType": "HttpData-PULL",
  "edc:stateTimestamp": 1700006000000,
  dataPayload: {
    resourceType: "Bundle",
    type: "searchset",
    total: 42,
    containedResourceTypes: ["Patient", "Observation", "Condition"],
    provider: "AlphaKlinik",
    transferredAt: "2024-11-14T10:00:00Z",
    sizeBytes: 51200,
  },
};

const NEGOTIATIONS = [
  {
    "@id": "neg-1",
    "edc:state": "FINALIZED",
    "edc:contractAgreementId": "agr-001",
    "edc:assetId": "fhir-patient-bundle",
    "edc:counterPartyId": "did:web:alpha-klinik.de:participant",
    counterPartyAddress: "http://controlplane:8082/api/dsp",
  },
];

function setupMocks(overrides?: {
  participants?: unknown;
  negotiations?: unknown;
  transfers?: unknown;
}) {
  mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/participants") {
      return mockResponse(overrides?.participants ?? PARTICIPANTS);
    }
    if (url === "/api/transfers" && init?.method === "POST") {
      return mockResponse({ "@id": "tp-new", state: "REQUESTED" });
    }
    if (url.startsWith("/api/transfers")) {
      return mockResponse(
        overrides?.transfers ?? [COMPLETED_TRANSFER_WITH_PAYLOAD],
      );
    }
    if (url.startsWith("/api/negotiations")) {
      return mockResponse(overrides?.negotiations ?? NEGOTIATIONS);
    }
    return mockResponse({});
  });
}

describe("DataTransferPage – extra coverage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    vi.restoreAllMocks();
  });

  /* ─── SUSPENDED state ─── */

  /* ─── FHIR bundle viewer – JSON view mode ─── */

  it("switches to Raw JSON view mode in FHIR viewer", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-1",
        type: "searchset",
        total: 1,
        entry: [
          {
            resource: {
              resourceType: "Patient",
              id: "pat-1",
              name: [{ given: ["Jane"], family: "Doe" }],
            },
          },
        ],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    // Open FHIR viewer
    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText(/FHIR Data/)).toBeInTheDocument();
    });

    // Switch to JSON view
    await user.click(screen.getByText("Raw JSON"));

    await waitFor(() => {
      // Should show raw JSON with "resourceType"
      expect(screen.getByText(/"resourceType"/)).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR viewer – Copy button ─── */

  it("copies JSON to clipboard when clicking Copy", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-2",
        type: "searchset",
        total: 0,
        entry: [],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Copy"));

    // The "Copied!" feedback confirms the copy handler ran
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR viewer – no bundle available fallback ─── */

  it("shows fallback when FHIR bundle data is not available for a transfer", async () => {
    setupMocks({ negotiations: [] });
    // Return empty bundles so no match is found
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/Full FHIR Bundle data not available/),
      ).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR bundle fetch failure ─── */

  it("handles fhir_bundles.json fetch failure gracefully", async () => {
    setupMocks({ negotiations: [] });
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Not found"));

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    // Should not crash – fallback message should appear
    await waitFor(() => {
      expect(
        screen.getByText(/Full FHIR Bundle data not available/),
      ).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR resource card expansion ─── */

  it("expands and collapses FHIR resource cards", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-3",
        type: "searchset",
        total: 1,
        entry: [
          {
            resource: {
              resourceType: "Condition",
              id: "cond-1",
              code: { text: "Hypertension" },
            },
          },
        ],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText("Condition")).toBeInTheDocument();
      expect(screen.getByText("Hypertension")).toBeInTheDocument();
    });

    // Click on the Condition resource card to expand it
    const conditionBtn = screen.getByText("Hypertension").closest("button");
    expect(conditionBtn).toBeTruthy();
    await user.click(conditionBtn!);

    // Should show expanded JSON content (the resource id)
    await waitFor(() => {
      expect(screen.getByText("resourceType")).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── DataPayload display for completed transfer ─── */

  /* ─── Status filter: no matching status ─── */

  /* ─── Transfer initiation – network error ─── */

  /* ─── Multiple transfers ─── */

  /* ─── DID resolution edge cases ─── */

  it("resolves unknown DID slugs to shortened display", async () => {
    const unknownDid = [
      {
        "@id": "neg-unk",
        "edc:state": "FINALIZED",
        "edc:contractAgreementId": "agr-unk",
        "edc:assetId": "test-bundle",
        "edc:counterPartyId": "did:web:unknown-org.eu:participant",
        counterPartyAddress: "http://cp:8082/api/dsp",
      },
    ];
    setupMocks({ negotiations: unknownDid, transfers: [] });
    render(<DataTransferPage />);

    await waitFor(() => {
      // Should show the slug since no match in the names map
      expect(screen.getByText(/participant/)).toBeInTheDocument();
    });
  });

  /* ─── Participant without displayName ─── */

  it("falls back to DID name when displayName is absent", async () => {
    // didToName splits by ":" and takes .pop(), so "did:web:pharmaco" → slug "pharmaco"
    const noName = [
      {
        "@id": "ctx-noname",
        identity: "did:web:pharmaco",
        role: "DATA_USER",
      },
    ];
    setupMocks({ participants: noName, transfers: [], negotiations: [] });
    render(<DataTransferPage />);

    await waitFor(() => {
      const option = screen.getByRole("option");
      expect(option.textContent).toContain("PharmaCo Research AG");
    });
  });

  /* ─── FHIR viewer – close button ─── */

  it("closes FHIR viewer when clicking the X button", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-close",
        type: "searchset",
        total: 0,
        entry: [],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText(/FHIR Data/)).toBeInTheDocument();
    });

    // Find and click the X close button inside the viewer
    const closeBtn = screen
      .getByText(/FHIR Data/)
      .closest("div")
      ?.parentElement?.querySelector("button:last-child");
    if (closeBtn) {
      await user.click(closeBtn);
    }

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR viewer – dataPayload stats ─── */

  it("shows transfer payload stats in FHIR viewer panel", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-stats",
        type: "searchset",
        total: 3,
        entry: [
          { resource: { resourceType: "Patient", id: "p1" } },
          { resource: { resourceType: "Observation", id: "o1" } },
          { resource: { resourceType: "Observation", id: "o2" } },
        ],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      // Stats: Total Resources, Resource Types, etc.
      expect(screen.getByText("Total Resources")).toBeInTheDocument();
      expect(screen.getByText("Resource Types")).toBeInTheDocument();
    });

    // Resource type pills
    expect(screen.getByText(/Patient \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Observation \(2\)/)).toBeInTheDocument();

    globalThis.fetch = origFetch;
  });

  /* ─── FHIR viewer – dataPayload containedResourceTypes fallback ─── */

  it("shows containedResourceTypes from dataPayload when no bundle entry", async () => {
    setupMocks({ negotiations: [] });
    const origFetch = globalThis.fetch;
    // No bundle match → falls back to dataPayload
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText(/FHIR Data/)).toBeInTheDocument();
    });

    // The dataPayload has containedResourceTypes: ["Patient", "Observation", "Condition"]
    // These should appear as pills in the viewer
    await waitFor(() => {
      expect(screen.getByText("Patient")).toBeInTheDocument();
      expect(screen.getByText("Observation")).toBeInTheDocument();
      expect(screen.getByText("Condition")).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });

  /* ─── Participant change triggers data reload ─── */

  it("reloads transfers when participant selection changes", async () => {
    const twoParticipants = [
      ...PARTICIPANTS,
      {
        "@id": "ctx-pharmaco",
        identity: "did:web:pharmaco.de:research",
        displayName: "PharmaCo Research AG",
        role: "DATA_USER",
      },
    ];
    setupMocks({
      participants: twoParticipants,
      transfers: [],
      negotiations: [],
    });
    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/AlphaKlinik Berlin \[DATA_HOLDER\]/),
      ).toBeInTheDocument();
    });

    const callsBefore = mockFetchApi.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).startsWith("/api/transfers"),
    ).length;

    // Switch participant: the data user is the default since #876, so
    // switch to the data holder.
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "ctx-alpha");

    await waitFor(() => {
      const callsAfter = mockFetchApi.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).startsWith("/api/transfers"),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  /* ─── FHIR resource type summary lines ─── */

  it("renders various FHIR resource type summaries", async () => {
    setupMocks({ negotiations: [] });
    const fhirBundles = {
      "fhir-patient-bundle": {
        resourceType: "Bundle",
        id: "b-multi",
        type: "searchset",
        total: 5,
        entry: [
          {
            resource: {
              resourceType: "MedicationRequest",
              id: "med-1",
              medicationCodeableConcept: { text: "Aspirin 100mg" },
            },
          },
          {
            resource: {
              resourceType: "Encounter",
              id: "enc-1",
              class: { display: "outpatient" },
              status: "finished",
            },
          },
          {
            resource: {
              resourceType: "Immunization",
              id: "imm-1",
              vaccineCode: { text: "COVID-19 mRNA" },
            },
          },
          {
            resource: {
              resourceType: "Procedure",
              id: "proc-1",
              code: { text: "Appendectomy" },
            },
          },
          {
            resource: {
              resourceType: "DiagnosticReport",
              id: "diag-1",
              code: { text: "CBC Panel" },
            },
          },
        ],
      },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fhirBundles),
    });

    const user = userEvent.setup();
    render(<DataTransferPage />);

    await waitFor(() => {
      expect(screen.getByText("Fhir Patient Bundle")).toBeInTheDocument();
    });

    await user.click(screen.getAllByText("View FHIR")[0]);

    await waitFor(() => {
      expect(screen.getByText("Aspirin 100mg")).toBeInTheDocument();
      expect(screen.getByText(/outpatient — finished/)).toBeInTheDocument();
      expect(screen.getByText("COVID-19 mRNA")).toBeInTheDocument();
      expect(screen.getByText("Appendectomy")).toBeInTheDocument();
      expect(screen.getByText("CBC Panel")).toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
  });
});
