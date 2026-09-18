/**
 * /permits: the public register page (Art. 57(1)(j), Art. 58(1)(f)).
 * Issue #206, M2.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import PermitsRegisterPage from "@/app/permits/page";

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 502,
    json: () => Promise.resolve(data),
  });
}

describe("/permits", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("shows decisions with their outcome and pending applications with the clock, from the public route", async () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "public/mock/permits.json"),
        "utf-8",
      ),
    );
    mockFetchApi.mockImplementation(() => response(fixture));
    render(<PermitsRegisterPage />);

    expect(
      await screen.findByText("Data permits register"),
    ).toBeInTheDocument();
    expect(mockFetchApi).toHaveBeenCalledWith("/api/permits");
    expect(screen.getByText(/Decisions \(4\)/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting a decision \(3\)/)).toBeInTheDocument();
    expect(screen.getAllByText("permit issued").length).toBeGreaterThan(0);
    expect(screen.getByText("request approved")).toBeInTheDocument();
    expect(
      screen.getByText(/statistical request, Art\. 69/),
    ).toBeInTheDocument();
    expect(screen.getByText("refused")).toBeInTheDocument();
    expect(
      screen.getByText(/Insufficient data minimisation plan/),
    ).toBeInTheDocument();
    expect(screen.getByText(/94 days overdue/)).toBeInTheDocument();
    expect(screen.getByText(/75 days left/)).toBeInTheDocument();
  });

  it("shows a revoked permit with its reason", async () => {
    mockFetchApi.mockImplementation(() =>
      response({
        generatedAt: "2026-09-18T06:00:00.000Z",
        entries: [
          {
            applicationId: "app-1",
            applicant: "PharmaCo Research AG",
            applicantDid: "did:web:pharmaco.de:research",
            applicantCountry: "DE",
            accessBody: "MedReg DE",
            purpose: "SCIENTIFIC_RESEARCH",
            datasetId: "dataset:x",
            datasetTitle: null,
            submittedAt: "2026-09-18T05:00:00Z",
            outcome: "permit revoked",
            permitId: "permit-app-1",
            decidedAt: "2026-09-18T05:10:00Z",
            validUntil: "2027-09-18T05:10:00Z",
            conditions: [],
            justification: null,
            publishBy: "2026-10-30",
            revokedAt: "2026-09-18T05:20:00Z",
            revocationReason: "Output left the SPE with direct identifiers.",
            decisionDue: "2026-12-18T05:00:00Z",
            daysToDecision: null,
          },
        ],
      }),
    );
    render(<PermitsRegisterPage />);
    expect(await screen.findByText("permit revoked")).toBeInTheDocument();
    expect(
      screen.getByText(/revoked 2026-09-18: Output left the SPE/),
    ).toBeInTheDocument();
  });

  it("says when the register cannot be read", async () => {
    mockFetchApi.mockImplementation(() =>
      response(
        { error: "The register is unavailable", detail: "fetch failed" },
        false,
      ),
    );
    render(<PermitsRegisterPage />);
    expect(
      await screen.findByText("The register could not be read"),
    ).toBeInTheDocument();
    expect(screen.getByText("fetch failed")).toBeInTheDocument();
  });

  it("is public: not on the protected path list", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf-8",
    );
    const list = middleware.slice(
      middleware.indexOf("const PROTECTED_PATHS"),
      middleware.indexOf("] as const;"),
    );
    expect(list).not.toContain('"/permits"');
  });
});
