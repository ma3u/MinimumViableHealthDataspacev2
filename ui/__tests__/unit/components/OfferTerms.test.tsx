/**
 * The terms a data user agrees to, in short labelled lists first and the
 * full wording and ODRL behind a click (#876).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...a: unknown[]) => mockFetchApi(...a),
}));

import OfferTerms, { shortPurpose } from "@/components/OfferTerms";

const POLICY = {
  "@type": "Offer",
  permission: [
    {
      action: "use",
      constraint: [
        {
          leftOperand: "purpose",
          operator: "isAnyOf",
          rightOperand: [
            "EHDS Art. 53(1)(e) - scientific research",
            "EHDS Art. 53(1)(a) - public interest in public or occupational health",
          ],
        },
        {
          leftOperand: "inForceDate",
          operator: "lteq",
          rightOperand: "contractAgreement+365d",
        },
      ],
      duty: [{ action: "https://w3id.org/ehds/pseudonymize" }],
    },
  ],
  prohibition: [{ action: "https://w3id.org/ehds/reidentify" }],
};

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

beforeEach(() => {
  mockFetchApi.mockReset();
});

describe("shortPurpose", () => {
  it("keeps what the purpose is, not the article", () => {
    expect(shortPurpose("EHDS Art. 53(1)(e) - scientific research")).toBe(
      "Scientific research",
    );
    expect(shortPurpose("https://w3id.org/ehds/scientificResearch")).toBe(
      "Scientific research",
    );
  });
});

describe("OfferTerms", () => {
  it("lists purpose, period, prohibitions and duties at a glance", async () => {
    mockFetchApi.mockReturnValue(ok({}));
    render(
      <OfferTerms
        policy={POLICY}
        providerDid="did:web:alpha"
        providerName="AlphaKlinik Berlin"
        consumerName="PharmaCo Research AG"
      />,
    );

    const purposes = screen.getByTestId("terms-purposes");
    expect(within(purposes).getByText("Scientific research")).toBeTruthy();
    expect(
      within(purposes).getByText("Scientific research").getAttribute("title"),
    ).toBe("EHDS Art. 53(1)(e) - scientific research");
    expect(screen.getByTestId("terms-time").textContent).toMatch(/1 year/);
    expect(screen.getByTestId("terms-prohibitions").textContent).toMatch(
      /re-?identify/i,
    );
    expect(screen.getByTestId("terms-duties").textContent).toMatch(
      /pseudonymi/i,
    );
    // The full wording is still there, behind "Read the full terms".
    const full = screen.getByTestId("offer-policy-description");
    expect(full.closest("details")).not.toBeNull();
  });

  it("sums the permits up and lists them on request", async () => {
    mockFetchApi.mockReturnValue(
      ok({
        permits: [
          { permitId: "permit-a", validUntil: "2027-11-01" },
          { permitId: "permit-b", validUntil: "2028-12-31" },
        ],
      }),
    );
    render(
      <OfferTerms
        policy={POLICY}
        providerDid="did:web:alpha"
        providerName="AlphaKlinik Berlin"
        consumerName="PharmaCo Research AG"
      />,
    );

    const permit = await screen.findByTestId("offer-permit");
    expect(permit.textContent).toMatch(
      /2 data permits; the latest is valid until 2028-12-31/,
    );
    expect(
      within(permit).getByText("permit-a").closest("details"),
    ).not.toBeNull();
  });
});
