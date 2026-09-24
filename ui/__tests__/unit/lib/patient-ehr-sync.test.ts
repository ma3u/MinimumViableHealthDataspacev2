/**
 * Tests for ui/src/lib/patient/ehr-sync.ts (issue #271): the last EHR sync
 * read from a graph row and shown as a date and time.
 */
import { describe, it, expect } from "vitest";
import { ehrSyncFromRow, formatEhrSync } from "@/lib/patient/ehr-sync";

describe("ehrSyncFromRow", () => {
  it("reads the instant and the source", () => {
    expect(
      ehrSyncFromRow({
        ehrSyncedAt: "2026-09-22T18:05:00Z",
        ehrSyncSource: "ePA transfer, GesundheitsID-authenticated",
      }),
    ).toEqual({
      at: "2026-09-22T18:05:00Z",
      source: "ePA transfer, GesundheitsID-authenticated",
    });
  });

  it("is null when the record was never synced", () => {
    expect(
      ehrSyncFromRow({ ehrSyncedAt: null, ehrSyncSource: null }),
    ).toBeNull();
    expect(ehrSyncFromRow(undefined)).toBeNull();
    expect(ehrSyncFromRow({})).toBeNull();
  });

  it("keeps the instant when the source is missing", () => {
    expect(ehrSyncFromRow({ ehrSyncedAt: "2026-09-22T18:05:00Z" })).toEqual({
      at: "2026-09-22T18:05:00Z",
      source: null,
    });
  });
});

describe("formatEhrSync", () => {
  it("shows the date and the time in the given locale and zone", () => {
    const text = formatEhrSync(
      "2026-09-22T18:05:00Z",
      "en-GB",
      "Europe/Berlin",
    );
    expect(text).toMatch(/22 Sept 2026/);
    expect(text).toMatch(/20:05/);
  });

  it("returns an unparseable instant as it is", () => {
    expect(formatEhrSync("yesterday")).toBe("yesterday");
  });
});
