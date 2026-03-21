/**
 * Comprehensive tests for the Onboarding page.
 *
 * Covers: loading state, participant rendering, expand/collapse cards,
 * deriveStatus logic, contact info (known + fallback), onboarding steps,
 * registration form, submission (success/error/network), reset after success,
 * EHDS requirements accordion, deep-link ?tenantId, role badges, API response
 * formats, submitting state, POST body, and PageIntro rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────
const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
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

import OnboardingPage from "@/app/onboarding/page";

// ── Helpers ──────────────────────────────────────────────────────────
function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

// ── Mock data ────────────────────────────────────────────────────────
const activeTenant = {
  id: "tenant-alpha",
  version: 1,
  properties: {
    displayName: "AlphaKlinik Berlin",
    role: "DATA_HOLDER",
    ehdsParticipantType: "data-holder",
    organization: "AlphaKlinik Berlin",
  },
  participantProfiles: [
    {
      dataspaceProfileId: "profile-1",
      participantContextId: "ctx-alpha-1",
      tenantId: "tenant-alpha",
      identifier: "did:web:alpha-klinik.de:participant",
      did: "did:web:alpha-klinik.de:participant",
      state: "ACTIVATED",
    },
  ],
};

const provisioningTenant = {
  id: "tenant-pharmaco",
  version: 1,
  properties: {
    displayName: "PharmaCo Research AG",
    role: "DATA_USER",
    ehdsParticipantType: "data-user",
    organization: "PharmaCo Research AG",
  },
  participantProfiles: [
    {
      dataspaceProfileId: "profile-2",
      participantContextId: "ctx-pharmaco-1",
      tenantId: "tenant-pharmaco",
      identifier: "null",
      did: "null",
      state: "PROVISIONING",
    },
  ],
};

const pendingTenant = {
  id: "tenant-medreg",
  version: 1,
  properties: {
    displayName: "MedReg DE",
    role: "HDAB",
    ehdsParticipantType: "health-data-access-body",
    organization: "MedReg DE",
  },
  participantProfiles: [],
};

const unknownOrgTenant = {
  id: "tenant-unknown",
  version: 1,
  properties: {
    displayName: "Acme Health GmbH",
    role: "DATA_HOLDER",
    ehdsParticipantType: "data-holder",
    organization: "Acme Health GmbH",
  },
  participantProfiles: [
    {
      dataspaceProfileId: "profile-3",
      participantContextId: "ctx-acme-1",
      tenantId: "tenant-unknown",
      identifier: "did:web:acme-health-gmbh.de:participant",
      did: "did:web:acme-health-gmbh.de:participant",
      state: "ACTIVATED",
    },
  ],
};

const limburgTenant = {
  id: "tenant-lmc",
  version: 1,
  properties: {
    displayName: "Limburg Medical Centre",
    role: "DATA_HOLDER",
    ehdsParticipantType: "data-holder",
    organization: "Limburg Medical Centre",
  },
  participantProfiles: [
    {
      dataspaceProfileId: "profile-lmc",
      participantContextId: "ctx-lmc-1",
      tenantId: "tenant-lmc",
      identifier: "did:web:lmc.nl:clinic",
      did: "did:web:lmc.nl:clinic",
      state: "ACTIVATED",
    },
  ],
};

const allTenants = [activeTenant, provisioningTenant, pendingTenant];

// ── Setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.mockReturnValue(new URLSearchParams());
});

// ── Tests ────────────────────────────────────────────────────────────
describe("OnboardingPage", () => {
  // ─── 1. Loading state ──────────────────────────────────────────────
  describe("loading state", () => {
    it("shows a loading spinner while fetching participants", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<OnboardingPage />);
      expect(
        screen.getByText(/Loading registered participants/),
      ).toBeInTheDocument();
    });

    it("does not render participant cards while loading", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<OnboardingPage />);
      expect(
        screen.queryByText("Registered Participants"),
      ).not.toBeInTheDocument();
    });
  });

  // ─── 2. Empty participants ─────────────────────────────────────────
  describe("empty participants", () => {
    it("shows no participant cards when API returns empty array", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.queryByText(/Loading registered participants/),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText("Registered Participants"),
      ).not.toBeInTheDocument();
    });

    it("still renders the registration form when no tenants exist", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── 3. Participants rendering ─────────────────────────────────────
  describe("participants rendering", () => {
    it("shows cards for each loaded tenant", async () => {
      mockFetchApi.mockReturnValue(mockResponse(allTenants));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
      expect(screen.getByText("MedReg DE")).toBeInTheDocument();
    });

    it("displays the organisation and role in the card subtitle", async () => {
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/AlphaKlinik Berlin · DATA_HOLDER · 1 profile/),
      ).toBeInTheDocument();
    });

    it("shows the Registered Participants heading when tenants exist", async () => {
      mockFetchApi.mockReturnValue(mockResponse(allTenants));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Registered Participants")).toBeInTheDocument();
      });
    });

    it("shows profile count in the subtitle", async () => {
      mockFetchApi.mockReturnValue(mockResponse([pendingTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText(/0 profile/)).toBeInTheDocument();
      });
    });
  });

  // ─── 4. Expand / collapse participant card ─────────────────────────
  describe("expand/collapse participant card", () => {
    it("expands a card on click to show contact details", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      // Click the card header button
      const cardButton = screen.getByRole("button", {
        name: /AlphaKlinik Berlin/,
      });
      await user.click(cardButton);
      expect(screen.getByText("Onboarding Progress")).toBeInTheDocument();
      // "Organisation" appears both in the form label and expanded card heading
      const orgHeadings = screen.getAllByText("Organisation");
      expect(orgHeadings.length).toBeGreaterThanOrEqual(2);
    });

    it("collapses an expanded card on second click", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      const cardButton = screen.getByRole("button", {
        name: /AlphaKlinik Berlin/,
      });
      await user.click(cardButton);
      expect(screen.getByText("Onboarding Progress")).toBeInTheDocument();
      await user.click(cardButton);
      expect(screen.queryByText("Onboarding Progress")).not.toBeInTheDocument();
    });

    it("shows tenant ID when expanded", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(screen.getByText("tenant-alpha")).toBeInTheDocument();
    });
  });

  // ─── 5. deriveStatus logic ─────────────────────────────────────────
  describe("deriveStatus logic", () => {
    it('shows "Active" badge for tenant with valid identifier', async () => {
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Active")).toBeInTheDocument();
      });
    });

    it('shows "Provisioning" badge for tenant with null identifiers', async () => {
      mockFetchApi.mockReturnValue(mockResponse([provisioningTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Provisioning")).toBeInTheDocument();
      });
    });

    it('shows "Pending" badge for tenant with no profiles', async () => {
      mockFetchApi.mockReturnValue(mockResponse([pendingTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Pending")).toBeInTheDocument();
      });
    });

    it("renders all three statuses side-by-side for mixed tenants", async () => {
      mockFetchApi.mockReturnValue(mockResponse(allTenants));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Active")).toBeInTheDocument();
      });
      expect(screen.getByText("Provisioning")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    it('shows "Active" for tenant with state ACTIVATED', async () => {
      const activated = {
        ...pendingTenant,
        participantProfiles: [
          {
            participantContextId: "ctx-1",
            state: "ACTIVATED",
          },
        ],
      };
      mockFetchApi.mockReturnValue(mockResponse([activated]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Active")).toBeInTheDocument();
      });
    });
  });

  // ─── 6. Contact info (known orgs from CONTACT_DB) ─────────────────
  describe("contact info for known orgs", () => {
    it("displays address for AlphaKlinik Berlin", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(
        screen.getByText(/Gesundheitsplatz 1, 10117 Berlin/),
      ).toBeInTheDocument();
    });

    it("displays email for AlphaKlinik Berlin", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(screen.getByText("forschung@alpha-klinik.de")).toBeInTheDocument();
    });

    it("displays DPO name for AlphaKlinik Berlin", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(screen.getByText("Prof. Dr. Klaus Weber")).toBeInTheDocument();
    });

    it("displays website for AlphaKlinik Berlin", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(screen.getByText("www.alpha-klinik.de")).toBeInTheDocument();
    });

    it("displays contact info for Limburg Medical Centre", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([limburgTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Limburg Medical Centre")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Limburg Medical Centre"));
      expect(screen.getByText(/Maastricht, Netherlands/)).toBeInTheDocument();
      expect(screen.getByText("Dr. Jan de Vries")).toBeInTheDocument();
    });
  });

  // ─── 7. Fallback contact for unknown orgs ──────────────────────────
  describe("fallback contact for unknown orgs", () => {
    it("shows generated fallback address for unknown org", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([unknownOrgTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Acme Health GmbH")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Acme Health GmbH"));
      expect(screen.getByText("Acme Health GmbH, Germany")).toBeInTheDocument();
    });

    it("shows generated fallback email for unknown org", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([unknownOrgTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Acme Health GmbH")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Acme Health GmbH"));
      expect(
        screen.getByText("contact@acme-health-gmbh.de"),
      ).toBeInTheDocument();
    });

    it("shows fallback DPO label for unknown org", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([unknownOrgTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Acme Health GmbH")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Acme Health GmbH"));
      expect(screen.getByText("Data Protection Officer")).toBeInTheDocument();
    });
  });

  // ─── 8. Onboarding steps ──────────────────────────────────────────
  describe("onboarding steps", () => {
    it("shows all 5 onboarding steps for an active tenant", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(screen.getByText("Tenant Created")).toBeInTheDocument();
      expect(screen.getByText("Participant Context")).toBeInTheDocument();
      expect(screen.getByText("DID Provisioned")).toBeInTheDocument();
      expect(screen.getByText("Credentials Issued")).toBeInTheDocument();
      expect(screen.getByText("Active in Dataspace")).toBeInTheDocument();
    });

    it("shows DID identifier in profile section for active tenant", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
      await user.click(screen.getByText("AlphaKlinik Berlin"));
      expect(
        screen.getByText(/did:web:alpha-klinik.de:participant/),
      ).toBeInTheDocument();
    });

    it("shows DID info for provisioning tenant profile", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([provisioningTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("PharmaCo Research AG")).toBeInTheDocument();
      });
      const cardButton = screen.getByRole("button", {
        name: /PharmaCo Research AG/,
      });
      await user.click(cardButton);
      // identifier is "null" (truthy string), so it renders DID: null
      expect(screen.getByText(/DID: null/)).toBeInTheDocument();
    });
  });

  // ─── 9. Registration form rendering ───────────────────────────────
  describe("registration form rendering", () => {
    it("shows Display Name input field", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Display Name")).toBeInTheDocument();
      });
      expect(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
      ).toBeInTheDocument();
    });

    it("shows Organisation input field", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Organisation")).toBeInTheDocument();
      });
    });

    it("shows EHDS Role radio options", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("EHDS Role")).toBeInTheDocument();
      });
      expect(screen.getByText("Data Holder")).toBeInTheDocument();
      expect(screen.getByText("Data User")).toBeInTheDocument();
      expect(screen.getByText("Health Data Access Body")).toBeInTheDocument();
    });

    it("shows Register Participant submit button", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Register Participant")).toBeInTheDocument();
      });
    });

    it("defaults to Data Holder role selected", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("EHDS Role")).toBeInTheDocument();
      });
      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toBeChecked();
    });
  });

  // ─── 10. Form submission success ──────────────────────────────────
  describe("form submission success", () => {
    it("shows success message after registration", async () => {
      const user = userEvent.setup();
      // First call: load tenants; second: POST; third: reload tenants
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-tenant" }))
        .mockReturnValueOnce(mockResponse([]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "Test Clinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "Test Organisation",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Registration Submitted")).toBeInTheDocument();
      });
    });

    it("shows DID provisioning description after success", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-tenant" }))
        .mockReturnValueOnce(mockResponse([]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "Test Clinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "Test Organisation",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(
          screen.getByText(/DID provisioning and credential issuance/),
        ).toBeInTheDocument();
      });
    });

    it("reloads tenants after successful submission", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-tenant" }))
        .mockReturnValueOnce(mockResponse([activeTenant]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "Test Clinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "Test Organisation",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Registration Submitted")).toBeInTheDocument();
      });

      // Should have called fetchApi 3 times: load, POST, reload
      expect(mockFetchApi).toHaveBeenCalledTimes(3);
    });
  });

  // ─── 11. Form submission error (API returns !ok) ──────────────────
  describe("form submission error", () => {
    it("shows error banner when API returns error", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(
          mockResponse({ error: "Duplicate participant" }, false),
        );

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "DupeClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "DupeOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Duplicate participant")).toBeInTheDocument();
      });
    });

    it("resets to form state after error", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ error: "Server error" }, false));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "TestClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "TestOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });
      // Form should still be visible
      expect(screen.getByText("Register Participant")).toBeInTheDocument();
    });
  });

  // ─── 12. Form submission network error ─────────────────────────────
  describe("form submission network error", () => {
    it('shows "Registration failed" on network failure', async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockRejectedValueOnce(new Error("Network error"));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "NetClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "NetOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("shows generic message for non-Error throws", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockRejectedValueOnce("unknown");

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "GenClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "GenOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText("Registration failed")).toBeInTheDocument();
      });
    });
  });

  // ─── 13. Reset after success ──────────────────────────────────────
  describe("reset after success", () => {
    it('"Register another participant" button returns to form', async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-tenant" }))
        .mockReturnValueOnce(mockResponse([]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "ResetClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "ResetOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(
          screen.getByText("Register another participant"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByText("Register another participant"));

      expect(
        screen.getByText("New Participant Registration"),
      ).toBeInTheDocument();
      // Form fields should be cleared
      expect(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
      ).toHaveValue("");
    });
  });

  // ─── 14. EHDS Requirements accordion ──────────────────────────────
  describe("EHDS Requirements accordion", () => {
    it("renders the requirements accordion header", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
        ).toBeInTheDocument();
      });
    });

    it("expands to show 3 requirement categories", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
      );

      expect(
        screen.getByText(/EHDS Regulation \(EU 2025\/327\)/),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Contractual / NDA Requirements"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Technical Dataspace Prerequisites (EDC-V / DCP)"),
      ).toBeInTheDocument();
    });

    it("collapses on second click", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
        ).toBeInTheDocument();
      });

      const heading = screen.getByText(
        "EHDS & Contractual Requirements for Data Sharing",
      );
      await user.click(heading);
      expect(
        screen.getByText("Contractual / NDA Requirements"),
      ).toBeInTheDocument();
      await user.click(heading);
      expect(
        screen.queryByText("Contractual / NDA Requirements"),
      ).not.toBeInTheDocument();
    });

    it("shows specific EHDS regulation items when expanded", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
        ).toBeInTheDocument();
      });
      await user.click(
        screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
      );
      expect(
        screen.getByText(/Pseudonymisation required before transfer/),
      ).toBeInTheDocument();
    });

    it("shows the demo environment note when expanded", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
        ).toBeInTheDocument();
      });
      await user.click(
        screen.getByText("EHDS & Contractual Requirements for Data Sharing"),
      );
      expect(
        screen.getByText(/In this demo environment all participants/),
      ).toBeInTheDocument();
    });
  });

  // ─── 15. Deep-link ?tenantId ──────────────────────────────────────
  describe("deep-link ?tenantId", () => {
    it("auto-expands the matching participant card", async () => {
      mockSearchParams.mockReturnValue(
        new URLSearchParams("tenantId=tenant-alpha"),
      );
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        // AlphaKlinik Berlin appears in the card header AND the expanded org section
        const matches = screen.getAllByText("AlphaKlinik Berlin");
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
      // Card should be auto-expanded — onboarding progress visible without clicking
      expect(screen.getByText("Onboarding Progress")).toBeInTheDocument();
    });

    it("does not auto-expand non-matching cards", async () => {
      mockSearchParams.mockReturnValue(
        new URLSearchParams("tenantId=tenant-alpha"),
      );
      mockFetchApi.mockReturnValue(
        mockResponse([activeTenant, provisioningTenant]),
      );
      render(<OnboardingPage />);
      await waitFor(() => {
        const matches = screen.getAllByText("AlphaKlinik Berlin");
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
      // Only one card should show Onboarding Progress
      const progressHeadings = screen.getAllByText("Onboarding Progress");
      expect(progressHeadings).toHaveLength(1);
    });
  });

  // ─── 16. Role badge rendering ─────────────────────────────────────
  describe("role badge rendering", () => {
    it("displays DATA_HOLDER role", async () => {
      mockFetchApi.mockReturnValue(mockResponse([activeTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText(/DATA_HOLDER/)).toBeInTheDocument();
      });
    });

    it("displays DATA_USER role", async () => {
      mockFetchApi.mockReturnValue(mockResponse([provisioningTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText(/DATA_USER/)).toBeInTheDocument();
      });
    });

    it("displays HDAB role", async () => {
      mockFetchApi.mockReturnValue(mockResponse([pendingTenant]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText(/HDAB/)).toBeInTheDocument();
      });
    });
  });

  // ─── 17. API response handling ────────────────────────────────────
  describe("API response handling", () => {
    it("handles direct array response", async () => {
      mockFetchApi.mockReturnValue(mockResponse(allTenants));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
    });

    it("handles { tenants: [...] } response format", async () => {
      mockFetchApi.mockReturnValue(mockResponse({ tenants: allTenants }));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("AlphaKlinik Berlin")).toBeInTheDocument();
      });
    });

    it("handles non-ok initial fetch gracefully", async () => {
      mockFetchApi.mockReturnValue(
        Promise.resolve({
          json: () => Promise.resolve([]),
          ok: false,
        }),
      );
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.queryByText(/Loading registered participants/),
        ).not.toBeInTheDocument();
      });
      // Should still show registration form
      expect(
        screen.getByText("New Participant Registration"),
      ).toBeInTheDocument();
    });

    it("handles fetch rejection for initial load", async () => {
      mockFetchApi.mockRejectedValue(new Error("fetch failed"));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.queryByText(/Loading registered participants/),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByText("New Participant Registration"),
      ).toBeInTheDocument();
    });
  });

  // ─── 18. Submitting state ─────────────────────────────────────────
  describe("submitting state", () => {
    it('shows "Registering…" text during submission', async () => {
      const user = userEvent.setup();
      // Initial load, then POST never resolves
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(new Promise(() => {}));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "SlowClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "SlowOrg",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(screen.getByText(/Registering/)).toBeInTheDocument();
      });
    });

    it("disables the submit button during submission", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(new Promise(() => {}));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "SlowClinic2",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "SlowOrg2",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        const submitBtn = screen.getByRole("button", {
          name: /Registering/,
        });
        expect(submitBtn).toBeDisabled();
      });
    });
  });

  // ─── 19. POST body ────────────────────────────────────────────────
  describe("POST body", () => {
    it("sends correct payload to /api/participants", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-id" }))
        .mockReturnValueOnce(mockResponse([]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "MyClinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "MyOrg",
      );
      // Select Data User role
      await user.click(screen.getByText("Data User"));
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        expect(mockFetchApi).toHaveBeenCalledWith("/api/participants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: "MyClinic",
            organization: "MyOrg",
            role: "data-user",
            ehdsParticipantType: "data-user",
          }),
        });
      });
    });

    it("sends data-holder role by default", async () => {
      const user = userEvent.setup();
      mockFetchApi
        .mockReturnValueOnce(mockResponse([]))
        .mockReturnValueOnce(mockResponse({ id: "new-id" }))
        .mockReturnValueOnce(mockResponse([]));

      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("New Participant Registration"),
        ).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("e.g. University Hospital Berlin"),
        "Default Clinic",
      );
      await user.type(
        screen.getByPlaceholderText(
          "e.g. AlphaKlinik Berlin University Hospital",
        ),
        "Default Org",
      );
      await user.click(screen.getByText("Register Participant"));

      await waitFor(() => {
        const postCall = mockFetchApi.mock.calls.find(
          (c: unknown[]) => c[0] === "/api/participants",
        );
        expect(postCall).toBeDefined();
        const body = JSON.parse(postCall![1].body);
        expect(body.role).toBe("data-holder");
        expect(body.ehdsParticipantType).toBe("data-holder");
      });
    });
  });

  // ─── 20. PageIntro component ──────────────────────────────────────
  describe("PageIntro component", () => {
    it("renders the page title", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Participant Onboarding")).toBeInTheDocument();
      });
    });

    it("renders the page description", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText(/Register your organisation as a participant/),
        ).toBeInTheDocument();
      });
    });

    it('renders the "Explore Datasets" next-step link', async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("Explore Datasets")).toBeInTheDocument();
      });
    });

    it("renders info text about EHDS Regulation after expanding info", async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("How does this work?")).toBeInTheDocument();
      });
      await user.click(screen.getByText("How does this work?"));
      expect(
        screen.getByText(/EHDS Regulation \(EU\) 2025\/327/),
      ).toBeInTheDocument();
    });

    it('renders the "Read the User Guide" doc link after expanding info', async () => {
      const user = userEvent.setup();
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("How does this work?")).toBeInTheDocument();
      });
      await user.click(screen.getByText("How does this work?"));
      expect(screen.getByText("Read the User Guide")).toBeInTheDocument();
    });
  });

  // ─── Additional edge cases ─────────────────────────────────────────
  describe("edge cases", () => {
    it("uses tenant id as name when displayName is missing", async () => {
      const noName = {
        ...activeTenant,
        id: "tenant-no-name",
        properties: {
          ...activeTenant.properties,
          displayName: undefined,
        },
      };
      mockFetchApi.mockReturnValue(mockResponse([noName]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(screen.getByText("tenant-no-name")).toBeInTheDocument();
      });
    });

    it("calls /api/participants/me on mount", () => {
      mockFetchApi.mockReturnValue(new Promise(() => {}));
      render(<OnboardingPage />);
      expect(mockFetchApi).toHaveBeenCalledWith("/api/participants/me");
    });

    it("shows role description text for each EHDS role option", async () => {
      mockFetchApi.mockReturnValue(mockResponse([]));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText("Provides health data (hospitals, registries)"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText("Consumes health data (researchers, pharma)"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Governs data access (regulators)"),
      ).toBeInTheDocument();
    });

    it("shows hint text below participant cards", async () => {
      mockFetchApi.mockReturnValue(mockResponse(allTenants));
      render(<OnboardingPage />);
      await waitFor(() => {
        expect(
          screen.getByText(
            /Click a participant card to expand contact details/,
          ),
        ).toBeInTheDocument();
      });
    });
  });
});
