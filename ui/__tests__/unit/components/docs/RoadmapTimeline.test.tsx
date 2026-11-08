/**
 * RoadmapTimeline hands the roadmap to vis-timeline: a group per lane, a bar
 * per issue, a diamond per milestone. vis-timeline draws on a canvas jsdom
 * does not lay out, so it is replaced by a fake that keeps what it was given
 * and lets the test fire its events; what the test checks is what the
 * component hands over and what it shows around the chart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

type Row = Record<string, unknown> & { id: string };

const vis = vi.hoisted(() => {
  class DataSet {
    rows = new Map<string, Row>();
    constructor(rows: Row[]) {
      for (const r of rows) this.rows.set(String(r.id), r);
    }
    get(id: string) {
      return this.rows.get(id);
    }
    update(rows: Row[]) {
      for (const r of rows) {
        this.rows.set(r.id, { ...this.rows.get(r.id), ...r } as Row);
      }
    }
  }
  class Timeline {
    handlers: Record<string, (p: unknown) => void> = {};
    selection: string[] = [];
    constructor(
      public el: HTMLElement,
      public items: DataSet,
      public groups: DataSet,
      public options: Record<string, unknown>,
    ) {
      timelines.push(this);
    }
    on(event: string, fn: (p: unknown) => void) {
      this.handlers[event] = fn;
    }
    setSelection(ids: string[]) {
      this.selection = ids;
    }
    focus() {}
    destroy() {}
    redraw() {}
    zoomIn() {}
    zoomOut() {}
    moveTo() {}
    fit() {}
    setWindow() {}
  }
  const timelines: Timeline[] = [];
  return { DataSet, Timeline, timelines };
});

vi.mock("vis-timeline/peer", () => ({ Timeline: vis.Timeline }));
vi.mock("vis-data/peer", () => ({ DataSet: vis.DataSet }));

import RoadmapTimeline from "@/components/docs/RoadmapTimeline";
import { ITEMS, LANES, MILESTONES, ROADMAP_PROJECT } from "@/lib/docs/roadmap";

const latest = () => vis.timelines[vis.timelines.length - 1];

async function drawn() {
  render(<RoadmapTimeline />);
  await waitFor(() => expect(vis.timelines.length).toBeGreaterThan(0));
  return latest();
}

beforeEach(() => {
  vis.timelines.length = 0;
  history.replaceState(null, "", "/docs/roadmap");
});

afterEach(() => {
  localStorage.clear();
});

describe("RoadmapTimeline", () => {
  it("hands over a lane per driver, a bar per issue and a diamond per milestone", async () => {
    const t = await drawn();
    expect([...t.groups.rows.keys()]).toEqual(LANES.map((l) => l.id));
    for (const i of ITEMS) {
      const row = t.items.get(`i${i.issue}`)!;
      expect(row).toMatchObject({
        group: i.lane,
        start: i.start,
        end: i.end,
        type: "range",
        className: `rt-${i.status}`,
      });
      expect(row.content).toContain(`${i.issue} ${i.short}`);
    }
    for (const m of MILESTONES) {
      expect(
        t.items.get(`m_${m.id.replace(/[^a-z0-9]/gi, "_")}`),
      ).toMatchObject({ type: "point", start: m.date, group: m.lane });
    }
    expect(t.options).toMatchObject({ showCurrentTime: true });
  });

  it("shows an issue's details with its sources when its bar is selected, and puts it in the address", async () => {
    const t = await drawn();
    act(() => t.handlers.select({ items: ["i934"] }));
    const detail = await screen.findByTestId("roadmap-detail");
    expect(detail).toHaveTextContent("#934");
    expect(
      screen.getByRole("link", { name: /Open issue #934/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934",
    );
    // The note's tagged parts are links too.
    expect(screen.getByRole("link", { name: "Art. 54" })).toHaveAttribute(
      "href",
      expect.stringContaining("#art_54"),
    );
    expect(location.hash).toBe("#i934");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("roadmap-detail")).not.toBeInTheDocument();
    expect(location.hash).toBe("");
  });

  it("opens with the bar the address names selected", async () => {
    history.replaceState(null, "", "/docs/roadmap#m_hamburg");
    const t = await drawn();
    expect(t.selection).toEqual(["m_hamburg"]);
    expect(await screen.findByTestId("roadmap-detail")).toHaveTextContent(
      "Hamburg 4.1",
    );
    expect(
      screen.getByRole("link", { name: /Open the source/ }),
    ).toHaveAttribute("href", expect.stringContaining("hamburg-4.1"));
  });

  it("dims what a filter leaves out", async () => {
    const t = await drawn();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by priority" }),
      {
        target: { value: "P1" },
      },
    );
    await waitFor(() =>
      expect(t.items.get("i712")!.className).toContain("rt-dim"),
    );
    expect(t.items.get("i708")!.className).not.toContain("rt-dim");
    expect(t.items.get("m_hamburg")!.className).toContain("rt-dim");
  });

  it("links the GitHub Project where the plan is edited", async () => {
    await drawn();
    expect(
      screen.getByRole("link", { name: /Edit in the GitHub Project/ }),
    ).toHaveAttribute("href", ROADMAP_PROJECT);
    expect(ROADMAP_PROJECT).toMatch(
      /^https:\/\/github\.com\/users\/ma3u\/projects\/\d+$/,
    );
  });

  it("fills the window when the browser refuses full screen", async () => {
    await drawn();
    fireEvent.click(screen.getByRole("button", { name: /Full screen/ }));
    await waitFor(() =>
      expect(screen.getByTestId("roadmap-timeline")).toHaveClass("rt-full"),
    );
    expect(
      screen.getByRole("button", { name: /Exit full screen/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("draws the lanes and the controls in German", async () => {
    localStorage.setItem("catalog-metadata-language", "de");
    render(<RoadmapTimeline />);
    await waitFor(() =>
      expect(String(latest()?.groups.get("identity")?.content ?? "")).toContain(
        "Identität und Wallets",
      ),
    );
    expect(screen.getByRole("button", { name: "Heute" })).toBeInTheDocument();
    expect(latest().options).toMatchObject({ locale: "de" });
  });
});
