/**
 * "Connect your EUDI wallet" (ADR-067): the link page of a sandbox patient.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PatientWalletPage from "@/app/patient/wallet/page";

type Answer = { status?: number; ok?: boolean; body: unknown };

/** Routes the page's calls to canned answers, and records them. */
function stubFetch(answers: {
  state: unknown;
  start?: Answer;
  status?: Answer;
  unlink?: Answer;
}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method, body: init?.body as string });
      const reply = (a: Answer) => ({
        ok: a.ok ?? true,
        status: a.status ?? 200,
        json: async () => a.body,
      });
      if (String(url).includes("/api/patient/wallet-link")) {
        return method === "DELETE"
          ? reply(answers.unlink ?? { body: { linked: false } })
          : reply({ body: answers.state });
      }
      if (String(url).includes("/api/auth/eudi/start")) {
        return reply(
          answers.start ?? {
            body: {
              sid: "L1",
              qrDataUri: "data:image/png;base64,QR",
              walletLink: "openid4vp://?l",
            },
          },
        );
      }
      return reply(answers.status ?? { body: { status: "pending" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PatientWalletPage", () => {
  it("starts a link presentation and reports the wallet connected", async () => {
    const calls = stubFetch({
      state: { eligible: true, available: true, linked: false },
      status: { body: { status: "linked" } },
    });
    render(<PatientWalletPage />);
    const connect = await screen.findByRole("button", {
      name: /Connect your EUDI wallet/,
    });
    // consent is asked for before anything is presented
    expect(
      screen.getByText(/consent to the hub keeping a secure hash/i),
    ).toBeInTheDocument();
    fireEvent.click(connect);
    expect(
      await screen.findByAltText("d-you OpenID4VP QR code"),
    ).toBeInTheDocument();
    const start = calls.find((c) => c.url.includes("/start"))!;
    expect(JSON.parse(start.body!)).toEqual({ purpose: "link" });
    expect(
      await screen.findByText(/d-you is now connected/, {}, { timeout: 6000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Disconnect wallet/ }),
    ).toBeInTheDocument();
  });

  it("says why a link was refused", async () => {
    stubFetch({
      state: { eligible: true, available: true, linked: false },
      status: {
        status: 409,
        ok: false,
        body: {
          status: "refused",
          error:
            "This PID is already connected to another account on this hub.",
        },
      },
    });
    render(<PatientWalletPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Connect your EUDI wallet/ }),
    );
    expect(
      await screen.findByText(
        /already connected to another account/,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });

  it("disconnects a connected wallet", async () => {
    const calls = stubFetch({
      state: { eligible: true, available: true, linked: true },
    });
    render(<PatientWalletPage />);
    expect(
      await screen.findByRole("heading", { name: "d-you is connected" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Disconnect wallet/ }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "DELETE" && c.url === "/api/patient/wallet-link",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText(/no longer keeps anything of your PID/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect your EUDI wallet/ }),
    ).toBeInTheDocument();
  });

  it("tells a demo persona it cannot connect a wallet", async () => {
    const calls = stubFetch({
      state: { eligible: false, available: true, linked: false },
    });
    render(<PatientWalletPage />);
    expect(
      await screen.findByText(/Only an account the Klarbefund app/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect your EUDI wallet/ }),
    ).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/start"))).toBe(false);
  });

  it("says so when the hub does not link wallets", async () => {
    stubFetch({ state: { eligible: true, available: false, linked: false } });
    render(<PatientWalletPage />);
    expect(
      await screen.findByText(/does not connect wallets/),
    ).toBeInTheDocument();
  });
});
