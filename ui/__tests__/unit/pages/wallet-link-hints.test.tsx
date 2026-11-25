/**
 * #708: connecting a wallet needs the account first. A sign-in on its way to
 * /patient/wallet says so and leads to the password sign-in, and a wallet the
 * hub knows no record for offers that next to "Create an account with this
 * PID".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/auth/signin",
  useSearchParams: () => searchParams,
}));

import { signIn } from "next-auth/react";
import SignInPage from "@/app/auth/signin/page";
import EudiQrPage from "@/app/auth/eudi-qr/page";
import { connectsWallet } from "@/lib/wallet-config";

const HINT = /To connect a wallet, sign in with your account first/;

/** The verifier start answers; every poll answers with `status`. */
function stubVerifier(status: Record<string, unknown>, code = 200) {
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
        : { ok: code < 400, status: code, json: async () => status },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("connectsWallet", () => {
  it.each([
    ["/patient/wallet", true],
    ["/patient/wallet?step=2", true],
    ["/patient/wallet/link", true],
    ["https://ehds.mabu.red/patient/wallet", true],
    ["/patient/walletx", false],
    ["/patient/profile", false],
    ["/", false],
    ["", false],
    [null, false],
  ])("%s → %s", (url, expected) => {
    expect(connectsWallet(url)).toBe(expected);
  });
});

describe("the sign-in page", () => {
  it("says to sign in with the account first when the next page connects a wallet", () => {
    searchParams = new URLSearchParams("callbackUrl=/patient/wallet");
    render(<SignInPage />);
    expect(screen.getByTestId("wallet-link-hint")).toHaveTextContent(HINT);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Keycloak" }),
    );
    expect(signIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/patient/wallet",
    });
  });

  it("says nothing of it for any other page", () => {
    searchParams = new URLSearchParams("callbackUrl=/patient/profile");
    render(<SignInPage />);
    expect(screen.queryByTestId("wallet-link-hint")).not.toBeInTheDocument();
  });
});

describe("the wallet QR page", () => {
  it("leads to the password sign-in when the next page connects a wallet", async () => {
    stubVerifier({ status: "pending" });
    searchParams = new URLSearchParams("callbackUrl=/patient/wallet");
    render(<EudiQrPage />);
    expect(await screen.findByTestId("wallet-link-hint")).toHaveTextContent(
      HINT,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with your account" }),
    );
    expect(signIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/patient/wallet",
    });
  });

  it("shows no hint for a plain wallet sign-in", async () => {
    stubVerifier({ status: "pending" });
    render(<EudiQrPage />);
    await screen.findByAltText(/QR code/);
    expect(screen.queryByTestId("wallet-link-hint")).not.toBeInTheDocument();
  });

  it("offers the password sign-in next to creating an account for an unknown PID", async () => {
    stubVerifier(
      {
        status: "refused",
        error: "No record on this hub belongs to the PID in this wallet.",
        canRegister: true,
      },
      403,
    );
    render(<EudiQrPage />);
    await screen.findByRole(
      "button",
      { name: "Create an account with this PID" },
      { timeout: 6000 },
    );
    expect(
      screen.getByTestId("wallet-link-existing-account"),
    ).toHaveTextContent("Already have an account?");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sign in with your password, then connect your wallet.",
      }),
    );
    expect(signIn).toHaveBeenCalledWith("keycloak", {
      callbackUrl: "/patient/wallet",
    });
  });
});
