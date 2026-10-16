/**
 * The Klarbefund section of the docs: /docs/klarbefund lists the user guide
 * and the developer guide, each rendered from ui/src/content/published-docs.json
 * with its screenshots and diagrams served from the hub itself.
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

import KlarbefundDocsPage from "@/app/docs/klarbefund/page";
import KlarbefundDocPage, {
  generateStaticParams,
} from "@/app/docs/klarbefund/[slug]/page";
import { docsInSection, publishedDocs } from "@/lib/docs/published-docs";

const PUBLIC = join(__dirname, "../../../public");

describe("the Klarbefund guides", () => {
  it("are the user guide and the developer guide, in that order", () => {
    expect(docsInSection("klarbefund").map((d) => d.slug)).toEqual([
      "klarbefund-user-guide",
      "klarbefund-developer-guide",
    ]);
    expect(generateStaticParams().map((p) => p.slug)).toEqual([
      "klarbefund-user-guide",
      "klarbefund-developer-guide",
    ]);
  });

  it("embed every screenshot and diagram from the hub, with a real alt text", () => {
    for (const d of docsInSection("klarbefund")) {
      const images = [
        ...d.markdown.matchAll(
          /<img\b[^>]*\bsrc="([^"]+)"[^>]*\balt="([^"]*)"/g,
        ),
        ...d.markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g),
      ];
      expect(images.length, `${d.slug} has images`).toBeGreaterThan(0);
      for (const m of images) {
        const [src, alt] = m[0].startsWith("<img")
          ? [m[1], m[2]]
          : [m[2], m[1]];
        expect(src, `${d.slug}: ${src}`).toMatch(
          /^__BASE_PATH__\/published-docs\//,
        );
        expect(
          existsSync(join(PUBLIC, src.slice("__BASE_PATH__/".length))),
          `${d.slug} embeds ${src}, which is not copied to public/`,
        ).toBe(true);
        expect(alt.length, `${d.slug}: alt of ${src}`).toBeGreaterThan(30);
      }
    }
  });

  it("link to published documents by route and to everything else on GitHub", () => {
    const routes = new Set(
      publishedDocs.map((d) => `/docs/${d.section}/${d.slug}`),
    );
    for (const d of docsInSection("klarbefund")) {
      for (const [, target] of d.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (target.startsWith("/docs/")) {
          expect(routes.has(target.split("#")[0]), `${d.slug}: ${target}`).toBe(
            true,
          );
        } else {
          expect(target, `${d.slug} keeps a relative link: ${target}`).toMatch(
            /^(https?:|#|__BASE_PATH__\/)/,
          );
        }
      }
    }
  });
});

describe("KlarbefundDocsPage", () => {
  it("lists both guides and the reports about the app", () => {
    render(<KlarbefundDocsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Klarbefund/ }),
    ).toBeInTheDocument();
    const guides = within(screen.getByTestId("klarbefund-guides"));
    expect(
      guides.getByText("Klarbefund user guide").closest("a"),
    ).toHaveAttribute("href", "/docs/klarbefund/klarbefund-user-guide");
    expect(
      guides.getByText("Klarbefund developer guide").closest("a"),
    ).toHaveAttribute("href", "/docs/klarbefund/klarbefund-developer-guide");
    expect(screen.getByText("Self-assessment").closest("a")).toHaveAttribute(
      "href",
      "/docs/security/klarbefund-self-assessment",
    );
    expect(
      screen.getByText(/Join the beta on TestFlight/).closest("a"),
    ).toHaveAttribute("href", "https://testflight.apple.com/join/ssADSXX6");
  });
});

describe("KlarbefundDocPage", () => {
  it("renders the user guide with its screenshots", async () => {
    render(
      await KlarbefundDocPage({
        params: Promise.resolve({ slug: "klarbefund-user-guide" }),
      }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Klarbefund user guide" }),
    ).toBeInTheDocument();
    const srcs = screen.getAllByRole("img").map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/published-docs/list.png");
    expect(srcs).toContain("/published-docs/connect.png");
    expect(srcs).toContain("/published-docs/consents.png");
    expect(
      screen.getByRole("heading", { name: "Connect to EHDS" }),
    ).toHaveAttribute("id", "connect-to-ehds");
  });

  it("renders the developer guide with both diagrams linked at full size", async () => {
    render(
      await KlarbefundDocPage({
        params: Promise.resolve({ slug: "klarbefund-developer-guide" }),
      }),
    );
    const figures = document.querySelectorAll("a.doc-figure");
    expect([...figures].map((a) => a.getAttribute("href"))).toEqual([
      "/published-docs/klarbefund-architecture.svg",
      "/published-docs/klarbefund-scan-pipeline.svg",
    ]);
  });

  it("answers an unknown slug with not found", async () => {
    await expect(
      KlarbefundDocPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
