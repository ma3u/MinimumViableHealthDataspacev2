import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  onTestFinished,
} from "vitest";
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
  fireEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Transfer data" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
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
    // Since ADR-065 a PID opens the record in its name, not a demo patient.
    expect(
      screen.getByText(/your PID opens the one in your name/i),
    ).toBeInTheDocument();
  });

  it("says when the wallet opened the request and then went quiet (#708)", async () => {
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    onTestFinished(() => clock.mockRestore());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? startOk
          : {
              status: 200,
              ok: true,
              json: async () => ({ status: "pending", walletOpened: true }),
            },
      ),
    );
    render(<EudiQrPage />);
    expect(
      await screen.findByText(
        /Your wallet opened the request/i,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    now += 30_000;
    expect(
      await screen.findByText(
        /not registered with that wallet yet/i,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
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

  it("says why when the PID belongs to no record, and does not sign in (#708)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? startOk
          : {
              status: 403,
              ok: false,
              json: async () => ({
                status: "refused",
                error:
                  "No record on this hub belongs to the PID in this wallet.",
              }),
            },
      ),
    );
    render(<EudiQrPage />);
    expect(
      await screen.findByText(
        /No record on this hub belongs to the PID/i,
        {},
        {
          timeout: 6000,
        },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/i }),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("offers an account for a PID on no account, shows the password once, then signs in (ADR-067)", async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: init?.body as string });
        if (String(url).includes("/start")) return startOk;
        if (String(url).includes("/register")) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              status: "completed",
              username: "kb-ab3dk7mn",
              password: "Abcde-fghjk-mnpqr-stuvw",
            }),
          };
        }
        return {
          status: 403,
          ok: false,
          json: async () => ({
            status: "refused",
            error: "No record on this hub belongs to the PID in this wallet.",
            canRegister: true,
          }),
        };
      }),
    );
    render(<EudiQrPage />);
    const create = await screen.findByRole(
      "button",
      { name: "Create an account with this PID" },
      { timeout: 6000 },
    );
    expect(screen.getByText(/never the name or the date/i)).toBeInTheDocument();
    fireEvent.click(create);
    expect(await screen.findByTestId("new-account-password")).toHaveTextContent(
      "Abcde-fghjk-mnpqr-stuvw",
    );
    expect(screen.getByTestId("new-account-username")).toHaveTextContent(
      "kb-ab3dk7mn",
    );
    expect(
      screen.getByText(/shows the password only now/i),
    ).toBeInTheDocument();
    const reg = calls.find((c) => c.url.includes("/api/auth/eudi/register"))!;
    expect(JSON.parse(reg.body!)).toEqual({ sid: "s1" });
    // the person goes on when they have saved it, not before
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "I have saved them, sign me in" }),
    );
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "eudi-wallet",
        expect.objectContaining({ sid: "s1", callbackUrl: "/overview" }),
      ),
    );
    expect(
      screen.queryByTestId("new-account-password"),
    ).not.toBeInTheDocument();
  });

  it("says why when the hub could not create the account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/start")) return startOk;
        if (String(url).includes("/register")) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: "This PID already has an account on this hub",
            }),
          };
        }
        return {
          status: 403,
          ok: false,
          json: async () => ({
            status: "refused",
            error: "No record on this hub belongs to the PID in this wallet.",
            canRegister: true,
          }),
        };
      }),
    );
    render(<EudiQrPage />);
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Create an account with this PID" },
        { timeout: 6000 },
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already has an account/,
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("offers no account when the refusal does not allow one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? startOk
          : {
              status: 403,
              ok: false,
              json: async () => ({
                status: "refused",
                error: "The wallet did not share a PID this hub can read.",
              }),
            },
      ),
    );
    render(<EudiQrPage />);
    await screen.findByText(/did not share a PID/i, {}, { timeout: 6000 });
    expect(
      screen.queryByRole("button", { name: /Create an account/ }),
    ).not.toBeInTheDocument();
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

  it("shows the refusal and does not sign in when no record belongs to the PID (#708)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/start")
          ? startOk
          : {
              status: 403,
              ok: false,
              json: async () => ({
                status: "refused",
                error:
                  "No record on this hub belongs to the PID in this wallet.",
              }),
            },
      ),
    );
    render(<EudiQrPage />);
    expect(
      await screen.findByText(
        /No record on this hub belongs to the PID/i,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Try again/i }),
    ).toBeInTheDocument();
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
