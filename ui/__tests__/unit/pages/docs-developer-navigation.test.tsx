/**
 * The developer guide's sections are numbered by a CSS counter on every h2
 * with an id, and its table of contents is an <ol>: the two numbers agree
 * only while the contents list every such section, in page order. And each
 * onboarding step leads somewhere a newcomer can follow.
 */
import { describe, expect, it, vi } from "vitest";
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

import DeveloperPage from "@/app/docs/developer/page";

describe("the developer guide's numbering", () => {
  it("lists every numbered section in the contents, in page order", () => {
    const { container } = render(<DeveloperPage />);
    expect(container.querySelector(".docs-numbered")).not.toBeNull();
    const sections = [...container.querySelectorAll("h2[id]")].map(
      (h) => `#${h.id}`,
    );
    const contents = container.querySelector("nav ol");
    expect(contents).not.toBeNull();
    const toc = [...contents!.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(sections.length).toBeGreaterThan(20);
    expect(toc).toEqual(sections);
  });
});

describe("the onboarding path", () => {
  it("links every step and every key concept", () => {
    render(<DeveloperPage />);
    const onboarding = screen
      .getByRole("heading", { level: 2, name: "Onboarding" })
      .closest("section")!;
    const cards = [...onboarding.querySelectorAll("li")];
    expect(cards).toHaveLength(15);
    for (const li of cards) {
      expect(li.querySelector("a"), li.textContent ?? "").not.toBeNull();
    }
    expect(
      within(onboarding).getByRole("link", { name: "Browse the Data Catalog" }),
    ).toHaveAttribute("href", "/catalog");
    expect(
      within(onboarding).getByRole("link", { name: "DSP:" }),
    ).toHaveAttribute(
      "href",
      "/docs/developer/stack-and-environment#protocols",
    );
  });
});
