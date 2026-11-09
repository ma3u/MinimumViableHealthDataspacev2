import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECENT_SEARCHES_KEY,
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from "@/lib/recent-searches";

describe("recent searches", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps five, newest first, without a second copy of one", () => {
    for (const q of ["a", "b", "c", "d", "e", "f"]) rememberSearch(q);
    expect(readRecentSearches()).toEqual(["f", "e", "d", "c", "b"]);
    expect(rememberSearch(" C ")).toEqual(["C", "f", "e", "d", "b"]);
  });

  it("ignores an empty search", () => {
    expect(rememberSearch("   ")).toEqual([]);
    expect(window.localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });

  it("reads nothing from a value that is not a list of words", () => {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, "{not json");
    expect(readRecentSearches()).toEqual([]);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, '["ok", 3, ""]');
    expect(readRecentSearches()).toEqual(["ok"]);
  });

  it("works when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readRecentSearches()).toEqual([]);
    expect(rememberSearch("opt-out")).toEqual(["opt-out"]);
    expect(() => clearRecentSearches()).not.toThrow();
  });
});
