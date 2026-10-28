/**
 * /compliance lists the trusted issuers, each with the credential types it
 * may issue (#710), from ui/src/content/trusted-issuers.json.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrustedIssuers } from "@/app/compliance/_components/TrustedIssuers";
import trusted from "@/content/trusted-issuers.json";

describe("TrustedIssuers", () => {
  it("shows every issuer with its DID and the types it may issue", () => {
    render(<TrustedIssuers />);
    const list = screen.getByTestId("trusted-issuers");
    for (const issuer of trusted.issuers) {
      const item = within(list).getByText(issuer.name).closest("li")!;
      expect(within(item).getByText(issuer.did)).toBeInTheDocument();
      for (const type of issuer.types) {
        expect(within(item).getByText(type)).toBeInTheDocument();
      }
    }
  });

  it("names the Simpl Governance Authority as fictional, for membership only", () => {
    render(<TrustedIssuers />);
    const item = screen
      .getByText(/Simpl test data space, Governance Authority \(fictional\)/)
      .closest("li")!;
    expect(within(item).getAllByText(/Credential$/)).toHaveLength(1);
    expect(within(item).getByText("MembershipCredential")).toBeInTheDocument();
  });
});
