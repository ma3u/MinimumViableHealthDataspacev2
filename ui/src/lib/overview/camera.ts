/**
 * Camera moves for the overview scene (issue #271), on plain vectors so
 * they can be tested without WebGL. The scene keeps a target (what the
 * camera looks at) and an offset (from the target to the camera); every
 * move here is a new offset, or a shift of both.
 *
 * Keys: arrows move (pan), Shift + arrows rotate, + and - zoom, Space
 * pauses or resumes the orbit, Home resets. After ORBIT_IDLE_MS without
 * input the scene orbits on its own, from left to right.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Idle time before the scene orbits on its own */
export const ORBIT_IDLE_MS = 30_000;
/** Orbit speed in radians per second; negative reads as left to right */
export const ORBIT_SPEED = -0.12;
/** Radians per rotate key press */
export const ROTATE_STEP = 0.08;
/** Fraction of the distance per pan key press */
export const PAN_STEP = 0.06;
/** Zoom factor per key press */
export const ZOOM_STEP = 1.12;
export const MIN_DISTANCE = 60;
export const MAX_DISTANCE = 6000;

export type CameraAction =
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "rotate-left"
  | "rotate-right"
  | "rotate-up"
  | "rotate-down"
  | "zoom-in"
  | "zoom-out"
  | "toggle-orbit"
  | "reset";

/** The action a key press asks for, or null when the key means nothing here. */
export function keyAction(e: {
  key: string;
  shiftKey?: boolean;
}): CameraAction | null {
  const shift = Boolean(e.shiftKey);
  switch (e.key) {
    case "ArrowLeft":
      return shift ? "rotate-left" : "pan-left";
    case "ArrowRight":
      return shift ? "rotate-right" : "pan-right";
    case "ArrowUp":
      return shift ? "rotate-up" : "pan-up";
    case "ArrowDown":
      return shift ? "rotate-down" : "pan-down";
    case "+":
    case "=":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case " ":
      return "toggle-orbit";
    case "Home":
      return "reset";
    default:
      return null;
  }
}

/** True when the key press belongs to a form field, not to the scene. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
}

export const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/** Rotate the offset around the vertical (z) axis. */
export function rotateAroundZ(off: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: off.x * c - off.y * s, y: off.x * s + off.y * c, z: off.z };
}

/**
 * Tilt the offset up or down: change its elevation above the target's
 * plane, keeping the distance, clamped so the camera never flips over the
 * pole or dives under the plane.
 */
export function tilt(off: Vec3, angle: number): Vec3 {
  const r = length(off) || 1;
  const horiz = Math.hypot(off.x, off.y);
  const elevation = Math.atan2(off.z, horiz);
  const next = Math.min(1.45, Math.max(0.08, elevation + angle));
  const h = r * Math.cos(next);
  const dir =
    horiz > 1e-6 ? { x: off.x / horiz, y: off.y / horiz } : { x: 0, y: -1 };
  return { x: dir.x * h, y: dir.y * h, z: r * Math.sin(next) };
}

/** Scale the offset, between MIN_DISTANCE and MAX_DISTANCE. */
export function zoom(off: Vec3, factor: number): Vec3 {
  const r = length(off) || 1;
  const target = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, r * factor));
  const k = target / r;
  return { x: off.x * k, y: off.y * k, z: off.z * k };
}

/**
 * The shift a pan applies to both the target and the camera: along the
 * camera's right and up axes, by a fraction of the distance.
 */
export function panShift(
  right: Vec3,
  up: Vec3,
  distance: number,
  action: "pan-left" | "pan-right" | "pan-up" | "pan-down",
): Vec3 {
  const step = distance * PAN_STEP;
  const sign = action === "pan-left" || action === "pan-down" ? -1 : 1;
  const axis = action === "pan-left" || action === "pan-right" ? right : up;
  return {
    x: axis.x * step * sign,
    y: axis.y * step * sign,
    z: axis.z * step * sign,
  };
}

/** Apply a rotate or zoom action to an offset; pans are handled by panShift. */
export function applyToOffset(off: Vec3, action: CameraAction): Vec3 {
  switch (action) {
    case "rotate-left":
      return rotateAroundZ(off, ROTATE_STEP);
    case "rotate-right":
      return rotateAroundZ(off, -ROTATE_STEP);
    case "rotate-up":
      return tilt(off, ROTATE_STEP);
    case "rotate-down":
      return tilt(off, -ROTATE_STEP);
    case "zoom-in":
      return zoom(off, 1 / ZOOM_STEP);
    case "zoom-out":
      return zoom(off, ZOOM_STEP);
    default:
      return off;
  }
}
