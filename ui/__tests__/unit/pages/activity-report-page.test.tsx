/**
 * /activity-report: the public activity report (Art. 59). Issue #206, M6.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

import ActivityReportPage from "@/app/activity-report/page";

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "public/mock/activity_report.json"), "utf8"),
);

describe("ActivityReportPage", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("renders the eleven items from the fixture with their figures", async () => {
    mockFetchApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(FIXTURE),
    });
    render(<ActivityReportPage />);

    expect(
      await screen.findByText("Activity report of the health data access body"),
    ).toBeInTheDocument();
    for (const k of "abcdefghijk") {
      expect(screen.getByTestId(`report-item-${k}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("report-period")).toHaveTextContent(
      "Period 2024-09-18 to 2026-09-18",
    );
    expect(screen.getByTestId("report-period")).toHaveTextContent("MedReg DE");
    const a = screen.getByTestId("report-item-a");
    expect(a).toHaveTextContent("Applications6");
    expect(a).toHaveTextContent("Permits issued3");
    expect(a).toHaveTextContent("research organisation: 2");
    expect(a).toHaveTextContent("Synthea Synthetic FHIR R4 Patient Cohort (2)");
    expect(screen.getByTestId("report-item-c")).toHaveTextContent(
      "PharmaCo Research AG",
    );
    expect(screen.getByTestId("report-item-h")).toHaveTextContent(
      "Average days14",
    );
    expect(screen.getByTestId("report-item-i")).toHaveTextContent("partial: 1");
    expect(screen.getByTestId("report-item-g")).toHaveTextContent(
      "Fees (Art. 62) are not modelled",
    );
    expect(
      screen.getByRole("button", { name: /Markdown/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JSON/ })).toBeInTheDocument();
  });

  it("shows the detail when the report cannot be generated", async () => {
    mockFetchApi.mockResolvedValue({
      ok: false,
      status: 502,
      json: () =>
        Promise.resolve({ error: "Neo4j unavailable", detail: "Bolt down" }),
    });
    render(<ActivityReportPage />);

    const box = await screen.findByTestId("report-error");
    expect(box).toHaveTextContent("The report could not be generated.");
    expect(box).toHaveTextContent("Bolt down");
    expect(screen.queryByTestId("report-item-a")).not.toBeInTheDocument();
  });
});
