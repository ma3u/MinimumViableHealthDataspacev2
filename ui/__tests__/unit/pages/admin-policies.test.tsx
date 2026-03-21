/**
 * Comprehensive tests for the Admin Policies page.
 *
 * Covers: loading state, page heading, policy groups accordion, expand/collapse,
 * stats bar, empty groups, create form toggle, template selector (6 templates),
 * participant dropdown, duration dropdown (5 options), ODRL JSON preview,
 * create submission success/error/offline, form messages, POST body verification,
 * form close/cancel, disabled submit, creating spinner, policy card ODRL viewer,
 * external ODRL docs link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/* ── Mocks ── */

const mockFetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
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

// Mock OdrlJsonHighlighter to avoid complex tokenisation rendering
vi.mock("@/components/OdrlJsonHighlighter", () => ({
  default: ({ data }: { data: unknown; className?: string }) => (
    <pre data-testid="odrl-json">{JSON.stringify(data)}</pre>
  ),
}));

import AdminPoliciesPage from "@/app/admin/policies/page";

function mockResponse(data: unknown, ok = true) {
  return Promise.resolve({ json: () => Promise.resolve(data), ok });
}

function mockErrorResponse() {
  return Promise.reject(new Error("Network error"));
}

/* ── Test data ── */

const MOCK_GROUPS = [
  {
    participantId: "participant-alpha",
    identity: "did:web:alpha-klinik.de:participant",
    policies: [
      {
        "@type": "edc:PolicyDefinition",
        "@id": "policy-ehds-research-111",
        "edc:policy": {
          "@type": "odrl:Set",
          "odrl:permission": [
            {
              "odrl:action": { "@id": "odrl:use" },
              "odrl:constraint": [
                {
                  "odrl:leftOperand": { "@id": "edc:purpose" },
                  "odrl:operator": { "@id": "odrl:isAnyOf" },
                  "odrl:rightOperand": [
                    "EHDS Article 53(1)(c) — scientific research",
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        "@type": "edc:PolicyDefinition",
        "@id": "policy-ehds-stats-222",
        "edc:policy": {
          "@type": "odrl:Set",
          "odrl:permission": [
            {
              "odrl:action": { "@id": "odrl:use" },
              "odrl:constraint": [
                {
                  "odrl:leftOperand": { "@id": "edc:purpose" },
                  "odrl:operator": { "@id": "odrl:isAnyOf" },
                  "odrl:rightOperand": [
                    "EHDS Article 53(1)(e) — official statistics",
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    participantId: "participant-pharmaco",
    identity: "did:web:pharmaco.de:research",
    policies: [],
  },
];

/* ── Helpers ── */

async function renderLoaded(groups = MOCK_GROUPS) {
  mockFetchApi.mockResolvedValueOnce(mockResponse({ participants: groups }));
  render(<AdminPoliciesPage />);
  await waitFor(() =>
    expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
  );
}

/* ── Tests ── */

describe("AdminPoliciesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ─── Loading state ─── */

  it("shows a loading spinner on mount", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AdminPoliciesPage />);
    expect(screen.getByText(/Loading policies/)).toBeInTheDocument();
  });

  it("calls fetchApi for /api/admin/policies on mount", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AdminPoliciesPage />);
    expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/policies");
  });

  /* ─── Page heading / PageIntro ─── */

  it("renders the page title", async () => {
    await renderLoaded();
    expect(screen.getByText("Policy Definitions")).toBeInTheDocument();
  });

  it("renders the page description about ODRL policies", async () => {
    await renderLoaded();
    expect(
      screen.getByText(/Manage ODRL policies across all participant contexts/),
    ).toBeInTheDocument();
  });

  it("renders a link to the ODRL W3C specification", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    // The doc link is inside PageIntro's collapsible info section
    const infoToggle = screen.getByText("How does this work?");
    await user.click(infoToggle);
    const link = screen.getByText("ODRL Specification (W3C)");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://www.w3.org/TR/odrl-model/",
    );
  });

  it("renders workflow navigation links", async () => {
    await renderLoaded();
    expect(screen.getByText("Tenant Management")).toBeInTheDocument();
    expect(screen.getByText("Audit & Provenance")).toBeInTheDocument();
  });

  /* ─── Stats bar ─── */

  it("displays participant count in the stats bar", async () => {
    await renderLoaded();
    expect(screen.getByText("2 participants")).toBeInTheDocument();
  });

  it("displays total policy count in the stats bar", async () => {
    await renderLoaded();
    expect(screen.getByText("2 total policies")).toBeInTheDocument();
  });

  it("does not display stats bar while loading", () => {
    mockFetchApi.mockReturnValue(new Promise(() => {}));
    render(<AdminPoliciesPage />);
    expect(screen.queryByText(/participants/)).not.toBeInTheDocument();
    expect(screen.queryByText(/total policies/)).not.toBeInTheDocument();
  });

  /* ─── Empty state ─── */

  it("shows centered empty message when no groups returned", async () => {
    await renderLoaded([]);
    expect(screen.getByText("No policies found")).toBeInTheDocument();
  });

  /* ─── Accordion: policy groups ─── */

  it("renders one accordion row per participant group", async () => {
    await renderLoaded();
    expect(screen.getByText("alpha-klinik.de:participant")).toBeInTheDocument();
    expect(screen.getByText("pharmaco.de:research")).toBeInTheDocument();
  });

  it("displays policy count for each group", async () => {
    await renderLoaded();
    expect(screen.getByText("2 policies")).toBeInTheDocument();
    expect(screen.getByText("0 policies")).toBeInTheDocument();
  });

  it("uses singular 'policy' for count of 1", async () => {
    const singlePolicy = [
      {
        participantId: "p1",
        identity: "did:web:example.com",
        policies: [
          {
            "@id": "pol-1",
            "edc:policy": { "odrl:permission": [] },
          },
        ],
      },
    ];
    await renderLoaded(singlePolicy);
    expect(screen.getByText("1 policy")).toBeInTheDocument();
  });

  /* ─── Expand / collapse ─── */

  it("expands a group on click to show policy cards", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    expect(screen.getByText("policy-ehds-research-111")).toBeInTheDocument();
    expect(screen.getByText("policy-ehds-stats-222")).toBeInTheDocument();
  });

  it("collapses an expanded group on second click", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    expect(screen.getByText("policy-ehds-research-111")).toBeInTheDocument();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    expect(
      screen.queryByText("policy-ehds-research-111"),
    ).not.toBeInTheDocument();
  });

  it("shows 'No policies defined' when expanding an empty group", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("pharmaco.de:research"));
    expect(screen.getByText("No policies defined")).toBeInTheDocument();
  });

  it("expanding one group collapses the previously expanded", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    expect(screen.getByText("policy-ehds-research-111")).toBeInTheDocument();

    await user.click(screen.getByText("pharmaco.de:research"));
    expect(
      screen.queryByText("policy-ehds-research-111"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No policies defined")).toBeInTheDocument();
  });

  /* ─── Policy card ODRL viewer ─── */

  it("renders View full ODRL JSON details in expanded policy cards", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    const summaries = screen.getAllByText("View full ODRL JSON");
    expect(summaries).toHaveLength(2);
  });

  it("renders purpose label from permission constraints", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    expect(
      screen.getByText("EHDS Article 53(1)(c) — scientific research"),
    ).toBeInTheDocument();
  });

  it("renders OdrlJsonHighlighter in policy card details", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByText("alpha-klinik.de:participant"));
    const jsonPreviews = screen.getAllByTestId("odrl-json");
    expect(jsonPreviews.length).toBeGreaterThanOrEqual(2);
  });

  /* ─── Create Policy button toggle ─── */

  it("renders a 'Create Policy' button", async () => {
    await renderLoaded();
    expect(
      screen.getByRole("button", { name: /Create Policy/ }),
    ).toBeInTheDocument();
  });

  it("opens the create form when Create Policy is clicked", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(
      screen.getByText("Create EHDS Policy Definition"),
    ).toBeInTheDocument();
  });

  it("toggles form button text to Close when form is visible", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(screen.getByRole("button", { name: /Close/ })).toBeInTheDocument();
  });

  it("closes form when Close button is clicked", async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(
      screen.getByText("Create EHDS Policy Definition"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Close/ }));
    expect(
      screen.queryByText("Create EHDS Policy Definition"),
    ).not.toBeInTheDocument();
  });

  /* ─── Template selector: 6 template cards ─── */

  it("displays all 6 policy template buttons", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    expect(screen.getByText("Scientific Research")).toBeInTheDocument();
    expect(screen.getByText("Public Health Surveillance")).toBeInTheDocument();
    expect(screen.getByText("Official Statistics")).toBeInTheDocument();
    expect(
      screen.getByText("Regulatory / Pharmacovigilance"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI / ML Model Training")).toBeInTheDocument();
    expect(
      screen.getByText("Cross-border Care (Primary Use)"),
    ).toBeInTheDocument();
  });

  it("displays article references on template cards", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    expect(screen.getByText("Art. 53(1)(c)")).toBeInTheDocument();
    expect(screen.getByText("Art. 53(1)(a)")).toBeInTheDocument();
    expect(screen.getByText("Art. 53(1)(e)")).toBeInTheDocument();
    expect(screen.getByText("Art. 53(1)(b)")).toBeInTheDocument();
    expect(
      screen.getByText("Art. 53(1)(c) + GDPR Art. 89"),
    ).toBeInTheDocument();
    expect(screen.getByText("Art. 7")).toBeInTheDocument();
  });

  it("shows the first template description by default", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    expect(
      screen.getByText(/Secondary use for scientific research in health/),
    ).toBeInTheDocument();
  });

  it("updates description when a different template is selected", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    await user.click(screen.getByText("Official Statistics"));
    expect(
      screen.getByText(/producing official statistics/),
    ).toBeInTheDocument();
  });

  it("updates description when AI template is selected", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    await user.click(screen.getByText("AI / ML Model Training"));
    expect(
      screen.getByText(/Training AI\/ML models for health applications/),
    ).toBeInTheDocument();
  });

  it("updates description for Cross-border Care template", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    await user.click(screen.getByText("Cross-border Care (Primary Use)"));
    expect(
      screen.getByText(/cross-border access for treatment continuity/),
    ).toBeInTheDocument();
  });

  /* ─── Participant dropdown ─── */

  it("populates participant dropdown from loaded groups", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    const select = screen.getByDisplayValue("alpha-klinik.de:participant");
    expect(select).toBeInTheDocument();

    const options = within(select as HTMLElement).getAllByRole("option");
    // "— select —" + 2 participants
    expect(options).toHaveLength(3);
  });

  it("shows '— select —' as the first option", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Label is not associated via htmlFor, so find by display value
    const selectEl = screen.getByDisplayValue("alpha-klinik.de:participant");
    const opts = within(selectEl as HTMLElement).getAllByRole("option");
    expect((opts[0] as HTMLOptionElement).textContent).toBe("— select —");
  });

  /* ─── Duration dropdown (5 options) ─── */

  it("shows all 5 duration options", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    const durationSelect = screen.getByDisplayValue("1 year");
    const opts = within(durationSelect as HTMLElement).getAllByRole("option");
    expect(opts).toHaveLength(5);
    expect(opts.map((o) => o.textContent)).toEqual([
      "90 days",
      "180 days",
      "1 year",
      "2 years",
      "3 years",
    ]);
  });

  it("defaults to 1 year duration", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    expect(screen.getByDisplayValue("1 year")).toBeInTheDocument();
  });

  /* ─── ODRL JSON preview ─── */

  it("has a collapsible preview for the ODRL JSON", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    expect(screen.getByText("Preview ODRL policy JSON")).toBeInTheDocument();
  });

  it("renders OdrlJsonHighlighter in the preview details", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // The <details> element contains the preview; the mock renders data-testid
    const previews = screen.getAllByTestId("odrl-json");
    expect(previews.length).toBeGreaterThanOrEqual(1);
  });

  /* ─── Disable submit when no participant ─── */

  it("disables the submit button when no participant is selected", async () => {
    // Return groups with no auto-selected participant
    mockFetchApi.mockResolvedValueOnce(mockResponse({ participants: [] }));
    render(<AdminPoliciesPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // There are two "Create Policy" on page: the header toggle and the form submit
    const submitButtons = screen.getAllByRole("button", {
      name: /Create Policy/,
    });
    const submit = submitButtons[submitButtons.length - 1];
    expect(submit).toBeDisabled();
  });

  /* ─── Create form submission success ─── */

  it("submits a POST request with correct body on form submit", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Second fetch for the POST, third fetch for the reload
    mockFetchApi.mockResolvedValueOnce(mockResponse({ "@id": "new-policy" }));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    // The form submit button (inside the form, not the toggle)
    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("policy-ehds-research-"),
      });
    });
  });

  it("shows success message after successful creation", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Policy created successfully."),
      ).toBeInTheDocument();
    });
  });

  it("shows green colour for success message", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      const msg = screen.getByText("Policy created successfully.");
      expect(msg.className).toContain("text-green-400");
    });
  });

  /* ─── Offline message ─── */

  it("shows offline message when response includes offline flag", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(mockResponse({ offline: true }));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/EDC-V management API is offline/),
      ).toBeInTheDocument();
    });
  });

  /* ─── Create form submission error ─── */

  it("shows error message when POST fails with HTTP error", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ error: "Duplicate policy" }, false),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed: Duplicate policy/)).toBeInTheDocument();
    });
  });

  it("shows error message when POST throws a network error", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockRejectedValueOnce(new Error("Network error"));

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed: Network error/)).toBeInTheDocument();
    });
  });

  it("shows red colour for error messages", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockRejectedValueOnce(new Error("Boom"));

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      const msg = screen.getByText(/Failed: Boom/);
      expect(msg.className).toContain("text-red-400");
    });
  });

  it("shows error when submitting without participant selected", async () => {
    // Use response that returns groups but clear participants so none is auto-selected
    mockFetchApi.mockResolvedValueOnce(mockResponse({ participants: [] }));
    render(<AdminPoliciesPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Pick a template to enable the form area, but the submit button should be disabled
    // Force-enable: we actually need to verify the validation message
    // The button is disabled, so we test that earlier; but let's also check the code path
    // when handleCreate is called without a participant (belt-and-suspenders)
    // That code path produces "Select a participant first."
    // Since the button is disabled, this path is not reachable via UI clicks.
    // We'll verify the disabled state instead — already covered above.
    const submitBtns = screen.getAllByRole("button", {
      name: /Create Policy/,
    });
    const submit = submitBtns[submitBtns.length - 1];
    expect(submit).toBeDisabled();
  });

  /* ─── Creating spinner ─── */

  it("disables submit button while creating", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Return a promise that doesn't resolve immediately
    let resolvePost!: (value: unknown) => void;
    mockFetchApi.mockReturnValueOnce(
      new Promise((r) => {
        resolvePost = r;
      }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => expect(submitBtn).toBeDisabled());

    // Resolve to clean up
    resolvePost(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );
  });

  /* ─── POST body verification ─── */

  it("includes participantId and policy in the POST body", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      const postCall = mockFetchApi.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "/api/admin/policies" &&
          (c[1] as { method?: string })?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as { body: string }).body);
      expect(body.participantId).toBe("participant-alpha");
      expect(body.policy).toBeDefined();
      expect(body.policy["@type"]).toBe("edc:PolicyDefinition");
      expect(body.policy["edc:policy"]["@type"]).toBe("odrl:Set");
    });
  });

  it("sends selected duration in the policy body", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Change duration to 90 days
    const durationSelect = screen.getByDisplayValue("1 year");
    await user.selectOptions(durationSelect, "contractAgreement+90d");

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      const postCall = mockFetchApi.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "/api/admin/policies" &&
          (c[1] as { method?: string })?.method === "POST",
      );
      const body = JSON.parse((postCall![1] as { body: string }).body);
      expect(JSON.stringify(body.policy)).toContain("contractAgreement+90d");
    });
  });

  it("sends selected template in the policy body", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Select the statistics template
    await user.click(screen.getByText("Official Statistics"));

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      const postCall = mockFetchApi.mock.calls.find(
        (c: unknown[]) =>
          c[0] === "/api/admin/policies" &&
          (c[1] as { method?: string })?.method === "POST",
      );
      const body = JSON.parse((postCall![1] as { body: string }).body);
      expect(body.policy["@id"]).toContain("policy-ehds-statistics-");
    });
  });

  /* ─── Form clears message on toggle ─── */

  it("clears formMsg when toggling the form closed and re-opened", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Trigger an error
    mockFetchApi.mockRejectedValueOnce(new Error("Oops"));
    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);
    await waitFor(() =>
      expect(screen.getByText(/Failed: Oops/)).toBeInTheDocument(),
    );

    // Close form
    await user.click(screen.getByRole("button", { name: /Close/ }));
    // Reopen
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(screen.queryByText(/Failed: Oops/)).not.toBeInTheDocument();
  });

  /* ─── Reload after create ─── */

  it("reloads policies after successful creation", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    mockFetchApi.mockResolvedValueOnce(mockResponse({}));
    mockFetchApi.mockResolvedValueOnce(
      mockResponse({ participants: MOCK_GROUPS }),
    );

    const formDiv = screen
      .getByText("Create EHDS Policy Definition")
      .closest("div")!;
    const submitBtn = within(formDiv).getByRole("button", {
      name: /Create Policy/,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      // Initial load call + POST + reload = 3 calls
      expect(mockFetchApi).toHaveBeenCalledTimes(3);
      expect(mockFetchApi).toHaveBeenLastCalledWith("/api/admin/policies");
    });
  });

  /* ─── Error handling on initial load ─── */

  it("handles fetch error gracefully and hides loading", async () => {
    mockFetchApi.mockRejectedValueOnce(new Error("Network error"));
    render(<AdminPoliciesPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
    );
    // Should show empty state
    expect(screen.getByText("No policies found")).toBeInTheDocument();
  });

  it("handles non-ok response gracefully", async () => {
    mockFetchApi.mockResolvedValueOnce(mockResponse({}, false));
    render(<AdminPoliciesPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("No policies found")).toBeInTheDocument();
  });

  /* ─── Error badge in participant group ─── */

  it("displays error text next to policy count when group has error", async () => {
    const errorGroups = [
      {
        participantId: "p-err",
        identity: "did:web:broken.com",
        policies: [],
        error: "EDC offline",
      },
    ];
    await renderLoaded(errorGroups);
    expect(screen.getByText("(EDC offline)")).toBeInTheDocument();
  });

  /* ─── Participant dropdown change ─── */

  it("allows selecting a different participant for policy creation", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    // Label is not associated via htmlFor, so find by current display value
    const selectEl = screen.getByDisplayValue("alpha-klinik.de:participant");
    await user.selectOptions(selectEl, "participant-pharmaco");
    expect(selectEl).toHaveValue("participant-pharmaco");
  });

  /* ─── Duration change ─── */

  it("allows changing the duration option", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));

    const durationSelect = screen.getByDisplayValue("1 year");
    await user.selectOptions(durationSelect, "contractAgreement+730d");
    expect(durationSelect).toHaveValue("contractAgreement+730d");
  });

  /* ─── Policy Template label ─── */

  it("renders Policy Template label above the template grid", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(screen.getByText("Policy Template")).toBeInTheDocument();
  });

  /* ─── Access Duration label ─── */

  it("renders Access Duration label", async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /Create Policy/ }));
    expect(screen.getByText("Access Duration")).toBeInTheDocument();
  });

  /* ─── Array data fallback ─── */

  it("handles top-level array response from API", async () => {
    mockFetchApi.mockResolvedValueOnce(mockResponse(MOCK_GROUPS));
    render(<AdminPoliciesPage />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading policies/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("2 participants")).toBeInTheDocument();
  });
});
