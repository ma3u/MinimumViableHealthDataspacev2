import { describe, it, expect } from "vitest";
import { callerHeaders, loadTestHeaders } from "@/lib/proxy";

describe("callerHeaders (#519)", () => {
  it("hashes the user id, never sends it, and is stable", () => {
    const h = callerHeaders({ user: { id: "f3a1-keycloak-sub" } });
    expect(h["X-Caller"]).toMatch(/^[a-f0-9]{32}$/);
    expect(h["X-Caller"]).not.toContain("keycloak");
    expect(callerHeaders({ user: { id: "f3a1-keycloak-sub" } })).toEqual(h);
    expect(
      callerHeaders({ user: { id: "someone-else" } })["X-Caller"],
    ).not.toBe(h["X-Caller"]);
  });

  it("is empty without a session or an id", () => {
    expect(callerHeaders()).toEqual({});
    expect(callerHeaders({ user: {} })).toEqual({});
  });
});

describe("loadTestHeaders (#519)", () => {
  it("forwards a well-formed run id and nothing else", () => {
    const req = (v?: string) =>
      ({ headers: new Headers(v ? { "x-load-test": v } : {}) }) as Request;
    expect(loadTestHeaders(req("20261006-0900-load-azure"))).toEqual({
      "X-Load-Test": "20261006-0900-load-azure",
    });
    expect(loadTestHeaders(req("not a run id"))).toEqual({});
    expect(loadTestHeaders(req())).toEqual({});
    expect(loadTestHeaders()).toEqual({});
  });
});
