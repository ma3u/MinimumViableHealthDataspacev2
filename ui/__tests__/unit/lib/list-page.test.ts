/**
 * The page a list route reads from `limit` and `offset` (#1086).
 */
import { describe, it, expect } from "vitest";
import { pageFrom, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/list-page";

const page = (query: string) => pageFrom(new URLSearchParams(query));

describe("pageFrom", () => {
  it("is the first page of 50 when nothing is asked", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(page("participantId=x")).toEqual({ limit: 50, offset: 0 });
    expect(page("limit=&offset=")).toEqual({ limit: 50, offset: 0 });
  });

  it("takes the page asked for", () => {
    expect(page("limit=20&offset=40")).toEqual({ limit: 20, offset: 40 });
  });

  it("lowers a limit over the maximum to it", () => {
    expect(MAX_PAGE_SIZE).toBe(200);
    expect(page("limit=5000")).toEqual({ limit: 200, offset: 0 });
  });

  it.each(["limit=0", "limit=-1", "limit=ten", "limit=2.5", "limit=1e3"])(
    "refuses %s",
    (q) => {
      expect(page(q)).toEqual({ error: expect.stringContaining("limit") });
    },
  );

  it.each(["offset=-5", "offset=x", "offset=1.5"])("refuses %s", (q) => {
    expect(page(q)).toEqual({ error: expect.stringContaining("offset") });
  });
});
