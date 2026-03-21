/**
 * Comprehensive tests for the Verifiable Credentials page.
 *
 * Covers: page title, loading state, credential cards, expand/collapse,
 * request form, successful/failed request, delete with confirm, API errors,
 * empty state, and claims display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────
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

import CredentialsPage from "@/app/credentials/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

const sampleCredential = {
  credentialId: "cred-001",
  credentialType: "EHDSParticipantCredential",
  issuerDid: "did:web:medreg.de:hdab",
  subjectDid: "did:web:alpha-klinik.de:participant",
  issuedAt: "2025-06-15T10:00:00Z",
  expiresAt: "2026-06-15T10:00:00Z",
  status: "active",
  holderName: "AlphaKlinik Berlin",
  holderType: "DATA_HOLDER",
  participantRole: "Provider",
  jurisdiction: "DE",
};

const secondCredential = {
  credentialId: "cred-002",
  credentialType: "DataQualityLabelCredential",
  issuerDid: "did:web:medreg.de:hdab",
  subjectDid: "did:web:lmc.nl:clinic",
  issuedAt: "2025-07-01T08:00:00Z",
  status: "active",
  holderName: "Limburg Medical Centre",
  completeness: 0.95,
  conformance: 0.88,
  timeliness: 0.91,
};

const sampleParticipants = [
  {
    "@id": "ctx-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    state: "ACTIVATED",
  },
  {
    "@id": "ctx-pharmaco",
    identity: "did:web:pharmaco.de:research",
    state: "ACTIVATED",
  },
];

const sampleDefinitions = [
  {
    id: "def-1",
    credentialType: "EHDSParticipantCredential",
    format: "JWT",
    attestations: ["self"],
    validity: 365,
  },
  {
    id: "def-2",
    credentialType: "DataQualityLabelCredential",
    format: "JWT",
    attestations: ["issuer"],
    validity: 180,
  },
];

/** Sets up mockFetchApi to return standard data for the three parallel calls */
function setupDefaultMocks(
  credentials: unknown[] = [sampleCredential, secondCredential],
  participants: unknown[] = sampleParticipants,
  definitions: unknown[] = sampleDefinitions,
) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url === "/api/credentials") {
      return mockResponse({ credentials });
    }
    if (url === "/api/participants") {
      return mockResponse(participants);
    }
    if (url === "/api/credentials/definitions") {
      return mockResponse({ definitions });
    }
    return mockResponse({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────
describe("CredentialsPage", () => {
  it("renders the page title and description", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Verifiable Credentials")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Request and manage EHDS participant credentials/),
    ).toBeInTheDocument();
  });

  it("shows loading state before data arrives", async () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<CredentialsPage />);

    expect(screen.getByText("Loading credentials…")).toBeInTheDocument();
  });

  it("shows credential cards after loading", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });
    expect(screen.getByText("DataQualityLabelCredential")).toBeInTheDocument();
    // Status badge — "active" → "Active"
    const badges = screen.getAllByText("Active");
    expect(badges.length).toBe(2);
  });

  it("shows issued date and truncated subject on credential card", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText(/2025-06-15/)).toBeInTheDocument();
    });
    // Subject is sliced to 40 chars + "…"
    expect(
      screen.getByText(/did:web:alpha-klinik\.de:participant/),
    ).toBeInTheDocument();
  });

  it("expands credential detail on click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    // Click on the first credential card button
    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[0]);

    // Expanded detail shows ID, Issuer, Subject labels
    await waitFor(() => {
      expect(screen.getByText("ID")).toBeInTheDocument();
      expect(screen.getByText("Issuer")).toBeInTheDocument();
      expect(screen.getByText("Subject")).toBeInTheDocument();
    });
    // Shows full issuer DID
    expect(screen.getByText("did:web:medreg.de:hdab")).toBeInTheDocument();
    // Shows expiration
    expect(screen.getByText("Expires")).toBeInTheDocument();
    expect(screen.getByText("2026-06-15T10:00:00Z")).toBeInTheDocument();
  });

  it("collapses credential detail on second click", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    // Expand
    await user.click(cardButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Issuer")).toBeInTheDocument();
    });

    // Collapse
    await user.click(cardButtons[0]);
    await waitFor(() => {
      expect(screen.queryByText("Issuer")).not.toBeInTheDocument();
    });
  });

  it("displays credential claims in expanded detail", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("holder")).toBeInTheDocument();
    });
    expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
    expect(screen.getByText("type")).toBeInTheDocument();
    expect(screen.getByText("DATA_HOLDER")).toBeInTheDocument();
    expect(screen.getByText("role")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("jurisdiction")).toBeInTheDocument();
    expect(screen.getByText("DE")).toBeInTheDocument();
  });

  it("displays numeric claims (completeness, conformance, timeliness) as strings", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("DataQualityLabelCredential"),
      ).toBeInTheDocument();
    });

    // Click on the second credential card
    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[1]);

    await waitFor(() => {
      expect(screen.getByText("completeness")).toBeInTheDocument();
    });
    expect(screen.getByText("0.95")).toBeInTheDocument();
    expect(screen.getByText("conformance")).toBeInTheDocument();
    expect(screen.getByText("0.88")).toBeInTheDocument();
    expect(screen.getByText("timeliness")).toBeInTheDocument();
    expect(screen.getByText("0.91")).toBeInTheDocument();
  });

  it("renders request form with participant and type dropdowns", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Request Credential")).toBeInTheDocument();
    });
    expect(screen.getByText("Participant Context")).toBeInTheDocument();
    expect(screen.getByText("Credential Type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request/ })).toBeInTheDocument();
  });

  it("populates participant dropdown from API data", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      // Participant identities rendered as option text
      // did:web:alpha-klinik.de:participant → "alpha-klinik.de:participant"
      expect(
        screen.getByText("alpha-klinik.de:participant"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("pharmaco.de:research")).toBeInTheDocument();
  });

  it("populates credential type dropdown from definitions API", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      // credentialType.replace(/([A-Z])/g, " $1").trim()
      expect(
        screen.getByText("E H D S Participant Credential"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Data Quality Label Credential"),
    ).toBeInTheDocument();
  });

  it("falls back to hardcoded credential types when definitions API returns empty", async () => {
    setupDefaultMocks([sampleCredential], sampleParticipants, []);
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("EHDS Participant Credential"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Data Processing Purpose Credential"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Data Quality Label Credential"),
    ).toBeInTheDocument();
  });

  it("submits credential request and shows success message", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Request Credential")).toBeInTheDocument();
    });

    // Override mockFetchApi for the POST request and subsequent refresh
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/credentials/request" && init?.method === "POST") {
        return mockResponse({ status: "ok" });
      }
      if (url === "/api/credentials") {
        return mockResponse({ credentials: [sampleCredential] });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    const requestBtn = screen.getByRole("button", { name: /Request/ });
    await user.click(requestBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Credential request submitted successfully"),
      ).toBeInTheDocument();
    });
    // Verify POST was called with correct body
    const postCall = mockFetchApi.mock.calls.find(
      (call: unknown[]) =>
        call[0] === "/api/credentials/request" &&
        (call[1] as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.participantContextId).toBe("ctx-alpha");
    expect(body.credentialType).toBe("EHDSParticipantCredential");
  });

  it("shows error message on failed credential request (non-ok response)", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Request Credential")).toBeInTheDocument();
    });

    // Override for POST failure
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/credentials/request" && init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Issuer unavailable" }),
        });
      }
      if (url === "/api/credentials") {
        return mockResponse({ credentials: [sampleCredential] });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    await user.click(screen.getByRole("button", { name: /Request/ }));

    await waitFor(() => {
      expect(screen.getByText("Error: Issuer unavailable")).toBeInTheDocument();
    });
  });

  it("shows generic error message on credential request network failure", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Request Credential")).toBeInTheDocument();
    });

    // Override for network error
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/credentials/request" && init?.method === "POST") {
        return Promise.reject(new Error("Network error"));
      }
      if (url === "/api/credentials") {
        return mockResponse({ credentials: [sampleCredential] });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    await user.click(screen.getByRole("button", { name: /Request/ }));

    await waitFor(() => {
      expect(
        screen.getByText("Error: Failed to submit request"),
      ).toBeInTheDocument();
    });
  });

  it("deletes credential after confirm dialog", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    // Mock window.confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    // Expand first credential to access Remove button
    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    // Override for DELETE
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/credentials/cred-001" && init?.method === "DELETE") {
        return mockResponse({ status: "ok" });
      }
      // Initial loads still work
      if (url === "/api/credentials") {
        return mockResponse({
          credentials: [sampleCredential, secondCredential],
        });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    await user.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        "Remove this credential? This cannot be undone.",
      );
    });

    // After successful delete, credential should be removed from list
    await waitFor(() => {
      expect(
        screen.queryByText("EHDSParticipantCredential"),
      ).not.toBeInTheDocument();
    });
    // Second credential remains
    expect(screen.getByText("DataQualityLabelCredential")).toBeInTheDocument();
  });

  it("does not delete credential when confirm is cancelled", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Remove"));

    // Credential should still be there
    expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    // DELETE should not have been called
    const deleteCalls = mockFetchApi.mock.calls.filter(
      (call: unknown[]) =>
        (call[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCalls.length).toBe(0);
  });

  it("alerts on failed credential delete", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });

    const cardButtons = screen.getAllByRole("button", { name: /EHDS|Data/ });
    await user.click(cardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    // Override for failed DELETE
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (
        url.includes("/api/credentials/cred-001") &&
        init?.method === "DELETE"
      ) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Credential in use" }),
        });
      }
      if (url === "/api/credentials") {
        return mockResponse({
          credentials: [sampleCredential, secondCredential],
        });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    await user.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Credential in use");
    });
    // Credential should still exist
    expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
  });

  it("handles API error for credentials gracefully", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/credentials") {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    render(<CredentialsPage />);

    // When credentials API fails, component uses fallback { credentials: [] }
    await waitFor(() => {
      expect(
        screen.getByText("No credentials found in Neo4j"),
      ).toBeInTheDocument();
    });
  });

  it("handles API error for participants gracefully", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/credentials") {
        return mockResponse({ credentials: [sampleCredential] });
      }
      if (url === "/api/participants") {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse({ definitions: sampleDefinitions });
      }
      return mockResponse({});
    });

    render(<CredentialsPage />);

    // Page should still render — participant dropdown will be empty
    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });
    expect(screen.getByText("Request Credential")).toBeInTheDocument();
  });

  it("handles API error for definitions gracefully", async () => {
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/credentials") {
        return mockResponse({ credentials: [sampleCredential] });
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return mockResponse({});
    });

    render(<CredentialsPage />);

    // Should fall back to hardcoded credential types
    await waitFor(() => {
      expect(
        screen.getByText("EHDS Participant Credential"),
      ).toBeInTheDocument();
    });
  });

  it("handles total API failure (Promise.all rejection)", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network down"));
    render(<CredentialsPage />);

    // Component catches the error and sets loading to false, showing empty state
    await waitFor(() => {
      expect(
        screen.getByText("No credentials found in Neo4j"),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no credentials exist", async () => {
    setupDefaultMocks([]);
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No credentials found in Neo4j"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Register a participant and request credentials above"),
    ).toBeInTheDocument();
  });

  it("does not show expiration field when credential has no expirationDate", async () => {
    // secondCredential has no expiresAt
    setupDefaultMocks([secondCredential]);
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("DataQualityLabelCredential"),
      ).toBeInTheDocument();
    });

    const cardButton = screen.getByRole("button", {
      name: /DataQualityLabelCredential/i,
    });
    await user.click(cardButton);

    await waitFor(() => {
      expect(screen.getByText("ID")).toBeInTheDocument();
    });
    expect(screen.queryByText("Expires")).not.toBeInTheDocument();
  });

  it("renders credential status badge with correct styling for Active", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      const badges = screen.getAllByText("Active");
      expect(badges.length).toBeGreaterThan(0);
      // Active badge should have green styling
      expect(badges[0].className).toContain("text-green-400");
    });
  });

  it("renders non-Active status with gray styling", async () => {
    const revokedCred = {
      ...sampleCredential,
      credentialId: "cred-revoked",
      status: "revoked",
    };
    setupDefaultMocks([revokedCred]);
    render(<CredentialsPage />);

    await waitFor(() => {
      const badge = screen.getByText("Revoked");
      expect(badge.className).toContain("text-gray-400");
    });
  });

  it("handles credentials API returning flat array instead of object", async () => {
    // Some endpoints return a flat array instead of { credentials: [...] }
    mockFetchApi.mockImplementation((url: string) => {
      if (url === "/api/credentials") {
        return mockResponse([sampleCredential]);
      }
      if (url === "/api/participants") {
        return mockResponse(sampleParticipants);
      }
      if (url === "/api/credentials/definitions") {
        return mockResponse(sampleDefinitions);
      }
      return mockResponse({});
    });

    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("EHDSParticipantCredential")).toBeInTheDocument();
    });
  });

  it("shows the info callout text about W3C Verifiable Credentials", async () => {
    setupDefaultMocks();
    const user = userEvent.setup();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Verifiable Credentials")).toBeInTheDocument();
    });

    // Info text is behind a toggle
    await user.click(screen.getByText("How does this work?"));

    await waitFor(() => {
      expect(
        screen.getByText(/W3C Verifiable Credentials standard/),
      ).toBeInTheDocument();
    });
  });

  it("renders workflow navigation links", async () => {
    setupDefaultMocks();
    render(<CredentialsPage />);

    await waitFor(() => {
      expect(screen.getByText("Verifiable Credentials")).toBeInTheDocument();
    });

    expect(screen.getByText("Protocol TCK")).toBeInTheDocument();
    expect(screen.getByText("Share Data")).toBeInTheDocument();
  });
});
