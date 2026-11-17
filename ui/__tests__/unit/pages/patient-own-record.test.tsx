/**
 * /patient/insights and /patient/research ask for the signed-in patient's own
 * record. Both used to ask for "demo-patient-1", which the routes refuse a
 * PATIENT with a 403 (#475, refuseForeignRecord), so patient1 and patient2 saw
 * no insights and no programmes. demo-patient-1 exists in no seed either, so
 * an operator now sees P1, the demo cohort's first patient. The static build
 * renders from public/mock, each demo persona from their own record's file,
 * and /patient/profile opens the persona's own patient. A refusal or an error
 * says so instead of passing for an empty list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "fs";
import path from "path";

const state = vi.hoisted(() => ({
  isStatic: false,
  session: null as Record<string, unknown> | null,
  status: "authenticated" as "authenticated" | "loading" | "unauthenticated",
}));

vi.mock("@/lib/static-export", () => ({
  get IS_STATIC() {
    return state.isStatic;
  },
  BASE_PATH: "",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: state.session, status: state.status }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The real fetchApi, watched: live mode reaches the stubbed fetch with the
// endpoint, static mode with the mock file it resolved to.
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { fetchApi: vi.fn(real.fetchApi) };
});

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

import { fetchApi } from "@/lib/api";
import { setDemoPersona } from "@/lib/use-demo-persona";
import ResearchInsightsPage from "@/app/patient/insights/page";
import ResearchProgramsPage from "@/app/patient/research/page";
import PatientProfilePage from "@/app/patient/profile/page";

const PUBLIC = path.resolve(__dirname, "../../../public");
const mock = (name: string) =>
  JSON.parse(readFileSync(path.join(PUBLIC, "mock", name), "utf8"));
const INSIGHTS = mock("patient_insights.json");
const RESEARCH = mock("patient_research.json");
const OPT_OUT = mock("patient_opt_out.json");

/** A Keycloak session as auth.ts builds it for a demo login. */
function sessionFor(username: string, roles: string[]) {
  return {
    user: { name: "Patient 7f915eed", preferredUsername: username },
    roles,
  };
}

/** Answers the live routes with the fixtures, and a mock path with its file. */
function stubFetch() {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/mock/")) {
      const file = url.slice(url.indexOf("/mock/") + "/mock/".length);
      return new Response(JSON.stringify(mock(file)), { status: 200 });
    }
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ message: "Consent registered" }));
    }
    if (url.startsWith("/api/patient/insights")) {
      return new Response(JSON.stringify(INSIGHTS));
    }
    if (url.startsWith("/api/patient/research")) {
      return new Response(JSON.stringify(RESEARCH));
    }
    if (url.startsWith("/api/patient/opt-out")) {
      return new Response(JSON.stringify(OPT_OUT));
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The GET endpoints a page asked fetchApi for, under one route. */
function asked(route: string): string[] {
  return vi
    .mocked(fetchApi)
    .mock.calls.filter(
      ([url, init]) =>
        String(url).startsWith(route) &&
        (init?.method ?? "GET").toUpperCase() === "GET",
    )
    .map(([url]) => String(url));
}

const FIRST_FINDING = INSIGHTS.findings[0].finding as string;
const FIRST_PROGRAMME = RESEARCH.programs[0].studyName as string;

beforeEach(() => {
  state.isStatic = false;
  state.session = null;
  state.status = "authenticated";
  vi.mocked(fetchApi).mockClear();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(async () => {
  // In static mode fetchApi waits out a simulated latency before it calls
  // fetch, so a test can end with a request still pending (the profile test
  // ends once the page has asked). Unmount, then let every request settle
  // while the stub still answers: unstubbed, the real fetch gets the relative
  // mock path and the page's rejection goes unhandled in a later test file.
  cleanup();
  await Promise.allSettled(
    vi.mocked(fetchApi).mock.results.map((r) => r.value),
  );
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each([
  ["patient1", "P1"],
  ["patient2", "P2"],
])("signed in as %s", (username, own) => {
  beforeEach(() => {
    state.session = sessionFor(username, ["PATIENT"]);
    stubFetch();
  });

  it(`insights ask for ${own} and show the findings`, async () => {
    render(<ResearchInsightsPage />);
    expect(await screen.findByText(FIRST_FINDING)).toBeInTheDocument();
    expect(asked("/api/patient/insights")).toEqual([
      `/api/patient/insights?patientId=${own}`,
    ]);
    expect(screen.queryByText("No insights available.")).toBeNull();
  });

  it(`research asks for ${own}, shows the programmes and consents as ${own}`, async () => {
    const user = userEvent.setup();
    render(<ResearchProgramsPage />);
    expect(await screen.findByText(FIRST_PROGRAMME)).toBeInTheDocument();
    expect(asked("/api/patient/research")).toEqual([
      `/api/patient/research?patientId=${own}`,
    ]);

    await user.click(
      (await screen.findAllByText("Donate my EHR to this study"))[0],
    );
    await waitFor(() => {
      const post = vi
        .mocked(fetchApi)
        .mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(post?.[1]?.body)).patientId).toBe(own);
    });
  });
});

describe("before the session is known", () => {
  it("asks for no record yet, so no request comes back 403", async () => {
    state.status = "loading";
    stubFetch();
    render(<ResearchInsightsPage />);
    render(<ResearchProgramsPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(asked("/api/patient/insights")).toEqual([]);
    expect(asked("/api/patient/research")).toEqual([]);
  });
});

describe("an operator (EDC_ADMIN)", () => {
  it("sees P1, a record the seeds carry, on both pages", async () => {
    state.session = sessionFor("edcadmin", ["EDC_ADMIN"]);
    stubFetch();
    render(<ResearchInsightsPage />);
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(asked("/api/patient/insights")).toEqual([
        "/api/patient/insights?patientId=P1",
      ]);
      expect(asked("/api/patient/research")).toEqual([
        "/api/patient/research?patientId=P1",
      ]);
    });
  });
});

describe.each([
  ["patient1", "P1", "patient_insights.json", "patient_research.json"],
  [
    "patient2",
    "P2",
    "patient_insights_patient2.json",
    "patient_research_patient2.json",
  ],
])(
  "static build, demo persona %s",
  (username, own, insightsFile, researchFile) => {
    beforeEach(() => {
      state.isStatic = true;
      state.session = null;
      state.status = "unauthenticated";
      vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
      setDemoPersona(username);
      stubFetch();
    });

    /** The mock files the stubbed fetch was asked for. */
    const files = () =>
      vi
        .mocked(fetch)
        .mock.calls.map(([url]) => String(url))
        .filter((url) => url.includes("/mock/"))
        .map((url) => url.slice(url.indexOf("/mock/") + "/mock/".length));

    it(`renders ${own}'s insights fixture, asked for as ${own}`, async () => {
      const finding = mock(insightsFile).findings[0].finding as string;
      render(<ResearchInsightsPage />);
      expect(await screen.findByText(finding)).toBeInTheDocument();
      expect(asked("/api/patient/insights")).toEqual([
        `/api/patient/insights?patientId=${own}`,
      ]);
      expect(files()).toContain(insightsFile);
    });

    it(`renders ${own}'s programmes and consents, asked for as ${own}`, async () => {
      const research = mock(researchFile);
      render(<ResearchProgramsPage />);
      expect(
        await screen.findByText(research.programs[0].studyName as string),
      ).toBeInTheDocument();
      expect(asked("/api/patient/research")).toEqual([
        `/api/patient/research?patientId=${own}`,
      ]);
      expect(files()).toContain(researchFile);
      for (const c of research.consents) {
        expect(screen.getAllByText(c.studyId as string).length).toBeGreaterThan(
          0,
        );
      }
    });

    it(`opens ${own} on the profile, and lists no other patient`, async () => {
      render(<PatientProfilePage />);
      await waitFor(() => {
        expect(asked("/api/patient/profile")).toContain(
          `/api/patient/profile?patientId=${own}`,
        );
      });
      expect(
        asked("/api/patient/profile").filter((u) => u.includes("patientId=")),
      ).toEqual([`/api/patient/profile?patientId=${own}`]);
    });
  },
);

describe("the two demo patients' static fixtures", () => {
  it("patient2's files are P2's own, and match P2's profile", () => {
    const profile = mock("patient_profile_patient2.json");
    const insights = mock("patient_insights_patient2.json");
    const research = mock("patient_research_patient2.json");
    expect(insights.patientId).toBe("P2");
    expect(insights.activeDonations).toBe(
      research.consents.filter((c: { revoked: boolean }) => !c.revoked).length,
    );
    expect(
      insights.donatedStudies.map((d: { studyId: string }) => d.studyId),
    ).toEqual(research.consents.map((c: { studyId: string }) => c.studyId));
    // Every finding concerns a condition on P2's profile.
    const conditions = profile.conditions
      .map((c: { display: string }) => c.display.toLowerCase())
      .join(" | ");
    for (const f of insights.findings) {
      for (const c of f.relevantConditions as string[]) {
        expect(conditions).toContain(c.toLowerCase());
      }
    }
    // Not P1's file under another name.
    expect(insights).not.toEqual(INSIGHTS);
    expect(research.consents).not.toEqual(RESEARCH.consents);
  });
});

describe("a refusal or an error is not an empty list", () => {
  beforeEach(() => {
    state.session = sessionFor("patient1", ["PATIENT"]);
  });

  function answer(status: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.startsWith("/api/patient/opt-out")) {
          return new Response(JSON.stringify(OPT_OUT));
        }
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status,
        });
      }),
    );
  }

  it("research: a 403 says the programmes are not the patient's to see", async () => {
    answer(403);
    render(<ResearchProgramsPage />);
    expect(await screen.findByTestId("research-load-error")).toHaveTextContent(
      "You may not see these research programs",
    );
    expect(screen.queryByText(/No research programs found/)).toBeNull();
  });

  it("research: a 500 says loading failed, with the status", async () => {
    answer(500);
    render(<ResearchProgramsPage />);
    expect(await screen.findByTestId("research-load-error")).toHaveTextContent(
      "The research programs could not be loaded (HTTP 500).",
    );
    expect(screen.queryByText(/No research programs found/)).toBeNull();
  });

  it("research: an empty list still says there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        String(input).startsWith("/api/patient/opt-out")
          ? new Response(JSON.stringify(OPT_OUT))
          : new Response(JSON.stringify({ programs: [], consents: [] })),
      ),
    );
    render(<ResearchProgramsPage />);
    expect(
      await screen.findByText(/No research programs found/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("research-load-error")).toBeNull();
  });

  it("insights: a 403 says the insights are not the patient's to see", async () => {
    answer(403);
    render(<ResearchInsightsPage />);
    expect(await screen.findByTestId("insights-load-error")).toHaveTextContent(
      "You may not see these insights",
    );
    expect(screen.queryByText("No insights available.")).toBeNull();
  });

  it("insights: a 502 says loading failed, with the status", async () => {
    answer(502);
    render(<ResearchInsightsPage />);
    expect(await screen.findByTestId("insights-load-error")).toHaveTextContent(
      "The insights could not be loaded (HTTP 502).",
    );
  });
});
