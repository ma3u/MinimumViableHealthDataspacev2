/**
 * Removing a participant from /onboarding (ADR-085 step 3): an EDC_ADMIN
 * sees "Remove participant" on a participant registered there
 * (registeredAt), confirms, and the page sends DELETE /api/participants/{id}
 * and reads the list again. A seeded participant and a non-admin get no
 * button; a refusal is shown.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const roles = vi.fn(() => ["EDC_ADMIN"]);
vi.mock("@/lib/use-tab-session", () => ({
  useTabSession: () => ({
    session: { roles: roles(), username: "edcadmin" },
    status: "authenticated",
    liveSession: null,
  }),
}));

import OnboardingPage from "@/app/onboarding/page";

const respond = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) });

const tenant = (id: string, name: string, registeredAt?: string) => ({
  id,
  version: 0,
  properties: {
    displayName: name,
    organization: name,
    role: "DATA_HOLDER",
    ...(registeredAt ? { registeredAt } : {}),
  },
  participantProfiles: [
    {
      participantContextId: id,
      identifier: `did:web:identityhub%3A7083:${id}`,
      state: "ACTIVATED",
    },
  ],
  provisioningComplete: true,
});

const SEEDED = tenant("alpha-klinik", "AlphaKlinik Berlin");
const ONBOARDED = tenant(
  "ctx-lmc-new",
  "Limburg Medical Centre",
  "2026-11-10T08:00:00Z",
);

async function expand(name: string) {
  await userEvent.click(await screen.findByText(name));
}

describe("/onboarding: removing a participant", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
    roles.mockReturnValue(["EDC_ADMIN"]);
  });

  it("removes a participant registered here after a confirmation", async () => {
    mockFetchApi.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return respond({ removed: true });
      return respond(
        mockFetchApi.mock.calls.some((c) => c[1]?.method === "DELETE")
          ? [SEEDED]
          : [SEEDED, ONBOARDED],
      );
    });
    render(<OnboardingPage />);

    await expand("Limburg Medical Centre");
    await userEvent.click(screen.getByTestId("remove-participant"));
    expect(mockFetchApi).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
    await userEvent.click(screen.getByTestId("confirm-remove-participant"));

    expect(mockFetchApi).toHaveBeenCalledWith("/api/participants/ctx-lmc-new", {
      method: "DELETE",
    });
    await waitFor(() =>
      expect(screen.queryByText("Limburg Medical Centre")).toBeNull(),
    );
    expect(screen.getByText("AlphaKlinik Berlin")).toBeTruthy();
  });

  it("offers no removal for a seeded participant", async () => {
    mockFetchApi.mockImplementation(() => respond([SEEDED]));
    render(<OnboardingPage />);

    await expand("AlphaKlinik Berlin");
    expect(screen.queryByTestId("remove-participant")).toBeNull();
  });

  it("offers no removal to someone who is not EDC_ADMIN", async () => {
    roles.mockReturnValue(["DATA_HOLDER"]);
    mockFetchApi.mockImplementation(() => respond([ONBOARDED]));
    render(<OnboardingPage />);

    await expand("Limburg Medical Centre");
    expect(screen.queryByTestId("remove-participant")).toBeNull();
  });

  it("shows the route's refusal and keeps the participant", async () => {
    mockFetchApi.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? respond(
            { error: "Not removed", detail: "IdentityHub answered 500" },
            false,
          )
        : respond([ONBOARDED]),
    );
    render(<OnboardingPage />);

    await expand("Limburg Medical Centre");
    await userEvent.click(screen.getByTestId("remove-participant"));
    await userEvent.click(screen.getByTestId("confirm-remove-participant"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "IdentityHub answered 500",
    );
    expect(
      screen.getAllByText("Limburg Medical Centre").length,
    ).toBeGreaterThan(0);
  });
});
