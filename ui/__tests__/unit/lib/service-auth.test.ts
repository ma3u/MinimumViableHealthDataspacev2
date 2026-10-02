/**
 * requireSessionOrToken(): a session, or the catalog crawler's bearer token,
 * for the demo DSP route (#404, ADR-044). The real requireAuth() runs against
 * the mocked session, so "no session" really is refused.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

vi.unmock("@/lib/auth-guard");

import { requireSessionOrToken } from "@/lib/service-auth";
import {
  POST,
  GET,
} from "@/app/api/mock-dsp/[participant]/catalog/request/route";

const TOKEN = "a".repeat(64);
const ENV = "DSP_CATALOG_TOKEN";

function req(auth?: string): Request {
  return new Request(
    "http://localhost/api/mock-dsp/alpha-klinik/catalog/request",
    {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    },
  );
}

const signedIn = {
  user: { name: "Researcher" },
  roles: ["DATA_USER"],
} as unknown as Awaited<ReturnType<typeof getServerSession>>;

describe("requireSessionOrToken", () => {
  beforeEach(() => {
    vi.stubEnv(ENV, TOKEN);
    vi.mocked(getServerSession).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("admits the right token as a service with no roles", async () => {
    const r = await requireSessionOrToken(req(`Bearer ${TOKEN}`), ENV);
    expect(r).not.toBeInstanceOf(NextResponse);
    expect(
      (r as { session: { roles: string[]; user: { id: string } } }).session,
    ).toMatchObject({
      roles: [],
      user: { id: `service:${ENV}` },
    });
  });

  it("refuses a wrong token, even when a session is present", async () => {
    vi.mocked(getServerSession).mockResolvedValue(signedIn);
    const r = await requireSessionOrToken(req(`Bearer ${"b".repeat(64)}`), ENV);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });

  it("refuses a token of a different length without throwing", async () => {
    const r = await requireSessionOrToken(req("Bearer short"), ENV);
    expect((r as NextResponse).status).toBe(401);
  });

  it("without a bearer header, needs a session", async () => {
    const refused = await requireSessionOrToken(req(), ENV);
    expect((refused as NextResponse).status).toBe(401);

    vi.mocked(getServerSession).mockResolvedValue(signedIn);
    const admitted = await requireSessionOrToken(req(), ENV);
    expect(admitted).not.toBeInstanceOf(NextResponse);
  });

  it("with the token unset, a bearer header opens nothing", async () => {
    vi.stubEnv(ENV, "");
    const r = await requireSessionOrToken(req(`Bearer ${TOKEN}`), ENV);
    expect((r as NextResponse).status).toBe(401);
  });
});

describe("/api/mock-dsp/[participant]/catalog/request", () => {
  const params = { params: Promise.resolve({ participant: "alpha-klinik" }) };

  beforeEach(() => {
    vi.stubEnv(ENV, TOKEN);
    vi.mocked(getServerSession).mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the crawler its catalogue with the token", async () => {
    const res = await POST(req(`Bearer ${TOKEN}`), params);
    expect(res.status).toBe(200);
    expect((await res.json())["@type"]).toBe("dcat:Catalog");
  });

  it("answers 401 { error } to an anonymous caller (ADR-044)", async () => {
    const res = await GET(
      new Request("http://localhost/api/mock-dsp/alpha-klinik/catalog/request"),
      params,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
