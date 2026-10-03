import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { KlarbefundTourPhone } from "@/components/KlarbefundTourPhone";

const ALT = "A tour through the Klarbefund app";

let observed: ((entries: { isIntersecting: boolean }[]) => void) | null;

beforeEach(() => {
  observed = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        observed = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KlarbefundTourPhone", () => {
  it("plays the video when it comes into view", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    render(<KlarbefundTourPhone basePath="" alt={ALT} />);
    observed?.([{ isIntersecting: true }]);
    expect(play).toHaveBeenCalled();
    expect(screen.getByLabelText(ALT)).toHaveAttribute(
      "src",
      "/klarbefund/klarbefund-tour.mp4",
    );
  });

  it("swaps in the animated image when the browser refuses to play", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      Object.assign(new Error("blocked"), { name: "NotAllowedError" }),
    );
    render(<KlarbefundTourPhone basePath="/base" alt={ALT} />);
    observed?.([{ isIntersecting: true }]);
    await waitFor(() =>
      expect(screen.getByAltText(ALT)).toHaveAttribute(
        "src",
        "/base/klarbefund/klarbefund-tour.webp",
      ),
    );
    expect(document.querySelector("video")).toBeNull();
  });

  it("keeps the video when a pause merely overtook the play", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    render(<KlarbefundTourPhone basePath="" alt={ALT} />);
    observed?.([{ isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("pauses the video when it scrolls out of view", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    render(<KlarbefundTourPhone basePath="" alt={ALT} />);
    observed?.([{ isIntersecting: false }]);
    expect(pause).toHaveBeenCalled();
  });
});
