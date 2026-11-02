/**
 * /patient/insights and /patient/research ask for the signed-in patient's own
 * record. Both used to ask for "demo-patient-1", which the routes refuse a
 * PATIENT with a 403 (#475, refuseForeignRecord), so patient1 and patient2 saw
 * no insights and no programmes. An operator still sees demo-patient-1, and
 * the static build still renders from public/mock for the demo persona.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => {
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
  it("still sees the demo record on both pages", async () => {
    state.session = sessionFor("edcadmin", ["EDC_ADMIN"]);
    stubFetch();
    render(<ResearchInsightsPage />);
    render(<ResearchProgramsPage />);
    await waitFor(() => {
      expect(asked("/api/patient/insights")).toEqual([
        "/api/patient/insights?patientId=demo-patient-1",
      ]);
      expect(asked("/api/patient/research")).toEqual([
        "/api/patient/research?patientId=demo-patient-1",
      ]);
    });
  });
});

describe.each([
  ["patient1", "P1"],
  ["patient2", "P2"],
])("static build, demo persona %s", (username, own) => {
  beforeEach(() => {
    state.isStatic = true;
    state.session = null;
    state.status = "unauthenticated";
    vi.stubEnv("NEXT_PUBLIC_STATIC_EXPORT", "true");
    setDemoPersona(username);
    stubFetch();
  });

  it(`renders the insights fixture, asked for as ${own}`, async () => {
    render(<ResearchInsightsPage />);
    expect(await screen.findByText(FIRST_FINDING)).toBeInTheDocument();
    expect(asked("/api/patient/insights")).toEqual([
      `/api/patient/insights?patientId=${own}`,
    ]);
  });

  it(`renders the programmes fixture, asked for as ${own}`, async () => {
    render(<ResearchProgramsPage />);
    expect(await screen.findByText(FIRST_PROGRAMME)).toBeInTheDocument();
    expect(asked("/api/patient/research")).toEqual([
      `/api/patient/research?patientId=${own}`,
    ]);
  });
});
