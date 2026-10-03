/**
 * Tests for LivingBodyHero: it hands the UI's theme to the canvas library,
 * follows theme changes, and tears the animation down on unmount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { mockMount, mockSetTheme, mockDestroy } = vi.hoisted(() => ({
  mockMount: vi.fn(),
  mockSetTheme: vi.fn(),
  mockDestroy: vi.fn(),
}));
vi.mock("@/lib/living-body/living-body", () => ({ mount: mockMount }));

import { LivingBodyHero } from "@/components/LivingBodyHero";

describe("LivingBodyHero", () => {
  beforeEach(() => {
    mockMount.mockReset();
    mockSetTheme.mockReset();
    mockDestroy.mockReset();
    mockMount.mockReturnValue({
      setTheme: mockSetTheme,
      destroy: mockDestroy,
      stats: vi.fn(),
      resetStats: vi.fn(),
    });
    vi.stubGlobal("matchMedia", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
  });

  it("does not start without matchMedia, as in jsdom", async () => {
    vi.unstubAllGlobals();
    const { container } = render(<LivingBodyHero className="aspect-9/16" />);
    expect(container.firstChild).toHaveClass("aspect-9/16");
    await new Promise((r) => setTimeout(r, 0));
    expect(mockMount).not.toHaveBeenCalled();
  });

  it("mounts light when <html> has no dark class, not the OS theme", async () => {
    const { container } = render(<LivingBodyHero />);
    await waitFor(() => expect(mockMount).toHaveBeenCalledTimes(1));
    expect(mockMount).toHaveBeenCalledWith(container.firstChild, {
      theme: "light",
    });
  });

  it("mounts dark when <html> has the dark class", async () => {
    document.documentElement.classList.add("dark");
    render(<LivingBodyHero />);
    await waitFor(() => expect(mockMount).toHaveBeenCalledTimes(1));
    expect(mockMount.mock.calls[0][1]).toEqual({ theme: "dark" });
  });

  it("follows the theme toggle", async () => {
    render(<LivingBodyHero />);
    await waitFor(() => expect(mockMount).toHaveBeenCalledTimes(1));
    document.documentElement.classList.add("dark");
    await waitFor(() => expect(mockSetTheme).toHaveBeenLastCalledWith("dark"));
    document.documentElement.classList.remove("dark");
    await waitFor(() => expect(mockSetTheme).toHaveBeenLastCalledWith("light"));
  });

  it("destroys the animation on unmount", async () => {
    const { unmount } = render(<LivingBodyHero />);
    await waitFor(() => expect(mockMount).toHaveBeenCalledTimes(1));
    unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
