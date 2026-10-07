import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EudiQrPage from "@/app/auth/eudi-qr/page";
import { signIn } from "next-auth/react";

const startOk = {
  ok: true,
  json: async () => ({
    sid: "s1",
    qrDataUri: "data:image/png;base64,QR",
    walletLink: "openid4vp://?x",
  }),
};
const statusPending = {
  status: 200,
  ok: true,
  json: async () => ({ status: "pending" }),
};

/** A fetch stub that tells the real start, the demo start and the poll apart. */
function stubFetch(demo: { ok: boolean; status?: number; sid?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/start")) {
        if (String(init?.body ?? "").includes('"demo":true')) {
          return demo.ok
            ? { ok: true, json: async () => ({ sid: demo.sid, demo: true }) }
            : { ok: false, status: demo.status ?? 404, json: async () => ({}) };
        }
        return startOk;
      }
      return statusPending;
    }),
  );
}

/** Tap through the register flow on the simulated phone. */
function approveOnPhone() {
  fireEvent.click(screen.getByRole("button", { name: "Yes, continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(screen.getByRole("button", { name: "Go to wallet" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // These tests exercise the LIVE verifier flow — pin static export off so they
  // are immune to env pollution from earlier test files (IS_STATIC is now read
  // at render time in the page).
  vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("EudiQrPage", () => {
  it("renders the QR after a successful start, named after the citizen wallet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? startOk
          : { status: 404, ok: false, json: async () => ({}) },
      ),
    );
    render(<EudiQrPage />);
    const img = await screen.findByAltText("d-you OpenID4VP QR code");
    expect(img).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByText(/Waiting for your wallet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Register with d-you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Simulated d-you register" }),
    ).toBeInTheDocument();
  });

  it("shows an error with a retry button when start fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502 })),
    );
    render(<EudiQrPage />);
    expect(
      await screen.findByText(/Could not reach the EUDI verifier/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/i }),
    ).toBeInTheDocument();
  });

  it("signs in when the wallet completes the presentation", async () => {
    // Real timers + waitFor (not fake timers): the async start() resolves on the
    // microtask queue, which fake-timer advancement raced — making this flaky.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? {
              ok: true,
              json: async () => ({
                sid: "s2",
                qrDataUri: "data:,",
                walletLink: "openid4vp://?y",
              }),
            }
          : {
              status: 200,
              ok: true,
              json: async () => ({ status: "completed" }),
            },
      ),
    );
    render(<EudiQrPage />);
    // start() → scanning → poll (every 2s) → status completed → signIn
    await waitFor(
      () =>
        expect(signIn).toHaveBeenCalledWith(
          "eudi-wallet",
          expect.objectContaining({ sid: "s2" }),
        ),
      { timeout: 6000 },
    );
    expect(signIn).toHaveBeenCalledWith(
      "eudi-wallet",
      expect.objectContaining({ sid: "s2" }),
    );
  });

  it("approving on the simulated phone signs in as the demo patient when the deployment allows it", async () => {
    stubFetch({ ok: true, sid: "demo1" });
    render(<EudiQrPage />);
    await screen.findByAltText("d-you OpenID4VP QR code");
    approveOnPhone();
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "eudi-wallet",
        expect.objectContaining({ sid: "demo1", callbackUrl: "/overview" }),
      ),
    );
    expect(await screen.findByText(/signing you in/i)).toBeInTheDocument();
  });

  it("approving on the simulated phone only shows a hint when the deployment refuses", async () => {
    stubFetch({ ok: false, status: 404 });
    render(<EudiQrPage />);
    await screen.findByAltText("d-you OpenID4VP QR code");
    approveOnPhone();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Simulation only on this deployment. Scan the QR code with d-you/,
    );
    expect(signIn).not.toHaveBeenCalled();
    // the real QR stays up: the visitor can still scan it
    expect(screen.getByAltText("d-you OpenID4VP QR code")).toBeInTheDocument();
  });

  it("the simulated phone still signs in when the verifier is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        String(init?.body ?? "").includes('"demo":true')
          ? { ok: true, json: async () => ({ sid: "demo2", demo: true }) }
          : { ok: false, status: 502, json: async () => ({}) },
      ),
    );
    render(<EudiQrPage />);
    await screen.findByText(/Could not reach the EUDI verifier/i);
    approveOnPhone();
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "eudi-wallet",
        expect.objectContaining({ sid: "demo2" }),
      ),
    );
  });
});
