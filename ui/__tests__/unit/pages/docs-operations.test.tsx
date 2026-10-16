/**
 * The Operations section of the docs: /docs/operations lists the load-test
 * results and the reports behind them, each rendered from
 * ui/src/content/published-docs.json with its dashboards linked.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

vi.mock("@/components/MermaidDiagram", () => ({
  default: ({ chart }: { chart: string }) => (
    <pre data-testid="mermaid-diagram">{chart}</pre>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import OperationsDocsPage from "@/app/docs/operations/page";
import OperationsDocPage, {
  generateStaticParams,
} from "@/app/docs/operations/[slug]/page";
import { docsInSection, publishedDocs } from "@/lib/docs/published-docs";

const PUBLIC = join(__dirname, "../../../public");

describe("the operations documents", () => {
  it("are the operational guideline, the latest results and the latest assessment", () => {
    expect(docsInSection("operations").map((d) => d.slug)).toEqual([
      "operational-guideline",
      "load-tests",
      "production-readiness-2026-10",
    ]);
    expect(generateStaticParams().map((p) => p.slug)).toEqual(
      docsInSection("operations").map((d) => d.slug),
    );
  });

  it("link every live run to its dashboard on the run's testid and time range", () => {
    const index = docsInSection("operations").find(
      (d) => d.slug === "load-tests",
    )!;
    const links = [
      ...index.markdown.matchAll(
        /https:\/\/grafana\.ehds\.mabu\.red\/d\/mvhd-load-test\/[^)\s]+/g,
      ),
    ].map((m) => m[0]);
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const l of links) {
      expect(l).toMatch(/var-testid=2026\d{4}-/);
      expect(l).toMatch(/from=\d{13}&to=\d{13}/);
    }
    expect(index.markdown).toContain("20261006-2140-stress-aca");
  });

  it("embed their images from the hub and link only to published routes or GitHub", () => {
    const routes = new Set(
      publishedDocs.map((d) => `/docs/${d.section}/${d.slug}`),
    );
    for (const d of docsInSection("operations")) {
      for (const [, target] of d.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (target.startsWith("/docs/")) {
          expect(routes.has(target.split("#")[0]), `${d.slug}: ${target}`).toBe(
            true,
          );
        } else if (target.startsWith("__BASE_PATH__/published-docs/")) {
          expect(
            existsSync(join(PUBLIC, target.slice("__BASE_PATH__/".length))),
            `${d.slug} embeds ${target}, which is not copied to public/`,
          ).toBe(true);
        } else {
          expect(target, `${d.slug} keeps a relative link: ${target}`).toMatch(
            /^(https?:|#)/,
          );
        }
      }
    }
  });
});

describe("OperationsDocsPage", () => {
  it("lists the documents and the two dashboards", () => {
    render(<OperationsDocsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Operations/ }),
    ).toBeInTheDocument();
    const cards = within(screen.getByTestId("operations-docs"));
    for (const d of docsInSection("operations")) {
      expect(cards.getByText(d.title).closest("a")).toHaveAttribute(
        "href",
        `/docs/operations/${d.slug}`,
      );
    }
    expect(
      screen.getByRole("link", { name: /^Load and stress test$/ }),
    ).toHaveAttribute(
      "href",
      "https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test",
    );
    expect(
      screen.getByRole("link", { name: /EDC contracts and transfers/ }),
    ).toHaveAttribute(
      "href",
      "https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers",
    );
  });
});

describe("OperationsDocPage", () => {
  it("renders the results index with its runs table", async () => {
    render(
      await OperationsDocPage({
        params: Promise.resolve({ slug: "load-tests" }),
      }),
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Load, stress and spike tests: results and dashboards",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("20261006-2140-stress-aca")).toBeInTheDocument();
    expect(screen.getAllByRole("img")[0]).toHaveAttribute(
      "src",
      "/published-docs/2026-10-05-load-azure.png",
    );
  });

  it("shows the operating-model diagrams of the guideline from the hub itself", async () => {
    render(
      await OperationsDocPage({
        params: Promise.resolve({ slug: "operational-guideline" }),
      }),
    );
    const images = screen.getAllByRole("img");
    expect(images.map((i) => i.getAttribute("src"))).toEqual([
      "/published-docs/ehds-operating-model.svg",
      "/published-docs/ehds-solution-layers.svg",
      "/published-docs/ehds-incident-coordination.svg",
    ]);
    for (const img of images) {
      expect(img.getAttribute("alt")).toMatch(/.{40,}/);
      expect(
        existsSync(
          join(__dirname, "../../../public", img.getAttribute("src")!),
        ),
      ).toBe(true);
    }
    expect(
      screen.getByRole("heading", { name: "The operating model as a process" }),
    ).toBeInTheDocument();
  });

  it("answers an unknown slug with not found", async () => {
    await expect(
      OperationsDocPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
