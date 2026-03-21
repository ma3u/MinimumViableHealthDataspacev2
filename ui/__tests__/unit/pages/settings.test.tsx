/**
 * Comprehensive tests for the Participant Settings page.
 *
 * Covers: page title, loading state, empty state (no profile → onboarding link),
 * tenant selector, identity section (read-only), contact form population,
 * form editing & save, save error handling, credentials loading,
 * credentials fallback to global endpoint, and API error handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import SettingsPage from "@/app/settings/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

const sampleTenant = {
  id: "tenant-alpha",
  version: 1,
  properties: {
    displayName: "AlphaKlinik Berlin",
    organization: "AlphaKlinik GmbH",
    contactPerson: "Dr. Müller",
    email: "contact@alpha-klinik.de",
    phone: "+49 30 12345",
    website: "https://alpha-klinik.de",
    address: "Friedrichstraße 100",
    city: "Berlin",
    postalCode: "10117",
    country: "DE",
    ehdsParticipantType: "DATA_HOLDER",
  },
  participantProfiles: [
    {
      id: "profile-1",
      type: "dsp",
      state: "active",
      identifier: "did%3Aweb%3Aalpha-klinik.de%3Aparticipant",
      properties: {
        "cfm.vpa.state": {
          participantContextId: "ctx-123",
        },
      },
      vpas: [{ id: "vpa-1", type: "cfm.dsp", state: "active" }],
    },
  ],
};

const sampleTenant2 = {
  id: "tenant-pharmaco",
  version: 1,
  properties: {
    displayName: "PharmaCo Research AG",
    organization: "PharmaCo AG",
    contactPerson: "Dr. Schmidt",
    email: "research@pharmaco.de",
    phone: "+49 69 98765",
    website: "https://pharmaco.de",
    address: "Zeil 5",
    city: "Frankfurt",
    postalCode: "60313",
    country: "DE",
    role: "DATA_USER",
  },
  participantProfiles: [],
};

const sampleCredentials = [
  {
    profileId: "profile-1",
    participantContextId: "ctx-123",
    credentials: [
      {
        id: "vc-001",
        type: ["VerifiableCredential", "EHDSParticipantCredential"],
        issuer: "did:web:medreg.de:hdab",
        issuanceDate: "2025-06-15T10:00:00Z",
        expirationDate: "2027-06-15T10:00:00Z",
        credentialSubject: {},
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────
describe("SettingsPage", () => {
  describe("page title", () => {
    it("renders the Participant Settings heading", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Participant Settings")).toBeTruthy();
      });
    });
  });

  describe("loading state", () => {
    it("shows loading indicator before data resolves", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
      render(<SettingsPage />);
      expect(screen.getByText("Loading settings…")).toBeTruthy();
    });
  });

  describe("empty state", () => {
    it("shows 'No participant profile found' and onboarding link when tenant list is empty", async () => {
      mockFetchApi.mockResolvedValue({
        json: () => Promise.resolve([]),
        ok: true,
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("No participant profile found")).toBeTruthy();
      });

      const link = screen.getByText("Register first →");
      expect(link).toBeTruthy();
      expect(link.getAttribute("href")).toBe("/onboarding");
    });

    it("handles non-ok response gracefully as empty list", async () => {
      mockFetchApi.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve(null),
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("No participant profile found")).toBeTruthy();
      });
    });

    it("handles API failure gracefully", async () => {
      mockFetchApi.mockRejectedValue(new Error("Network error"));

      render(<SettingsPage />);
      // Should exit loading state and show empty (no crash)
      await waitFor(() => {
        expect(screen.queryByText("Loading settings…")).toBeNull();
      });
    });
  });

  describe("tenant selector", () => {
    it("renders a dropdown with tenant display names", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me")
          return mockResponse([sampleTenant, sampleTenant2]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Active Profile")).toBeTruthy();
      });

      const select = screen.getByRole("combobox");
      const options = select.querySelectorAll("option");
      expect(options.length).toBe(2);
      expect(options[0].textContent).toBe("AlphaKlinik Berlin");
      expect(options[1].textContent).toBe("PharmaCo Research AG");
    });

    it("switches profile when a different tenant is selected", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me")
          return mockResponse([sampleTenant, sampleTenant2]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole("combobox")).toBeTruthy();
      });

      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "tenant-pharmaco");

      await waitFor(() => {
        // Form should now reflect the second tenant's data
        const emailInput = screen.getByPlaceholderText("contact@example.de");
        expect((emailInput as HTMLInputElement).value).toBe(
          "research@pharmaco.de",
        );
      });
    });
  });

  describe("identity section", () => {
    it("displays EHDS role from tenant properties", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Identity")).toBeTruthy();
      });

      expect(screen.getByText("DATA_HOLDER")).toBeTruthy();
      expect(screen.getByText("tenant-alpha")).toBeTruthy();
    });

    it("falls back to role property when ehdsParticipantType is missing", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me")
          return mockResponse([sampleTenant2]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("DATA_USER")).toBeTruthy();
      });
    });
  });

  describe("contact form", () => {
    it("populates form fields with tenant properties", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Profile & Contact Details")).toBeTruthy();
      });

      expect(
        (
          screen.getByPlaceholderText(
            "e.g. AlphaKlinik Berlin",
          ) as HTMLInputElement
        ).value,
      ).toBe("AlphaKlinik Berlin");
      expect(
        (screen.getByPlaceholderText("Legal entity name") as HTMLInputElement)
          .value,
      ).toBe("AlphaKlinik GmbH");
      expect(
        (screen.getByPlaceholderText("Full name") as HTMLInputElement).value,
      ).toBe("Dr. Müller");
      expect(
        (screen.getByPlaceholderText("contact@example.de") as HTMLInputElement)
          .value,
      ).toBe("contact@alpha-klinik.de");
      expect(
        (screen.getByPlaceholderText("+49 30 …") as HTMLInputElement).value,
      ).toBe("+49 30 12345");
      expect(
        (screen.getByPlaceholderText("Berlin") as HTMLInputElement).value,
      ).toBe("Berlin");
      expect(
        (screen.getByPlaceholderText("10117") as HTMLInputElement).value,
      ).toBe("10117");
      expect(
        (screen.getByPlaceholderText("DE") as HTMLInputElement).value,
      ).toBe("DE");
    });

    it("allows editing form fields", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Full name")).toBeTruthy();
      });

      const nameInput = screen.getByPlaceholderText("Full name");
      await user.clear(nameInput);
      await user.type(nameInput, "Dr. Fischer");

      expect((nameInput as HTMLInputElement).value).toBe("Dr. Fischer");
    });
  });

  describe("save", () => {
    it("saves profile and shows success message", async () => {
      mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (opts?.method === "PATCH") return mockResponse({ ok: true });
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByText("Profile saved successfully.")).toBeTruthy();
      });

      // Verify PATCH was called with correct endpoint and form data
      const patchCall = mockFetchApi.mock.calls.find(
        (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      expect(patchCall![0]).toBe("/api/participants/tenant-alpha");
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.properties.displayName).toBe("AlphaKlinik Berlin");
    });

    it("shows Saved button text after successful save", async () => {
      mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (opts?.method === "PATCH") return mockResponse({ ok: true });
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByText("Saved")).toBeTruthy();
      });
    });

    it("shows error message when save fails with non-ok response", async () => {
      mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (opts?.method === "PATCH")
          return Promise.resolve({
            ok: false,
            text: () => Promise.resolve("Forbidden"),
          });
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByText("Forbidden")).toBeTruthy();
      });
    });

    it("shows error message when save throws", async () => {
      mockFetchApi.mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (opts?.method === "PATCH")
          return Promise.reject(new Error("Network failure"));
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByText("Network failure")).toBeTruthy();
      });
    });
  });

  describe("credentials loading", () => {
    it("displays credentials when tenant-specific endpoint returns them", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url === "/api/participants/tenant-alpha/credentials")
          return mockResponse(sampleCredentials);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Digital Credentials")).toBeTruthy();
      });

      await waitFor(() => {
        expect(screen.getByText("EHDSParticipantCredential")).toBeTruthy();
      });

      expect(screen.getByText("did:web:medreg.de:hdab")).toBeTruthy();
    });

    it("shows 'No credentials issued yet' when there are no credentials", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("No credentials issued yet")).toBeTruthy();
      });
    });

    it("shows 'Fetching credentials…' while credentials are loading", async () => {
      let resolveCredentials!: (v: unknown) => void;
      const credentialsPromise = new Promise((resolve) => {
        resolveCredentials = resolve;
      });

      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return credentialsPromise;
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Fetching credentials…")).toBeTruthy();
      });

      // Resolve to finish loading
      resolveCredentials({ json: () => Promise.resolve([]), ok: true });
      await waitFor(() => {
        expect(screen.queryByText("Fetching credentials…")).toBeNull();
      });
    });
  });

  describe("credentials fallback", () => {
    it("falls back to /api/credentials when tenant endpoint returns empty", async () => {
      // Initial load: tenant endpoint returns credentials so initial render completes.
      // On Refresh click, tenant endpoint returns empty → triggers fallback.
      let credCallCount = 0;
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url === "/api/participants/tenant-alpha/credentials") {
          credCallCount++;
          return mockResponse([]); // always empty → triggers fallback
        }
        if (url === "/api/credentials")
          return mockResponse({
            credentials: [
              {
                credentialId: "cred-fallback",
                credentialType: "EHDSParticipantCredential",
                issuerDid: "did:web:medreg.de:hdab",
                subjectDid: "did:web:alpha-klinik.de:participant",
                issuedAt: "2025-06-15T10:00:00Z",
              },
            ],
          });
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      // Wait for initial load to finish (tenants state populated)
      await waitFor(() => {
        expect(screen.getByText("Refresh")).toBeTruthy();
      });

      // Click Refresh — now tenants state is populated so DID matching works
      await user.click(screen.getByText("Refresh"));

      await waitFor(() => {
        expect(screen.getByText("EHDSParticipantCredential")).toBeTruthy();
      });
    });

    it("falls back to /api/credentials when tenant endpoint throws", async () => {
      let credCallCount = 0;
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url === "/api/participants/tenant-alpha/credentials") {
          credCallCount++;
          return Promise.reject(new Error("500"));
        }
        if (url === "/api/credentials")
          return mockResponse({
            credentials: [
              {
                credentialId: "cred-fallback-2",
                credentialType: "MembershipCredential",
                issuerDid: "did:web:medreg.de:hdab",
                subjectDid: "did:web:alpha-klinik.de:participant",
                issuedAt: "2025-01-01T00:00:00Z",
              },
            ],
          });
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      // Wait for initial load to finish (tenants state populated)
      await waitFor(() => {
        expect(screen.getByText("Refresh")).toBeTruthy();
      });

      // Click Refresh — now tenants state is populated so DID matching works
      await user.click(screen.getByText("Refresh"));

      await waitFor(() => {
        expect(screen.getByText("MembershipCredential")).toBeTruthy();
      });
    });

    it("shows no credentials when fallback also fails", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url === "/api/participants/tenant-alpha/credentials")
          return Promise.reject(new Error("fail"));
        if (url === "/api/credentials")
          return Promise.reject(new Error("also fail"));
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("No credentials issued yet")).toBeTruthy();
      });
    });
  });

  describe("dataspace profiles", () => {
    it("displays profile details including DID and context ID", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Dataspace Profiles")).toBeTruthy();
      });

      expect(screen.getByText("profile-1")).toBeTruthy();
      expect(
        screen.getByText("did:web:alpha-klinik.de:participant"),
      ).toBeTruthy();
      expect(screen.getByText("ctx-123")).toBeTruthy();
    });

    it("shows active VPA types", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("dsp")).toBeTruthy();
      });
    });

    it("shows 'No dataspace profiles linked yet.' when profiles are empty", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me")
          return mockResponse([sampleTenant2]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(
          screen.getByText("No dataspace profiles linked yet."),
        ).toBeTruthy();
      });
    });

    it("shows error state for profiles with provisioning failure", async () => {
      const errorTenant = {
        ...sampleTenant,
        participantProfiles: [
          {
            id: "profile-err",
            type: "dsp",
            state: "error",
            identifier: "",
            error: true,
            properties: {},
            vpas: [{ id: "vpa-1", type: "cfm.dsp", state: "active" }],
          },
        ],
      };
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([errorTenant]);
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("Provisioning failed")).toBeTruthy();
      });
    });
  });

  describe("tenants wrapped in object", () => {
    it("handles { tenants: [...] } response shape", async () => {
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me")
          return mockResponse({ tenants: [sampleTenant] });
        if (url.includes("/credentials")) return mockResponse([]);
        return mockResponse([]);
      });

      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeTruthy();
      });
    });
  });

  describe("refresh credentials", () => {
    it("has a Refresh button that reloads credentials", async () => {
      let callCount = 0;
      mockFetchApi.mockImplementation((url: string) => {
        if (url === "/api/participants/me") return mockResponse([sampleTenant]);
        if (url === "/api/participants/tenant-alpha/credentials") {
          callCount++;
          if (callCount <= 1) return mockResponse([]);
          return mockResponse(sampleCredentials);
        }
        if (url === "/api/credentials") return mockResponse([]);
        return mockResponse([]);
      });

      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("No credentials issued yet")).toBeTruthy();
      });

      await user.click(screen.getByText("Refresh"));

      await waitFor(() => {
        expect(screen.getByText("EHDSParticipantCredential")).toBeTruthy();
      });
    });
  });
});
