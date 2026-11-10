/**
 * The bonus programs page (ui/src/app/patient/programmes/page.tsx), #934
 * step 6 (ADR-087): a member who joined sees their own result for the
 * ended year before anything is sent, and Send stays off while the year
 * is not over. AlphaKasse DE and every value are fictional.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (url: string, init?: unknown) => mockFetchApi(url, init),
}));
vi.mock("@/lib/patient/use-own-record", () => ({
  useOwnRecord: () => ({ kind: "own", patientId: "P1" }),
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

import BonusProgrammesPage from "@/app/patient/programmes/page";

const PROGRAMME = "urn:mvhd:programme:alphakasse:active-year-2025";
const ok = (data: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  });

const LIST = {
  programmes: [
    {
      programmeId: PROGRAMME,
      title: "Active year bonus 2025",
      description: null,
      publisherName: "AlphaKasse DE",
      publisherDid: "did:web:alphakasse.de:insurer",
      dataSpace: "insurance-wellbeing",
      endpointUrl: null,
      ruleTitle: "Active year rule, version 2025.1",
      ruleDescription: "150 minutes a week and one check-up.",
      ruleVersion: "2025.1",
      lastSeenAt: null,
    },
  ],
  consents: [
    {
      consentId: "c-1",
      programmeId: PROGRAMME,
      joinedAt: "2026-11-10T09:00:00Z",
      withdrawnAt: null,
    },
  ],
};

const EVALUATED = {
  programmeId: PROGRAMME,
  evaluation: {
    year: 2025,
    status: "evaluated",
    goalMet: true,
    activity: {
      minutesPerWeek: 181,
      required: 150,
      weeksWithData: 52,
      met: true,
    },
    checkUp: { count: 1, required: 1, met: true },
  },
};

function route(
  evaluation: unknown,
  transfer?: { status: number; body: unknown },
) {
  mockFetchApi.mockImplementation((url: string) => {
    if (url.startsWith("/api/patient/programmes/evaluation")) {
      return ok(evaluation);
    }
    if (url.startsWith("/api/patient/programmes/transfer")) {
      return ok(transfer?.body ?? {}, transfer?.status ?? 202);
    }
    return ok(LIST);
  });
}

describe("BonusProgrammesPage: the year's result (ADR-087)", () => {
  beforeEach(() => {
    mockFetchApi.mockReset();
  });

  it("shows the member's own result and its breakdown before anything is sent", async () => {
    route(EVALUATED);
    render(<BonusProgrammesPage />);
    expect(await screen.findByTestId("bonus-programme-goal")).toHaveTextContent(
      "Goal met: yes",
    );
    const result = screen.getByTestId("bonus-programme-result");
    expect(result).toHaveTextContent("181 minutes a week on average");
    expect(result).toHaveTextContent("from 52 weeks your tracker shared");
    expect(result).toHaveTextContent("Check-ups in 2025: 1");
    expect(result).toHaveTextContent("This breakdown stays in your record");
    // The member's own record, never a query parameter's.
    expect(mockFetchApi).toHaveBeenCalledWith(
      expect.stringContaining(
        `/api/patient/programmes/evaluation?programmeId=${encodeURIComponent(
          PROGRAMME,
        )}&patientId=P1`,
      ),
      undefined,
    );
    // Nothing is sent by looking.
    expect(
      mockFetchApi.mock.calls.some(([u]) => String(u).includes("/transfer")),
    ).toBe(false);
  });

  it("sends only on the member's instruction, and says goal met: yes", async () => {
    route(EVALUATED, {
      status: 202,
      body: { transfer: { year: 2025, goalMet: true, status: "evaluated" } },
    });
    render(<BonusProgrammesPage />);
    const send = await screen.findByRole("button", {
      name: /Send my answer for 2025/,
    });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    expect(
      await screen.findByText(/Recorded for 2025: goal met, yes\./),
    ).toBeInTheDocument();
  });

  it("says goal met: no when the year fell short", async () => {
    route(
      {
        ...EVALUATED,
        evaluation: {
          ...EVALUATED.evaluation,
          goalMet: false,
          activity: {
            minutesPerWeek: 78,
            required: 150,
            weeksWithData: 48,
            met: false,
          },
        },
      },
      { status: 202, body: { transfer: { year: 2025, goalMet: false } } },
    );
    render(<BonusProgrammesPage />);
    expect(await screen.findByTestId("bonus-programme-goal")).toHaveTextContent(
      "Goal met: no",
    );
    const send = screen.getByRole("button", {
      name: /Send my answer for 2025/,
    });
    await userEvent.click(send);
    expect(
      await screen.findByText(/Recorded for 2025: goal met, no\./),
    ).toBeInTheDocument();
  });

  it("keeps Send off while the year is not over", async () => {
    route({
      programmeId: PROGRAMME,
      evaluation: {
        year: 2025,
        status: "year-not-over",
        evaluableFrom: "2026-01-01",
      },
    });
    render(<BonusProgrammesPage />);
    expect(
      await screen.findByTestId("bonus-programme-year-not-over"),
    ).toHaveTextContent("The hub works out your result from 2026-01-01");
    expect(
      screen.getByRole("button", { name: /Send my answer for 2025/ }),
    ).toBeDisabled();
  });
});
