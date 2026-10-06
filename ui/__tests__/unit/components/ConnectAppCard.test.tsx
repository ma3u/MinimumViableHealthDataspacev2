/**
 * The patient screen's "Connect the Klarbefund app" card (#473, ADR-049).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const flags = vi.hoisted(() => ({ isStatic: false }));
vi.mock("@/lib/static-export", () => ({
  get IS_STATIC() {
    return flags.isStatic;
  },
}));

const devices = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/lib/api", () => ({
  fetchApi: vi.fn(
    async () => new Response(JSON.stringify({ devices: devices.list })),
  ),
}));

import ConnectAppCard from "@/components/ConnectAppCard";

const PAIRING = {
  pairingId: "p-1",
  appLink: "klarbefund://connect?ehds=x&device_code=dc",
  qrDataUri: "data:image/png;base64,AAAA",
  userCode: "ABCD-EFGH",
  verificationUri:
    "http://localhost:8080/realms/edcv/device?user_code=ABCD-EFGH",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

describe("ConnectAppCard", () => {
  beforeEach(() => {
    flags.isStatic = false;
    devices.list = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the QR code, the approval link and the same link for a phone", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(PAIRING)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectAppCard />);
    fireEvent.click(screen.getByTestId("connect-app-start"));

    const qr = await screen.findByTestId("connect-app-qr");
    expect(qr.getAttribute("src")).toBe(PAIRING.qrDataUri);
    expect(fetchMock).toHaveBeenCalledWith("/api/patient/app-pairing", {
      method: "POST",
    });
    expect(screen.getByTestId("connect-app-approve").getAttribute("href")).toBe(
      PAIRING.verificationUri,
    );
    expect(screen.getByTestId("connect-app-open").getAttribute("href")).toBe(
      PAIRING.appLink,
    );
    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
  });

  it("says what went wrong when the hub refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
      ),
    );
    render(<ConnectAppCard />);
    fireEvent.click(screen.getByTestId("connect-app-start"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  });

  it("leads with the connection when a phone is connected: no scan steps, a quiet way to add another", async () => {
    devices.list = [
      {
        deviceId: "d-1",
        deviceName: "iPhone",
        connectedAt: "2026-10-05T19:18:00Z",
        lastSeenAt: "2026-10-06T23:29:00Z",
      },
    ];
    render(<ConnectAppCard />);
    expect(
      await screen.findByRole("heading", { name: "Klarbefund is connected" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/scan the code/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("connect-app-qr")).not.toBeInTheDocument();
    expect(screen.getByTestId("connect-app-start")).toHaveTextContent(
      "Connect another phone",
    );
  });

  it("asks a patient with no phone to connect one", async () => {
    render(<ConnectAppCard />);
    expect(
      screen.getByRole("heading", { name: "Connect the Klarbefund app" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("connect-app-start")).toHaveTextContent(
      "Show QR code",
    );
  });

  it("lists connected phones with a way to disconnect each", async () => {
    devices.list = [
      {
        deviceId: "d-1",
        deviceName: "iPhone of P1",
        connectedAt: "2026-10-03T10:00:00Z",
        lastSeenAt: null,
      },
    ];
    render(<ConnectAppCard />);
    expect(await screen.findByText("iPhone of P1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect iPhone of P1" }),
    ).toBeInTheDocument();
  });

  it("in the static build, points at the live demo instead of asking Keycloak", async () => {
    flags.isStatic = true;
    render(<ConnectAppCard />);
    expect(screen.getByTestId("connect-app-static")).toHaveTextContent(
      "ehds.mabu.red",
    );
    expect(screen.queryByTestId("connect-app-start")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull(),
    );
  });
});
