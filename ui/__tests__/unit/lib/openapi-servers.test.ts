/**
 * Swagger UI sends "Try it out" to the first server of the spec. The page
 * puts the hub it is served from first (lib/openapi-servers.ts), so a reader
 * signed in on a local stack calls that stack and not the Azure demo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { specForThisHub } from "@/lib/openapi-servers";

const SPEC = readFileSync(
  path.resolve(__dirname, "../../../public/openapi.yaml"),
  "utf8",
);

const urls = (spec: string) =>
  [
    .../^servers:\n((?:[ \t]+.*\n|\n)*)/m
      .exec(spec)![1]
      .matchAll(/- url:\s*(\S+)/g),
  ].map((m) => m[1]);

describe("specForThisHub", () => {
  it("the spec as checked in lists the Azure demo first", () => {
    expect(urls(SPEC)[0]).toBe("https://ehds.mabu.red");
  });

  it("puts an origin the spec does not list first, and keeps the others", () => {
    const out = specForThisHub(SPEC, "http://localhost:3017");
    expect(urls(out)).toEqual(["http://localhost:3017", ...urls(SPEC)]);
  });

  it("moves an origin the spec lists to the front, once", () => {
    const out = specForThisHub(SPEC, "http://localhost:3003");
    expect(urls(out)[0]).toBe("http://localhost:3003");
    expect(urls(out).filter((u) => u === "http://localhost:3003")).toHaveLength(
      1,
    );
    expect(urls(out).sort()).toEqual(urls(SPEC).sort());
  });

  it("changes nothing but the servers block", () => {
    const out = specForThisHub(SPEC, "http://localhost:3017");
    const rest = (s: string) => s.slice(s.indexOf("\ntags:\n"));
    expect(rest(out)).toBe(rest(SPEC));
    expect(out.slice(0, out.indexOf("\nservers:\n"))).toBe(
      SPEC.slice(0, SPEC.indexOf("\nservers:\n")),
    );
    expect(out).toContain("\nservers:\n  - url: http://localhost:3017\n");
  });

  it("returns a document without a servers block as it is", () => {
    expect(specForThisHub("openapi: 3.1.0\npaths: {}\n", "http://x")).toBe(
      "openapi: 3.1.0\npaths: {}\n",
    );
  });
});
