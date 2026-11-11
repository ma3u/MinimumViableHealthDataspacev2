import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { signIn } from "next-auth/react";

/**
 * The start page's register dialog on the hub (not the static export): the
 * two ways in Matthias asked for.
 *
 * 1. The simulated phone signs in as the demo patient patient1, with a real
 *    session through the `eudi-wallet` provider, and lands on /patient.
 * 2. The QR code is the verifier's own request. A PID on an account signs in
 *    to it; a PID on no account creates one (ADR-067) and may go on to
 *    connect the Klarbefund app (ADR-049), which is optional.
 */

vi.mock("qrcode", () => ({
  default: { toDataURL: () => Promise.resolve("data:image/png;base64,DECO") },
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const flags = { isStatic: false };
vi.mock("@/lib/static-export", () => ({
  get IS_STATIC() {
    return flags.isStatic;
  },
  BASE_PATH: "",
}));

import { HomeRegisterCta } from "@/components/HomeRegisterCta";
import { RegisterDialog } from "@/components/RegisterDialog";

const START = {
  ok: true,
  status: 200,
  json: async () => ({
    sid: "s1",
    qrDataUri: "data:image/png;base64,HUBQR",
    walletLink: "openid4vp://?client_id=x&request_uri=y",
  }),
};
const PENDING = {
  ok: true,
  status: 200,
  json: async () => ({ status: "pending" }),
};
const REFUSED_CAN_REGISTER = {
  ok: false,
  status: 403,
  json: async () => ({
    status: "refused",
    error: "No record on this hub belongs to the PID in this wallet.",
    canRegister: true,
  }),
};
const CREATED = {
  ok: true,
  status: 201,
  json: async () => ({
    status: "completed",
    username: "kb-ab3dk7mn",
    password: "Abcde-fghjk-mnpqr-stuvw",
  }),
};

type Answer = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Tells the real start, the demo start, the poll and the register apart. */
function stubFetch(answers: {
  demo?: Answer;
  status?: Answer;
  register?: Answer;
  start?: Answer;
}) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body as string | undefined;
      calls.push({ url: u, body });
      if (u.includes("/api/auth/eudi/start")) {
        if (body?.includes('"demo":true')) {
          return (
            answers.demo ?? {
              ok: true,
              status: 200,
              json: async () => ({ sid: "demo-sid", demo: true }),
            }
          );
        }
        return answers.start ?? START;
      }
      if (u.includes("/api/auth/eudi/register")) return answers.register;
      return answers.status ?? PENDING;
    }),
  );
  return calls;
}

function openDialog() {
  render(<HomeRegisterCta />);
  fireEvent.click(screen.getByRole("button", { name: /Register with d-you/i }));
  return screen.getByRole("dialog");
}

/** Taps through the register flow on the simulated phone. */
function approveOnPhone() {
  const phone = screen.getByRole("group", { name: /Approve d-you register/ });
  fireEvent.click(within(phone).getByRole("button", { name: "Scan QR code" }));
  fireEvent.click(within(phone).getByRole("button", { name: "Next" }));
  fireEvent.click(within(phone).getByRole("button", { name: "Next" }));
  fireEvent.click(within(phone).getByRole("button", { name: "Transfer data" }));
  fireEvent.click(within(phone).getByRole("button", { name: "Close" }));
}

beforeEach(() => {
  flags.isStatic = false;
  vi.mocked(signIn).mockReset();
  push.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("The register dialog on the hub: the simulated phone", () => {
  it("signs in as the demo patient patient1, with a session, and lands on /patient", async () => {
    const calls = stubFetch({});
    openDialog();
    approveOnPhone();
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("eudi-wallet", {
        sid: "demo-sid",
        callbackUrl: "/patient",
      }),
    );
    const demo = calls.find((c) => c.body?.includes('"demo":true'));
    expect(demo?.url).toBe("/api/auth/eudi/start");
    // A real session, not a persona in the browser that /patient refuses.
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("demo-persona")).toBeNull();
  });

  it("stays a picture and says so where the deployment refuses the demo", async () => {
    stubFetch({ demo: { ok: false, status: 404, json: async () => ({}) } });
    openDialog();
    approveOnPhone();
    expect(
      await screen.findByText(/Simulation only on this deployment/i),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("The register dialog on the hub: the QR code", () => {
  it("is the verifier's request, not a fixed link to a page", async () => {
    const calls = stubFetch({});
    const dialog = openDialog();
    const img = await within(dialog).findByAltText("d-you OpenID4VP QR code");
    expect(img).toHaveAttribute("src", "data:image/png;base64,HUBQR");
    expect(within(dialog).queryByAltText(/Scan with d-you:/)).toBeNull();
    expect(
      within(dialog).getByRole("link", { name: /Tap to open d-you/ }),
    ).toHaveAttribute("href", "openid4vp://?client_id=x&request_uri=y");
    expect(within(dialog).getByText("Scan with d-you")).toBeInTheDocument();
    // a plain start: a sign-in, nothing in the body
    const start = calls.find((c) => c.url === "/api/auth/eudi/start");
    expect(start?.body).toBeUndefined();
  });

  it("signs a PID on an account in to it and lands on /patient", async () => {
    stubFetch({
      status: {
        ok: true,
        status: 200,
        json: async () => ({ status: "completed" }),
      },
    });
    openDialog();
    await waitFor(
      () =>
        expect(signIn).toHaveBeenCalledWith("eudi-wallet", {
          sid: "s1",
          callbackUrl: "/patient",
        }),
      { timeout: 6000 },
    );
  });

  it("creates an account for a PID on none, shows the login once, and signs in to /patient", async () => {
    const calls = stubFetch({
      status: REFUSED_CAN_REGISTER,
      register: CREATED,
    });
    const dialog = openDialog();
    fireEvent.click(
      await within(dialog).findByRole(
        "button",
        { name: "Create an account with this PID" },
        { timeout: 6000 },
      ),
    );
    expect(
      await within(dialog).findByTestId("new-account-password"),
    ).toHaveTextContent("Abcde-fghjk-mnpqr-stuvw");
    expect(
      within(dialog).getByTestId("new-account-username"),
    ).toHaveTextContent("kb-ab3dk7mn");
    const reg = calls.find((c) => c.url === "/api/auth/eudi/register");
    expect(JSON.parse(reg!.body!)).toEqual({ sid: "s1" });
    // Klarbefund is optional and not chosen for them.
    expect(within(dialog).getByTestId("connect-app-next")).not.toBeChecked();
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "I have saved them, sign me in",
      }),
    );
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("eudi-wallet", {
        sid: "s1",
        callbackUrl: "/patient",
      }),
    );
  });

  it("goes on to connect Klarbefund when the new account's owner chooses it", async () => {
    stubFetch({ status: REFUSED_CAN_REGISTER, register: CREATED });
    const dialog = openDialog();
    fireEvent.click(
      await within(dialog).findByRole(
        "button",
        { name: "Create an account with this PID" },
        { timeout: 6000 },
      ),
    );
    const option = await within(dialog).findByRole("checkbox", {
      name: /Connect the Klarbefund app next \(optional\)/,
    });
    expect(
      within(dialog).getByText(/Keycloak asks once for this username/),
    ).toBeInTheDocument();
    fireEvent.click(option);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "I have saved them, sign me in",
      }),
    );
    // The card of ADR-049 on the profile page: the one way the app connects.
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("eudi-wallet", {
        sid: "s1",
        callbackUrl: "/patient/profile#connect-app",
      }),
    );
  });

  it("says when the verifier cannot be reached, and the phone still works", async () => {
    stubFetch({
      start: { ok: false, status: 502, json: async () => ({}) },
    });
    const dialog = openDialog();
    expect(
      await within(dialog).findByText(/Could not reach the EUDI verifier/),
    ).toBeInTheDocument();
    approveOnPhone();
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("eudi-wallet", {
        sid: "demo-sid",
        callbackUrl: "/patient",
      }),
    );
  });
});

describe("The register dialog's text", () => {
  it("names the claims the request asks for: the name and the date of birth, no age", () => {
    stubFetch({});
    const dialog = openDialog();
    expect(
      within(dialog).getByText(/your name and date of birth/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/only as a secure hash/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/age over 18/i)).toBeNull();
  });
});

describe("The ePA transfer on the hub", () => {
  it("stays the simulation and asks the verifier nothing", async () => {
    const calls = stubFetch({});
    const onComplete = vi.fn();
    render(
      <RegisterDialog
        mode="ehr"
        title="Request EHR data"
        onClose={() => {}}
        onComplete={onComplete}
      />,
    );
    expect(
      await screen.findByAltText(/Scan with your insurer app/),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
