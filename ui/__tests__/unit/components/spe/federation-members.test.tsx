/**
 * /catalog shows the federation's register of members (ADR-100 decision 5,
 * #1236): every member, its status and its agreement, with the public
 * register and the agreement one click away.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FederationMembers from "@/components/spe/FederationMembers";
import {
  FEDERATION_MEMBERS,
  FEDERATION_REGISTER_PATH,
  FEDERATION_AGREEMENT_URL,
} from "@/lib/federation-members";

describe("FederationMembers", () => {
  it("lists every member with its holder, status and agreement", () => {
    render(<FederationMembers />);
    expect(
      screen.getByRole("heading", { name: "Federation members" }),
    ).toBeInTheDocument();
    for (const m of FEDERATION_MEMBERS) {
      const card = screen.getByTestId(`federation-member-${m.speId}`);
      expect(card).toHaveTextContent(`${m.speId} · ${m.publisher.name}`);
      expect(within(card).getByText("Admitted")).toBeInTheDocument();
      expect(card).toHaveTextContent(m.admitted);
      expect(card).toHaveTextContent(m.servesDataset);
      expect(card).toHaveTextContent(m.attestationRequired);
    }
  });

  it("links the public register and the agreement", () => {
    render(<FederationMembers />);
    expect(
      screen.getByRole("link", { name: /Register \(JSON-LD\)/ }),
    ).toHaveAttribute("href", FEDERATION_REGISTER_PATH);
    expect(
      screen.getByRole("link", { name: /Federation agreement/ }),
    ).toHaveAttribute("href", FEDERATION_AGREEMENT_URL);
  });
});
