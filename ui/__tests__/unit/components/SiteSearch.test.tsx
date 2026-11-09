/**
 * The site search dialog (ADR-082) with the index replaced: what opens it,
 * what the keys do, and what it says when there is nothing to show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { SearchHit } from "@/lib/site-search";

const { push, searchSite } = vi.hoisted(() => ({
  push: vi.fn(),
  searchSite: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/site-search", () => ({ searchSite }));

import SiteSearch, { panelPosition } from "@/components/SiteSearch";

const HITS: SearchHit[] = [
  {
    url: "/docs/ehds/glossary",
    title: "EHDS glossary",
    kind: "page",
    excerpt: "the <mark>opt-out</mark> of Art. 71",
    anchors: [
      {
        url: "/docs/ehds/glossary#opt-out",
        title: "right to opt out",
        excerpt: "<mark>opt-out</mark>",
      },
    ],
  },
  {
    url: "/docs/ehds/regulation-implementation",
    title: "What the hub implements",
    kind: "doc",
    excerpt: "Primary-use <mark>opt-out</mark>",
    anchors: [],
  },
];

async function openAndType(q: string) {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const input = await screen.findByRole("combobox", {
    name: "Search pages and documentation",
  });
  await act(async () => {
    fireEvent.change(input, { target: { value: q } });
  });
  return input;
}

describe("SiteSearch", () => {
  beforeEach(() => {
    push.mockReset();
    searchSite.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is closed until asked", () => {
    render(<SiteSearch />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+K Meta+K /",
    );
  });

  it("opens with Ctrl+K, Cmd+K, / and the button", () => {
    render(<SiteSearch />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("does not take / from a field the reader is typing in", () => {
    render(
      <>
        <input aria-label="other" />
        <SiteSearch />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("other"), { key: "/" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("searches the interface language and lists pages, documents and headings", async () => {
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    await openAndType("opt-out");
    expect(searchSite).toHaveBeenLastCalledWith("en", "opt-out");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("EHDS glossary");
    expect(options[0]).toHaveTextContent("Page");
    expect(options[1]).toHaveTextContent("right to opt out");
    expect(options[2]).toHaveTextContent("Documentation");
    expect(options[0].querySelector("mark")).toHaveTextContent("opt-out");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("moves with the arrow keys and opens the result with Enter", async () => {
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    const input = await openAndType("opt-out");
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/docs/ehds/glossary#opt-out");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a result on click", async () => {
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    await openAndType("opt-out");
    fireEvent.click((await screen.findAllByRole("option"))[2]);
    expect(push).toHaveBeenCalledWith("/docs/ehds/regulation-implementation");
  });

  it("closes with Escape and gives the focus back to the button", async () => {
    render(<SiteSearch />);
    const input = await openAndType("");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
  });

  it("says so when nothing matches", async () => {
    searchSite.mockResolvedValue([]);
    render(<SiteSearch />);
    await openAndType("zzz");
    expect(await screen.findByText("No results for “zzz”")).toBeInTheDocument();
  });

  it("ignores a search a later keystroke replaced", async () => {
    searchSite.mockResolvedValue(null);
    render(<SiteSearch />);
    await openAndType("op");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.queryByText(/No results/)).toBeNull();
  });

  it("says so when the index cannot be loaded", async () => {
    searchSite.mockRejectedValue(new Error("404"));
    render(<SiteSearch />);
    await openAndType("opt-out");
    expect(
      await screen.findByText("Search is not available right now."),
    ).toBeInTheDocument();
  });

  it("lists the last searches while the field is empty, newest first", async () => {
    window.localStorage.setItem(
      "site-search-recent",
      JSON.stringify(["permit", "opt-out"]),
    );
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    const input = await openAndType("");
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["permit", "opt-out"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(input).toHaveValue("opt-out");
    expect(searchSite).toHaveBeenLastCalledWith("en", "opt-out");
    expect(push).not.toHaveBeenCalled();
  });

  it("clears the last searches", async () => {
    window.localStorage.setItem(
      "site-search-recent",
      JSON.stringify(["permit"]),
    );
    render(<SiteSearch />);
    await openAndType("");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Recent searches")).toBeNull();
    expect(window.localStorage.getItem("site-search-recent")).toBeNull();
  });

  it("keeps a search when a result is opened", async () => {
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    await openAndType("opt-out");
    fireEvent.click((await screen.findAllByRole("option"))[0]);
    expect(
      JSON.parse(window.localStorage.getItem("site-search-recent")!),
    ).toEqual(["opt-out"]);
  });

  it("keeps a search that found something when the reader closes it", async () => {
    searchSite.mockResolvedValue(HITS);
    render(<SiteSearch />);
    const input = await openAndType("glossary");
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      JSON.parse(window.localStorage.getItem("site-search-recent")!),
    ).toEqual(["glossary"]);
  });

  it("does not keep a search that found nothing", async () => {
    searchSite.mockResolvedValue([]);
    render(<SiteSearch />);
    const input = await openAndType("zzz");
    await screen.findByText("No results for “zzz”");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(window.localStorage.getItem("site-search-recent")).toBeNull();
  });

  it("closes on a click outside, and the button toggles it", async () => {
    render(
      <>
        <p>elsewhere</p>
        <SiteSearch />
      </>,
    );
    const button = screen.getByRole("button", { name: "Search" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("panelPosition", () => {
    it("puts the panel's right edge at the icon's on a wide screen", () => {
      expect(panelPosition({ right: 1200, bottom: 48 }, 1600)).toEqual({
        left: 624,
        top: 56,
        width: 576,
      });
    });

    it("moves it right when the icon is too far left for its width", () => {
      // 858 px wide, icon at 488: right-aligned it would start at -88.
      expect(panelPosition({ right: 488, bottom: 48 }, 858)).toEqual({
        left: 8,
        top: 56,
        width: 576,
      });
    });

    it("spans a phone's screen, eight pixels from each edge", () => {
      expect(panelPosition({ right: 230, bottom: 56 }, 375)).toEqual({
        left: 8,
        top: 64,
        width: 359,
      });
    });
  });
});
