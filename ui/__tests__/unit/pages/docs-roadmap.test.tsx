/**
 * /docs/roadmap: the timeline of the roadmap to 2031, the drivers behind it
 * with their sources, and every item as a table with its issue.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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

// vis-timeline draws on a canvas jsdom does not lay out; the component's own
// test checks what it hands over (RoadmapTimeline.test.tsx).
vi.mock("@/components/docs/RoadmapTimeline", () => ({
  default: () => <div data-testid="roadmap-timeline" />,
}));

import RoadmapDocsPage from "@/app/docs/roadmap/page";
import { EPICS, ITEMS, itemEpic } from "@/lib/docs/roadmap";

describe("/docs/roadmap", () => {
  it("renders the timeline and links the GitHub Project the plan is edited in", () => {
    render(<RoadmapDocsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Roadmap/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "GitHub Project" }),
    ).toHaveAttribute("href", "https://github.com/users/ma3u/projects/1");
  });

  it("names the six drivers, each with its sources", () => {
    render(<RoadmapDocsPage />);
    for (const name of [
      "The EHDS Regulation, to 2031",
      "Simpl, the EU's data space middleware",
      "eIDAS 2.0: the EUDI Wallet and the Business Wallet",
      "Health standards: HL7 FHIR, OMOP, HealthDCAT-AP",
      "Eclipse Dataspace: DSP, DCP and DPS",
      "Apache Iceberg and the lakehouse formats",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
    // The driver and the regulation lane's items (#990) both link it.
    const regulation = screen.getAllByRole("link", {
      name: /Regulation \(EU\) 2025\/327/,
    });
    expect(regulation.length).toBeGreaterThan(0);
    for (const a of regulation)
      expect(a).toHaveAttribute(
        "href",
        "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng",
      );
    expect(
      screen.getByRole("link", { name: "What the hub implements" }),
    ).toHaveAttribute("href", "/docs/ehds");
  });

  it("lists every item with a link to its issue", () => {
    render(<RoadmapDocsPage />);
    const items = screen.getByRole("heading", {
      level: 2,
      name: "Every item",
    }).parentElement!;
    for (const i of ITEMS) {
      // A note can name an issue too ("After #708"); every such link goes
      // to that issue.
      const links = within(items).getAllByRole("link", {
        name: `#${i.issue}`,
      });
      for (const a of links)
        expect(a).toHaveAttribute(
          "href",
          `https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/${i.issue}`,
        );
    }
  });

  it("groups every item under its epic, the closed ones last", () => {
    render(<RoadmapDocsPage />);
    const items = screen.getByRole("heading", {
      level: 2,
      name: "Every item",
    }).parentElement!;
    const groups = within(items)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    // In the epic cards' order; only epics with dated items.
    expect(groups).toEqual([
      ...EPICS.filter((e) => ITEMS.some((i) => itemEpic(i) === e)).map(
        (e) => e.title,
      ),
      "Closed before the epics",
    ]);
    // #649 is a sub-issue of #716, so it sits with #716 under #961.
    const secondary = within(items).getByRole("heading", {
      level: 3,
      name: /^Secondary use/,
    }).parentElement!;
    expect(
      within(secondary).getByRole("link", { name: "#649" }),
    ).toBeInTheDocument();
    expect(
      within(secondary).getByRole("link", { name: "Epic #961" }),
    ).toHaveAttribute("href", "#e961");
    // Within an epic: P1 before P2.
    const tehdas = within(items).getByRole("heading", {
      level: 3,
      name: /^TEHDAS2 results/,
    }).parentElement!;
    const order = within(tehdas)
      .getAllByRole("link", { name: /^#\d+$/ })
      .map((a) => a.textContent);
    expect(order.slice(0, 4)).toEqual(["#991", "#992", "#994", "#993"]);
  });

  it("links what the texts cite to the article, the act or the file", () => {
    render(<RoadmapDocsPage />);
    expect(screen.getByRole("link", { name: "Art. 105" })).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_105",
    );
    expect(
      screen.getByRole("link", { name: "2026/2099, Art. 4(2)" }),
    ).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg_impl/2026/2099/oj/eng#004.002",
    );
    expect(
      screen.getByRole("link", { name: "Simpl-Live wave 1" }),
    ).toHaveAttribute(
      "href",
      "https://simpl-programme.ec.europa.eu/programme/simpl-live/wave-1",
    );
    // An item's article links to the article.
    expect(screen.getByRole("link", { name: "Art. 53" })).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_53",
    );
    // A docs page by its route.
    expect(
      screen.getByRole("link", { name: "adopted article numbers" }),
    ).toHaveAttribute("href", "/docs/ehds/article-numbering");
  });

  it("says what the sources say: no wallet singled out, no day for d-you, no release number in 2026/2098", () => {
    render(<RoadmapDocsPage />);
    expect(
      screen.getByText(/it does not single out the EUDI Wallet/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/is to be available from early 2027/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /to the latest HealthDCAT-AP release without naming a number/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2 January 2027/)).not.toBeInTheDocument();
    expect(screen.queryByText(/first wave/)).not.toBeInTheDocument();
  });

  it("says the bars are planning windows and links the plan", () => {
    render(<RoadmapDocsPage />);
    expect(
      screen.getByText(/the bars are\s+planning windows set on 2026-11-08/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#725" })).toHaveAttribute(
      "href",
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/725",
    );
  });
});
