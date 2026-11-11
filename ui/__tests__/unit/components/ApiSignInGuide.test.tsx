/**
 * The sign-in guide above the API explorers: it tells the reader whether
 * they have a session and with which roles, marks the row of the role they
 * hold, and links to the sign-in page with the way back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { setLanguage } from "@/lib/use-language";

const auth = vi.hoisted(() => ({
  session: null as null | { user: { name: string }; roles: string[] },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: auth.session,
    status: auth.session ? "authenticated" : "unauthenticated",
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ApiSignInGuide } from "@/components/docs/ApiSignInGuide";

afterEach(() => {
  auth.session = null;
  act(() => setLanguage("en"));
});

describe("ApiSignInGuide", () => {
  it("tells a signed-out reader that a request answers 401, and where to sign in", () => {
    render(<ApiSignInGuide returnTo="/docs/developer/api" />);
    const status = screen.getByTestId("api-sign-in-status");
    expect(status).toHaveTextContent(
      "You are not signed in: a request from here answers 401.",
    );
    expect(status.querySelector("a")).toHaveAttribute(
      "href",
      "/auth/signin?callbackUrl=%2Fdocs%2Fdeveloper%2Fapi",
    );
  });

  it("names the session's user and roles and marks that role's row", () => {
    auth.session = { user: { name: "regulator" }, roles: ["HDAB_AUTHORITY"] };
    render(<ApiSignInGuide returnTo="/docs/developer/reference" />);
    expect(screen.getByTestId("api-sign-in-status")).toHaveTextContent(
      "You are signed in as regulator (HDAB_AUTHORITY).",
    );
    expect(
      screen.getByTestId("api-sign-in-row-HDAB_AUTHORITY").className,
    ).toContain("bg-(--accent)/10");
    expect(
      screen.getByTestId("api-sign-in-row-EDC_ADMIN").className,
    ).not.toContain("bg-(--accent)/10");
  });

  it("lists a demo user for each role, the operator for the trust centre", () => {
    render(<ApiSignInGuide returnTo="/docs/developer/api" />);
    const cell = (role: string) =>
      screen.getByTestId(`api-sign-in-row-${role}`).querySelector("td")
        ?.textContent;
    expect(cell("EDC_ADMIN")).toBe("edcadmin");
    expect(cell("HDAB_AUTHORITY")).toContain("regulator");
    expect(cell("DATA_USER")).toBe("researcher");
    expect(cell("DATA_HOLDER")).toBe("clinicuser, lmcuser");
    expect(cell("PATIENT")).toBe("patient1, patient2");
    expect(cell("TRUST_CENTER_OPERATOR")).toBe("edcadmin");
  });

  it("follows the language picker", () => {
    render(<ApiSignInGuide returnTo="/docs/developer/api" />);
    act(() => setLanguage("de"));
    expect(
      screen.getByRole("heading", {
        name: "Erst anmelden, dann eine Anfrage ausprobieren",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("api-sign-in-status")).toHaveTextContent(
      "Sie sind nicht angemeldet",
    );
  });
});
