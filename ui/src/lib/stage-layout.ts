/**
 * Where the full-screen journeys page opens a picked step's preview: as an
 * overlay over the page's content (the drawing and the description), beside
 * the picked box and never on it. Of the four sides of the box the preview
 * takes the one where it can be largest. Everything is in the content area's
 * pixels.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PreviewKind = "web" | "app";

/** The preview's view (height / width) and the room its frame adds. */
const WEB_ASPECT = 750 / 1200;
const WEB_CHROME = 28;
const APP_ASPECT = 1434 / 660;
const PHONE_BEZEL = 8;
/** Room kept between the preview and the picked box, and to the edge. */
const GAP = 24;
const EDGE = 12;

/** The preview's largest size for an area: a page up to 62 % of its width,
 *  a phone up to 92 % of its height. */
export function largestPreview(
  area: { w: number; h: number },
  kind: PreviewKind,
): { w: number; h: number } {
  if (kind === "web") {
    const w = Math.min(
      area.w * 0.62,
      (area.h * 0.92 - WEB_CHROME) / WEB_ASPECT,
    );
    return { w, h: w * WEB_ASPECT + WEB_CHROME };
  }
  const h = Math.min(area.h * 0.92, 900);
  return { w: (h - 2 * PHONE_BEZEL) / APP_ASPECT + 2 * PHONE_BEZEL, h };
}

/** The preview at a share of its largest size, its frame kept whole. */
function scaled(
  size: { w: number; h: number },
  kind: PreviewKind,
  f: number,
): { w: number; h: number } {
  if (kind === "web") {
    const w = size.w * f;
    return { w, h: w * WEB_ASPECT + WEB_CHROME };
  }
  const h = size.h * f;
  return { w: (h - 2 * PHONE_BEZEL) / APP_ASPECT + 2 * PHONE_BEZEL, h };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * The preview's place for a picked box: on the side of the box where it can
 * be largest (right, left, below or above), centred on the box along that
 * side and kept inside the area. It never covers the box.
 */
export function overlayLayout(
  area: { w: number; h: number },
  kind: PreviewKind,
  box: Rect,
): Rect {
  const full = largestPreview(area, kind);
  const room = {
    right: area.w - EDGE - (box.x + box.w + GAP),
    left: box.x - GAP - EDGE,
    below: area.h - EDGE - (box.y + box.h + GAP),
    above: box.y - GAP - EDGE,
  };
  const across = area.w - 2 * EDGE;
  const down = area.h - 2 * EDGE;
  // How much of the largest size fits on each side.
  const fit = (w: number, h: number) => {
    const f = Math.min(1, w / full.w, h / full.h);
    const s = scaled(full, kind, Math.max(f, 0));
    return s.w <= w + 0.5 && s.h <= h + 0.5 ? Math.max(f, 0) : 0;
  };
  const sides = [
    { side: "right", f: fit(room.right, down) },
    { side: "left", f: fit(room.left, down) },
    { side: "below", f: fit(across, room.below) },
    { side: "above", f: fit(across, room.above) },
  ] as const;
  const best = [...sides].sort((a, b) => b.f - a.f)[0];
  const size = scaled(full, kind, best.f);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const alongX = clamp(cx - size.w / 2, EDGE, area.w - EDGE - size.w);
  const alongY = clamp(cy - size.h / 2, EDGE, area.h - EDGE - size.h);
  switch (best.side) {
    case "right":
      return { x: box.x + box.w + GAP, y: alongY, ...size };
    case "left":
      return { x: box.x - GAP - size.w, y: alongY, ...size };
    case "below":
      return { x: alongX, y: box.y + box.h + GAP, ...size };
    default:
      return { x: alongX, y: box.y - GAP - size.h, ...size };
  }
}

/** The point of a rectangle nearest to another point. */
export function nearest(r: Rect, x: number, y: number): [number, number] {
  return [
    Math.min(Math.max(x, r.x), r.x + r.w),
    Math.min(Math.max(y, r.y), r.y + r.h),
  ];
}
