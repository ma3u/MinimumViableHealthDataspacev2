/**
 * Screenshots and diagrams in the picked language (ADR-071): the variant
 * the manifest lists for that language, else the English image.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("@/content/localized-images.json", () => ({
  default: {
    languages: ["de", "fr", "nl", "es"],
    images: {
      "/images/guide/catalog.webp": { de: "/images/guide/de/catalog.webp" },
      "/published-docs/deployment.svg": {
        fr: "/published-docs/deployment.fr.svg",
      },
    },
  },
}));

import { LocalizedImage } from "@/components/docs/LocalizedImage";
import { DocFigure } from "@/components/docs/DocFigure";
import { localizedImagePath } from "@/lib/i18n/localized-images";
import { setLanguage } from "@/lib/use-language";

afterEach(() => {
  localStorage.clear();
});

describe("localizedImagePath", () => {
  it("picks the variant the manifest lists for the language", () => {
    expect(localizedImagePath("/images/guide/catalog.webp", "de")).toBe(
      "/images/guide/de/catalog.webp",
    );
    expect(localizedImagePath("/published-docs/deployment.svg", "fr")).toBe(
      "/published-docs/deployment.fr.svg",
    );
  });

  it("falls back to English for a language or an image with no variant", () => {
    expect(localizedImagePath("/images/guide/catalog.webp", "nl")).toBe(
      "/images/guide/catalog.webp",
    );
    expect(localizedImagePath("/images/guide/catalog.webp", "en")).toBe(
      "/images/guide/catalog.webp",
    );
    expect(localizedImagePath("/images/guide/admin.webp", "de")).toBe(
      "/images/guide/admin.webp",
    );
  });
});

describe("LocalizedImage", () => {
  it("shows English first and the variant once German is picked", () => {
    render(<LocalizedImage src="/images/guide/catalog.webp" alt="Catalog" />);
    const img = screen.getByAltText("Catalog");
    expect(img).toHaveAttribute("src", "/images/guide/catalog.webp");
    act(() => setLanguage("de"));
    expect(img).toHaveAttribute("src", "/images/guide/de/catalog.webp");
    act(() => setLanguage("es"));
    expect(img).toHaveAttribute("src", "/images/guide/catalog.webp");
  });

  it("localizes a docs page's diagram and the link around it", () => {
    localStorage.setItem("catalog-metadata-language", "fr");
    render(
      <DocFigure file="deployment.svg" alt="Deployment" caption="Caption" />,
    );
    expect(screen.getByAltText("Deployment")).toHaveAttribute(
      "src",
      "/published-docs/deployment.fr.svg",
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/published-docs/deployment.fr.svg",
    );
  });
});
