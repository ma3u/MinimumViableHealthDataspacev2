/**
 * Tests for ui/src/lib/overview/camera.ts (issue #271): the key map and
 * the camera moves the overview scene applies to its target and offset.
 */
import { describe, it, expect } from "vitest";
import {
  applyToOffset,
  isTypingTarget,
  keyAction,
  length,
  MAX_DISTANCE,
  MIN_DISTANCE,
  ORBIT_IDLE_MS,
  ORBIT_SPEED,
  panShift,
  rotateAroundZ,
  tilt,
  zoom,
} from "@/lib/overview/camera";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("keyAction", () => {
  it("maps arrows to moves, shifted arrows to rotations, plus and minus to zoom", () => {
    expect(keyAction({ key: "ArrowLeft" })).toBe("pan-left");
    expect(keyAction({ key: "ArrowRight" })).toBe("pan-right");
    expect(keyAction({ key: "ArrowUp" })).toBe("pan-up");
    expect(keyAction({ key: "ArrowDown" })).toBe("pan-down");
    expect(keyAction({ key: "ArrowLeft", shiftKey: true })).toBe("rotate-left");
    expect(keyAction({ key: "ArrowRight", shiftKey: true })).toBe(
      "rotate-right",
    );
    expect(keyAction({ key: "ArrowUp", shiftKey: true })).toBe("rotate-up");
    expect(keyAction({ key: "ArrowDown", shiftKey: true })).toBe("rotate-down");
    expect(keyAction({ key: "+" })).toBe("zoom-in");
    expect(keyAction({ key: "=" })).toBe("zoom-in");
    expect(keyAction({ key: "-" })).toBe("zoom-out");
    expect(keyAction({ key: " " })).toBe("toggle-orbit");
    expect(keyAction({ key: "Home" })).toBe("reset");
    expect(keyAction({ key: "a" })).toBeNull();
  });

  it("leaves form fields alone", () => {
    const input = {
      tagName: "INPUT",
      isContentEditable: false,
    } as unknown as EventTarget;
    const div = {
      tagName: "DIV",
      isContentEditable: false,
    } as unknown as EventTarget;
    const editable = {
      tagName: "DIV",
      isContentEditable: true,
    } as unknown as EventTarget;
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("camera moves", () => {
  const off = { x: 0, y: -400, z: 240 };

  it("rotates around the vertical axis and keeps the distance and height", () => {
    const r = rotateAroundZ(off, Math.PI / 2);
    close(r.x, 400);
    close(r.y, 0);
    close(r.z, 240);
    close(length(r), length(off));
  });

  it("tilts within the pole and the plane, keeping the distance", () => {
    const up = tilt(off, 0.3);
    expect(up.z).toBeGreaterThan(off.z);
    close(length(up), length(off));
    // many tilts up never flip over the pole
    let o = off;
    for (let i = 0; i < 100; i++) o = tilt(o, 0.3);
    expect(o.z).toBeGreaterThan(0);
    expect(o.z).toBeLessThan(length(off));
    expect(o.y).toBeLessThan(0);
    // and down never dives under the plane
    for (let i = 0; i < 100; i++) o = tilt(o, -0.3);
    expect(o.z).toBeGreaterThan(0);
  });

  it("zooms between the bounds", () => {
    close(length(zoom(off, 0.5)), length(off) / 2);
    close(length(zoom(off, 1e-9)), MIN_DISTANCE);
    close(length(zoom(off, 1e9)), MAX_DISTANCE);
  });

  it("pans along the camera's right and up axes by a fraction of the distance", () => {
    const right = { x: 1, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };
    expect(panShift(right, up, 100, "pan-right")).toEqual({ x: 6, y: 0, z: 0 });
    expect(panShift(right, up, 100, "pan-left")).toEqual({
      x: -6,
      y: -0,
      z: -0,
    });
    expect(panShift(right, up, 100, "pan-up")).toEqual({ x: 0, y: 0, z: 6 });
    expect(panShift(right, up, 100, "pan-down").z).toBe(-6);
  });

  it("applies rotate and zoom actions to an offset, and leaves the rest alone", () => {
    expect(length(applyToOffset(off, "zoom-in"))).toBeLessThan(length(off));
    expect(length(applyToOffset(off, "zoom-out"))).toBeGreaterThan(length(off));
    expect(applyToOffset(off, "rotate-left").x).toBeGreaterThan(0);
    expect(applyToOffset(off, "rotate-right").x).toBeLessThan(0);
    expect(applyToOffset(off, "rotate-up").z).toBeGreaterThan(off.z);
    expect(applyToOffset(off, "rotate-down").z).toBeLessThan(off.z);
    expect(applyToOffset(off, "pan-left")).toBe(off);
    expect(applyToOffset(off, "toggle-orbit")).toBe(off);
  });

  it("orbits on its own after thirty seconds, from left to right", () => {
    expect(ORBIT_IDLE_MS).toBe(30_000);
    expect(ORBIT_SPEED).toBeLessThan(0);
  });
});
