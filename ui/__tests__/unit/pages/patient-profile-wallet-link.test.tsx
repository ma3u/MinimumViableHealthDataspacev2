/**
 * The profile page links a sandbox patient to "Connect your EUDI wallet"
 * (ADR-067), and nobody else: a demo persona signs in with a wallet by name.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const who = vi.hoisted(() => ({ username: "kb-ab3dk7mn" }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Patient x", preferredUsername: who.username },
      roles: ["PATIENT"],
    },
    status: "authenticated",
  }),
}));
vi.mock("@/lib/api", () => ({
  fetchApi: vi.fn(async () => ({
    ok: true,
    json: async () => ({ patients: [] }),
  })),
}));
vi.mock("@/components/ConnectAppCard", () => ({ default: () => null }));
vi.mock("@/components/HealthInterests", () => ({ default: () => null }));

import PatientProfilePage from "@/app/patient/profile/page";

describe("the profile page's wallet link (ADR-067)", () => {
  it("is there for a sandbox account", () => {
    who.username = "kb-ab3dk7mn";
    render(<PatientProfilePage />);
    expect(screen.getByTestId("connect-wallet-link")).toHaveAttribute(
      "href",
      "/patient/wallet",
    );
  });

  it("is not there for a demo persona", () => {
    who.username = "patient1";
    render(<PatientProfilePage />);
    expect(screen.queryByTestId("connect-wallet-link")).not.toBeInTheDocument();
  });
});
