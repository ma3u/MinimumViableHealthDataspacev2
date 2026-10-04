/**
 * The participant directory: every row can be removed, seeded ones included,
 * after a second click that says what happens to a seed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ParticipantsAdminPage from "@/app/admin/participants/page";

const DIRECTORY = {
  participants: [
    {
      participantId: "did:web:alpha-klinik.de:participant",
      name: "AlphaKlinik Berlin",
      participantType: "DATA_HOLDER",
      source: "seed",
      walletType: "business",
      country: "DE",
      dspCatalogUrl: "https://ehds.mabu.red/api/mock-dsp/alpha-klinik",
      crawlerEnabled: true,
      onboardedAt: "2026-01-15T09:00:00Z",
      datasetCount: 2,
    },
    {
      participantId: "did:web:nordsee-klinikum.example:participant",
      name: "Nordsee Klinikum",
      participantType: "DATA_HOLDER",
      source: "business-wallet",
      walletType: "business",
      country: "DE",
      dspCatalogUrl: null,
      crawlerEnabled: true,
      onboardedAt: "2026-09-01T09:00:00Z",
      datasetCount: 0,
    },
  ],
  summary: {
    total: 2,
    crawlable: 1,
    bySource: { seed: 1, "business-wallet": 1 },
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          init?.method === "DELETE"
            ? { ok: true, seeded: true, returnsOnDeploy: true }
            : DIRECTORY,
        ),
        { status: 200 },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Participant directory", () => {
  it("offers a remove button on seeded rows too", async () => {
    render(<ParticipantsAdminPage />);
    expect(
      await screen.findByRole("button", { name: "Remove AlphaKlinik Berlin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Nordsee Klinikum" }),
    ).toBeInTheDocument();
  });

  it("asks once, says a seed comes back, then deletes", async () => {
    render(<ParticipantsAdminPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove AlphaKlinik Berlin" }),
    );

    expect(screen.getByText("Remove? Back on next deploy")).toBeInTheDocument();
    // Nothing is deleted on the first click.
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        screen.getByText(/the next deploy adds it back/),
      ).toBeInTheDocument(),
    );
    const del = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    );
    expect(del?.[0]).toContain(
      encodeURIComponent("did:web:alpha-klinik.de:participant"),
    );
  });

  it("cancels without deleting", async () => {
    render(<ParticipantsAdminPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Nordsee Klinikum" }),
    );
    expect(screen.getByText("Remove?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove?")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });
});
