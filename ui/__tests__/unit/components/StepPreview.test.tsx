/**
 * A step's preview on the full-screen journeys page: the side-by-side stage
 * never lets the diagram and the preview cover each other and puts the
 * preview on the picked box's side; the tour of a page starts at its top,
 * zooms to each core feature without leaving the image, and still scrolls a
 * page with few features; every page and screen a step shows has its image.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { StepPreview, pageShot, tourStops } from "@/components/StepPreview";
import { largestPreview, overlayLayout, type Rect } from "@/lib/stage-layout";
import { JOURNEY_FLOWS } from "@/lib/journey-flows";
import { previewPages, stepInfo } from "@/lib/journey-steps";
import previews from "@/content/journey-previews.json";

const PUBLIC = path.resolve("public");

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

describe("the overlay", () => {
  const AREA = { w: 1990, h: 1120 };
  const boxes = [
    { x: 60, y: 300, w: 160, h: 50 }, // far left
    { x: 900, y: 500, w: 160, h: 50 }, // middle
    { x: 1350, y: 900, w: 160, h: 50 }, // lower right
    { x: 700, y: 40, w: 160, h: 50 }, // top
  ];

  it("never covers the picked box and stays inside the content", () => {
    for (const kind of ["web", "app"] as const) {
      for (const box of boxes) {
        const r = overlayLayout(AREA, kind, box);
        expect(overlap(r, box), `${kind} ${box.x}`).toBe(0);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(AREA.w + 0.5);
        expect(r.y + r.h).toBeLessThanOrEqual(AREA.h + 0.5);
      }
    }
  });

  it("is more than twice the old 410-pixel preview, wherever the box is", () => {
    for (const box of boxes) {
      expect(overlayLayout(AREA, "web", box).w).toBeGreaterThan(820);
      expect(overlayLayout(AREA, "app", box).h).toBeGreaterThan(680);
    }
  });

  it("opens on the side with the most room", () => {
    const left = overlayLayout(AREA, "web", boxes[0]);
    expect(left.x).toBeGreaterThan(boxes[0].x + boxes[0].w);
    const right = overlayLayout(AREA, "web", boxes[2]);
    expect(right.x + right.w).toBeLessThan(boxes[2].x + 1);
  });

  it("is never larger than its largest size", () => {
    const full = largestPreview(AREA, "web");
    const r = overlayLayout(AREA, "web", boxes[0]);
    expect(r.w).toBeLessThanOrEqual(full.w + 0.5);
  });
});

describe("the tour of a page", () => {
  const shot = pageShot("/compliance");

  it("starts at the top and zooms to each feature, never past the image", () => {
    const vw = 700;
    const vh = 437;
    const H = (vw * shot.height) / shot.width;
    const stops = tourStops(shot, vw, vh);
    expect(stops[0]).toEqual({ x: 0, y: 0, zoom: 1, ring: null });
    expect(stops.length).toBeGreaterThanOrEqual(1 + shot.focus.length);
    for (const s of stops) {
      expect(s.zoom).toBeGreaterThanOrEqual(1);
      expect(s.zoom).toBeLessThanOrEqual(2.4);
      expect(s.x).toBeLessThanOrEqual(0);
      expect(s.x).toBeGreaterThanOrEqual(vw - vw * s.zoom - 0.01);
      expect(s.y).toBeLessThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(Math.min(0, vh - H * s.zoom) - 0.01);
    }
    expect(stops.filter((s) => s.ring).length).toBe(shot.focus.length);
  });

  it("still scrolls a long page that names few features", () => {
    const long = { src: "/x.webp", width: 1200, height: 2400, focus: [] };
    const stops = tourStops(long, 600, 375);
    expect(stops.length).toBe(3);
    expect(stops[2].y).toBeLessThan(stops[1].y);
  });
});

describe("the pictures", () => {
  it("has a full-page screenshot with its features for every page a step shows", () => {
    const pages = (previews as { pages: Record<string, unknown> }).pages;
    for (const page of previewPages()) {
      expect(pages[page], page).toBeDefined();
      const shot = pageShot(page);
      expect(existsSync(path.join(PUBLIC, shot.src)), shot.src).toBe(true);
      expect(shot.focus.length, page).toBeGreaterThan(0);
      for (const f of shot.focus) {
        expect(f.x + f.w).toBeLessThanOrEqual(1.0001);
        expect(f.y + f.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("has every app screen a step shows", () => {
    for (const f of JOURNEY_FLOWS) {
      for (const n of f.nodes) {
        const p = stepInfo(f.id, n)?.preview;
        if (p?.kind !== "app") continue;
        for (const s of p.screens) {
          expect(
            existsSync(path.join(PUBLIC, "published-docs", `${s}.png`)),
            s,
          ).toBe(true);
        }
      }
    }
  });

  it("draws a page in a browser window and app screens in a phone", () => {
    const { unmount } = render(
      <StepPreview
        preview={{ kind: "web", pages: ["/compliance"] }}
        label="4b · Approve data permit"
      />,
    );
    expect(screen.getByTestId("journey-step-preview")).toHaveAttribute(
      "data-kind",
      "web",
    );
    expect(screen.getByTestId("journey-step-preview-url")).toHaveTextContent(
      "ehds.mabu.red/compliance",
    );
    expect(
      screen.getByRole("img", { name: "4b · Approve data permit" }),
    ).toHaveAttribute("src", "/images/journeys/compliance.webp");
    unmount();
    render(
      <StepPreview
        preview={{ kind: "app", screens: ["detail", "reference"] }}
        label="3 · Coded, checkable"
      />,
    );
    expect(screen.getByTestId("journey-step-preview")).toHaveAttribute(
      "data-kind",
      "app",
    );
    expect(
      screen.getByRole("img", { name: "3 · Coded, checkable" }),
    ).toHaveAttribute("src", "/published-docs/detail.png");
  });
});
