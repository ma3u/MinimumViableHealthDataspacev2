/**
 * Unit tests for <DemoPasswordBanner /> — dismissible banner reminding
 * the demo user to change their default password. Closes the 0% coverage
 * gap and pins the runtime Keycloak-URL fetch contract introduced in
 * 1e873df (fetches /api/keycloak-config instead of baking
 * NEXT_PUBLIC_KEYCLOAK_PUBLIC_URL at build time).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";

type FakeSession = {
  user: { name: string; email: string };
  preferredUsername?: string;
};

const sessionState: {
  data: FakeSession | null;
  status: "authenticated" | "unauthenticated" | "loading";
} = { data: null, status: "unauthenticated" };

vi.mock("next-auth/react", () => ({
  useSession: () => sessionState,
}));

import { readFileSync } from "fs";
import path from "path";
import DemoPasswordBanner, {
  DEMO_ACCOUNTS,
} from "@/components/DemoPasswordBanner";

const KC_URL = "https://mvhd-keycloak.example.com/realms/edcv";
const fetchMock = vi.fn();

beforeEach(() => {
  sessionState.data = {
    user: { name: "researcher", email: "r@ex" },
    preferredUsername: "researcher",
  };
  sessionState.status = "authenticated";
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      publicUrl: KC_URL,
      clientId: "health-dataspace-ui",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DemoPasswordBanner", () => {
  it("renders nothing while unauthenticated", () => {
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    const { container } = render(<DemoPasswordBanner />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing while dismissed in sessionStorage", () => {
    sessionStorage.setItem("demo-password-banner-dismissed", "true");
    const { container } = render(<DemoPasswordBanner />);
    expect(container.textContent).toBe("");
  });

  it("fetches /api/keycloak-config and links to the kc_action=UPDATE_PASSWORD flow", async () => {
    render(<DemoPasswordBanner />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/keycloak-config", {
        cache: "no-store",
      });
    });
    const link = await screen.findByRole("link", {
      name: /change your password/i,
    });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain(`${KC_URL}/protocol/openid-connect/auth`);
    expect(href).toContain("kc_action=UPDATE_PASSWORD");
    expect(href).toContain("client_id=health-dataspace-ui");
    expect(href).toContain("response_type=code");
  });

  it("never leaks localhost:8080 when the config endpoint is reachable", async () => {
    render(<DemoPasswordBanner />);
    const link = await screen.findByRole("link", {
      name: /change your password/i,
    });
    expect(link.getAttribute("href")).not.toContain("localhost:8080");
  });

  it("hides the banner gracefully when the config endpoint fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    render(<DemoPasswordBanner />);
    // Without a resolved URL the banner should not render; wait a tick
    // to let the effect settle and confirm no link appears.
    await new Promise((r) => setTimeout(r, 0));
    expect(
      screen.queryByRole("link", { name: /change your password/i }),
    ).toBeNull();
  });

  it("dismisses and persists state when the close button is clicked", async () => {
    render(<DemoPasswordBanner />);
    await screen.findByRole("link", { name: /change your password/i });
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss password warning/i }),
    );
    expect(sessionStorage.getItem("demo-password-banner-dismissed")).toBe(
      "true",
    );
    expect(
      screen.queryByRole("link", { name: /change your password/i }),
    ).toBeNull();
  });
});

describe("who is warned about a default password", () => {
  it("not a Klarbefund account: its password is random, made by the app", async () => {
    sessionState.data = {
      user: {
        name: "Klarbefund Sandbox",
        email: "kb-hh2mygdj@klarbefund.invalid",
      },
      preferredUsername: "kb-hh2mygdj",
    };
    const { container } = render(<DemoPasswordBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("not a session without a login name", async () => {
    sessionState.data = { user: { name: "someone", email: "s@ex" } };
    const { container } = render(<DemoPasswordBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("names exactly the realm's demo users, the service account aside", () => {
    const realm = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../../../jad/keycloak-realm.json"),
        "utf8",
      ),
    ) as { users: { username: string }[] };
    const seeded = realm.users
      .map((u) => u.username)
      .filter((u) => !u.startsWith("service-account-"));
    expect([...DEMO_ACCOUNTS].sort()).toEqual(seeded.sort());
  });
});
