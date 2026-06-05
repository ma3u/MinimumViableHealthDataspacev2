import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import EudiQrPage from "@/app/auth/eudi-qr/page";
import { signIn } from "next-auth/react";

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
  it("renders the QR after a successful start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? {
              ok: true,
              json: async () => ({
                sid: "s1",
                qrDataUri: "data:image/png;base64,QR",
                walletLink: "openid4vp://?x",
              }),
            }
          : { status: 404, ok: false, json: async () => ({}) },
      ),
    );
    render(<EudiQrPage />);
    const img = await screen.findByAltText("EUDI Wallet OpenID4VP QR code");
    expect(img).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByText(/Waiting for your wallet/i)).toBeInTheDocument();
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
    vi.useFakeTimers();
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
    // flush start() → phase "scanning" → poll effect registers
    await vi.advanceTimersByTimeAsync(0);
    // fire the 2s poll → status completed → signIn
    await vi.advanceTimersByTimeAsync(2100);
    expect(signIn).toHaveBeenCalledWith(
      "eudi-wallet",
      expect.objectContaining({ sid: "s2" }),
    );
  });
});
