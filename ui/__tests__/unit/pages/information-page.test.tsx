/**
 * /information: what the public is told about secondary use, Art. 58(1).
 * Issue #206, M6.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

import InformationPage from "@/app/information/page";

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 502,
    json: () => Promise.resolve(data),
  });
}

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public/mock/information.json"),
    "utf-8",
  ),
);

describe("/information", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders the seven items of Art. 58(1) from the fixture", async () => {
    mockFetchApi.mockImplementation(() => response(FIXTURE));
    render(<InformationPage />);
    expect(
      await screen.findByText(
        "Secondary use of health data: what you should know",
      ),
    ).toBeInTheDocument();
    for (const l of ["a", "b", "c", "d", "e", "f", "g"]) {
      expect(screen.getByTestId(`info-${l}`)).toBeInTheDocument();
    }
    expect(
      await within(screen.getByTestId("info-e")).findByText("MedReg DE"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("info-opt-out")).toHaveTextContent("1 of 127");
    const access = screen.getAllByTestId("access-row");
    expect(access).toHaveLength(1);
    expect(access[0]).toHaveTextContent("Limburg Medical Centre (NL)");
    expect(access[0]).toHaveTextContent("(e) scientific research");
    expect(screen.getByTestId("info-result")).toHaveTextContent(
      "Readmission after cardiac surgery",
    );
    expect(screen.getByTestId("info-fees")).toHaveTextContent(
      "75% off for public sector bodies",
    );
    expect(screen.getByTestId("info-b")).toHaveTextContent(
      "at least 12 months",
    );
  });

  it("says so when no permit is in force and no result was communicated", async () => {
    mockFetchApi.mockImplementation(() =>
      response({ ...FIXTURE, bodies: [], access: [], results: [] }),
    );
    render(<InformationPage />);
    expect(
      await screen.findByText("No data permit is in force."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No data user has communicated results yet/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("info-e")).toHaveTextContent(
      "did:web:medreg.de:hdab",
    );
  });

  it("keeps the fixed items and names the reason when the graph is away", async () => {
    mockFetchApi.mockImplementation(() =>
      response({ error: "Neo4j unavailable" }, false),
    );
    render(<InformationPage />);
    expect(
      await screen.findByText(/unavailable: Neo4j unavailable/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("info-a")).toHaveTextContent("Art. 53(1)");
    expect(screen.getByTestId("info-d")).toHaveTextContent("health record");
  });
});
