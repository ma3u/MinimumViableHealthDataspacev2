import { describe, expect, it } from "vitest";
import { indexUrl, toHit } from "@/lib/site-search";

describe("site search results", () => {
  it("finds a language's index under public/pagefind/<lang>/", () => {
    expect(indexUrl("de")).toBe("/pagefind/de/pagefind.js");
  });

  it("reads the title and kind from the meta the index wrote", () => {
    const hit = toHit({
      url: "/docs/ehds/glossary",
      excerpt: "x",
      meta: { title: "EHDS glossary", kind: "doc" },
    });
    expect(hit).toMatchObject({ title: "EHDS glossary", kind: "doc" });
    expect(toHit({ url: "/demo", excerpt: "", meta: {} })).toMatchObject({
      title: "/demo",
      kind: "page",
    });
  });

  it("keeps at most three headings, and only real anchors", () => {
    const sub = (url: string) => ({ url, title: url, excerpt: "" });
    const hit = toHit({
      url: "/docs/x",
      excerpt: "",
      meta: { title: "X" },
      sub_results: [
        sub("/docs/x"),
        sub("/docs/x#a"),
        sub("/docs/x#b"),
        sub("/docs/x#c"),
        sub("/docs/x#d"),
      ],
    });
    expect(hit.anchors.map((a) => a.url)).toEqual([
      "/docs/x#a",
      "/docs/x#b",
      "/docs/x#c",
    ]);
  });
});
