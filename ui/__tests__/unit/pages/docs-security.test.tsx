/**
 * The published security and data-protection reports: /docs/security and
 * /docs/security/<slug>, rendered from ui/src/content/security-docs.json.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

import SecurityDocsPage from "@/app/docs/security/page";
import SecurityDocPage, {
  generateStaticParams,
} from "@/app/docs/security/[slug]/page";
import { securityDocs } from "@/lib/docs/security-docs";

describe("the published reports", () => {
  it("are the ten reports, each with a title, a summary, a source and a body", () => {
    expect(securityDocs.map((d) => d.slug)).toEqual([
      "operational-guideline",
      "security-test-report",
      "threat-model-hub",
      "threat-model-klarbefund",
      "klarbefund-self-assessment",
      "klarbefund-evidence",
      "report-for-health-insurers",
      "klarbefund-run-on-mac",
      "bsi-c5-gap-analysis",
      "sbom",
    ]);
    for (const d of securityDocs) {
      expect(d.title.length).toBeGreaterThan(5);
      expect(d.summary.length).toBeGreaterThan(20);
      expect(d.source).toMatch(/^docs\/.+\.md$/);
      expect(d.markdown.length).toBeGreaterThan(500);
    }
  });

  it("link only to reports that are published, never to a bare .md file", () => {
    const slugs = new Set(securityDocs.map((d) => d.slug));
    for (const d of securityDocs) {
      for (const [, target] of d.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (target.startsWith("/docs/security/")) {
          const slug = target.slice("/docs/security/".length).split("#")[0];
          expect(slugs.has(slug), `${d.slug} links to ${target}`).toBe(true);
        } else if (target.startsWith("__BASE_PATH__/published-docs/")) {
          const file = target.slice("__BASE_PATH__/".length);
          expect(
            existsSync(join(__dirname, "../../../public", file)),
            `${d.slug} embeds ${file}, which is not copied to public/`,
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

describe("SecurityDocsPage", () => {
  it("lists every report with a link to its page", () => {
    render(<SecurityDocsPage />);
    expect(
      screen.getByRole("heading", { name: /Security and Data Protection/ }),
    ).toBeInTheDocument();
    for (const d of securityDocs) {
      expect(screen.getByText(d.title).closest("a")).toHaveAttribute(
        "href",
        `/docs/security/${d.slug}`,
      );
    }
  });

  it("states the findings' status after the fixes", () => {
    render(<SecurityDocsPage />);
    expect(screen.getByText(/nine are closed/)).toBeInTheDocument();
  });
});

describe("SecurityDocPage", () => {
  it("prerenders one page per report", () => {
    expect(generateStaticParams().map((p) => p.slug)).toEqual(
      securityDocs.map((d) => d.slug),
    );
  });

  it("renders the security test report with its findings table", async () => {
    render(
      await SecurityDocPage({
        params: Promise.resolve({ slug: "security-test-report" }),
      }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /Security test report/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Findings" })).toHaveAttribute(
      "id",
      "findings",
    );
    expect(screen.getByText("F10")).toBeInTheDocument();
    expect(screen.getByText(/on GitHub/).closest("a")).toHaveAttribute(
      "href",
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/security/security-test-report-2026-10-15.md",
    );
  });

  it("shows the operating-model diagrams of the guideline from the hub itself", async () => {
    render(
      await SecurityDocPage({
        params: Promise.resolve({ slug: "operational-guideline" }),
      }),
    );
    const images = screen.getAllByRole("img");
    expect(images.map((i) => i.getAttribute("src"))).toEqual([
      "/published-docs/ehds-operating-model.svg",
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
      SecurityDocPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
